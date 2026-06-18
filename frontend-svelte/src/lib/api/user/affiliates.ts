/**
 * User Affiliates API · Svelte rewrite (subme-only increment)
 *
 * subme 上游契约（参 frontend/src/api/user.ts + vue_affiliates_view 分析）：
 *   - GET  /api/v1/user/aff             → UserAffiliateDetail（referral + invitees）
 *   - POST /api/v1/user/aff/transfer    → AffiliateTransferResponse（quota → balance）
 *
 * Svelte 端口扩展契约（前瞻；后端落地前部分端点会 4xx 兜底）：
 *   - GET  /api/v1/user/aff             → 复用，承载 referral / 统计 / invitees
 *   - GET  /api/v1/user/aff/invitees    → 列表分页（subme 当前在 detail 内 inline，
 *                                         后端落地后切独立端点，UI 不感知）
 *   - GET  /api/v1/user/aff/rebates     → 返利 ledger（前瞻）
 *   - POST /api/v1/user/aff/withdraw    → 提现（前瞻；subme 当前仅 transfer）
 *   - GET  /api/v1/user/aff/withdrawals → 提现历史（前瞻）
 *
 * 设计契约：
 *   - 不引 axios；走 apiClient 已统一 401 兜底。
 *   - UI 友好 camelCase shape；服务端 snake_case 在 mapper 里收口一次。
 *   - 不缓存；由 +page.svelte 自行 stale。
 *   - 不在此层处理 401；调用方按 'unauthorized' 字符串识别静默。
 *   - 不强依赖前瞻端点：listInvitedUsers 在缺端点时降级回 getReferralInfo
 *     已经返回的 invitees 数组，保证 UI 不空屏。
 *
 * Sentinel 契约（memory reshadcn-migration）：
 *   - rebate ledger status filter 用 '__all__' sentinel；空字符串绝不发送。
 *   - 空字符串在 buildQuery 阶段拦截。
 */
import { apiClient } from '../client';

// ── 公共类型 ─────────────────────────────────────────────────────────────

/** 邀请记录中单个被邀请人。 */
export interface AffiliateInvitee {
	userId: number;
	email: string;
	username: string;
	joinedAt: string | null;
	totalSpend: number;
	rebateGenerated: number;
}

/** Referral / 统计聚合（首屏渲染数据）。 */
export interface ReferralInfo {
	/** 邀请码。 */
	code: string;
	/** 可分享的注册链接（包含 ?ref=<code>）。 */
	link: string;
	/** 当前用户视角下的有效返利比例（百分比，0-100）。 */
	rebateRatePercent: number;
	/** 累计邀请人数。 */
	totalInvited: number;
	/** 可用返利（待提现 / 待转账）。 */
	availableRebate: number;
	/** 冻结返利（等待解冻）。 */
	frozenRebate: number;
	/** 历史累计返利。 */
	totalRebate: number;
	/** 进行中的提现（pending）金额合计。 */
	pendingWithdrawals: number;
	/** Inline 邀请列表（首屏直接拿到，避免二次请求）。 */
	invitees: AffiliateInvitee[];
}

/** Rebate ledger 状态。 */
export type RebateStatus = 'frozen' | 'available' | 'withdrawn' | 'cancelled';

/** Rebate ledger 单条记录。 */
export interface RebateRecord {
	id: string;
	timestamp: string;
	/** 触发返利的被邀请人 user_id（可空：历史数据）。 */
	sourceUserId: number | null;
	/** 触发返利的被邀请人 email（可空）。 */
	sourceEmail: string | null;
	amount: number;
	status: RebateStatus;
	/** 解冻时间（仅 frozen 状态有意义）。 */
	frozenUntil: string | null;
	note: string | null;
}

/** Withdrawal 渠道。 */
export type WithdrawalDestination = 'paypal' | 'alipay' | 'wxpay' | 'bank';

/** Withdrawal 状态。 */
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';

/** Withdrawal 历史记录。 */
export interface WithdrawalRecord {
	id: string;
	timestamp: string;
	amount: number;
	currency: string;
	destination: WithdrawalDestination;
	status: WithdrawalStatus;
	note: string | null;
}

/** Withdrawal 提交 payload。 */
export interface WithdrawalPayload {
	amount: number;
	destination: WithdrawalDestination;
	/** 渠道相关明细：paypal=email; alipay=account; wxpay=openid; bank=account/name/bank。 */
	details: Record<string, string>;
}

/** Withdrawal 提交响应。 */
export interface WithdrawalResponse {
	id: string;
	status: WithdrawalStatus;
}

/** 分页响应包装。 */
export interface Paginated<T> {
	items: T[];
	total: number;
	pages: number;
}

/** Rebate ledger 过滤器。 */
export interface ListRebatesFilter {
	page?: number;
	pageSize?: number;
	/** '__all__' sentinel = 不发 status 参数 → 服务端返回所有。 */
	status?: RebateStatus | '__all__';
}

/** Withdrawal 列表过滤器。 */
export interface ListWithdrawalsFilter {
	page?: number;
	pageSize?: number;
}

// ── Raw shapes（后端契约；仅本文件可见） ────────────────────────────────

interface RawAffiliateInvitee {
	user_id?: number;
	email?: string;
	username?: string;
	created_at?: string | null;
	total_rebate?: number | string;
	total_spend?: number | string;
	[k: string]: unknown;
}

interface RawUserAffiliateDetail {
	user_id?: number;
	aff_code?: string;
	aff_count?: number;
	aff_quota?: number | string;
	aff_frozen_quota?: number | string;
	aff_history_quota?: number | string;
	aff_pending_withdrawal_quota?: number | string;
	effective_rebate_rate_percent?: number | string;
	invitees?: RawAffiliateInvitee[];
	[k: string]: unknown;
}

interface RawRebateRecord {
	id?: string | number;
	created_at?: string | null;
	timestamp?: string | null;
	source_user_id?: number | null;
	source_email?: string | null;
	amount?: number | string;
	status?: string;
	frozen_until?: string | null;
	note?: string | null;
	[k: string]: unknown;
}

interface RawPaginated<T> {
	items?: T[];
	data?: T[];
	records?: T[];
	total?: number;
	pages?: number;
	[k: string]: unknown;
}

interface RawWithdrawalRecord {
	id?: string | number;
	created_at?: string | null;
	timestamp?: string | null;
	amount?: number | string;
	currency?: string;
	destination?: string;
	status?: string;
	note?: string | null;
	[k: string]: unknown;
}

// ── helpers ──────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
	return v == null ? fallback : String(v);
}

function normalizeRebateStatus(v: unknown): RebateStatus {
	const s = String(v ?? '').toLowerCase();
	switch (s) {
		case 'frozen':
		case 'pending_freeze':
			return 'frozen';
		case 'available':
		case 'unlocked':
		case 'ready':
			return 'available';
		case 'withdrawn':
		case 'transferred':
		case 'paid':
			return 'withdrawn';
		case 'cancelled':
		case 'canceled':
		case 'refunded':
			return 'cancelled';
		default:
			return 'available';
	}
}

function normalizeWithdrawalStatus(v: unknown): WithdrawalStatus {
	const s = String(v ?? '').toLowerCase();
	switch (s) {
		case 'pending':
		case 'processing':
			return 'pending';
		case 'approved':
			return 'approved';
		case 'rejected':
		case 'failed':
			return 'rejected';
		case 'paid':
		case 'completed':
		case 'success':
			return 'paid';
		case 'cancelled':
		case 'canceled':
			return 'cancelled';
		default:
			return 'pending';
	}
}

function normalizeDestination(v: unknown): WithdrawalDestination {
	const s = String(v ?? '').toLowerCase();
	if (s === 'paypal' || s === 'alipay' || s === 'wxpay' || s === 'bank') return s;
	return 'paypal';
}

function buildReferralLink(code: string): string {
	if (!code) return '';
	const origin = typeof window !== 'undefined' ? window.location?.origin ?? '' : '';
	return `${origin}/register?ref=${encodeURIComponent(code)}`;
}

function mapInvitee(raw: RawAffiliateInvitee): AffiliateInvitee {
	return {
		userId: num(raw.user_id),
		email: str(raw.email),
		username: str(raw.username),
		joinedAt: raw.created_at ?? null,
		totalSpend: num(raw.total_spend),
		rebateGenerated: num(raw.total_rebate)
	};
}

function mapReferralInfo(raw: RawUserAffiliateDetail): ReferralInfo {
	const code = str(raw.aff_code);
	const invitees = Array.isArray(raw.invitees) ? raw.invitees.map(mapInvitee) : [];
	return {
		code,
		link: buildReferralLink(code),
		rebateRatePercent: num(raw.effective_rebate_rate_percent),
		totalInvited: num(raw.aff_count, invitees.length),
		availableRebate: num(raw.aff_quota),
		frozenRebate: num(raw.aff_frozen_quota),
		totalRebate: num(raw.aff_history_quota),
		pendingWithdrawals: num(raw.aff_pending_withdrawal_quota),
		invitees
	};
}

function mapRebate(raw: RawRebateRecord): RebateRecord {
	return {
		id: String(raw.id ?? ''),
		timestamp: str(raw.created_at ?? raw.timestamp ?? ''),
		sourceUserId: raw.source_user_id ?? null,
		sourceEmail: raw.source_email ?? null,
		amount: num(raw.amount),
		status: normalizeRebateStatus(raw.status),
		frozenUntil: raw.frozen_until ?? null,
		note: raw.note ?? null
	};
}

function mapWithdrawal(raw: RawWithdrawalRecord): WithdrawalRecord {
	return {
		id: String(raw.id ?? ''),
		timestamp: str(raw.created_at ?? raw.timestamp ?? ''),
		amount: num(raw.amount),
		currency: str(raw.currency, 'USD'),
		destination: normalizeDestination(raw.destination),
		status: normalizeWithdrawalStatus(raw.status),
		note: raw.note ?? null
	};
}

function extractList<T>(resp: RawPaginated<T>): T[] {
	return resp.items ?? resp.data ?? resp.records ?? [];
}

function buildRebateQuery(filter: ListRebatesFilter = {}): string {
	const q: Record<string, string> = {};
	q.page = String(filter.page ?? 1);
	q.page_size = String(filter.pageSize ?? 20);
	// '__all__' sentinel → 不发 status 参数。
	if (filter.status && filter.status !== '__all__') q.status = filter.status;
	const usp = new URLSearchParams(q);
	const s = usp.toString();
	return s ? `?${s}` : '';
}

function buildPageQuery(filter: { page?: number; pageSize?: number } = {}): string {
	const q: Record<string, string> = {};
	q.page = String(filter.page ?? 1);
	q.page_size = String(filter.pageSize ?? 20);
	const usp = new URLSearchParams(q);
	const s = usp.toString();
	return s ? `?${s}` : '';
}

// ── API 入口 ─────────────────────────────────────────────────────────────

/**
 * 取邀请信息（referral code / link / 统计 / inline invitees）。
 *
 * subme 当前后端 /user/aff 返回 UserAffiliateDetail；端口 mapper 把
 * snake_case 平铺到 ReferralInfo camelCase 形态。
 */
export async function getReferralInfo(): Promise<ReferralInfo> {
	const raw = await apiClient.get<RawUserAffiliateDetail>('/api/v1/user/aff');
	return mapReferralInfo(raw);
}

/**
 * 列邀请人（分页）。
 *
 * 前瞻端点：/api/v1/user/aff/invitees；缺失时静默降级返回 getReferralInfo
 * 已 inline 的 invitees 第一页快照（保证 UI 不空屏 + 不再多打一次同源请求）。
 *
 * 调用方应当先调 getReferralInfo() 拿统计，再按需 listInvitedUsers() 翻页。
 */
export async function listInvitedUsers(
	filter: { page?: number; pageSize?: number } = {}
): Promise<Paginated<AffiliateInvitee>> {
	try {
		const resp = await apiClient.get<RawPaginated<RawAffiliateInvitee> | RawAffiliateInvitee[]>(
			`/api/v1/user/aff/invitees${buildPageQuery(filter)}`
		);
		if (Array.isArray(resp)) {
			const items = resp.map(mapInvitee);
			return { items, total: items.length, pages: 1 };
		}
		return {
			items: extractList(resp).map(mapInvitee),
			total: num(resp.total, 0),
			pages: num(resp.pages, 0)
		};
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (msg === 'unauthorized') throw err;
		// 端点未落地 → 用 detail 兜底，避免 UI 空屏。
		const detail = await getReferralInfo();
		const pageSize = filter.pageSize ?? 20;
		const page = filter.page ?? 1;
		const start = (page - 1) * pageSize;
		const slice = detail.invitees.slice(start, start + pageSize);
		return {
			items: slice,
			total: detail.invitees.length,
			pages: Math.max(1, Math.ceil(detail.invitees.length / pageSize))
		};
	}
}

/**
 * 列返利账本（分页）。
 *
 * 前瞻端点：/api/v1/user/aff/rebates；后端落地前会 4xx，UI 走空态。
 * sentinel：filter.status === '__all__' → 不发 status 参数。
 */
export async function listRebateLedger(
	filter: ListRebatesFilter = {}
): Promise<Paginated<RebateRecord>> {
	const resp = await apiClient.get<RawPaginated<RawRebateRecord> | RawRebateRecord[]>(
		`/api/v1/user/aff/rebates${buildRebateQuery(filter)}`
	);
	if (Array.isArray(resp)) {
		const items = resp.map(mapRebate);
		return { items, total: items.length, pages: 1 };
	}
	return {
		items: extractList(resp).map(mapRebate),
		total: num(resp.total, 0),
		pages: num(resp.pages, 0)
	};
}

/**
 * 提交提现。
 *
 * 前瞻端点：/api/v1/user/aff/withdraw；subme 当前仅 transfer-to-balance
 * （POST /user/aff/transfer），cash withdrawal 是未来契约。
 */
export async function requestWithdrawal(payload: WithdrawalPayload): Promise<WithdrawalResponse> {
	const raw = await apiClient.post<{ id?: string | number; status?: string }>(
		'/api/v1/user/aff/withdraw',
		{
			amount: payload.amount,
			destination: payload.destination,
			details: payload.details
		}
	);
	return {
		id: String(raw.id ?? ''),
		status: normalizeWithdrawalStatus(raw.status)
	};
}

/**
 * 列提现历史（分页）。
 *
 * 前瞻端点：/api/v1/user/aff/withdrawals；后端落地前会 4xx，UI 走空态。
 */
export async function listWithdrawals(
	filter: ListWithdrawalsFilter = {}
): Promise<Paginated<WithdrawalRecord>> {
	const resp = await apiClient.get<RawPaginated<RawWithdrawalRecord> | RawWithdrawalRecord[]>(
		`/api/v1/user/aff/withdrawals${buildPageQuery(filter)}`
	);
	if (Array.isArray(resp)) {
		const items = resp.map(mapWithdrawal);
		return { items, total: items.length, pages: 1 };
	}
	return {
		items: extractList(resp).map(mapWithdrawal),
		total: num(resp.total, 0),
		pages: num(resp.pages, 0)
	};
}

/**
 * Transfer 接口：把可用 rebate 转入账户余额（subme 当前主路径）。
 * 与 requestWithdrawal 互补：后者打到第三方渠道，前者走系统内余额。
 */
export async function transferAffiliateQuota(): Promise<{
	transferredQuota: number;
	balance: number;
}> {
	const raw = await apiClient.post<{
		transferred_quota?: number | string;
		balance?: number | string;
	}>('/api/v1/user/aff/transfer', {});
	return {
		transferredQuota: num(raw.transferred_quota),
		balance: num(raw.balance)
	};
}

export const userAffiliatesApi = {
	getReferralInfo,
	listInvitedUsers,
	listRebateLedger,
	requestWithdrawal,
	listWithdrawals,
	transferAffiliateQuota
};
