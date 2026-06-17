//go:build unit

package service

import (
	"context"
	"errors"
	"math"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/internal/payment"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

// 这些测试聚焦 payment_refund.go 错误路径与状态机：
//   - validateRefundRequest：跨用户 / 错误类型 / 错误状态
//   - RequestRefund：余额不足、冲突更新
//   - PrepareRefund：未知订单、无效金额、超额、状态不允许
//   - prepDeduct：余额扣减 / 订阅扣减、找不到激活订阅 + force 行为
//   - RollbackRefund：余额 + 订阅 rollback 成功 / 失败
//   - markRefundOk：部分退款标记 PartiallyRefunded

// --- 用户 repo stub：支持 GetByID / UpdateBalance / DeductBalance ------------

type refundUserRepoStub struct {
	userRepoStub

	user                 *User
	getErr               error
	updateBalanceErr     error
	deductBalanceErr     error
	updateBalanceCalls   []refundBalanceOp
	deductBalanceCalls   []refundBalanceOp
}

type refundBalanceOp struct {
	UserID int64
	Amount float64
}

func (s *refundUserRepoStub) GetByID(_ context.Context, _ int64) (*User, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	if s.user == nil {
		return nil, ErrUserNotFound
	}
	return s.user, nil
}

func (s *refundUserRepoStub) UpdateBalance(_ context.Context, id int64, amount float64) error {
	s.updateBalanceCalls = append(s.updateBalanceCalls, refundBalanceOp{UserID: id, Amount: amount})
	return s.updateBalanceErr
}

func (s *refundUserRepoStub) DeductBalance(_ context.Context, id int64, amount float64) error {
	s.deductBalanceCalls = append(s.deductBalanceCalls, refundBalanceOp{UserID: id, Amount: amount})
	return s.deductBalanceErr
}

// --- validateRefundRequest --------------------------------------------------

func TestValidateRefundRequest_OrderNotFound(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	_, err := svc.validateRefundRequest(ctx, 999999, 1)
	require.Error(t, err)
	require.Equal(t, "NOT_FOUND", infraerrors.Reason(err))
}

func TestValidateRefundRequest_RejectsCrossUser(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "rfd-owner@example.com", "rfdo")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_rfd_xuser",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusCompleted,
		OrderType:   payment.OrderTypeBalance,
	})

	_, err := svc.validateRefundRequest(ctx, order.ID, owner.ID+1)
	require.Error(t, err)
	require.Equal(t, "FORBIDDEN", infraerrors.Reason(err),
		"不同用户请求退款必须返回 FORBIDDEN")
}

func TestValidateRefundRequest_RejectsNonBalanceOrderType(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "rfd-sub@example.com", "rfds")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_rfd_subscription",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusCompleted,
		OrderType:   payment.OrderTypeSubscription,
	})

	_, err := svc.validateRefundRequest(ctx, order.ID, owner.ID)
	require.Error(t, err)
	require.Equal(t, "INVALID_ORDER_TYPE", infraerrors.Reason(err),
		"用户自助退款仅允许 balance 类型；订阅订单必须走管理员退款流程")
}

func TestValidateRefundRequest_RejectsNonCompletedStatus(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "rfd-pending@example.com", "rfdp")
	for _, status := range []string{
		OrderStatusPending,
		OrderStatusCancelled,
		OrderStatusRefunded,
		OrderStatusRefundRequested,
	} {
		t.Run("status="+status, func(t *testing.T) {
			order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
				OutTradeNo:  "sub2_rfd_status_" + status,
				PaymentType: payment.TypeAlipay,
				Status:      status,
				OrderType:   payment.OrderTypeBalance,
			})
			_, err := svc.validateRefundRequest(ctx, order.ID, owner.ID)
			require.Error(t, err)
			require.Equal(t, "INVALID_STATUS", infraerrors.Reason(err),
				"只允许 completed 状态发起退款；status=%s 不应通过", status)
		})
	}
}

// --- RequestRefund 余额不足 / 状态冲突 ------------------------------------

func TestRequestRefund_RejectsWhenBalanceInsufficient(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)

	owner := mustCreateUser(t, ctx, client, "rfd-low-bal@example.com", "rfdlb")
	inst, err := client.PaymentProviderInstance.Create().
		SetProviderKey(payment.TypeAlipay).
		SetName("alipay-rfd-instance").
		SetConfig("{}").
		SetSupportedTypes("alipay").
		SetEnabled(true).
		SetAllowUserRefund(true).
		SetRefundEnabled(true).
		Save(ctx)
	require.NoError(t, err)
	instID := strconv.FormatInt(inst.ID, 10)

	order, err := client.PaymentOrder.Create().
		SetUserID(owner.ID).
		SetUserEmail(owner.Email).
		SetUserName(owner.Username).
		SetAmount(100).
		SetPayAmount(100).
		SetFeeRate(0).
		SetRechargeCode("RC-LOW").
		SetOutTradeNo("sub2_rfd_low_bal").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("trade-low-bal").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetPaidAt(time.Now()).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		SetProviderInstanceID(instID).
		SetProviderKey(payment.TypeAlipay).
		Save(ctx)
	require.NoError(t, err)

	// 用户余额低于订单金额（已被消费）。
	repo := &refundUserRepoStub{user: &User{ID: owner.ID, Balance: 50}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	err = svc.RequestRefund(ctx, order.ID, owner.ID, "试用后想退")
	require.Error(t, err)
	require.Equal(t, "BALANCE_NOT_ENOUGH", infraerrors.Reason(err),
		"余额不足必须拒绝用户自助退款，避免负余额")

	// DB 中订单状态不应被改写为 REFUND_REQUESTED
	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusCompleted, reload.Status,
		"BALANCE_NOT_ENOUGH 失败路径不可写脏订单状态")
}

// --- PrepareRefund -----------------------------------------------------------

func TestPrepareRefund_OrderNotFound(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	plan, res, err := svc.PrepareRefund(ctx, 999999, 0, "", false, false)
	require.Nil(t, plan)
	require.Nil(t, res)
	require.Error(t, err)
	require.Equal(t, "NOT_FOUND", infraerrors.Reason(err))
}

func TestPrepareRefund_RejectsInvalidStatuses(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "prep-status@example.com", "prps")

	for _, status := range []string{
		OrderStatusPending,
		OrderStatusCancelled,
		OrderStatusRefunding,
		OrderStatusRefunded,
		OrderStatusPartiallyRefunded,
	} {
		t.Run("status="+status, func(t *testing.T) {
			order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
				OutTradeNo:  "sub2_prep_" + status,
				PaymentType: payment.TypeAlipay,
				Status:      status,
				OrderType:   payment.OrderTypeBalance,
			})
			_, _, err := svc.PrepareRefund(ctx, order.ID, 0, "", false, false)
			require.Error(t, err)
			require.Equal(t, "INVALID_STATUS", infraerrors.Reason(err))
		})
	}
}

func TestPrepareRefund_InvalidAmount(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "prep-amt@example.com", "prpa")
	inst, err := client.PaymentProviderInstance.Create().
		SetProviderKey(payment.TypeAlipay).
		SetName("alipay-prep-inst").
		SetConfig("{}").
		SetSupportedTypes("alipay").
		SetEnabled(true).
		SetRefundEnabled(true).
		Save(ctx)
	require.NoError(t, err)
	instID := strconv.FormatInt(inst.ID, 10)
	order, err := client.PaymentOrder.Create().
		SetUserID(owner.ID).
		SetUserEmail(owner.Email).
		SetUserName(owner.Username).
		SetAmount(100).
		SetPayAmount(100).
		SetFeeRate(0).
		SetRechargeCode("RC-PREP-AMT").
		SetOutTradeNo("sub2_prep_amt").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("trade-prep-amt").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetPaidAt(time.Now()).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		SetProviderInstanceID(instID).
		SetProviderKey(payment.TypeAlipay).
		Save(ctx)
	require.NoError(t, err)

	t.Run("NaN", func(t *testing.T) {
		_, _, err := svc.PrepareRefund(ctx, order.ID, math.NaN(), "", false, false)
		require.Error(t, err)
		require.Equal(t, "INVALID_AMOUNT", infraerrors.Reason(err))
	})
	t.Run("Inf", func(t *testing.T) {
		_, _, err := svc.PrepareRefund(ctx, order.ID, math.Inf(1), "", false, false)
		require.Error(t, err)
		require.Equal(t, "INVALID_AMOUNT", infraerrors.Reason(err))
	})
	t.Run("over recharge", func(t *testing.T) {
		_, _, err := svc.PrepareRefund(ctx, order.ID, 1000, "", false, false)
		require.Error(t, err)
		require.Equal(t, "REFUND_AMOUNT_EXCEEDED", infraerrors.Reason(err),
			"退款金额大于充值金额必须被拦截，避免回吐多余资金")
	})
}

func TestPrepareRefund_AmountLeqZeroDefaultsToOrderAmount(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "prep-default@example.com", "prpd")
	inst, err := client.PaymentProviderInstance.Create().
		SetProviderKey(payment.TypeAlipay).
		SetName("alipay-prep-default").
		SetConfig("{}").
		SetSupportedTypes("alipay").
		SetEnabled(true).
		SetRefundEnabled(true).
		Save(ctx)
	require.NoError(t, err)
	instID := strconv.FormatInt(inst.ID, 10)
	order, err := client.PaymentOrder.Create().
		SetUserID(owner.ID).
		SetUserEmail(owner.Email).
		SetUserName(owner.Username).
		SetAmount(88).
		SetPayAmount(88).
		SetFeeRate(0).
		SetRechargeCode("RC-DFLT").
		SetOutTradeNo("sub2_prep_default").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("trade-prep-default").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetPaidAt(time.Now()).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		SetProviderInstanceID(instID).
		SetProviderKey(payment.TypeAlipay).
		Save(ctx)
	require.NoError(t, err)

	plan, res, err := svc.PrepareRefund(ctx, order.ID, 0, "", false, false)
	require.NoError(t, err)
	require.Nil(t, res)
	require.NotNil(t, plan)
	require.InDelta(t, 88, plan.RefundAmount, 1e-9,
		"金额<=0 时应默认为订单 amount")
	require.Equal(t, payment.DeductionTypeNone, plan.DeductionType,
		"deduct=false 路径下不应预设 DeductionType")
}

func TestPrepareRefund_DeductBalance_FetchUserOK(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)

	owner := mustCreateUser(t, ctx, client, "prep-deduct@example.com", "prpdb")
	inst, err := client.PaymentProviderInstance.Create().
		SetProviderKey(payment.TypeAlipay).
		SetName("alipay-prep-deduct").
		SetConfig("{}").
		SetSupportedTypes("alipay").
		SetEnabled(true).
		SetRefundEnabled(true).
		Save(ctx)
	require.NoError(t, err)
	instID := strconv.FormatInt(inst.ID, 10)
	order, err := client.PaymentOrder.Create().
		SetUserID(owner.ID).
		SetUserEmail(owner.Email).
		SetUserName(owner.Username).
		SetAmount(100).
		SetPayAmount(100).
		SetFeeRate(0).
		SetRechargeCode("RC-DEDUCT").
		SetOutTradeNo("sub2_prep_deduct").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("trade-prep-deduct").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetPaidAt(time.Now()).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		SetProviderInstanceID(instID).
		SetProviderKey(payment.TypeAlipay).
		Save(ctx)
	require.NoError(t, err)

	t.Run("balance >= refund: BalanceToDeduct = RefundAmount", func(t *testing.T) {
		repo := &refundUserRepoStub{user: &User{ID: owner.ID, Balance: 500}}
		svc := &PaymentService{entClient: client, userRepo: repo}
		plan, res, err := svc.PrepareRefund(ctx, order.ID, 60, "test", false, true)
		require.NoError(t, err)
		require.Nil(t, res)
		require.Equal(t, payment.DeductionTypeBalance, plan.DeductionType)
		require.InDelta(t, 60, plan.BalanceToDeduct, 1e-9,
			"余额充足时应扣除完整退款金额")
	})

	t.Run("balance < refund: BalanceToDeduct = balance (cap)", func(t *testing.T) {
		repo := &refundUserRepoStub{user: &User{ID: owner.ID, Balance: 30}}
		svc := &PaymentService{entClient: client, userRepo: repo}
		plan, res, err := svc.PrepareRefund(ctx, order.ID, 60, "test", false, true)
		require.NoError(t, err)
		require.Nil(t, res)
		require.Equal(t, payment.DeductionTypeBalance, plan.DeductionType)
		require.InDelta(t, 30, plan.BalanceToDeduct, 1e-9,
			"余额不足时只扣除可用余额，避免触发负余额")
	})
}

func TestPrepareRefund_DeductBalance_FetchUserFailsRequiresForce(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)

	owner := mustCreateUser(t, ctx, client, "prep-deduct-fail@example.com", "prpdf")
	inst, err := client.PaymentProviderInstance.Create().
		SetProviderKey(payment.TypeAlipay).
		SetName("alipay-prep-deduct-fail").
		SetConfig("{}").
		SetSupportedTypes("alipay").
		SetEnabled(true).
		SetRefundEnabled(true).
		Save(ctx)
	require.NoError(t, err)
	instID := strconv.FormatInt(inst.ID, 10)
	order, err := client.PaymentOrder.Create().
		SetUserID(owner.ID).
		SetUserEmail(owner.Email).
		SetUserName(owner.Username).
		SetAmount(40).
		SetPayAmount(40).
		SetFeeRate(0).
		SetRechargeCode("RC-DEDUCT-FAIL").
		SetOutTradeNo("sub2_prep_deduct_fail").
		SetPaymentType(payment.TypeAlipay).
		SetPaymentTradeNo("trade-prep-deduct-fail").
		SetOrderType(payment.OrderTypeBalance).
		SetStatus(OrderStatusCompleted).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SetPaidAt(time.Now()).
		SetClientIP("127.0.0.1").
		SetSrcHost("api.example.com").
		SetProviderInstanceID(instID).
		SetProviderKey(payment.TypeAlipay).
		Save(ctx)
	require.NoError(t, err)

	// userRepo.GetByID 失败
	repo := &refundUserRepoStub{getErr: errors.New("db oops")}
	svc := &PaymentService{entClient: client, userRepo: repo}

	t.Run("without force: returns RequireForce result", func(t *testing.T) {
		plan, res, err := svc.PrepareRefund(ctx, order.ID, 0, "", false, true)
		require.NoError(t, err,
			"非 force 路径下应返回 RefundResult.RequireForce=true，而不是 error")
		require.Nil(t, plan)
		require.NotNil(t, res)
		require.False(t, res.Success)
		require.True(t, res.RequireForce,
			"无法读取余额时应要求 admin 显式 force")
		require.Contains(t, res.Warning, "cannot fetch user balance")
	})

	t.Run("with force: plan returned with no balance deduction", func(t *testing.T) {
		plan, res, err := svc.PrepareRefund(ctx, order.ID, 0, "", true, true)
		require.NoError(t, err)
		require.Nil(t, res)
		require.NotNil(t, plan)
		require.Equal(t, payment.DeductionTypeNone, plan.DeductionType,
			"force 路径下找不到用户余额时应保持 DeductionType=None，避免误扣")
		require.True(t, plan.Force)
	})
}

// --- RollbackRefund: 状态机闭环 -------------------------------------------

func TestRollbackRefund_BalanceReturnsTrueOnSuccess(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{user: &User{ID: 1, Balance: 0}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	p := &RefundPlan{
		OrderID:         123,
		Order:           &dbent.PaymentOrder{ID: 123, UserID: 1},
		DeductionType:   payment.DeductionTypeBalance,
		BalanceToDeduct: 25,
	}
	ok := svc.RollbackRefund(ctx, p, errors.New("gateway fail"))
	require.True(t, ok)
	require.Len(t, repo.updateBalanceCalls, 1)
	require.Equal(t, int64(1), repo.updateBalanceCalls[0].UserID)
	require.InDelta(t, 25, repo.updateBalanceCalls[0].Amount, 1e-9,
		"rollback 必须把扣掉的余额加回去")
}

func TestRollbackRefund_BalanceReturnsFalseOnRepoError(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{
		user:             &User{ID: 1, Balance: 0},
		updateBalanceErr: errors.New("write failed"),
	}
	svc := &PaymentService{entClient: client, userRepo: repo}

	p := &RefundPlan{
		OrderID:         200,
		Order:           &dbent.PaymentOrder{ID: 200, UserID: 1},
		DeductionType:   payment.DeductionTypeBalance,
		BalanceToDeduct: 50,
	}
	ok := svc.RollbackRefund(ctx, p, errors.New("gw"))
	require.False(t, ok,
		"rollback 写库失败必须返回 false，触发上层 REFUND_FAILED 终态而不是悄悄继续")

	// 应写一条 REFUND_ROLLBACK_FAILED 审计日志
	logs, err := svc.GetOrderAuditLogs(ctx, 200)
	require.NoError(t, err)
	require.Len(t, logs, 1)
	require.Equal(t, "REFUND_ROLLBACK_FAILED", logs[0].Action,
		"rollback 失败必须留 REFUND_ROLLBACK_FAILED 审计痕迹，便于人工对账")
}

func TestRollbackRefund_NoopWhenDeductionTypeNone(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{user: &User{ID: 1}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	p := &RefundPlan{
		OrderID:       300,
		Order:         &dbent.PaymentOrder{ID: 300, UserID: 1},
		DeductionType: payment.DeductionTypeNone,
	}
	ok := svc.RollbackRefund(ctx, p, errors.New("gw"))
	require.True(t, ok)
	require.Empty(t, repo.updateBalanceCalls,
		"DeductionType=None 时 rollback 不应触发任何余额操作")
}

func TestRollbackRefund_NoopWhenBalanceToDeductZero(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{user: &User{ID: 1}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	p := &RefundPlan{
		OrderID:         400,
		Order:           &dbent.PaymentOrder{ID: 400, UserID: 1},
		DeductionType:   payment.DeductionTypeBalance,
		BalanceToDeduct: 0,
	}
	ok := svc.RollbackRefund(ctx, p, nil)
	require.True(t, ok)
	require.Empty(t, repo.updateBalanceCalls,
		"BalanceToDeduct=0 时不应调用 UpdateBalance，避免无意义写库与审计噪音")
}

// --- restoreStatus: 状态回写 ---------------------------------------------

func TestRestoreStatus_RefundRequestedRollsBackToRefundRequested(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "rs-rfqd@example.com", "rsrfqd")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_rs_rfqd",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusRefunding, // gateway 失败后正处于 Refunding
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{
		OrderID: order.ID,
		Order:   &dbent.PaymentOrder{ID: order.ID, Status: OrderStatusRefundRequested},
	}
	svc.restoreStatus(ctx, p)

	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusRefundRequested, reload.Status,
		"原状态是 RefundRequested 时，gateway 失败后必须还原回 RefundRequested 而不是 Completed")
}

func TestRestoreStatus_NonRequestedFallsBackToCompleted(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "rs-cmp@example.com", "rscmp")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_rs_cmp",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusRefunding,
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{
		OrderID: order.ID,
		Order:   &dbent.PaymentOrder{ID: order.ID, Status: OrderStatusCompleted},
	}
	svc.restoreStatus(ctx, p)

	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusCompleted, reload.Status)
}

// --- markRefundOk: 全额 vs 部分退款 ----------------------------------------

func TestMarkRefundOk_FullRefundMarksRefunded(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "mark-full@example.com", "mkfull")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_mark_full",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusRefunding,
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{
		OrderID:      order.ID,
		Order:        &dbent.PaymentOrder{ID: order.ID, Amount: 10},
		RefundAmount: 10,
		Reason:       "full",
	}
	res, err := svc.markRefundOk(ctx, p)
	require.NoError(t, err)
	require.True(t, res.Success)

	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusRefunded, reload.Status,
		"退款 == 订单金额时必须置为 Refunded，不能误判为 PartiallyRefunded")
}

func TestMarkRefundOk_PartialRefundMarksPartiallyRefunded(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	owner := mustCreateUser(t, ctx, client, "mark-part@example.com", "mkpart")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_mark_part",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusRefunding,
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{
		OrderID:      order.ID,
		Order:        &dbent.PaymentOrder{ID: order.ID, Amount: 10},
		RefundAmount: 6, // < amount
		Reason:       "partial",
	}
	res, err := svc.markRefundOk(ctx, p)
	require.NoError(t, err)
	require.True(t, res.Success)

	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusPartiallyRefunded, reload.Status,
		"退款 < 订单金额时必须标 PartiallyRefunded，避免审计误判")
	require.InDelta(t, 6, reload.RefundAmount, 1e-9)
}

// --- ExecuteRefund: 状态机锁 --------------------------------------------

func TestExecuteRefund_LocksOrderToRefunding(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{user: &User{ID: 1, Balance: 100}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	owner := mustCreateUser(t, ctx, client, "exec-lock@example.com", "exec")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_exec_lock",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusCompleted,
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{
		OrderID:      order.ID,
		Order:        order,
		RefundAmount: 10,
		// PaymentTradeNo 为空，gwRefund 写一条 REFUND_NO_TRADE_NO 跳过 gateway
	}

	res, err := svc.ExecuteRefund(ctx, p)
	require.NoError(t, err)
	require.True(t, res.Success)

	reload, err := client.PaymentOrder.Get(ctx, order.ID)
	require.NoError(t, err)
	require.Equal(t, OrderStatusRefunded, reload.Status)
}

func TestExecuteRefund_RejectsOrderInWrongStatus(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	repo := &refundUserRepoStub{user: &User{ID: 1}}
	svc := &PaymentService{entClient: client, userRepo: repo}

	owner := mustCreateUser(t, ctx, client, "exec-wrong@example.com", "execw")
	order := mustCreateOrder(t, ctx, client, owner, paymentOrderSeed{
		OutTradeNo:  "sub2_exec_wrong",
		PaymentType: payment.TypeAlipay,
		Status:      OrderStatusRefunding, // 已经在退款中 → 应被 status guard 拒
		OrderType:   payment.OrderTypeBalance,
	})

	p := &RefundPlan{OrderID: order.ID, Order: order, RefundAmount: 5}
	res, err := svc.ExecuteRefund(ctx, p)
	require.Nil(t, res)
	require.Error(t, err)
	require.Equal(t, "CONFLICT", infraerrors.Reason(err),
		"幂等保护：already-refunding 订单的并发 ExecuteRefund 必须返回 CONFLICT")
}
