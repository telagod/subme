/**
 * Admin Payment Dashboard API · Svelte rewrite（M12 · /(admin)/orders/dashboard）
 *
 * 端口自 Vue tree 的 `adminPaymentAPI.getDashboard(days?)`，原始 backend 端点
 * 仅一条：`GET /api/admin/payment/dashboard?days=N`，返回 `DashboardStats`
 * 聚合包（today/total + daily_series + payment_methods + top_users）。
 *
 * Task 描述要求暴露 3 个函数（getDashboardStats / getDashboardTrend /
 * getProviderBreakdown）。后端不存在拆分端点 —— 因此本模块以 ONE-CALL +
 * CLIENT-SIDE PROJECTION 策略实现：
 *
 *   1. 内部 `fetchDashboard(days)` 调一次后端拿全量聚合。
 *   2. `getDashboardStats` 投影顶部 KPI 切片（今日 / MTD / 退款 / 订阅维度）。
 *   3. `getDashboardTrend` 投影 `daily_series` 做时序 view。
 *   4. `getProviderBreakdown` 把 `payment_methods` 折算成 provider 行
 *      （success_rate / avg_ticket 由前端从同一份载荷推导，
 *       后端未直出）。
 *
 * 设计 invariant：
 *   - 三个函数都接受 `DashboardRange` 入参（保持调用面对称），但同窗口
 *     的三次调用会被 in-flight memoization 折叠成一次后端请求，
 *     避免页面初始化 3× round-trip。
 *   - in-flight cache 仅作 request collapsing 用，TTL = 调用面用完即清；
 *     不做长期缓存（admin dashboard 数据每次手动 refresh 触发）。
 *
 * 红线（CLAUDE.md billing）：
 *   - 本文件**不**引用计费核心 service、渠道定价端点、价格查询函数；
 *   - 不在模块顶层 import @stripe / airwallex / chart.js 等 lazy island；
 *   - 退款审计与定价决策走各自专属表面（M11 RefundDialog / billing service）。
 */
import { apiClient } from '../client';

// ── 类型契约 ────────────────────────────────────────────────────────────────

export type DashboardGranularity = 'day' | 'week';

export interface DashboardRange {
	/** 整数天数（与 Vue tree `days` 入参对齐：7 / 30 / 90 / 180）。 */
	days: number;
	/** 可选 granularity — 后端不消费，前端 chart 侧自行采样。 */
	granularity?: DashboardGranularity;
}

export interface DashboardStatsSnapshot {
	today_revenue: number;
	today_orders: number;
	today_refunds: number;
	mtd_revenue: number;
	active_subscriptions: number | null;
	churn_rate: number | null;
	total_revenue: number;
	total_orders: number;
	avg_amount: number;
}

export interface DashboardTrendPoint {
	date: string;
	revenue: number;
	count: number;
}

export interface ProviderBreakdownRow {
	provider: string;
	revenue: number;
	order_count: number;
	avg_ticket: number;
	success_rate: number;
}

// ── 后端聚合包（与 Vue tree DashboardStats 1:1）────────────────────────────

interface DashboardWire {
	today_amount?: number;
	total_amount?: number;
	today_count?: number;
	total_count?: number;
	avg_amount?: number;
	today_refund_amount?: number;
	mtd_amount?: number;
	active_subscriptions?: number;
	churn_rate?: number;
	daily_series?: Array<{
		date: string;
		amount: number;
		count: number;
		refund_amount?: number;
	}>;
	payment_methods?: Array<{
		type: string;
		amount: number;
		count: number;
		success_count?: number;
		fail_count?: number;
	}>;
	top_users?: Array<{ user_id: number; email: string; amount: number }>;
}

// ── In-flight memoization（同窗口 3 函数折叠成 1 次后端请求）────────────────

interface InflightEntry {
	key: string;
	promise: Promise<DashboardWire>;
}

let inflight: InflightEntry | null = null;

function rangeKey(range: DashboardRange): string {
	return `d=${range.days}`;
}

async function fetchDashboard(range: DashboardRange): Promise<DashboardWire> {
	const key = rangeKey(range);
	if (inflight && inflight.key === key) return inflight.promise;
	const promise = (async () => {
		try {
			const qs = `?days=${encodeURIComponent(String(range.days))}`;
			const raw = await apiClient.get<DashboardWire>(`/api/admin/payment/dashboard${qs}`);
			return raw ?? {};
		} finally {
			// 同步窗口结束后清缓存：下一次调用会重新打后端。
			queueMicrotask(() => {
				if (inflight && inflight.key === key) inflight = null;
			});
		}
	})();
	inflight = { key, promise };
	return promise;
}

/** 测试钩子：vitest 中重置 in-flight 状态，避免跨 case 串味。 */
export function __resetDashboardCache(): void {
	inflight = null;
}

// ── 投影函数 ────────────────────────────────────────────────────────────────

export async function getDashboardStats(
	range: DashboardRange
): Promise<DashboardStatsSnapshot> {
	const raw = await fetchDashboard(range);
	return {
		today_revenue: raw.today_amount ?? 0,
		today_orders: raw.today_count ?? 0,
		today_refunds: raw.today_refund_amount ?? 0,
		mtd_revenue: raw.mtd_amount ?? raw.total_amount ?? 0,
		active_subscriptions:
			typeof raw.active_subscriptions === 'number' ? raw.active_subscriptions : null,
		churn_rate: typeof raw.churn_rate === 'number' ? raw.churn_rate : null,
		total_revenue: raw.total_amount ?? 0,
		total_orders: raw.total_count ?? 0,
		avg_amount: raw.avg_amount ?? 0
	};
}

export async function getDashboardTrend(
	range: DashboardRange,
	granularity: DashboardGranularity = 'day'
): Promise<DashboardTrendPoint[]> {
	const raw = await fetchDashboard({ ...range, granularity });
	const rows = raw.daily_series ?? [];
	const points: DashboardTrendPoint[] = rows.map((r) => ({
		date: r.date,
		revenue: r.amount ?? 0,
		count: r.count ?? 0
	}));
	if (granularity !== 'week') return points;

	// 简易按周聚合 —— 每 7 个 daily 点收成 1 个 weekly 点；
	// chart 侧用同样语义索引到 label。Vue tree 没有 week granularity，
	// 这里仅为 task 描述的入参一致性做兜底。
	const weekly: DashboardTrendPoint[] = [];
	for (let i = 0; i < points.length; i += 7) {
		const chunk = points.slice(i, i + 7);
		const revenue = chunk.reduce((s, p) => s + p.revenue, 0);
		const count = chunk.reduce((s, p) => s + p.count, 0);
		weekly.push({ date: chunk[0]?.date ?? '', revenue, count });
	}
	return weekly;
}

export async function getProviderBreakdown(
	range: DashboardRange
): Promise<ProviderBreakdownRow[]> {
	const raw = await fetchDashboard(range);
	const methods = raw.payment_methods ?? [];
	return methods.map((m) => {
		const successCount = m.success_count ?? m.count ?? 0;
		const failCount = m.fail_count ?? 0;
		const denom = successCount + failCount;
		const success_rate = denom > 0 ? successCount / denom : 1;
		const order_count = m.count ?? 0;
		const avg_ticket = order_count > 0 ? (m.amount ?? 0) / order_count : 0;
		return {
			provider: m.type,
			revenue: m.amount ?? 0,
			order_count,
			avg_ticket,
			success_rate
		};
	});
}

export const adminPaymentDashboardApi = {
	getDashboardStats,
	getDashboardTrend,
	getProviderBreakdown
};

export default adminPaymentDashboardApi;
