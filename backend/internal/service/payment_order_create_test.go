//go:build unit

package service

import (
	"context"
	"math"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/internal/payment"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

// 这些测试聚焦于 payment_order.go 的可单元化路径：
//   - CreateOrder 在 payment_disabled / balance_disabled / invalid_amount 的快速失败
//   - validateOrderInput 的金额边界与子类型分支
//   - GetOrder / GetOrderByID 的权限边界与 not_found 语义
//   - GetUserOrders / AdminListOrders 的过滤、分页、排序
// CreateOrder 的完整 happy path 涉及 LoadBalancer + Provider + Wxpay OAuth，
// 由集成测试覆盖；这里专门捕获"快速失败 + 查询访问控制"的回归面。

// paymentOrderCreateUserRepoStub 仅实现 CreateOrder 在快速失败前会触达的
// userRepo.GetByID。其他方法不应被调用。
type paymentOrderCreateUserRepoStub struct {
	userRepoStub
	user *User
}

func (s *paymentOrderCreateUserRepoStub) GetByID(_ context.Context, _ int64) (*User, error) {
	if s.user == nil {
		return nil, ErrUserNotFound
	}
	return s.user, nil
}

// paymentOrderCreateSettingRepoStub 复用 paymentConfigSettingRepoStub 形态
// 通过 PaymentConfigService 控制 CreateOrder 看到的 PaymentConfig.Enabled
// 等开关。
func newPaymentOrderConfigService(t *testing.T, settings map[string]string) (*PaymentConfigService, *dbent.Client) {
	t.Helper()
	client := newPaymentConfigServiceTestClient(t)
	stub := &paymentConfigSettingRepoStub{values: settings}
	svc := NewPaymentConfigService(client, stub, nil)
	return svc, client
}

func TestCreateOrder_RejectsWhenPaymentDisabled(t *testing.T) {
	ctx := context.Background()
	cfgSvc, client := newPaymentOrderConfigService(t, map[string]string{
		SettingPaymentEnabled: "false",
	})
	svc := &PaymentService{
		entClient:     client,
		configService: cfgSvc,
		userRepo:      &paymentOrderCreateUserRepoStub{},
	}

	_, err := svc.CreateOrder(ctx, CreateOrderRequest{
		UserID:      1,
		Amount:      10,
		PaymentType: payment.TypeAlipay,
	})
	require.Error(t, err)
	require.Equal(t, "PAYMENT_DISABLED", infraerrors.Reason(err),
		"PaymentConfig.Enabled=false 时必须返回 PAYMENT_DISABLED，且不可继续到 userRepo / 选择实例")
}

func TestCreateOrder_RejectsBalanceWhenBalanceDisabled(t *testing.T) {
	ctx := context.Background()
	cfgSvc, client := newPaymentOrderConfigService(t, map[string]string{
		SettingPaymentEnabled:     "true",
		SettingBalancePayDisabled: "true",
		SettingMinRechargeAmount:  "1",
		SettingMaxRechargeAmount:  "1000",
	})
	svc := &PaymentService{
		entClient:     client,
		configService: cfgSvc,
		userRepo:      &paymentOrderCreateUserRepoStub{},
	}

	_, err := svc.CreateOrder(ctx, CreateOrderRequest{
		UserID:      1,
		Amount:      50,
		PaymentType: payment.TypeAlipay,
		OrderType:   payment.OrderTypeBalance,
	})
	require.Error(t, err)
	require.Equal(t, "BALANCE_PAYMENT_DISABLED", infraerrors.Reason(err))
}

func TestValidateOrderInput_AmountBoundaries(t *testing.T) {
	ctx := context.Background()
	svc := &PaymentService{} // validateOrderInput 在余额路径下不依赖任何 repo

	cfg := &PaymentConfig{
		MinAmount: 10,
		MaxAmount: 100,
	}

	tests := []struct {
		name      string
		amount    float64
		wantCode  string
		wantOK    bool
		extraMeta map[string]string
	}{
		{name: "zero rejected", amount: 0, wantCode: "INVALID_AMOUNT"},
		{name: "negative rejected", amount: -1, wantCode: "INVALID_AMOUNT"},
		{name: "NaN rejected", amount: math.NaN(), wantCode: "INVALID_AMOUNT"},
		{name: "+Inf rejected", amount: math.Inf(1), wantCode: "INVALID_AMOUNT"},
		{name: "-Inf rejected", amount: math.Inf(-1), wantCode: "INVALID_AMOUNT"},
		{name: "below min rejected", amount: 5, wantCode: "INVALID_AMOUNT"},
		{name: "above max rejected", amount: 200, wantCode: "INVALID_AMOUNT"},
		{name: "at min accepted", amount: 10, wantOK: true},
		{name: "at max accepted", amount: 100, wantOK: true},
		{name: "between min/max accepted", amount: 50, wantOK: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := CreateOrderRequest{
				Amount:      tt.amount,
				PaymentType: payment.TypeAlipay,
				OrderType:   payment.OrderTypeBalance,
			}
			_, err := svc.validateOrderInput(ctx, req, cfg)
			if tt.wantOK {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			require.Equal(t, tt.wantCode, infraerrors.Reason(err))
		})
	}
}

func TestValidateOrderInput_NoLimitsAcceptsAnyPositive(t *testing.T) {
	ctx := context.Background()
	svc := &PaymentService{}
	cfg := &PaymentConfig{MinAmount: 0, MaxAmount: 0}
	_, err := svc.validateOrderInput(ctx, CreateOrderRequest{
		Amount:      9999.99,
		PaymentType: payment.TypeAlipay,
		OrderType:   payment.OrderTypeBalance,
	}, cfg)
	require.NoError(t, err,
		"min=0/max=0 表示不限额，正数应一律通过")
}

func TestValidateOrderInput_SubscriptionRequiresPlanID(t *testing.T) {
	ctx := context.Background()
	svc := &PaymentService{} // 不会走到 plan 查询
	cfg := &PaymentConfig{}
	req := CreateOrderRequest{
		Amount:      0,
		PaymentType: payment.TypeAlipay,
		OrderType:   payment.OrderTypeSubscription,
		PlanID:      0,
	}
	_, err := svc.validateOrderInput(ctx, req, cfg)
	require.Error(t, err)
	require.Equal(t, "INVALID_INPUT", infraerrors.Reason(err),
		"订阅订单缺少 plan_id 必须返回 INVALID_INPUT")
}

// -- 查询 / 访问控制 -------------------------------------------------------

func TestGetOrder_NotFoundReturnsApplicationError(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	_, err := svc.GetOrder(ctx, 99999, 1)
	require.Error(t, err)
	require.Equal(t, "NOT_FOUND", infraerrors.Reason(err))
}

func TestGetOrder_RejectsCrossUserAccess(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	user, err := client.User.Create().
		SetEmail("owner@example.com").
		SetPasswordHash("h").
		SetUsername("owner").
		Save(ctx)
	require.NoError(t, err)

	order, err := client.PaymentOrder.Create().
		SetUserID(user.ID).
		SetUserEmail(user.Email).
		SetUserName(user.Username).
		SetAmount(10).
		SetPayAmount(10).
		SetFeeRate(0).
		SetRechargeCode("R1").
		SetOutTradeNo("sub2_xuser_order").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusPending).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		Save(ctx)
	require.NoError(t, err)

	// owner 自己能拿到
	got, err := svc.GetOrder(ctx, order.ID, user.ID)
	require.NoError(t, err)
	require.Equal(t, order.ID, got.ID)

	// 其他用户访问必须 FORBIDDEN（不能漏成 NOT_FOUND/200）
	_, err = svc.GetOrder(ctx, order.ID, user.ID+1)
	require.Error(t, err)
	require.Equal(t, "FORBIDDEN", infraerrors.Reason(err),
		"跨用户访问必须返回 FORBIDDEN，不能泄露订单存在性")
}

func TestGetOrderByID_BypassesUserCheck(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	user, err := client.User.Create().
		SetEmail("any@example.com").
		SetPasswordHash("h").
		SetUsername("any").
		Save(ctx)
	require.NoError(t, err)

	order, err := client.PaymentOrder.Create().
		SetUserID(user.ID).
		SetUserEmail(user.Email).
		SetUserName(user.Username).
		SetAmount(10).
		SetPayAmount(10).
		SetFeeRate(0).
		SetRechargeCode("R-ADM").
		SetOutTradeNo("sub2_adm_order").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusPending).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		Save(ctx)
	require.NoError(t, err)

	got, err := svc.GetOrderByID(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, order.ID, got.ID,
		"GetOrderByID 是 admin/webhook 路径，必须绕过 UserID 检查；丢失 by-id 能力会破坏退款审计与 webhook")

	_, err = svc.GetOrderByID(ctx, 999999)
	require.Error(t, err)
	require.Equal(t, "NOT_FOUND", infraerrors.Reason(err))
}

func TestGetUserOrders_FiltersAndPaginates(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "lister@example.com", "lister")
	other := mustCreateUser(t, ctx, client, "other@example.com", "other")

	// owner 的订单：3 个 alipay + 2 个 wxpay
	for i := 0; i < 3; i++ {
		mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
			OutTradeNo:  "sub2_uo_ali_" + strconv.Itoa(i),
			PaymentType: payment.TypeAlipay,
			Status:      OrderStatusPending,
			OrderType:   payment.OrderTypeBalance,
		})
	}
	for i := 0; i < 2; i++ {
		mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
			OutTradeNo:  "sub2_uo_wx_" + strconv.Itoa(i),
			PaymentType: payment.TypeWxpay,
			Status:      OrderStatusCompleted,
			OrderType:   payment.OrderTypeBalance,
		})
	}
	// 别人的订单（不能出现在 owner 列表中）
	mustCreateOrder(t, ctx, client, other, paymentOrderSeed{
		OutTradeNo:  "sub2_uo_other",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusPending,
		OrderType:   payment.OrderTypeBalance,
	})

	t.Run("no filter returns only owner orders", func(t *testing.T) {
		got, total, err := svc.GetUserOrders(ctx, owner.ID, OrderListParams{})
		require.NoError(t, err)
		require.Equal(t, 5, total)
		require.Len(t, got, 5)
		for _, o := range got {
			require.Equal(t, owner.ID, o.UserID,
				"GetUserOrders 必须按 UserID 严格隔离")
		}
	})

	t.Run("filter by payment_type", func(t *testing.T) {
		got, total, err := svc.GetUserOrders(ctx, owner.ID, OrderListParams{PaymentType: payment.TypeWxpay})
		require.NoError(t, err)
		require.Equal(t, 2, total)
		require.Len(t, got, 2)
	})

	t.Run("filter by status", func(t *testing.T) {
		got, total, err := svc.GetUserOrders(ctx, owner.ID, OrderListParams{Status: OrderStatusCompleted})
		require.NoError(t, err)
		require.Equal(t, 2, total)
		require.Len(t, got, 2)
	})

	t.Run("pagination caps to page size", func(t *testing.T) {
		got, total, err := svc.GetUserOrders(ctx, owner.ID, OrderListParams{Page: 1, PageSize: 2})
		require.NoError(t, err)
		require.Equal(t, 5, total, "total 是过滤后未分页的总数")
		require.Len(t, got, 2)
	})

	t.Run("page 2 returns next slice", func(t *testing.T) {
		got, total, err := svc.GetUserOrders(ctx, owner.ID, OrderListParams{Page: 2, PageSize: 2})
		require.NoError(t, err)
		require.Equal(t, 5, total)
		require.Len(t, got, 2)
	})
}

func TestAdminListOrders_FilterByUser(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	u1 := mustCreateUser(t, ctx, client, "adm-u1@example.com", "admu1")
	u2 := mustCreateUser(t, ctx, client, "adm-u2@example.com", "admu2")

	mustCreateOrder(t, ctx, client, u1, paymentOrderSeed{OutTradeNo: "sub2_alo_u1_a", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})
	mustCreateOrder(t, ctx, client, u1, paymentOrderSeed{OutTradeNo: "sub2_alo_u1_b", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})
	mustCreateOrder(t, ctx, client, u2, paymentOrderSeed{OutTradeNo: "sub2_alo_u2_a", PaymentType: payment.TypeWxpay, Status: OrderStatusCompleted, OrderType: payment.OrderTypeBalance})

	t.Run("userID=0 lists all users", func(t *testing.T) {
		got, total, err := svc.AdminListOrders(ctx, 0, OrderListParams{})
		require.NoError(t, err)
		require.Equal(t, 3, total)
		require.Len(t, got, 3)
	})

	t.Run("userID>0 filters to single user", func(t *testing.T) {
		got, total, err := svc.AdminListOrders(ctx, u1.ID, OrderListParams{})
		require.NoError(t, err)
		require.Equal(t, 2, total)
		for _, o := range got {
			require.Equal(t, u1.ID, o.UserID)
		}
	})
}

func TestAdminListOrders_KeywordSearchesAcrossUserAndTrade(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	alice := mustCreateUser(t, ctx, client, "alice-kw@example.com", "alice")
	bob := mustCreateUser(t, ctx, client, "bob-other@example.com", "bob")

	mustCreateOrder(t, ctx, client, alice, paymentOrderSeed{OutTradeNo: "sub2_kw_alice_1", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})
	mustCreateOrder(t, ctx, client, bob, paymentOrderSeed{OutTradeNo: "sub2_kw_bob_special", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})

	t.Run("matches user email substring", func(t *testing.T) {
		got, total, err := svc.AdminListOrders(ctx, 0, OrderListParams{Keyword: "alice-kw"})
		require.NoError(t, err)
		require.Equal(t, 1, total)
		require.Len(t, got, 1)
		require.Equal(t, alice.ID, got[0].UserID)
	})

	t.Run("matches out_trade_no substring", func(t *testing.T) {
		got, total, err := svc.AdminListOrders(ctx, 0, OrderListParams{Keyword: "special"})
		require.NoError(t, err)
		require.Equal(t, 1, total)
		require.Equal(t, "sub2_kw_bob_special", got[0].OutTradeNo)
	})

	t.Run("matches user name substring", func(t *testing.T) {
		got, total, err := svc.AdminListOrders(ctx, 0, OrderListParams{Keyword: "bob"})
		require.NoError(t, err)
		require.Equal(t, 1, total)
		require.Equal(t, bob.ID, got[0].UserID)
	})
}

func TestAdminListOrders_OrdersByCreatedAtDesc(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	user := mustCreateUser(t, ctx, client, "ord@example.com", "ord")
	first := mustCreateOrder(t, ctx, client, user, paymentOrderSeed{OutTradeNo: "sub2_ord_1", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})
	time.Sleep(5 * time.Millisecond)
	second := mustCreateOrder(t, ctx, client, user, paymentOrderSeed{OutTradeNo: "sub2_ord_2", PaymentType: payment.TypeAlipay, Status: OrderStatusPending, OrderType: payment.OrderTypeBalance})

	got, _, err := svc.AdminListOrders(ctx, user.ID, OrderListParams{})
	require.NoError(t, err)
	require.Len(t, got, 2)
	// 期望：新订单在前
	require.Equal(t, second.ID, got[0].ID,
		"AdminListOrders 必须按 created_at 倒序，最新订单排首位")
	require.Equal(t, first.ID, got[1].ID)
}

// ---- 测试用辅助构造 ------------------------------------------------------

type paymentOrderSeed struct {
	OutTradeNo  string
	PaymentType string
	Status      string
	OrderType   string
}

func mustCreateUser(t *testing.T, ctx context.Context, client *dbent.Client, email, username string) *dbent.User {
	t.Helper()
	u, err := client.User.Create().
		SetEmail(email).
		SetPasswordHash("h").
		SetUsername(username).
		Save(ctx)
	require.NoError(t, err)
	return u
}

func mustCreateOrder(t *testing.T, ctx context.Context, client *dbent.Client, user *dbent.User, seed paymentOrderSeed) *dbent.PaymentOrder {
	t.Helper()
	o, err := client.PaymentOrder.Create().
		SetUserID(user.ID).
		SetUserEmail(user.Email).
		SetUserName(user.Username).
		SetAmount(10).
		SetPayAmount(10).
		SetFeeRate(0).
		SetRechargeCode("RC-" + seed.OutTradeNo).
		SetOutTradeNo(seed.OutTradeNo).
		SetPaymentType(seed.PaymentType).
		SetPaymentTradeNo("").
		SetOrderType(seed.OrderType).
		SetStatus(seed.Status).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		Save(ctx)
	require.NoError(t, err)
	return o
}
