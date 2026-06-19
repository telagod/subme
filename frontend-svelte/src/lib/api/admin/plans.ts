/**
 * Admin Plans Catalog API · Svelte rewrite（M22 · /(admin)/monetization/plans）
 *
 * 端口自 frontend/src/api/admin/payment.ts 的 plan slice。
 * 与 Vue tree 差异：
 *   - features 字段在线上后端是 JSON 字符串或换行分隔字符串；listPlans 内
 *     直接 parse 成 string[]，上游消费即得；createPlan / updatePlan 反向
 *     join('\n') 还原 backend wire format（Vue tree PlanEditDialog 同款契约）。
 *   - duplicate / archive / restore 是 svelte 前端层包装（后端无独立端点）：
 *       duplicate = createPlan(snapshot)
 *       archive   = updatePlan(id, { for_sale: false })
 *       restore   = updatePlan(id, { for_sale: true })
 *     与 task 描述 plans_api：「NO duplicate / clone / archive endpoint exists」
 *     对齐 —— 用前端组合包装 for_sale 软隐 + 浅克隆复制。
 *
 * 红线（CLAUDE.md billing）：本文件不涉及 billing_service.GetModelPricing 或
 * /admin/channels/model-pricing，仅 /admin/payment/plans 表面。
 */
import { apiClient } from '../client';

// ── 类型契约 ────────────────────────────────────────────────────────────────

export type ValidityUnit = 'days' | 'weeks' | 'months';

export interface AdminPlan {
	id: number;
	group_id: number;
	group_platform?: string;
	group_name?: string;
	rate_multiplier?: number;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
	supported_model_scopes?: string[];
	name: string;
	description: string;
	price: number;
	original_price?: number;
	validity_days: number;
	validity_unit: ValidityUnit | string;
	/** UI side: string[]; backend wire: JSON string or newline-joined string. */
	features: string[];
	for_sale: boolean;
	sort_order: number;
}

export interface AdminGroupLite {
	id: number;
	name: string;
	platform: string;
	rate_multiplier: number;
	subscription_type?: string;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
}

export interface CreatePlanPayload {
	name: string;
	group_id: number;
	description: string;
	price: number;
	original_price?: number;
	validity_days: number;
	validity_unit: ValidityUnit | string;
	sort_order?: number;
	for_sale?: boolean;
	/** UI side: string[]; serializer joins on '\n' before wire. */
	features?: string[];
}

export type UpdatePlanPayload = Partial<CreatePlanPayload>;

// ── 内部 helpers ────────────────────────────────────────────────────────────

interface ListPlansResponse {
	data?: AdminPlanWire[];
	plans?: AdminPlanWire[];
	items?: AdminPlanWire[];
}

type AdminPlanWire = Omit<AdminPlan, 'features'> & { features: string | string[] };

function parseFeatures(raw: string | string[] | undefined): string[] {
	if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
	if (typeof raw !== 'string') return [];
	const trimmed = raw.trim();
	if (!trimmed) return [];
	// Try JSON first (some backends store as JSON-encoded array)
	if (trimmed.startsWith('[')) {
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter((s): s is string => typeof s === 'string');
			}
		} catch {
			// fall through to newline split
		}
	}
	return trimmed
		.split('\n')
		.map((f) => f.trim())
		.filter(Boolean);
}

function normalizePlan(raw: AdminPlanWire): AdminPlan {
	return { ...raw, features: parseFeatures(raw.features) };
}

function serializeWritePayload(p: CreatePlanPayload | UpdatePlanPayload): Record<string, unknown> {
	const out: Record<string, unknown> = { ...p };
	if (p.features !== undefined) {
		out.features = p.features.map((s) => s.trim()).filter(Boolean).join('\n');
	}
	return out;
}

// ── 端点 ────────────────────────────────────────────────────────────────────

const PLANS_BASE = '/api/admin/payment/plans';
const GROUPS_BASE = '/api/admin/groups';

export async function listPlans(): Promise<AdminPlan[]> {
	const raw = await apiClient.get<AdminPlanWire[] | ListPlansResponse>(PLANS_BASE);
	const arr: AdminPlanWire[] = Array.isArray(raw)
		? raw
		: (raw.data ?? raw.plans ?? raw.items ?? []);
	return arr
		.map(normalizePlan)
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export async function getPlan(id: number): Promise<AdminPlan> {
	const raw = await apiClient.get<AdminPlanWire>(`${PLANS_BASE}/${id}`);
	return normalizePlan(raw);
}

export async function createPlan(payload: CreatePlanPayload): Promise<AdminPlan> {
	const wire = await apiClient.post<AdminPlanWire>(PLANS_BASE, serializeWritePayload(payload));
	return normalizePlan(wire);
}

export async function updatePlan(id: number, payload: UpdatePlanPayload): Promise<AdminPlan> {
	const wire = await apiClient.put<AdminPlanWire>(
		`${PLANS_BASE}/${id}`,
		serializeWritePayload(payload)
	);
	return normalizePlan(wire);
}

export async function deletePlan(id: number): Promise<void> {
	await apiClient.delete<void>(`${PLANS_BASE}/${id}`);
}

/**
 * Duplicate = POST a new plan from an existing snapshot.
 * Backend has no /duplicate endpoint —— this is a UI-side affordance.
 * Strategy: copy all writable fields, suffix name with ' (copy)', leave
 * sort_order=0 so it lands at top, force for_sale=false so the operator
 * reviews before publishing.
 */
export async function duplicatePlan(plan: AdminPlan): Promise<AdminPlan> {
	const payload: CreatePlanPayload = {
		name: `${plan.name} (copy)`,
		group_id: plan.group_id,
		description: plan.description,
		price: plan.price,
		original_price: plan.original_price ?? 0,
		validity_days: plan.validity_days,
		validity_unit: plan.validity_unit,
		sort_order: 0,
		for_sale: false,
		features: [...plan.features]
	};
	return createPlan(payload);
}

/**
 * Archive = soft-hide via for_sale=false. No real archive endpoint exists;
 * for_sale is the canonical soft-hide flag (per upstream contract).
 */
export async function archivePlan(id: number): Promise<AdminPlan> {
	return updatePlan(id, { for_sale: false });
}

/**
 * Restore = un-archive via for_sale=true. Symmetric inverse of archivePlan.
 */
export async function restorePlan(id: number): Promise<AdminPlan> {
	return updatePlan(id, { for_sale: true });
}

/**
 * Bulk re-write of sort_order across the catalog. Mirrors Vue tree's
 * Promise.allSettled fan-out on move-up / move-down.
 */
export async function persistSortOrder(ordered: AdminPlan[]): Promise<void> {
	await Promise.allSettled(ordered.map((p, i) => updatePlan(p.id, { sort_order: i })));
}

export async function listGroups(): Promise<AdminGroupLite[]> {
	// Backend exposes both /admin/groups/all (array) and /admin/groups (paginated).
	// We need the full list for the picker, so prefer /all and fall back gracefully.
	try {
		const raw = await apiClient.get<AdminGroupLite[] | { data?: AdminGroupLite[] }>(
			`${GROUPS_BASE}/all`
		);
		if (Array.isArray(raw)) return raw;
		return raw?.data ?? [];
	} catch {
		// Fall back to paginated endpoint (returns { data, total })
		const raw = await apiClient.get<{ data?: AdminGroupLite[] }>(
			`${GROUPS_BASE}?page=1&page_size=200`
		);
		return raw?.data ?? [];
	}
}

export const adminPlansApi = {
	listPlans,
	getPlan,
	createPlan,
	updatePlan,
	deletePlan,
	duplicatePlan,
	archivePlan,
	restorePlan,
	persistSortOrder,
	listGroups
};

export default adminPlansApi;
