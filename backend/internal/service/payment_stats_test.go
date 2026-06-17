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
)

// -- 纯函数 helper 测试 -----------------------------------------------------

func TestComputeBasicStats_EmptyOrdersZerosAvg(t *testing.T) {
	st := &DashboardStats{}
	computeBasicStats(st, nil, time.Now())
	require.Equal(t, 0, st.TotalCount)
	require.Equal(t, 0, st.TodayCount)
	require.InDelta(t, 0.0, st.TotalAmount, 1e-9)
	require.InDelta(t, 0.0, st.TodayAmount, 1e-9)
	require.InDelta(t, 0.0, st.AvgAmount, 1e-9,
		"无订单时 AvgAmount 应为 0（不可触发 divide-by-zero NaN）")
	require.False(t, math.IsNaN(st.AvgAmount))
}

func TestComputeBasicStats_RoundsToTwoDecimals(t *testing.T) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	yesterday := todayStart.Add(-1 * time.Hour)

	orders := []*dbent.PaymentOrder{
		// 今日订单：PayAmount 11.115 -> 应被金额舍入到 2 位
		{PayAmount: 11.115, PaidAt: timePtr(todayStart.Add(1 * time.Hour))},
		// 历史订单
		{PayAmount: 22.005, PaidAt: timePtr(yesterday)},
		// PaidAt == todayStart 不应被算作今日（Before 判定）：
		// 实际上 !PaidAt.Before(todayStart) 表示 >= todayStart，因此应算今日
		{PayAmount: 5.005, PaidAt: timePtr(todayStart)},
	}
	st := &DashboardStats{}
	computeBasicStats(st, orders, todayStart)

	require.Equal(t, 3, st.TotalCount)
	require.Equal(t, 2, st.TodayCount,
		"PaidAt 等于 todayStart 时应算入今日（边界包含）")
	// 11.115 + 22.005 + 5.005 = 38.125 → round 38.13
	require.InDelta(t, 38.13, st.TotalAmount, 1e-9)
	// today: 11.115 + 5.005 = 16.12 (round)
	require.InDelta(t, 16.12, st.TodayAmount, 1e-9)
	// avg: 38.125 / 3 = 12.708333… → round 12.71
	require.InDelta(t, 12.71, st.AvgAmount, 1e-9)
}

func TestComputeBasicStats_SkipsOrdersWithoutPaidAt(t *testing.T) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	orders := []*dbent.PaymentOrder{
		{PayAmount: 10, PaidAt: nil}, // 未支付的订单：不应算今日
		{PayAmount: 20, PaidAt: timePtr(todayStart.Add(2 * time.Hour))},
	}
	st := &DashboardStats{}
	computeBasicStats(st, orders, todayStart)
	require.Equal(t, 2, st.TotalCount,
		"TotalCount 不区分 PaidAt 是否为 nil（GetDashboardStats 已经按 PaidAt 过滤）")
	require.Equal(t, 1, st.TodayCount,
		"TodayCount 必须跳过 PaidAt 为 nil 的订单，避免误把未结算订单计为今日成单")
	require.InDelta(t, 20.0, st.TodayAmount, 1e-9)
}

func TestBuildDailySeries_FillsZerosForGapDays(t *testing.T) {
	// since 是 5 天前的午夜；查询窗口包含 5 个日历日。
	// since 是排他下界（buildDailySeries 内 i+1），第 0 日为 since+1 天。
	loc := time.UTC
	since := time.Date(2026, 1, 1, 0, 0, 0, 0, loc)
	// 只在 since+2 这一天有一个订单（按代码：i=1 对应 date = since.AddDate(0,0,2)）
	orderDate := since.AddDate(0, 0, 2)
	orders := []*dbent.PaymentOrder{
		{PayAmount: 99.995, PaidAt: timePtr(orderDate)},
	}
	series := buildDailySeries(orders, since, 5)

	require.Len(t, series, 5, "应输出与 days 一致的天数")
	for i, ds := range series {
		want := since.AddDate(0, 0, i+1).Format("2006-01-02")
		require.Equal(t, want, ds.Date, "第 %d 天日期", i)
	}
	// 验证非订单日金额为 0，订单日金额被舍入到 2 位
	for i, ds := range series {
		if ds.Date == orderDate.Format("2006-01-02") {
			require.Equal(t, 1, ds.Count)
			require.InDelta(t, 100.0, ds.Amount, 1e-9,
				"99.995 应被舍入到 100.00")
			continue
		}
		require.Equal(t, 0, ds.Count, "第 %d 天应无订单", i)
		require.InDelta(t, 0.0, ds.Amount, 1e-9)
	}
}

func TestBuildMethodDistribution_GroupsAndRounds(t *testing.T) {
	orders := []*dbent.PaymentOrder{
		{PaymentType: payment.TypeAlipay, PayAmount: 11.115},
		{PaymentType: payment.TypeAlipay, PayAmount: 22.005},
		{PaymentType: payment.TypeWxpay, PayAmount: 7.5},
	}
	got := buildMethodDistribution(orders)
	require.Len(t, got, 2)

	byType := map[string]PaymentMethodStat{}
	for _, m := range got {
		byType[m.Type] = m
	}

	require.Equal(t, 2, byType[payment.TypeAlipay].Count)
	// 11.115 + 22.005 = 33.12 (round)
	require.InDelta(t, 33.12, byType[payment.TypeAlipay].Amount, 1e-9)
	require.Equal(t, 1, byType[payment.TypeWxpay].Count)
	require.InDelta(t, 7.5, byType[payment.TypeWxpay].Amount, 1e-9)
}

func TestBuildTopUsers_SortsDescAndCapsAtTopUsersLimit(t *testing.T) {
	orders := make([]*dbent.PaymentOrder, 0, topUsersLimit+5)
	// 制造 N 用户，金额递增（uid=1 最小，uid=N 最大）。
	N := topUsersLimit + 5
	for i := 1; i <= N; i++ {
		orders = append(orders, &dbent.PaymentOrder{
			UserID:    int64(i),
			UserEmail: "u" + strconv.Itoa(i) + "@example.com",
			PayAmount: float64(i) * 10.0,
		})
	}
	top := buildTopUsers(orders)
	require.Len(t, top, topUsersLimit,
		"TopUsers 长度必须不超过 topUsersLimit (=%d)", topUsersLimit)
	// 排序：降序
	for i := 1; i < len(top); i++ {
		require.GreaterOrEqual(t, top[i-1].Amount, top[i].Amount,
			"TopUsers 必须按 Amount 降序")
	}
	// 第一名是 uid=N
	require.Equal(t, int64(N), top[0].UserID)
	require.Equal(t, "u"+strconv.Itoa(N)+"@example.com", top[0].Email)
}

func TestBuildTopUsers_FewerThanLimitReturnsAllSorted(t *testing.T) {
	orders := []*dbent.PaymentOrder{
		{UserID: 1, UserEmail: "a@example.com", PayAmount: 10.005},
		{UserID: 1, UserEmail: "a@example.com", PayAmount: 5.005},
		{UserID: 2, UserEmail: "b@example.com", PayAmount: 100},
	}
	top := buildTopUsers(orders)
	require.Len(t, top, 2)
	require.Equal(t, int64(2), top[0].UserID)
	require.InDelta(t, 100, top[0].Amount, 1e-9)
	require.Equal(t, int64(1), top[1].UserID)
	// 10.005 + 5.005 = 15.01 (round)
	require.InDelta(t, 15.01, top[1].Amount, 1e-9)
}

// -- 端到端：GetDashboardStats 走真 sqlite ------------------------------------

func TestGetDashboardStats_EmptyDBReturnsZeroedStatsWithFilledSeries(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	got, err := svc.GetDashboardStats(ctx, 7)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, 0, got.TotalCount)
	require.Equal(t, 0, got.TodayCount)
	require.Equal(t, 0, got.PendingOrders)
	require.InDelta(t, 0, got.AvgAmount, 1e-9)
	require.Len(t, got.DailySeries, 7,
		"DailySeries 必须按 days 输出（空 DB 时全 0 也要占位）")
	for i, ds := range got.DailySeries {
		require.Equal(t, 0, ds.Count, "第 %d 天 Count", i)
		require.InDelta(t, 0, ds.Amount, 1e-9)
	}
	require.Empty(t, got.PaymentMethods)
	require.Empty(t, got.TopUsers)
}

func TestGetDashboardStats_PendingOrdersCountedSeparately(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	user, err := client.User.Create().
		SetEmail("stats-pending@example.com").
		SetPasswordHash("hash").
		SetUsername("stats-pending").
		Save(ctx)
	require.NoError(t, err)

	// 2 个 PENDING 订单
	for i := 0; i < 2; i++ {
		_, err = client.PaymentOrder.Create().
			SetUserID(user.ID).
			SetUserEmail(user.Email).
			SetUserName(user.Username).
			SetAmount(10).
			SetPayAmount(10).
			SetFeeRate(0).
			SetRechargeCode("PENDING-" + strconv.Itoa(i)).
			SetOutTradeNo("sub2_pending_" + strconv.Itoa(i)).
			SetPaymentType(payment.TypeAlipay).
			SetPaymentTradeNo("").
			SetOrderType(payment.OrderTypeBalance).
			SetStatus(OrderStatusPending).
			SetExpiresAt(time.Now().Add(time.Hour)).
			SetClientIP("127.0.0.1").
			SetSrcHost("api.example.com").
			Save(ctx)
		require.NoError(t, err)
	}

	got, err := svc.GetDashboardStats(ctx, 7)
	require.NoError(t, err)
	require.Equal(t, 2, got.PendingOrders,
		"PENDING 订单应仅计入 PendingOrders，不应进入 paidStatuses 聚合")
	require.Equal(t, 0, got.TotalCount,
		"PENDING 订单 PaidAt 为 nil，且状态不在 paidStatuses，不应进入 TotalCount")
}

func TestGetDashboardStats_AggregatesCompletedOrders(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	user, err := client.User.Create().
		SetEmail("stats-agg@example.com").
		SetPasswordHash("hash").
		SetUsername("stats-agg").
		Save(ctx)
	require.NoError(t, err)

	now := time.Now()
	// 三笔 COMPLETED，PaidAt 在过去 7 天内
	amounts := []float64{10.005, 20.005, 7.5}
	for i, a := range amounts {
		_, err = client.PaymentOrder.Create().
			SetUserID(user.ID).
			SetUserEmail(user.Email).
			SetUserName(user.Username).
			SetAmount(a).
			SetPayAmount(a).
			SetFeeRate(0).
			SetRechargeCode("COMP-" + strconv.Itoa(i)).
			SetOutTradeNo("sub2_comp_" + strconv.Itoa(i)).
			SetPaymentType(payment.TypeAlipay).
			SetPaymentTradeNo("trade-" + strconv.Itoa(i)).
			SetOrderType(payment.OrderTypeBalance).
			SetStatus(OrderStatusCompleted).
			SetExpiresAt(now.Add(time.Hour)).
			SetPaidAt(now.Add(-time.Duration(i+1) * time.Hour)).
			SetClientIP("127.0.0.1").
			SetSrcHost("api.example.com").
			Save(ctx)
		require.NoError(t, err)
	}

	got, err := svc.GetDashboardStats(ctx, 7)
	require.NoError(t, err)
	require.Equal(t, 3, got.TotalCount)
	require.InDelta(t, 37.51, got.TotalAmount, 1e-9,
		"10.005+20.005+7.5 = 37.51 (rounded)")
	require.InDelta(t, 37.51/3.0, got.AvgAmount, 0.01)
	require.Len(t, got.PaymentMethods, 1)
	require.Equal(t, payment.TypeAlipay, got.PaymentMethods[0].Type)
	require.Len(t, got.TopUsers, 1)
	require.Equal(t, user.ID, got.TopUsers[0].UserID)
}

func TestGetDashboardStats_DefaultDaysWhenInvalid(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	for _, days := range []int{0, -5} {
		t.Run("days="+strconv.Itoa(days), func(t *testing.T) {
			got, err := svc.GetDashboardStats(ctx, days)
			require.NoError(t, err)
			require.Len(t, got.DailySeries, 30,
				"days<=0 应使用默认 30 天窗口")
		})
	}
}

// -- 审计日志 --------------------------------------------------------------

func TestGetOrderAuditLogs_EmptyForUnknownOrder(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	logs, err := svc.GetOrderAuditLogs(ctx, 99999)
	require.NoError(t, err)
	require.Empty(t, logs,
		"未知 order id 应返回空切片而非 nil 错误")
}

func TestGetOrderAuditLogs_OrderedByCreatedAt(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	const orderID = int64(101)
	// 写两条审计日志，验证按 created_at 升序返回。
	for _, action := range []string{"ORDER_CREATED", "ORDER_PAID"} {
		svc.writeAuditLog(ctx, orderID, action, "test", map[string]any{"k": "v"})
		// 微小延时，确保 created_at 有差异（sqlite 时间戳精度足够）
		time.Sleep(2 * time.Millisecond)
	}

	logs, err := svc.GetOrderAuditLogs(ctx, orderID)
	require.NoError(t, err)
	require.Len(t, logs, 2)
	require.Equal(t, "ORDER_CREATED", logs[0].Action)
	require.Equal(t, "ORDER_PAID", logs[1].Action)
	// detail 是 JSON 字符串
	require.Contains(t, logs[0].Detail, `"k":"v"`)
}

func TestGetOrderAuditLogs_FiltersByOrderID(t *testing.T) {
	ctx := context.Background()
	client := newPaymentConfigServiceTestClient(t)
	svc := &PaymentService{entClient: client}

	svc.writeAuditLog(ctx, 1, "A", "test", nil)
	svc.writeAuditLog(ctx, 2, "B", "test", nil)
	svc.writeAuditLog(ctx, 1, "C", "test", nil)

	logs1, err := svc.GetOrderAuditLogs(ctx, 1)
	require.NoError(t, err)
	require.Len(t, logs1, 2,
		"GetOrderAuditLogs 必须按 OrderID 精确过滤，避免跨订单审计泄漏")

	logs2, err := svc.GetOrderAuditLogs(ctx, 2)
	require.NoError(t, err)
	require.Len(t, logs2, 1)
	require.Equal(t, "B", logs2[0].Action)
}

// note: timePtr 已在 ops_health_score_test.go 中定义，复用即可。
