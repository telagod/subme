/**
 * Admin Affiliates API · Svelte rewrite（M10c · features tab）
 *
 * 端口自 frontend/src/api/v1/admin/affiliates.ts。覆盖 settings feature tab 的
 * per-user 配置端点，以及管理端 affiliate records 读面。
 *
 * 与 Vue tree 差异：
 *   - 不引 axios；走 apiClient 已统一 401 兜底。
 *   - 用 URLSearchParams 拼 query；apiClient.get/path 不带 params 参数，
 *     query 在调用方手动拼接。
 *   - shape 保持 snake_case —— UI 直接消费、不做 camelCase 映射，
 *     与 settings-registry flat-key 风格一致。
 */
import { apiClient } from '../client';

function unwrap<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

export interface AffiliateAdminEntry {
	user_id: number;
	email: string;
	username: string;
	aff_code: string;
	aff_code_custom: boolean;
	aff_rebate_rate_percent?: number | null;
	aff_count: number;
}

export interface ListAffiliateUsersParams {
	page?: number;
	page_size?: number;
	search?: string;
}

export interface PaginatedAffiliateUsers {
	items: AffiliateAdminEntry[];
	total: number;
	pages: number;
}

export interface SimpleUser {
	id: number;
	email: string;
	username: string;
}

export interface UpdateAffiliateUserRequest {
	aff_code?: string;
	aff_rebate_rate_percent?: number | null;
	/** 设置为 true 显式清除 per-user rate（设为 NULL）。 */
	clear_rebate_rate?: boolean;
}

export interface BatchSetRateRequest {
	user_ids: number[];
	aff_rebate_rate_percent?: number | null;
	/** 设置为 true 清空所选用户的 rate，而非赋值。 */
	clear?: boolean;
}

export interface ListAffiliateRecordsParams {
	page?: number;
	page_size?: number;
	search?: string;
	start_at?: string;
	end_at?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
	timezone?: string;
}

export interface AffiliateInviteRecord {
	inviter_id: number;
	inviter_email: string;
	inviter_username: string;
	invitee_id: number;
	invitee_email: string;
	invitee_username: string;
	aff_code: string;
	total_rebate: number;
	created_at: string;
}

export interface AffiliateRebateRecord {
	order_id: number;
	out_trade_no: string;
	inviter_id: number;
	inviter_email: string;
	inviter_username: string;
	invitee_id: number;
	invitee_email: string;
	invitee_username: string;
	order_amount: number;
	pay_amount: number;
	rebate_amount: number;
	payment_type: string;
	order_status: string;
	created_at: string;
}

export interface AffiliateTransferRecord {
	ledger_id: number;
	user_id: number;
	user_email: string;
	username: string;
	amount: number;
	balance_after?: number | null;
	available_quota_after?: number | null;
	frozen_quota_after?: number | null;
	history_quota_after?: number | null;
	snapshot_available: boolean;
	created_at: string;
}

export interface AffiliateUserOverview {
	user_id: number;
	email: string;
	username: string;
	aff_code: string;
	rebate_rate_percent: number;
	invited_count: number;
	rebated_invitee_count: number;
	available_quota: number;
	history_quota: number;
}

interface RawPaginated<T> {
	items?: T[];
	data?: T[];
	records?: T[];
	total?: number;
	pages?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === '') continue;
		usp.set(k, String(v));
	}
	const s = usp.toString();
	return s ? `?${s}` : '';
}

function normalizePaginated<T>(raw: RawPaginated<T>): { items: T[]; total: number; pages: number } {
	const items = raw.items ?? raw.data ?? raw.records ?? [];
	return {
		items,
		total: typeof raw.total === 'number' ? raw.total : items.length,
		pages: typeof raw.pages === 'number' ? raw.pages : 0
	};
}

export async function listUsers(
	params: ListAffiliateUsersParams = {}
): Promise<PaginatedAffiliateUsers> {
	const q = buildQuery({
		page: params.page ?? 1,
		page_size: params.page_size ?? 20,
		search: params.search ?? ''
	});
	const raw = unwrap<RawPaginated<AffiliateAdminEntry>>(await apiClient.get(
		`/api/v1/admin/affiliates/users${q}`
	));
	return normalizePaginated(raw);
}

export async function lookupUsers(q: string): Promise<SimpleUser[]> {
	const query = buildQuery({ q });
	const raw = unwrap<SimpleUser[] | RawPaginated<SimpleUser>>(await apiClient.get(
		`/api/v1/admin/affiliates/users/lookup${query}`
	));
	if (Array.isArray(raw)) return raw;
	return raw.items ?? raw.data ?? raw.records ?? [];
}

export async function updateUserSettings(
	userId: number,
	payload: UpdateAffiliateUserRequest
): Promise<{ user_id: number }> {
	return unwrap<{ user_id: number }>(await apiClient.put(
		`/api/v1/admin/affiliates/users/${userId}`,
		payload
	));
}

export async function clearUserSettings(userId: number): Promise<{ user_id: number }> {
	return unwrap<{ user_id: number }>(await apiClient.delete(`/api/v1/admin/affiliates/users/${userId}`));
}

export async function batchSetRate(
	payload: BatchSetRateRequest
): Promise<{ affected: number }> {
	return unwrap<{ affected: number }>(await apiClient.post(
		'/api/v1/admin/affiliates/users/batch-rate',
		payload
	));
}

function recordQuery(params: ListAffiliateRecordsParams = {}): string {
	return buildQuery({
		page: params.page ?? 1,
		page_size: params.page_size ?? 20,
		search: params.search ?? '',
		start_at: params.start_at,
		end_at: params.end_at,
		sort_by: params.sort_by,
		sort_order: params.sort_order,
		timezone: params.timezone
	});
}

export async function listInviteRecords(
	params: ListAffiliateRecordsParams = {}
): Promise<{ items: AffiliateInviteRecord[]; total: number; pages: number }> {
	const raw = unwrap<RawPaginated<AffiliateInviteRecord>>(await apiClient.get(
		`/api/v1/admin/affiliates/invites${recordQuery(params)}`
	));
	return normalizePaginated(raw);
}

export async function listRebateRecords(
	params: ListAffiliateRecordsParams = {}
): Promise<{ items: AffiliateRebateRecord[]; total: number; pages: number }> {
	const raw = unwrap<RawPaginated<AffiliateRebateRecord>>(await apiClient.get(
		`/api/v1/admin/affiliates/rebates${recordQuery(params)}`
	));
	return normalizePaginated(raw);
}

export async function listTransferRecords(
	params: ListAffiliateRecordsParams = {}
): Promise<{ items: AffiliateTransferRecord[]; total: number; pages: number }> {
	const raw = unwrap<RawPaginated<AffiliateTransferRecord>>(await apiClient.get(
		`/api/v1/admin/affiliates/transfers${recordQuery(params)}`
	));
	return normalizePaginated(raw);
}

export async function getUserOverview(userId: number): Promise<AffiliateUserOverview> {
	return unwrap<AffiliateUserOverview>(await apiClient.get(`/api/v1/admin/affiliates/users/${userId}/overview`));
}

export const adminAffiliatesApi = {
	listUsers,
	lookupUsers,
	updateUserSettings,
	clearUserSettings,
	batchSetRate,
	listInviteRecords,
	listRebateRecords,
	listTransferRecords,
	getUserOverview
};

export default adminAffiliatesApi;
