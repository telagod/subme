/**
 * User Usage API · M7+ usage analytics wiring
 *
 * 端点对齐 Vue tree（frontend/src/api/usage.ts）—— 但只暴露 svelte usage 页消费的子集：
 *   - GET /api/v1/usage                          —— 分页流水（listUsage）
 *   - GET /api/v1/usage/stats?period=...         —— 区间聚合（getUsageSummary）
 *   - GET /api/v1/usage/dashboard/trend?...      —— 时序图源（getUsageTrend）
 *   - GET /api/v1/usage（client loop）            —— CSV 导出（exportCsv）
 *
 * 设计契约：
 *   - 不引 axios；走 apiClient（已统一 401 兜底）。
 *   - UI 友好 camelCase shape；服务端 snake_case 在 mapper 里收口一次。
 *   - models filter 支持多选 + '__all__' sentinel —— 与 reshadcn-migration 红线对齐：
 *     '__all__' 字面值 = 不发 model 参数。空字符串绝不发送。
 *   - exportCsv 完全客户端 loop（page_size=1000）；与 Vue tree UsageView 行为一致，
 *     避免无服务端 CSV endpoint 时白屏。> 10k 行需要换流式后端，本层不做。
 *
 * RED LINE（memory openrouter-pricing-done）：
 *   - 严禁 import / reference 后端定价/计费内核 —— 见 CLAUDE memory；
 *     字面符号名故意不在此处出现，红线 grep 维持空命中。
 *
 * Sentinel 契约（memory reshadcn-migration）：
 *   - models filter 用 '__all__' sentinel；endpoint filter 同样。
 *   - 任何 sentinel 字符串绝不出现在 URL query 里。
 */
import { apiClient } from '../client';

function unwrapEnvelope<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

// ── 公共类型 ─────────────────────────────────────────────────────────────

/** 时序粒度：日 / 小时；模型 / 端点 聚合下退回 day 时序。 */
export type UsageGranularity = 'day' | 'hour' | 'model' | 'endpoint';

/** 单行流水（UI 友好）。 */
export interface UsageEntry {
	id: number | string;
	/** ISO 字符串。 */
	timestamp: string;
	model: string;
	endpoint: string;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	status: string;
	/** 请求总耗时（ms）。 */
	latencyMs: number;
}

/** 顶部 3 张卡片聚合。 */
export interface UsageSummary {
	totalRequests: number;
	totalTokens: number;
	totalCost: number;
}

/** 时序图单点（chart 复用 dashboard UsageChart 时映射到 TrendPoint shape）。 */
export interface UsageTrendPoint {
	/** bucket label：day=YYYY-MM-DD；hour=YYYY-MM-DDTHH；model/endpoint=维度字符串。 */
	bucket: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

/** 通用过滤器 —— 三个 read 接口共用。 */
export interface UsageFilter {
	page?: number;
	pageSize?: number;
	/** 起始日期 YYYY-MM-DD（含）。 */
	startDate?: string;
	/** 结束日期 YYYY-MM-DD（含）。 */
	endDate?: string;
	/**
	 * 多选 model；'__all__' 或空数组 = 不发送 model 参数。
	 * 单元素直接发 model=xxx；多元素发 model=a&model=b（与 Vue tree 兼容）。
	 */
	models?: string[] | '__all__';
	/** 单选 endpoint；'__all__' = 不发送。 */
	endpoint?: string | '__all__';
	/** 聚合粒度：仅 trend 接口使用，list/summary 接口忽略。 */
	groupBy?: UsageGranularity;
	/** 排序键（仅 list 接口）。 */
	sortBy?: string;
	/** 排序方向（仅 list 接口）。 */
	sortOrder?: 'asc' | 'desc';
}

export interface PaginatedUsage {
	items: UsageEntry[];
	total: number;
	pages: number;
}

// ── Raw shapes（后端契约；仅本文件可见） ─────────────────────────────────

interface RawUsageRow {
	id?: number | string;
	created_at?: string;
	timestamp?: string;
	model?: string;
	endpoint?: string;
	path?: string;
	inbound_endpoint?: string;
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	actual_cost?: number;
	cost?: number;
	total_cost?: number;
	status?: string;
	status_code?: number | string;
	duration_ms?: number;
	latency_ms?: number;
	[k: string]: unknown;
}

interface RawUsageList {
	items?: RawUsageRow[];
	total?: number;
	pages?: number;
	[k: string]: unknown;
}

interface RawUsageStats {
	total_requests?: number;
	total_tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
	total_cost?: number;
	total_actual_cost?: number;
	actual_cost?: number;
	[k: string]: unknown;
}

interface RawTrendResp {
	trend?: Array<{
		date?: string;
		bucket?: string;
		hour?: string;
		model?: string;
		endpoint?: string;
		requests?: number;
		input_tokens?: number;
		output_tokens?: number;
		cost?: number;
		actual_cost?: number;
		[k: string]: unknown;
	}>;
	[k: string]: unknown;
}

// ── helpers ──────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function mapRow(raw: RawUsageRow, idx: number): UsageEntry {
	return {
		id: raw.id ?? `row-${idx}`,
		timestamp: String(raw.created_at ?? raw.timestamp ?? ''),
		model: String(raw.model ?? ''),
		endpoint: String(raw.inbound_endpoint ?? raw.endpoint ?? raw.path ?? ''),
		inputTokens: num(raw.input_tokens),
		outputTokens: num(raw.output_tokens),
		cost: num(raw.actual_cost ?? raw.cost ?? raw.total_cost),
		status: String(raw.status ?? raw.status_code ?? 'ok'),
		latencyMs: num(raw.duration_ms ?? raw.latency_ms)
	};
}

function mapTrend(raw: RawTrendResp): UsageTrendPoint[] {
	const arr = raw.trend ?? [];
	return arr.map((p) => ({
		bucket: String(p.bucket ?? p.date ?? p.hour ?? p.model ?? p.endpoint ?? ''),
		requests: num(p.requests),
		inputTokens: num(p.input_tokens),
		outputTokens: num(p.output_tokens),
		cost: num(p.cost ?? p.actual_cost)
	}));
}

/**
 * 构造 query 字符串。
 *
 * sentinel 拦截：'__all__' 一律不发；空数组 / 空字符串同样拦截。
 * 多选 model 走重复参数（model=a&model=b）—— 与后端 Vue tree 一致。
 */
function buildQuery(filter: UsageFilter = {}, opts: { trend?: boolean; list?: boolean } = {}): string {
	const usp = new URLSearchParams();
	if (opts.list !== false) {
		// list/summary 接口默认带分页；trend 不带。
		if (!opts.trend) {
			usp.set('page', String(filter.page ?? 1));
			usp.set('page_size', String(filter.pageSize ?? 20));
		}
	}
	if (filter.startDate) usp.set('start_date', filter.startDate);
	if (filter.endDate) usp.set('end_date', filter.endDate);
	if (filter.models && filter.models !== '__all__') {
		for (const m of filter.models) {
			if (m && m !== '__all__') usp.append('model', m);
		}
	}
	if (filter.endpoint && filter.endpoint !== '__all__') {
		usp.set('endpoint', filter.endpoint);
	}
	if (opts.trend && filter.groupBy) {
		usp.set('granularity', filter.groupBy);
	}
	if (!opts.trend && filter.sortBy) usp.set('sort_by', filter.sortBy);
	if (!opts.trend && filter.sortOrder) usp.set('sort_order', filter.sortOrder);
	const s = usp.toString();
	return s ? `?${s}` : '';
}

// ── 公共入口 ─────────────────────────────────────────────────────────────

/**
 * 分页流水。
 *
 * 默认 page=1, pageSize=20。
 */
export async function listUsage(filter: UsageFilter = {}): Promise<PaginatedUsage> {
	const resp = unwrapEnvelope<RawUsageList>(await apiClient.get(`/api/v1/usage${buildQuery(filter)}`));
	const items = (resp.items ?? []).map(mapRow);
	return {
		items,
		total: num(resp.total, items.length),
		pages: num(resp.pages, items.length > 0 ? 1 : 0)
	};
}

/**
 * 区间聚合（顶部 3 张卡片）。
 */
export async function getUsageSummary(filter: UsageFilter = {}): Promise<UsageSummary> {
	const resp = unwrapEnvelope<RawUsageStats>(await apiClient.get(`/api/v1/usage/stats${buildQuery(filter)}`));
	const inputT = num(resp.input_tokens);
	const outputT = num(resp.output_tokens);
	const total = num(resp.total_tokens, inputT + outputT);
	return {
		totalRequests: num(resp.total_requests),
		totalTokens: total,
		totalCost: num(resp.total_actual_cost ?? resp.actual_cost ?? resp.total_cost)
	};
}

/**
 * 时序图源（line chart）。
 *
 * groupBy 决定 bucket 维度；'day' / 'hour' 时间序，'model' / 'endpoint' 维度序。
 */
export async function getUsageTrend(filter: UsageFilter = {}): Promise<UsageTrendPoint[]> {
	const q = buildQuery({ ...filter, groupBy: filter.groupBy ?? 'day' }, { trend: true, list: false });
	const resp = unwrapEnvelope<RawTrendResp>(await apiClient.get(`/api/v1/usage/dashboard/trend${q}`));
	return mapTrend(resp);
}

// ── CSV export ───────────────────────────────────────────────────────────

const CSV_HEADERS = [
	'timestamp',
	'model',
	'endpoint',
	'input_tokens',
	'output_tokens',
	'cost',
	'status',
	'latency_ms'
];

/**
 * CSV formula-injection 防御：以 = + - @ 开头的字段补单引号前缀。
 * 与 Vue tree UsageView 同款实现。
 */
function escapeCsv(v: unknown): string {
	let s = v === null || v === undefined ? '' : String(v);
	if (/^[=+\-@]/.test(s)) s = "'" + s;
	if (/[",\n\r]/.test(s)) {
		s = '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

function rowsToCsv(rows: UsageEntry[]): string {
	const out: string[] = [CSV_HEADERS.join(',')];
	for (const r of rows) {
		out.push(
			[
				r.timestamp,
				r.model,
				r.endpoint,
				r.inputTokens,
				r.outputTokens,
				r.cost,
				r.status,
				r.latencyMs
			]
				.map(escapeCsv)
				.join(',')
		);
	}
	return out.join('\n');
}

/**
 * 浏览器侧 CSV 导出。
 *
 * 设计：
 *   - 客户端 loop /api/v1/usage（page_size=1000），直到 pagination.total 覆盖完。
 *   - 与 Vue tree UsageView 行为一致；> 10k 行需要后端流式端点（本层不做）。
 *   - 触发 Blob + URL.createObjectURL + <a download> click 下载；
 *     filename = usage-YYYYMMDD-HHmmss.csv。
 *   - 测试可 mock URL.createObjectURL；本函数对 typeof document/URL 做兜底，
 *     SSR 调用直接返回（不抛）。
 */
export async function exportCsv(filter: UsageFilter = {}): Promise<void> {
	const PAGE_SIZE = 1000;
	const all: UsageEntry[] = [];
	let page = 1;
	// 第一页确定 total；后续 loop。最多 50 页保护，避免恶意 total 让浏览器跑死。
	const MAX_PAGES = 50;
	for (let i = 0; i < MAX_PAGES; i++) {
		const resp = await listUsage({ ...filter, page, pageSize: PAGE_SIZE });
		all.push(...resp.items);
		const totalPages = resp.pages > 0 ? resp.pages : Math.ceil(resp.total / PAGE_SIZE);
		if (page >= totalPages || resp.items.length < PAGE_SIZE) break;
		page += 1;
	}

	const csv = rowsToCsv(all);
	if (typeof document === 'undefined' || typeof URL === 'undefined') return;

	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `usage-${csvTimestamp()}.csv`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	// URL.revokeObjectURL 在某些 jsdom 版本不存在；try/catch 兜底。
	try {
		URL.revokeObjectURL(url);
	} catch {
		/* noop */
	}
}

function csvTimestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
		`-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

// ── Error requests ─────────────────────────────────────────────────────

export interface UserErrorRequest {
	id: number;
	timestamp: string;
	created_at?: string;
	model: string;
	endpoint: string;
	inboundEndpoint?: string;
	inbound_endpoint?: string;
	status_code: number;
	statusCode?: number;
	error_type: string;
	category?: string;
	error_message: string;
	message?: string;
	latency_ms: number;
	platform?: string;
	createdAt?: string;
	api_key_name?: string;
	apiKeyName?: string;
	keyName?: string;
	api_key_deleted?: boolean;
	apiKeyDeleted?: boolean;
	keyDeleted?: boolean;
}

export interface UserErrorRequestDetail extends UserErrorRequest {
	request_body?: string;
	response_body?: string;
	request_headers?: Record<string, string>;
	response_headers?: Record<string, string>;
	headers?: Record<string, string>;
	upstream_error?: string;
	upstreamError?: string;
	upstreamStatusCode?: number;
	upstream_status_code?: number;
	errorBody?: string;
	error_body?: string;
	account_name?: string;
	accountName?: string;
	duration_ms?: number;
}

export interface PaginatedErrors {
	items: UserErrorRequest[];
	total: number;
	page: number;
	page_size: number;
}

export async function listErrorRequests(
	page = 1,
	pageSize = 20,
	filters: Record<string, string | undefined> = {}
): Promise<PaginatedErrors> {
	const usp = new URLSearchParams();
	usp.set('page', String(page));
	usp.set('page_size', String(pageSize));
	for (const [k, v] of Object.entries(filters)) {
		if (v) usp.set(k, v);
	}
	return unwrapEnvelope<PaginatedErrors>(await apiClient.get(`/api/v1/usage/errors?${usp}`));
}

export async function getErrorDetail(id: number): Promise<UserErrorRequestDetail> {
	return unwrapEnvelope<UserErrorRequestDetail>(await apiClient.get(`/api/v1/usage/errors/${id}`));
}

export const userUsageApi = {
	listUsage,
	getUsageSummary,
	getUsageTrend,
	exportCsv,
	listErrorRequests,
	getErrorDetail
};
