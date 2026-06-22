/**
 * Admin Subscriptions API · Svelte rewrite（M22 · /(admin)/monetization/subscriptions）
 *
 * GROUND TRUTH（backend/internal/server/routes/admin.go:517-535）—— 仅以下端点真实存在：
 *   - List       : GET    /api/v1/admin/subscriptions
 *   - GetByID    : GET    /api/v1/admin/subscriptions/:id
 *   - GetProgress: GET    /api/v1/admin/subscriptions/:id/progress
 *   - Assign     : POST   /api/v1/admin/subscriptions/assign
 *   - BulkAssign : POST   /api/v1/admin/subscriptions/bulk-assign
 *   - Extend     : POST   /api/v1/admin/subscriptions/:id/extend   body { days:number }
 *   - ResetQuota : POST   /api/v1/admin/subscriptions/:id/reset-quota
 *   - Revoke     : DELETE /api/v1/admin/subscriptions/:id
 *
 * 红线：subscription surface only —— 严禁引用计费核心服务、渠道定价端点、价格查询函数。
 * 注意：后端 NO /:id/cancel、NO /:id/refund、NO /:id/audit-log —— 这些端点不存在，
 *      故本文件不导出 refund()/getAuditLog()，亦不再用 POST /:id/cancel。
 */
import { apiClient } from '../client';

function unwrap<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

// ── 类型契约 ────────────────────────────────────────────────────────────────

export type AdminSubStatus = 'active' | 'cancelled' | 'expired' | 'revoked';

export interface AdminSubscription {
	id: number | string;
	user_id: number;
	user_email?: string;
	plan_id?: number;
	plan_name?: string;
	group_id?: number;
	group_name?: string;
	platform?: string;
	status: AdminSubStatus | string;
	started_at: string;
	expires_at: string;
	cancelled_at?: string | null;
	mtd_cost?: number;
	price_paid?: number;
	currency?: string;
	remaining_value?: number;
}

export interface AdminSubFilter {
	page?: number;
	page_size?: number;
	status?: AdminSubStatus | string;
	plan_id?: number;
	user_id?: number;
	search?: string;
	expires_after?: string;
	expires_before?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface AdminSubListResponse {
	data: AdminSubscription[];
	total: number;
	page: number;
	page_size: number;
}

// ── 内部 helpers ────────────────────────────────────────────────────────────

function buildQuery(filter: AdminSubFilter | undefined): string {
	if (!filter) return '';
	const parts: string[] = [];
	for (const [k, v] of Object.entries(filter)) {
		if (v === undefined || v === null || v === '') continue;
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}

// ── 端点 ────────────────────────────────────────────────────────────────────

const SUBS_BASE = '/api/v1/admin/subscriptions';

export async function listAdminSubs(
	filter?: AdminSubFilter
): Promise<AdminSubListResponse> {
	const qs = buildQuery(filter);
	const raw = unwrap<AdminSubListResponse | AdminSubscription[]>(await apiClient.get(
		`${SUBS_BASE}${qs}`
	));
	if (Array.isArray(raw)) {
		return {
			data: raw,
			total: raw.length,
			page: filter?.page ?? 1,
			page_size: filter?.page_size ?? raw.length
		};
	}
	return {
		data: raw?.data ?? [],
		total: raw?.total ?? 0,
		page: raw?.page ?? filter?.page ?? 1,
		page_size: raw?.page_size ?? filter?.page_size ?? 20
	};
}

export async function getAdminSub(id: number | string): Promise<AdminSubscription> {
	return unwrap<AdminSubscription>(await apiClient.get(`${SUBS_BASE}/${id}`));
}

/**
 * Revoke a subscription as admin.
 *   - DELETE /admin/subscriptions/:id（Revoke 端点，唯一的 admin 取消通道）。
 *   - 后端无 /:id/cancel，故 reason 无法随 body 携带（DELETE 不带 body）；
 *     调用方仅用于触发撤销，理由记录由后端审计层负责。
 */
export async function revokeSub(id: number | string): Promise<void> {
	await apiClient.delete<void>(`${SUBS_BASE}/${id}`);
}

/**
 * Extend a subscription by N days.
 *   - POST /admin/subscriptions/:id/extend  body { days:number }
 *   - 后端契约为 days（相对天数），NOT new_expires_at（绝对时间）。
 */
export async function extendSub(
	id: number | string,
	days: number
): Promise<AdminSubscription> {
	return unwrap<AdminSubscription>(await apiClient.post(`${SUBS_BASE}/${id}/extend`, {
		days
	}));
}

export async function resetQuotaSub(id: number | string): Promise<AdminSubscription> {
	return unwrap<AdminSubscription>(await apiClient.post(`${SUBS_BASE}/${id}/reset-quota`));
}

// ── Assign / Bulk-Assign 类型 ──────────────────────────────────────────────

export interface AssignSubPayload {
	user_id: number;
	group_id: number;
	validity_days?: number;
	notes?: string;
}

export interface BulkAssignSubPayload {
	user_ids: number[];
	group_id: number;
	validity_days?: number;
	notes?: string;
}

export interface BulkAssignResult {
	success_count: number;
	created_count: number;
	reused_count: number;
	failed_count: number;
	subscriptions: AdminSubscription[];
	errors: string[];
	statuses?: Record<string, string>;
}

/**
 * Assign a subscription to a single user.
 *   - POST /admin/subscriptions/assign  body { user_id, group_id, validity_days?, notes? }
 */
export async function assignSub(payload: AssignSubPayload): Promise<AdminSubscription> {
	return unwrap<AdminSubscription>(await apiClient.post(`${SUBS_BASE}/assign`, payload));
}

/**
 * Bulk-assign subscriptions to multiple users.
 *   - POST /admin/subscriptions/bulk-assign  body { user_ids, group_id, validity_days?, notes? }
 */
export async function bulkAssignSub(payload: BulkAssignSubPayload): Promise<BulkAssignResult> {
	return unwrap<BulkAssignResult>(await apiClient.post(`${SUBS_BASE}/bulk-assign`, payload));
}

export const adminSubscriptionsApi = {
	listAdminSubs,
	getAdminSub,
	revokeSub,
	extendSub,
	resetQuotaSub,
	assignSub,
	bulkAssignSub
};

export default adminSubscriptionsApi;
