/**
 * User Dashboard API · M6 dashboard wiring
 *
 * 端点对齐 Vue tree（frontend/src/api/usage.ts + user.ts）：
 *   - GET /api/v1/usage/dashboard/stats             —— 顶部聚合指标
 *   - GET /api/v1/usage/dashboard/trend?...         —— 7 日趋势（chart）
 *   - GET /api/v1/usage?...                         —— 最近请求流水（取前 N）
 *   - GET /api/v1/user/platform-quotas              —— 平台配额（用于 quota card）
 *   - GET /api/v1/subscriptions/me                  —— 用户订阅列表（active count）
 *
 * 设计契约：
 *   - 只暴露 dashboard 页消费的两个聚合方法：getDashboardSummary / getRecentUsage。
 *     其中 getDashboardSummary 串好下面四条子调用（Promise.allSettled），
 *     任何一条 fail 不阻塞其他卡片渲染（rejected → 子字段 null）。
 *   - 返回 UI 友好的 camelCase shape；服务端 snake_case 在 mapper 里收口。
 *   - 不做缓存 —— 由 +page.svelte 自行 stale。
 *   - 失败语义：getRecentUsage 不吞错（上层负责 toast + retry）；
 *     getDashboardSummary 不抛（用 partial 兜底）—— 仪表盘半亮也比白屏好。
 *
 * RED LINE:
 *   - 不引 axios。
 *   - 不在此层执行 401 处理（apiClient 已统一）。
 */
import { apiClient } from '../client';

// ── 公共类型 ─────────────────────────────────────────────────────────────

export interface DashboardSummary {
	/** Quota card —— 累计配额（USD）；null 表示加载失败或没数据。 */
	quota: {
		used: number;
		total: number;
		/** total <= 0 视为不限额。 */
		unlimited: boolean;
	} | null;
	/** Today's requests card —— 今日请求数；null = 加载失败。 */
	todayRequests: number | null;
	/** 订阅卡片 —— 活跃订阅数；null = 加载失败。 */
	activeSubscriptions: number | null;
	/** 7-day trend —— 已展平的 UI 数组。空数组 = 没数据；null = 加载失败。 */
	trend: TrendPoint[] | null;
}

export interface TrendPoint {
	date: string;
	inputTokens: number;
	outputTokens: number;
	requests: number;
}

export interface UsageEntry {
	id: number | string;
	timestamp: string;
	endpoint: string;
	model: string;
	tokens: number;
	cost: number;
}

// ── Raw shapes（后端契约；仅本文件可见） ─────────────────────────────────

interface RawDashboardStats {
	total_cost?: number;
	total_actual_cost?: number;
	today_requests?: number;
	total_quota?: number;
	used_quota?: number;
	[k: string]: unknown;
}

interface RawTrendResponse {
	trend?: Array<{
		date?: string;
		bucket?: string;
		input_tokens?: number;
		output_tokens?: number;
		requests?: number;
		[k: string]: unknown;
	}>;
}

interface RawUsageList {
	items?: Array<{
		id?: number | string;
		created_at?: string;
		timestamp?: string;
		endpoint?: string;
		path?: string;
		model?: string;
		total_tokens?: number;
		input_tokens?: number;
		output_tokens?: number;
		actual_cost?: number;
		cost?: number;
		[k: string]: unknown;
	}>;
}

interface RawPlatformQuotas {
	platform_quotas?: Array<{
		used?: number;
		limit?: number;
		quota?: number;
		[k: string]: unknown;
	}>;
}

interface RawSubscriptionList {
	items?: Array<{ status?: string; [k: string]: unknown }>;
	subscriptions?: Array<{ status?: string; [k: string]: unknown }>;
}

// ── 私有 helpers ─────────────────────────────────────────────────────────

function startOfDayIso(d: Date): string {
	const dd = new Date(d);
	dd.setHours(0, 0, 0, 0);
	return dd.toISOString().slice(0, 10);
}

function past7DayRange(): { start: string; end: string } {
	const end = new Date();
	const start = new Date();
	start.setDate(end.getDate() - 6);
	return { start: startOfDayIso(start), end: startOfDayIso(end) };
}

function mapTrend(raw: RawTrendResponse): TrendPoint[] {
	const arr = raw.trend ?? [];
	return arr.map((p) => ({
		date: String(p.date ?? p.bucket ?? ''),
		inputTokens: Number(p.input_tokens ?? 0),
		outputTokens: Number(p.output_tokens ?? 0),
		requests: Number(p.requests ?? 0)
	}));
}

function mapUsage(raw: RawUsageList, limit: number): UsageEntry[] {
	const items = (raw.items ?? []).slice(0, limit);
	return items.map((it, i) => ({
		id: it.id ?? `row-${i}`,
		timestamp: String(it.created_at ?? it.timestamp ?? ''),
		endpoint: String(it.endpoint ?? it.path ?? ''),
		model: String(it.model ?? ''),
		tokens: Number(
			it.total_tokens ?? (Number(it.input_tokens ?? 0) + Number(it.output_tokens ?? 0))
		),
		cost: Number(it.actual_cost ?? it.cost ?? 0)
	}));
}

// ── 公共入口 ─────────────────────────────────────────────────────────────

/**
 * 聚合首屏数据。
 *
 * 任何一路失败都不抛 —— 对应字段置 null，UI 自行降级（"--"）。
 * 这样仪表盘半亮也好过整屏崩。
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
	const { start, end } = past7DayRange();

	const [statsR, trendR, quotasR, subsR] = await Promise.allSettled([
		apiClient.get<RawDashboardStats>('/api/v1/usage/dashboard/stats'),
		apiClient.get<RawTrendResponse>(
			`/api/v1/usage/dashboard/trend?start_date=${start}&end_date=${end}&granularity=day`
		),
		apiClient.get<RawPlatformQuotas>('/api/v1/user/platform-quotas'),
		apiClient.get<RawSubscriptionList>('/api/v1/subscriptions/me')
	]);

	// quota: 优先 platform-quotas（精确）；否则退回 stats.used_quota / total_quota；
	// 都不可用 → null。
	let quota: DashboardSummary['quota'] = null;
	if (quotasR.status === 'fulfilled') {
		const list = quotasR.value.platform_quotas ?? [];
		if (list.length > 0) {
			let used = 0;
			let total = 0;
			let anyUnlimited = false;
			for (const q of list) {
				used += Number(q.used ?? 0);
				const lim = Number(q.limit ?? q.quota ?? 0);
				if (lim <= 0) anyUnlimited = true;
				else total += lim;
			}
			quota = { used, total, unlimited: anyUnlimited || total <= 0 };
		}
	}
	if (!quota && statsR.status === 'fulfilled') {
		const s = statsR.value;
		const total = Number(s.total_quota ?? 0);
		const used = Number(s.used_quota ?? s.total_actual_cost ?? s.total_cost ?? 0);
		quota = { used, total, unlimited: total <= 0 };
	}

	const todayRequests =
		statsR.status === 'fulfilled' ? Number(statsR.value.today_requests ?? 0) : null;

	let activeSubscriptions: number | null = null;
	if (subsR.status === 'fulfilled') {
		const arr = subsR.value.items ?? subsR.value.subscriptions ?? [];
		activeSubscriptions = arr.filter((x) => String(x.status ?? '').toLowerCase() === 'active')
			.length;
	}

	const trend = trendR.status === 'fulfilled' ? mapTrend(trendR.value) : null;

	return { quota, todayRequests, activeSubscriptions, trend };
}

/**
 * 取最近 N 条 usage 流水（不吞错）。
 *
 * limit 客户端裁剪即可；服务端 page_size 一律 100 防止偶发尾包。
 */
export async function getRecentUsage(limit: number): Promise<UsageEntry[]> {
	const { start, end } = past7DayRange();
	const resp = await apiClient.get<RawUsageList>(
		`/api/v1/usage?start_date=${start}&end_date=${end}&page=1&page_size=100`
	);
	return mapUsage(resp, limit);
}

export const userDashboardApi = {
	getDashboardSummary,
	getRecentUsage
};
