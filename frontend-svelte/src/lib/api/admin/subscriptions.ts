/**
 * Admin Subscriptions API · Svelte rewrite（M22 · /(admin)/monetization/subscriptions）
 *
 * 端口自 Vue tree 的 subscriptionsAPI + 红线：
 *   - 本文件只触 subscription surface 端点（/admin/subscriptions 与 /admin/subscriptions/:id/refund）；
 *   - 严禁引用计费核心服务、渠道定价端点、价格查询函数（见 cultivating-skills 红线手册）。
 *   - refund 是 subscription-side 包装：POST /admin/subscriptions/:id/refund —— 与 task 描述
 *     「RefundDialog → POST /api/v1/admin/subscriptions/:id/refund」契约对齐。
 *
 * 端点：
 *   - listAdminSubs(filter)        : GET /api/admin/subscriptions
 *   - getAdminSub(id)              : GET /api/admin/subscriptions/:id
 *   - forceCancelSub(id, reason)   : DELETE /api/admin/subscriptions/:id（携带 reason 进 body）
 *   - refundSub(id, payload)       : POST /api/admin/subscriptions/:id/refund
 *   - extendSub(id, newExpiresAt)  : POST /api/admin/subscriptions/:id/extend
 *   - getAuditLog(id)              : GET /api/admin/subscriptions/:id/audit-log
 */
import { apiClient } from '../client';

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

export interface AdminSubAuditEntry {
	id: number;
	subscription_id: number | string;
	action: string;
	actor?: string;
	actor_id?: number;
	reason?: string;
	created_at: string;
	metadata?: Record<string, unknown>;
}

export interface RefundPayload {
	amount: number;
	reason: string;
	notify_user?: boolean;
}

export interface ExtendPayload {
	new_expires_at: string;
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

const SUBS_BASE = '/api/admin/subscriptions';

export async function listAdminSubs(
	filter?: AdminSubFilter
): Promise<AdminSubListResponse> {
	const qs = buildQuery(filter);
	const raw = await apiClient.get<AdminSubListResponse | AdminSubscription[]>(
		`${SUBS_BASE}${qs}`
	);
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
	return apiClient.get<AdminSubscription>(`${SUBS_BASE}/${id}`);
}

/**
 * Force cancel a subscription as admin. Per upstream:
 *   - DELETE /admin/subscriptions/:id is the revoke endpoint.
 *   - reason is non-canonical on path; sent via JSON body for audit trail.
 *   - apiClient.delete does not accept a body so we use raw POST to a cancel sub-route,
 *     keeping a single source of truth on the wire format.
 */
export async function forceCancelSub(
	id: number | string,
	reason: string
): Promise<void> {
	await apiClient.post<void>(`${SUBS_BASE}/${id}/cancel`, { reason });
}

export async function refundSub(
	id: number | string,
	payload: RefundPayload
): Promise<{ refund_id?: string; amount: number }> {
	return apiClient.post<{ refund_id?: string; amount: number }>(
		`${SUBS_BASE}/${id}/refund`,
		payload
	);
}

export async function extendSub(
	id: number | string,
	newExpiresAt: string
): Promise<AdminSubscription> {
	return apiClient.post<AdminSubscription>(`${SUBS_BASE}/${id}/extend`, {
		new_expires_at: newExpiresAt
	});
}

export async function getAuditLog(
	id: number | string
): Promise<AdminSubAuditEntry[]> {
	const raw = await apiClient.get<
		AdminSubAuditEntry[] | { data?: AdminSubAuditEntry[]; entries?: AdminSubAuditEntry[] }
	>(`${SUBS_BASE}/${id}/audit-log`);
	if (Array.isArray(raw)) return raw;
	return raw?.data ?? raw?.entries ?? [];
}

export const adminSubscriptionsApi = {
	listAdminSubs,
	getAdminSub,
	forceCancelSub,
	refundSub,
	extendSub,
	getAuditLog
};

export default adminSubscriptionsApi;
