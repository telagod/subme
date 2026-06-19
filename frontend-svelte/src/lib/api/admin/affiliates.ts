/**
 * Admin Affiliates API · Svelte rewrite（M10c · features tab）
 *
 * 端口自 frontend/src/api/admin/affiliates.ts。仅包含
 * AffiliateCustomUsersSection.svelte 所需的 5 个端点（list / lookup / update /
 * clear / batch-rate）—— invite/rebate/transfer 记录在管理端 affiliates 路由侧
 * 已落地，不重复包装。
 *
 * 与 Vue tree 差异：
 *   - 不引 axios；走 apiClient 已统一 401 兜底。
 *   - 用 URLSearchParams 拼 query；apiClient.get/path 不带 params 参数，
 *     query 在调用方手动拼接。
 *   - shape 保持 snake_case —— UI 直接消费、不做 camelCase 映射，
 *     与 settings-registry flat-key 风格一致。
 */
import { apiClient } from '../client';

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

export async function listUsers(
	params: ListAffiliateUsersParams = {}
): Promise<PaginatedAffiliateUsers> {
	const q = buildQuery({
		page: params.page ?? 1,
		page_size: params.page_size ?? 20,
		search: params.search ?? ''
	});
	const raw = await apiClient.get<RawPaginated<AffiliateAdminEntry>>(
		`/api/admin/affiliates/users${q}`
	);
	return {
		items: raw.items ?? raw.data ?? raw.records ?? [],
		total: typeof raw.total === 'number' ? raw.total : 0,
		pages: typeof raw.pages === 'number' ? raw.pages : 0
	};
}

export async function lookupUsers(q: string): Promise<SimpleUser[]> {
	const query = buildQuery({ q });
	const raw = await apiClient.get<SimpleUser[] | RawPaginated<SimpleUser>>(
		`/api/admin/affiliates/users/lookup${query}`
	);
	if (Array.isArray(raw)) return raw;
	return raw.items ?? raw.data ?? raw.records ?? [];
}

export async function updateUserSettings(
	userId: number,
	payload: UpdateAffiliateUserRequest
): Promise<{ user_id: number }> {
	return apiClient.put<{ user_id: number }>(
		`/api/admin/affiliates/users/${userId}`,
		payload
	);
}

export async function clearUserSettings(userId: number): Promise<{ user_id: number }> {
	return apiClient.delete<{ user_id: number }>(`/api/admin/affiliates/users/${userId}`);
}

export async function batchSetRate(
	payload: BatchSetRateRequest
): Promise<{ affected: number }> {
	return apiClient.post<{ affected: number }>(
		'/api/admin/affiliates/users/batch-rate',
		payload
	);
}

export const adminAffiliatesApi = {
	listUsers,
	lookupUsers,
	updateUserSettings,
	clearUserSettings,
	batchSetRate
};

export default adminAffiliatesApi;
