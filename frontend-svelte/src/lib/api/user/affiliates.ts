/**
 * User Affiliates API · Svelte rewrite (subme-only increment)
 *
 * GROUND TRUTH (backend/internal/server/routes/user.go) — the ONLY user-side
 * affiliate endpoints that exist:
 *   - GET  /api/v1/user/aff            → UserAffiliateDetail（referral + inline invitees）
 *   - POST /api/v1/user/aff/transfer   → { transferred_quota, balance }（quota → balance）
 *
 * 不存在 withdraw / rebates / invitees / withdrawals 子路由。
 * 历史端口曾按"前瞻契约"打这些幻影子路由 → 全部 404；本次 stop-the-bleeding 删除。
 *
 * 设计契约：
 *   - 不引 axios；走 apiClient 已统一 401 兜底。
 *   - UI 友好 camelCase shape；服务端 snake_case 在 mapper 里收口一次。
 *   - 不缓存；由 +page.svelte 自行 stale。
 *   - 不在此层处理 401；调用方按 'unauthorized' 字符串识别静默。
 *   - invitees 走 /aff 返回的 inline 数组（后端当前唯一来源）。
 */
import { apiClient } from '../client';

function unwrapEnvelope<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

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
	/** 可用返利（待转账到余额）。 */
	availableRebate: number;
	/** 冻结返利（等待解冻）。 */
	frozenRebate: number;
	/** 历史累计返利。 */
	totalRebate: number;
	/** Inline 邀请列表（首屏直接拿到，避免二次请求）。 */
	invitees: AffiliateInvitee[];
}

/** quota → balance 转账响应。 */
export interface TransferResult {
	transferredQuota: number;
	balance: number;
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
	effective_rebate_rate_percent?: number | string;
	invitees?: RawAffiliateInvitee[];
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
		invitees
	};
}

// ── API 入口 ─────────────────────────────────────────────────────────────

/**
 * 取邀请信息（referral code / link / 统计 / inline invitees）。
 *
 * 后端 GET /user/aff 返回 UserAffiliateDetail；mapper 把 snake_case 平铺到
 * ReferralInfo camelCase 形态。invitees 直接来自 detail，无独立列表端点。
 */
export async function getReferralInfo(): Promise<ReferralInfo> {
	const raw = unwrapEnvelope<RawUserAffiliateDetail>(await apiClient.get('/api/v1/user/aff'));
	return mapReferralInfo(raw);
}

/**
 * Transfer：把全部可用 affiliate quota 转入账户余额。
 *
 * 后端 POST /user/aff/transfer 不接收任何 body（subject 取自 JWT），转账全部
 * 可用 quota，返回 { transferred_quota, balance }。
 */
export async function transferAffiliateQuota(): Promise<TransferResult> {
	const raw = unwrapEnvelope<{
		transferred_quota?: number | string;
		balance?: number | string;
	}>(await apiClient.post('/api/v1/user/aff/transfer', {}));
	return {
		transferredQuota: num(raw.transferred_quota),
		balance: num(raw.balance)
	};
}

export const userAffiliatesApi = {
	getReferralInfo,
	transferAffiliateQuota
};
