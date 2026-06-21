/**
 * Admin Orders API · Svelte rewrite（M12 · /(admin)/orders/list）
 *
 * 端口自 Vue tree 的 adminPaymentAPI.{getOrders,getOrder,cancelOrder,retryRecharge}。
 * 退款入口 refundOrder 不在这里 —— task 描述明确指明走 M11 已落地的
 * `$lib/api/v1/admin/payment.ts` 同名导出（subscription / orders 两面共用退款管线）。
 *
 * 端点：
 *   - listAdminOrders(filter)        : GET /api/v1/admin/payment/orders
 *   - getAdminOrder(id)              : GET /api/v1/admin/payment/orders/:id
 *   - retryOrder(id)                 : POST /api/v1/admin/payment/orders/:id/retry
 *   - cancelOrder(id)                : POST /api/v1/admin/payment/orders/:id/cancel
 *   - listOrderAuditLog(id)          : GET /api/v1/admin/payment/orders/:id/audit-log
 *     —— audit log endpoint 与 subscription 等差形对齐，404 时 fallback 空数组。
 *
 * 红线（CLAUDE.md billing）：
 *   - 本文件**不**引用计费核心服务、渠道定价端点、价格查询函数；
 *   - 不在模块顶层 import @stripe / airwallex / chart.js 等 lazy island；
 *   - apiClient.delete 不接受 body，因此 cancel 走 POST /cancel sub-route
 *     与 subscription surface 同款契约。
 */
import { apiClient } from '../client';

// ── 订单状态机（与 Vue tree OrderStatusBadge 对齐）─────────────────────────

export type AdminOrderStatus =
	| 'PENDING'
	| 'PAID'
	| 'RECHARGING'
	| 'COMPLETED'
	| 'EXPIRED'
	| 'CANCELLED'
	| 'FAILED'
	| 'REFUND_REQUESTED'
	| 'REFUNDING'
	| 'PARTIALLY_REFUNDED'
	| 'REFUNDED'
	| 'REFUND_FAILED';

export type AdminOrderType = 'subscription' | 'topup' | 'balance' | string;

// ── 类型契约 ────────────────────────────────────────────────────────────────

export interface AdminOrder {
	id: number | string;
	out_trade_no: string;
	user_id: number;
	user_email?: string;
	plan_id?: number;
	plan_name?: string;
	order_type: AdminOrderType;
	payment_type?: string; // alipay / wxpay / stripe / airwallex / balance ...
	payment_provider?: string;
	provider_id?: number | null;
	provider_name?: string;
	status: AdminOrderStatus | string;
	base_amount?: number;
	pay_amount: number;
	credited_amount?: number;
	fee?: number;
	currency?: string;
	created_at: string;
	expires_at?: string | null;
	paid_at?: string | null;
	completed_at?: string | null;
	refund_amount?: number;
	actually_refunded?: number;
	refund_reason?: string | null;
	refund_at?: string | null;
}

export interface AdminOrderFilter {
	page?: number;
	page_size?: number;
	status?: AdminOrderStatus | string;
	payment_type?: string;
	provider?: string;
	user_id?: number;
	keyword?: string;
	plan_id?: number;
	start_date?: string;
	end_date?: string;
	order_type?: AdminOrderType;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface AdminOrderListResponse {
	data: AdminOrder[];
	total: number;
	page: number;
	page_size: number;
}

export interface AdminOrderAuditEntry {
	id: number;
	order_id: number | string;
	action: string;
	actor?: string;
	actor_id?: number;
	reason?: string;
	created_at: string;
	metadata?: Record<string, unknown>;
}

// ── 内部 helpers ────────────────────────────────────────────────────────────

function buildQuery(filter: AdminOrderFilter | undefined): string {
	if (!filter) return '';
	const parts: string[] = [];
	for (const [k, v] of Object.entries(filter)) {
		if (v === undefined || v === null || v === '') continue;
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}

// ── 端点 ────────────────────────────────────────────────────────────────────

const ORDERS_BASE = '/api/v1/admin/payment/orders';

export async function listAdminOrders(
	filter?: AdminOrderFilter
): Promise<AdminOrderListResponse> {
	const qs = buildQuery(filter);
	const raw = await apiClient.get<AdminOrderListResponse | AdminOrder[]>(
		`${ORDERS_BASE}${qs}`
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

export async function getAdminOrder(id: number | string): Promise<AdminOrder> {
	return apiClient.get<AdminOrder>(`${ORDERS_BASE}/${id}`);
}

export async function retryOrder(id: number | string): Promise<void> {
	await apiClient.post<void>(`${ORDERS_BASE}/${id}/retry`, {});
}

export async function cancelOrder(id: number | string): Promise<void> {
	await apiClient.post<void>(`${ORDERS_BASE}/${id}/cancel`, {});
}

/**
 * Audit log fetch with graceful degradation. Backend may not have an
 * audit-log endpoint yet for orders surface; in that case we return empty
 * array (consistent with the subscriptions audit log pattern in M22).
 */
export async function listOrderAuditLog(
	id: number | string
): Promise<AdminOrderAuditEntry[]> {
	try {
		const raw = await apiClient.get<
			AdminOrderAuditEntry[] | { data?: AdminOrderAuditEntry[]; entries?: AdminOrderAuditEntry[] }
		>(`${ORDERS_BASE}/${id}/audit-log`);
		if (Array.isArray(raw)) return raw;
		return raw?.data ?? raw?.entries ?? [];
	} catch {
		return [];
	}
}

export const adminOrdersApi = {
	listAdminOrders,
	getAdminOrder,
	retryOrder,
	cancelOrder,
	listOrderAuditLog
};

export default adminOrdersApi;
