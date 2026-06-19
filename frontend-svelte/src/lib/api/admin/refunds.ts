/**
 * Admin Refunds API · Svelte rewrite（refund queue · admin/orders/refunds）
 *
 * Port goal:
 *   - Provide a lightweight queue façade over the refund-request workflow
 *     that exists on the orders surface (REFUND_REQUESTED → admin reviews →
 *     approved / rejected; downstream pipeline finishes REFUNDING → REFUNDED).
 *   - The queue is admin-only — it consumes a thin /api/admin/payment/refunds
 *     listing endpoint plus per-id approve / reject sub-routes. Backend may
 *     route approve through the existing /admin/payment/orders/:order_id/refund
 *     pipeline internally; the frontend only needs a stable shape.
 *
 * 红线（CLAUDE.md billing）：
 *   - 不引用计费核心服务、渠道定价端点、价格查询函数（见 grep gate）；
 *   - 不在模块顶层 import 任何渠道支付 SDK（@stripe / airwallex / chart.js）；
 *   - apiClient.delete 不接受 body，所有写操作走 POST sub-route。
 *
 * Endpoints:
 *   - listRefundQueue(filter)            : GET  /api/admin/payment/refunds
 *   - getRefund(id)                      : GET  /api/admin/payment/refunds/:id
 *   - approveRefund(id, payload)         : POST /api/admin/payment/refunds/:id/approve
 *   - rejectRefund(id, reason)           : POST /api/admin/payment/refunds/:id/reject
 *
 * Backend listing shape tolerance:
 *   Same {data,total,page,page_size} envelope as orders. Bare array also
 *   accepted so a backwards-compat backend can be added in any order.
 */
import { apiClient } from '../client';

// ── 状态机 ──────────────────────────────────────────────────────────────────
// 仅约束 queue 维度，不与订单状态机重叠（订单状态由 orders.ts 维护）。
export type RefundRequestStatus =
	| 'pending' // 用户已发起退款申请，等待管理员审核
	| 'approved' // 管理员通过，已进入实际退款管线（订单变 REFUNDING）
	| 'rejected' // 管理员驳回
	| 'completed' // 已完成（订单已 REFUNDED 或 PARTIALLY_REFUNDED）
	| 'failed'; // approve 后渠道侧失败（订单 REFUND_FAILED）

// ── 类型契约 ────────────────────────────────────────────────────────────────

export interface AdminRefundRequest {
	id: number | string;
	order_id: number | string;
	out_trade_no?: string;
	user_id: number;
	user_email?: string;
	amount: number;
	currency?: string;
	reason: string;
	status: RefundRequestStatus | string;
	requested_at: string;
	reviewed_at?: string | null;
	reviewer?: string | null;
	reviewer_note?: string | null;
	resolved_at?: string | null;
	plan_id?: number;
	plan_name?: string;
	payment_provider?: string;
}

export interface AdminRefundFilter {
	page?: number;
	page_size?: number;
	status?: RefundRequestStatus | string;
	user_id?: number;
	keyword?: string;
	start_date?: string;
	end_date?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface AdminRefundListResponse {
	data: AdminRefundRequest[];
	total: number;
	page: number;
	page_size: number;
}

export interface ApproveRefundPayload {
	amount?: number;
	reason?: string;
	deduct_balance?: boolean;
	force?: boolean;
	notify_user?: boolean;
}

// ── 内部 helpers ────────────────────────────────────────────────────────────

function buildQuery(filter: AdminRefundFilter | undefined): string {
	if (!filter) return '';
	const parts: string[] = [];
	for (const [k, v] of Object.entries(filter)) {
		if (v === undefined || v === null || v === '') continue;
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}

// ── 端点 ────────────────────────────────────────────────────────────────────

const REFUNDS_BASE = '/api/admin/payment/refunds';

export async function listRefundQueue(
	filter?: AdminRefundFilter
): Promise<AdminRefundListResponse> {
	const qs = buildQuery(filter);
	const raw = await apiClient.get<AdminRefundListResponse | AdminRefundRequest[]>(
		`${REFUNDS_BASE}${qs}`
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

export async function getRefund(id: number | string): Promise<AdminRefundRequest> {
	return apiClient.get<AdminRefundRequest>(`${REFUNDS_BASE}/${id}`);
}

/**
 * Approve a refund request. Backend may map this to the existing
 * /admin/payment/orders/:order_id/refund executor — the queue façade
 * just stamps reviewer + forwards optional override fields.
 */
export async function approveRefund(
	id: number | string,
	payload: ApproveRefundPayload = {}
): Promise<{ refund_id?: string; amount?: number; status?: string }> {
	return apiClient.post<{ refund_id?: string; amount?: number; status?: string }>(
		`${REFUNDS_BASE}/${id}/approve`,
		payload
	);
}

export async function rejectRefund(
	id: number | string,
	reason: string
): Promise<{ status?: string }> {
	return apiClient.post<{ status?: string }>(`${REFUNDS_BASE}/${id}/reject`, {
		reason
	});
}

export const adminRefundsApi = {
	listRefundQueue,
	getRefund,
	approveRefund,
	rejectRefund
};

export default adminRefundsApi;
