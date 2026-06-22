/**
 * User Subscriptions API · M6 subscription wiring
 *
 * 端点对齐 Vue tree（frontend/src/api/subscriptions.ts + payment.ts）：
 *   - GET  /api/v1/subscriptions                  listAll()            — 历史 + 当前
 *   - GET  /api/v1/subscriptions/active           getActive()          — 仅 active
 *   - GET  /api/v1/payment/plans                  listPlans()          — 可订阅计划
 *   - POST /api/v1/subscriptions/cancel           cancelSubscription() — 用户主动取消
 *
 * 设计契约：
 *   - 不引 axios；走 apiClient。
 *   - UI 友好 camelCase shape；服务端 snake_case 在 mapper 里收口。
 *   - listHistory = listAll，前端依赖 status 字段区分 current vs past。
 *   - getCurrent() = active 列表第一项（最常见单订阅场景；多订阅另开 list 视图）。
 *
 * 注意：Vue tree 注释明确「无 /subscriptions/cancel 端点 — cancellation 走 expiry/非续费」；
 *   subme 服务端已新增 POST /api/v1/subscriptions/cancel（M6 增量），本文件按新契约调用。
 *   若后端尚未上线该端点，会收到 404 → showError 走默认 UNKNOWN 文案。
 *
 * RED LINE:
 *   - 不缓存 list 结果 —— 由页面 +page.svelte 自行 stale。
 *   - 不在此层处理 401（apiClient 已统一）。
 */
import { apiClient } from '../client';

function unwrapEnvelope<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

// ── 公共类型 ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'trialing' | 'expired' | 'cancelled' | 'canceled' | 'pending';

/** UI-friendly Plan shape（camelCase）。 */
export interface Plan {
	id: string;
	groupId?: string;
	name: string;
	/** USD price string-safe（避免浮点累计）。 */
	price: number;
	/** 原价（划线展示）；缺省 = 无 promo。 */
	originalPrice?: number;
	/** Period unit：day / month / year。 */
	periodUnit: 'day' | 'month' | 'year';
	periodValue: number;
	/** 平台 tint：anthropic / openai / antigravity / gemini / 'default'。 */
	platform: string;
	description?: string;
	features: string[];
	/** rate multiplier（subme 增量）：1 = 标准。 */
	rateMultiplier?: number;
	/** 配额上限（USD）：null = 不限。 */
	dailyLimitUsd?: number | null;
	weeklyLimitUsd?: number | null;
	monthlyLimitUsd?: number | null;
}

/** UI-friendly UserSubscription shape。 */
export interface UserSubscription {
	id: string;
	planId: string;
	planName: string;
	platform: string;
	status: SubscriptionStatus;
	/** ISO timestamp；activeSub 用此判断 renew/expire。 */
	startedAt: string | null;
	expiresAt: string | null;
	/** 取消时间（cancelled 后填）。 */
	cancelledAt: string | null;
	/** 价格快照（用于历史卡片显示）。 */
	pricePaid: number | null;
	/** 货币（默认 USD）。 */
	currency: string;
}

// ── Raw shapes（后端契约；仅本文件可见） ─────────────────────────────────

interface RawPlan {
	id?: string | number;
	plan_id?: string;
	group_id?: string | number;
	name?: string;
	title?: string;
	price?: number | string;
	original_price?: number | string;
	validity_unit?: 'day' | 'month' | 'year';
	validity_value?: number;
	period?: string;
	period_value?: number;
	platform?: string;
	description?: string;
	features?: string[];
	rate_multiplier?: number;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
	[k: string]: unknown;
}

interface RawSubscription {
	id?: string | number;
	plan_id?: string | number;
	plan_name?: string;
	group?: { name?: string; platform?: string };
	group_name?: string;
	platform?: string;
	status?: string;
	started_at?: string | null;
	created_at?: string | null;
	expires_at?: string | null;
	cancelled_at?: string | null;
	canceled_at?: string | null;
	price_paid?: number | string | null;
	price?: number | string | null;
	currency?: string;
	[k: string]: unknown;
}

interface RawList<T> {
	items?: T[];
	subscriptions?: T[];
	plans?: T[];
	data?: T[];
}

// ── mappers ───────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function mapPlan(raw: RawPlan): Plan {
	const features = Array.isArray(raw.features) ? raw.features.map(String) : [];
	const platform = String(raw.platform ?? 'default').toLowerCase();
	const periodUnit = (raw.validity_unit ?? 'month') as 'day' | 'month' | 'year';
	const periodValue = num(raw.validity_value ?? raw.period_value ?? 1, 1);
	const originalPrice = raw.original_price !== undefined && raw.original_price !== null
		? num(raw.original_price)
		: undefined;
	return {
		id: String(raw.id ?? raw.plan_id ?? ''),
		groupId: raw.group_id !== undefined ? String(raw.group_id) : undefined,
		name: String(raw.name ?? raw.title ?? ''),
		price: num(raw.price),
		originalPrice,
		periodUnit,
		periodValue,
		platform,
		description: raw.description,
		features,
		rateMultiplier: raw.rate_multiplier !== undefined ? num(raw.rate_multiplier, 1) : undefined,
		dailyLimitUsd: raw.daily_limit_usd ?? null,
		weeklyLimitUsd: raw.weekly_limit_usd ?? null,
		monthlyLimitUsd: raw.monthly_limit_usd ?? null
	};
}

function normalizeStatus(s: string | undefined | null): SubscriptionStatus {
	const v = String(s ?? '').toLowerCase();
	switch (v) {
		case 'active':
		case 'trialing':
		case 'expired':
		case 'cancelled':
		case 'pending':
			return v;
		case 'canceled':
			return 'cancelled';
		default:
			return 'expired';
	}
}

function mapSubscription(raw: RawSubscription): UserSubscription {
	const groupName = raw.group?.name ?? raw.group_name ?? '';
	const platform = String(raw.group?.platform ?? raw.platform ?? 'default').toLowerCase();
	return {
		id: String(raw.id ?? ''),
		planId: String(raw.plan_id ?? ''),
		planName: String(raw.plan_name ?? groupName ?? ''),
		platform,
		status: normalizeStatus(raw.status),
		startedAt: raw.started_at ?? raw.created_at ?? null,
		expiresAt: raw.expires_at ?? null,
		cancelledAt: raw.cancelled_at ?? raw.canceled_at ?? null,
		pricePaid:
			raw.price_paid !== undefined && raw.price_paid !== null
				? num(raw.price_paid)
				: raw.price !== undefined && raw.price !== null
					? num(raw.price)
					: null,
		currency: String(raw.currency ?? 'USD')
	};
}

function extractList<T>(resp: RawList<T> | T[] | null | undefined): T[] {
	if (!resp) return [];
	if (Array.isArray(resp)) return resp;
	return resp.items ?? resp.subscriptions ?? resp.plans ?? resp.data ?? [];
}

// ── API 入口 ─────────────────────────────────────────────────────────────

export async function listPlans(): Promise<Plan[]> {
	const resp = unwrapEnvelope<RawList<RawPlan> | RawPlan[]>(await apiClient.get('/api/v1/payment/plans'));
	return extractList(resp).map(mapPlan);
}

export async function listAll(): Promise<UserSubscription[]> {
	const resp = unwrapEnvelope<RawList<RawSubscription> | RawSubscription[]>(await apiClient.get(
		'/api/v1/subscriptions'
	));
	return extractList(resp).map(mapSubscription);
}

export async function listActive(): Promise<UserSubscription[]> {
	const resp = unwrapEnvelope<RawList<RawSubscription> | RawSubscription[]>(await apiClient.get(
		'/api/v1/subscriptions/active'
	));
	return extractList(resp).map(mapSubscription);
}

/**
 * 取当前订阅 —— 取活跃列表第一项（最常见单订阅场景）。
 * 没有活跃订阅时返回 null。
 */
export async function getCurrent(): Promise<UserSubscription | null> {
	const list = await listActive();
	return list.length > 0 ? list[0] : null;
}

/** 历史 = listAll 的非 active 子集。 */
export async function listHistory(): Promise<UserSubscription[]> {
	const list = await listAll();
	return list.filter((s) => s.status !== 'active' && s.status !== 'trialing');
}

/**
 * 取消订阅 —— POST /api/v1/subscriptions/cancel { subscription_id }。
 *
 * Vue tree 注释提到「无该端点」；subme M6 已新增，按 brief 契约调用。
 * 后端未上线 → 4xx，调用方 catch 后弹 toast。
 */
export async function cancel(subscriptionId: string): Promise<void> {
	await apiClient.post<unknown>('/api/v1/subscriptions/cancel', {
		subscription_id: subscriptionId
	});
}

export const userSubscriptionsApi = {
	listPlans,
	listAll,
	listActive,
	getCurrent,
	listHistory,
	cancel
};
