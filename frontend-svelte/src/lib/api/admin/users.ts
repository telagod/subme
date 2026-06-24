import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';

export type AdminUserRole = 'admin' | 'user' | string;
export type AdminUserStatus = 'active' | 'disabled' | string;

export interface AdminUser {
	id: number;
	email: string;
	username?: string | null;
	role: AdminUserRole;
	status: AdminUserStatus;
	balance?: number | null;
	concurrency?: number | null;
	rpm_limit?: number | null;
	current_concurrency?: number | null;
	notes?: string | null;
	allowed_groups?: number[] | null;
	group_names?: string[] | null;
	groups?: Array<{ id: number; name: string }>;
	subscriptions?: Array<{ id: number; status: string; plan_name?: string | null }>;
	last_used_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	[key: string]: unknown;
}

export interface AdminUserFilters {
	status?: 'active' | 'disabled';
	role?: 'admin' | 'user';
	search?: string;
	group_name?: string;
	api_key_group_id?: number;
	include_subscriptions?: boolean;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
	balance_min?: number;
	balance_max?: number;
	created_after?: string;
	created_before?: string;
	last_active_after?: string;
	last_active_before?: string;
	subscription_status?: 'active' | 'expired' | 'none';
}

export interface CreateAdminUserRequest {
	email: string;
	password: string;
	username?: string;
	notes?: string;
	balance?: number;
	concurrency?: number;
	rpm_limit?: number;
	allowed_groups?: number[] | null;
}

export interface UpdateAdminUserRequest {
	email?: string;
	password?: string;
	username?: string;
	notes?: string;
	role?: 'admin' | 'user';
	balance?: number;
	concurrency?: number;
	status?: 'active' | 'disabled';
	allowed_groups?: number[] | null;
	group_rates?: Record<number, number | null>;
}

const USERS_BASE = '/api/v1/admin/users';

export async function listUsers(
	page = 1,
	pageSize = 20,
	filters: AdminUserFilters = {}
): Promise<PaginatedResponse<AdminUser>> {
	return getPaginated<AdminUser>(
		`${USERS_BASE}${buildQuery({
			page,
			page_size: pageSize,
			...filters,
			api_key_group_id:
				typeof filters.api_key_group_id === 'number' && filters.api_key_group_id > 0
					? filters.api_key_group_id
					: undefined
		})}`
	);
}

export async function getUser(id: number, includeDeleted = false): Promise<AdminUser> {
	return unwrapData(await apiClient.get<AdminUser | ApiEnvelope<AdminUser>>(
		`${USERS_BASE}/${id}${buildQuery({ include_deleted: includeDeleted || undefined })}`
	));
}

export async function createUser(payload: CreateAdminUserRequest): Promise<AdminUser> {
	return unwrapData(await apiClient.post<AdminUser | ApiEnvelope<AdminUser>>(USERS_BASE, payload));
}

export async function updateUser(id: number, payload: UpdateAdminUserRequest): Promise<AdminUser> {
	return unwrapData(await apiClient.put<AdminUser | ApiEnvelope<AdminUser>>(`${USERS_BASE}/${id}`, payload));
}

export async function deleteUser(id: number): Promise<{ message: string }> {
	return unwrapData(await apiClient.delete<{ message: string } | ApiEnvelope<{ message: string }>>(`${USERS_BASE}/${id}`));
}

export async function updateUserBalance(
	id: number,
	balance: number,
	operation: 'set' | 'add' | 'subtract' = 'set',
	notes = ''
): Promise<AdminUser> {
	return unwrapData(await apiClient.post<AdminUser | ApiEnvelope<AdminUser>>(`${USERS_BASE}/${id}/balance`, { balance, operation, notes }));
}

export function updateUserConcurrency(id: number, concurrency: number): Promise<AdminUser> {
	return updateUser(id, { concurrency });
}

export function toggleUserStatus(id: number, status: 'active' | 'disabled'): Promise<AdminUser> {
	return updateUser(id, { status });
}

export interface UserAPIKey {
	id: number;
	name: string;
	key: string;
	status: string;
	quota: number;
	quota_used: number;
	group?: { id: number; name: string } | null;
	created_at?: string | null;
	last_used_at?: string | null;
	[key: string]: unknown;
}

export async function getUserAPIKeys(
	userId: number,
	page = 1,
	pageSize = 20,
	sortBy = 'created_at',
	sortOrder = 'desc'
): Promise<PaginatedResponse<UserAPIKey>> {
	return getPaginated<UserAPIKey>(
		`${USERS_BASE}/${userId}/api-keys${buildQuery({ page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder })}`
	);
}

export interface UserUsageStats {
	total_cost: number;
	total_requests: number;
	total_tokens: number;
	total_input_tokens?: number;
	total_output_tokens?: number;
	[key: string]: unknown;
}

export async function getUserUsage(userId: number, period = 'month'): Promise<UserUsageStats> {
	return unwrapData(await apiClient.get<UserUsageStats | ApiEnvelope<UserUsageStats>>(`${USERS_BASE}/${userId}/usage${buildQuery({ period })}`));
}

export interface BalanceHistoryRecord {
	id: number;
	type: string;
	amount: number;
	balance_after?: number;
	notes?: string | null;
	created_at?: string | null;
	[key: string]: unknown;
}

export interface BalanceHistoryResponse {
	items: BalanceHistoryRecord[];
	total: number;
	page: number;
	page_size: number;
	pages: number;
	total_recharged: number;
}

export async function getBalanceHistory(
	userId: number,
	page = 1,
	pageSize = 20,
	type?: string
): Promise<BalanceHistoryResponse> {
	return unwrapData(await apiClient.get<BalanceHistoryResponse | ApiEnvelope<BalanceHistoryResponse>>(
		`${USERS_BASE}/${userId}/balance-history${buildQuery({ page, page_size: pageSize, type: type || undefined })}`
	));
}

export interface ReplaceGroupResult {
	migrated_keys: number;
}

export async function replaceGroup(
	userId: number,
	oldGroupId: number,
	newGroupId: number
): Promise<ReplaceGroupResult> {
	return unwrapData(await apiClient.post<ReplaceGroupResult | ApiEnvelope<ReplaceGroupResult>>(`${USERS_BASE}/${userId}/replace-group`, {
		old_group_id: oldGroupId,
		new_group_id: newGroupId
	}));
}

export interface PlatformQuota {
	platform: string;
	daily_limit_usd: number | null;
	weekly_limit_usd: number | null;
	monthly_limit_usd: number | null;
	daily_usage_usd?: number;
	weekly_usage_usd?: number;
	monthly_usage_usd?: number;
	[key: string]: unknown;
}

export async function getUserPlatformQuotas(userId: number): Promise<{ platform_quotas: PlatformQuota[] }> {
	return unwrapData(await apiClient.get<{ platform_quotas: PlatformQuota[] } | ApiEnvelope<{ platform_quotas: PlatformQuota[] }>>(`${USERS_BASE}/${userId}/platform-quotas`));
}

export interface PlatformQuotaInput {
	platform: string;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
}

export async function updateUserPlatformQuotas(
	userId: number,
	quotas: PlatformQuotaInput[]
): Promise<{ platform_quotas: PlatformQuota[] }> {
	return unwrapData(await apiClient.put<{ platform_quotas: PlatformQuota[] } | ApiEnvelope<{ platform_quotas: PlatformQuota[] }>>(`${USERS_BASE}/${userId}/platform-quotas`, { quotas }));
}

export async function resetUserPlatformQuotaWindow(
	userId: number,
	platform: string,
	window: string
): Promise<{ message: string }> {
	return unwrapData(await apiClient.post<{ message: string } | ApiEnvelope<{ message: string }>>(`${USERS_BASE}/${userId}/platform-quotas/reset`, { platform, window }));
}

export async function bindAuthIdentity(
	userId: number,
	provider: string,
	providerUserId: string
): Promise<AdminUser> {
	return unwrapData(await apiClient.post<AdminUser | ApiEnvelope<AdminUser>>(`${USERS_BASE}/${userId}/auth-identities`, {
		provider,
		provider_user_id: providerUserId
	}));
}

export const adminUsersApi = {
	listUsers,
	getUser,
	createUser,
	updateUser,
	deleteUser,
	updateUserBalance,
	updateUserConcurrency,
	toggleUserStatus,
	getUserAPIKeys,
	getUserUsage,
	getBalanceHistory,
	replaceGroup,
	getUserPlatformQuotas,
	updateUserPlatformQuotas,
	resetUserPlatformQuotaWindow,
	bindAuthIdentity
};
