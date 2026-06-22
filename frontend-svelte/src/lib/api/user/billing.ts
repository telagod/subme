/**
 * User Billing API · M6 billing dashboard wiring
 *
 * 端点（display-only over 用户自己的余额 + 交易历史）：
 *   - GET /api/v1/user/billing/balance          getBalance()
 *   - GET /api/v1/user/billing/transactions     listTransactions(filter)
 *   - GET /api/v1/user/billing/transactions/:id getTransaction(id)
 *
 * 设计契约：
 *   - 不引 axios；走 apiClient。
 *   - UI 友好 camelCase shape；服务端 snake_case 在 mapper 里收口一次。
 *   - 不在此层处理 401（apiClient 已统一兜底；调用方按 'unauthorized' 字符串识别）。
 *   - 不缓存结果；由 +page.svelte 自行 stale。
 *   - createTopUp NOT 在这里 —— 那条是 payment.ts 的事（payment agent facade）。
 *
 * RED LINE（memory openrouter-pricing-done）：
 *   - 严禁 import / reference 后端定价/计费内核（the forbidden trio is
 *     documented in CLAUDE memory; intentionally NOT literally spelled here
 *     so static red-line greps stay green over production source）。
 *   - 本文件只读用户视角的 balance + transactions，不涉及定价侧。
 *
 * Sentinel 契约（memory reshadcn-migration）：
 *   - type filter 用 '__all__' sentinel；空字符串绝不发送。
 *   - 空字符串在 buildQuery 阶段拦截。
 */
import { apiClient } from '../client';

function unwrapEnvelope<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

// ── 公共类型 ─────────────────────────────────────────────────────────────

/** Transaction 业务类型枚举。 */
export type BillingTxType = 'topup' | 'charge' | 'refund' | 'rebate';

/** Transaction 状态枚举。 */
export type BillingTxStatus =
	| 'pending'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'refunded';

/** UI-friendly Balance shape（camelCase）。 */
export interface Balance {
	/** 当前余额（美元）。 */
	amount: number;
	/** 货币代码（默认 USD）。 */
	currency: string;
	/** 最近一次结算时间（ISO 字符串），可空。 */
	updatedAt: string | null;
}

/** UI-friendly Transaction shape。 */
export interface BillingTransaction {
	id: string;
	/** 业务类型：topup / charge / refund / rebate。 */
	type: BillingTxType;
	/** 金额（美元；charge 为负、topup 为正，前端不另行变号）。 */
	amount: number;
	/** 货币代码。 */
	currency: string;
	/** 状态。 */
	status: BillingTxStatus;
	/** 发生时间（ISO 字符串）。 */
	timestamp: string;
	/** 业务参考号（订单号 / out_trade_no / refund_id 等），可空。 */
	ref: string | null;
	/** 备注（可空）。 */
	note: string | null;
}

/** 列表过滤参数。 */
export interface ListTransactionsFilter {
	page?: number;
	pageSize?: number;
	/** '__all__' sentinel = 不发 type 参数 → 服务端返回所有。 */
	type?: BillingTxType | '__all__';
	/** 起始日期（YYYY-MM-DD），可空。 */
	startDate?: string;
	/** 结束日期（YYYY-MM-DD），可空。 */
	endDate?: string;
}

/** 分页响应包装。 */
export interface PaginatedTransactions {
	items: BillingTransaction[];
	total: number;
	pages: number;
}

// ── Raw shapes（后端契约；仅本文件可见） ────────────────────────────────

interface RawBalance {
	balance?: number | string;
	amount?: number | string;
	currency?: string;
	updated_at?: string | null;
	last_settled_at?: string | null;
	[k: string]: unknown;
}

interface RawTransaction {
	id?: string | number;
	type?: string;
	amount?: number | string;
	currency?: string;
	status?: string;
	created_at?: string | null;
	timestamp?: string | null;
	occurred_at?: string | null;
	ref?: string | null;
	reference?: string | null;
	order_id?: string | null;
	out_trade_no?: string | null;
	note?: string | null;
	description?: string | null;
	[k: string]: unknown;
}

interface RawPaginatedTransactions {
	items?: RawTransaction[];
	transactions?: RawTransaction[];
	data?: RawTransaction[];
	total?: number;
	pages?: number;
	[k: string]: unknown;
}

// ── helpers ──────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function normalizeType(v: unknown): BillingTxType {
	const s = String(v ?? '').toLowerCase();
	switch (s) {
		case 'topup':
		case 'recharge':
		case 'top_up':
			return 'topup';
		case 'charge':
		case 'consume':
		case 'usage':
			return 'charge';
		case 'refund':
			return 'refund';
		case 'rebate':
		case 'commission':
		case 'reward':
			return 'rebate';
		default:
			return 'charge';
	}
}

function normalizeStatus(v: unknown): BillingTxStatus {
	const s = String(v ?? '').toLowerCase();
	switch (s) {
		case 'pending':
		case 'processing':
			return 'pending';
		case 'completed':
		case 'paid':
		case 'success':
		case 'succeeded':
			return 'completed';
		case 'failed':
		case 'error':
			return 'failed';
		case 'cancelled':
		case 'canceled':
			return 'cancelled';
		case 'refunded':
			return 'refunded';
		default:
			return 'pending';
	}
}

function mapBalance(raw: RawBalance): Balance {
	return {
		amount: num(raw.balance ?? raw.amount),
		currency: String(raw.currency ?? 'USD'),
		updatedAt: raw.updated_at ?? raw.last_settled_at ?? null
	};
}

function mapTransaction(raw: RawTransaction): BillingTransaction {
	return {
		id: String(raw.id ?? ''),
		type: normalizeType(raw.type),
		amount: num(raw.amount),
		currency: String(raw.currency ?? 'USD'),
		status: normalizeStatus(raw.status),
		timestamp: String(raw.created_at ?? raw.timestamp ?? raw.occurred_at ?? ''),
		ref:
			raw.ref ??
			raw.reference ??
			raw.order_id ??
			raw.out_trade_no ??
			null,
		note: raw.note ?? raw.description ?? null
	};
}

function extractTxList(resp: RawPaginatedTransactions): RawTransaction[] {
	return resp.items ?? resp.transactions ?? resp.data ?? [];
}

function buildQuery(filter: ListTransactionsFilter = {}): string {
	const q: Record<string, string> = {};
	q.page = String(filter.page ?? 1);
	q.page_size = String(filter.pageSize ?? 20);
	// '__all__' sentinel → 不发 type 参数；服务端默认返回所有。
	if (filter.type && filter.type !== '__all__') q.type = filter.type;
	if (filter.startDate) q.start_date = filter.startDate;
	if (filter.endDate) q.end_date = filter.endDate;
	const usp = new URLSearchParams(q);
	const s = usp.toString();
	return s ? `?${s}` : '';
}

// ── API 入口 ─────────────────────────────────────────────────────────────

/**
 * 取当前余额。
 *
 * 后端未返回 balance → amount=0，UI 自行降级显示 $0.00。
 */
export async function getBalance(): Promise<Balance> {
	const raw = unwrapEnvelope<RawBalance>(await apiClient.get('/api/v1/user/billing/balance'));
	return mapBalance(raw);
}

/**
 * 取交易历史（分页）。
 *
 * sentinel：filter.type === '__all__' → 不发送 type 参数（buildQuery 内拦截）。
 */
export async function listTransactions(
	filter: ListTransactionsFilter = {}
): Promise<PaginatedTransactions> {
	const resp = unwrapEnvelope<RawPaginatedTransactions | RawTransaction[]>(await apiClient.get(
		`/api/v1/user/billing/transactions${buildQuery(filter)}`
	));
	if (Array.isArray(resp)) {
		const items = resp.map(mapTransaction);
		return { items, total: items.length, pages: 1 };
	}
	return {
		items: extractTxList(resp).map(mapTransaction),
		total: num(resp.total, 0),
		pages: num(resp.pages, 0)
	};
}

/** 取单笔交易明细。 */
export async function getTransaction(id: string): Promise<BillingTransaction> {
	const raw = unwrapEnvelope<RawTransaction>(await apiClient.get(
		`/api/v1/user/billing/transactions/${encodeURIComponent(id)}`
	));
	return mapTransaction(raw);
}

export const userBillingApi = {
	getBalance,
	listTransactions,
	getTransaction
};
