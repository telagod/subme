import { apiClient } from '../client';
import { buildQuery, getPaginated, type PaginatedResponse } from './supply';

export type UsageRequestType = 'unknown' | 'sync' | 'stream' | 'ws_v2' | string;
export type SortOrder = 'asc' | 'desc';

export interface UsageUserSummary {
	id: number;
	email?: string | null;
	username?: string | null;
	[key: string]: unknown;
}

export interface UsageApiKeySummary {
	id: number;
	name?: string | null;
	user_id?: number | null;
	[key: string]: unknown;
}

export interface UsageGroupSummary {
	id: number;
	name?: string | null;
	[key: string]: unknown;
}

export interface UsageAccountSummary {
	id: number;
	name?: string | null;
	[key: string]: unknown;
}

export interface AdminUsageLog {
	id: number | string;
	user_id?: number | null;
	api_key_id?: number | null;
	account_id?: number | null;
	group_id?: number | null;
	subscription_id?: number | null;
	request_id?: string | null;
	model?: string | null;
	upstream_model?: string | null;
	model_mapping_chain?: string | null;
	service_tier?: string | null;
	reasoning_effort?: string | null;
	inbound_endpoint?: string | null;
	upstream_endpoint?: string | null;
	endpoint_path?: string | null;
	request_type?: UsageRequestType | null;
	stream?: boolean | null;
	openai_ws_mode?: boolean | null;
	billing_type?: number | null;
	billing_mode?: string | null;
	billing_tier?: string | null;
	channel_id?: number | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	cache_creation_tokens?: number | null;
	cache_read_tokens?: number | null;
	cache_creation_5m_tokens?: number | null;
	cache_creation_1h_tokens?: number | null;
	total_tokens?: number | null;
	input_cost?: number | null;
	output_cost?: number | null;
	cache_creation_cost?: number | null;
	cache_read_cost?: number | null;
	total_cost?: number | null;
	actual_cost?: number | null;
	account_stats_cost?: number | null;
	account_rate_multiplier?: number | null;
	rate_multiplier?: number | null;
	duration_ms?: number | null;
	first_token_ms?: number | null;
	status?: string | number | null;
	status_code?: string | number | null;
	ip_address?: string | null;
	user_agent?: string | null;
	created_at?: string | null;
	user?: UsageUserSummary | null;
	api_key?: UsageApiKeySummary | null;
	group?: UsageGroupSummary | null;
	account?: UsageAccountSummary | null;
	[key: string]: unknown;
}

export interface EndpointStat {
	endpoint?: string;
	path?: string;
	name?: string;
	requests?: number;
	total_tokens?: number;
	tokens?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface AdminUsageStatsResponse {
	total_requests: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_cache_tokens: number;
	total_tokens: number;
	total_cost: number;
	total_actual_cost: number;
	total_account_cost: number;
	average_duration_ms: number;
	endpoints?: EndpointStat[];
	upstream_endpoints?: EndpointStat[];
	endpoint_paths?: EndpointStat[];
	[key: string]: unknown;
}

export interface AdminUsageQueryParams {
	page?: number;
	page_size?: number;
	user_id?: number;
	api_key_id?: number;
	account_id?: number;
	group_id?: number;
	model?: string;
	request_type?: UsageRequestType;
	stream?: boolean;
	billing_type?: number | null;
	billing_mode?: string;
	start_date?: string;
	end_date?: string;
	exact_total?: boolean;
	sort_by?: string;
	sort_order?: SortOrder;
	timezone?: string;
	nocache?: number;
}

export interface SimpleUsageUser {
	id: number;
	email: string;
	deleted?: boolean;
}

export interface SimpleUsageApiKey {
	id: number;
	name: string;
	user_id: number;
}

export interface UsageCleanupFilters {
	start_time: string;
	end_time: string;
	user_id?: number;
	api_key_id?: number;
	account_id?: number;
	group_id?: number;
	model?: string | null;
	request_type?: UsageRequestType | null;
	stream?: boolean | null;
	billing_type?: number | null;
}

export interface UsageCleanupTask {
	id: number;
	status: string;
	filters: UsageCleanupFilters;
	created_by: number;
	deleted_rows: number;
	error_message?: string | null;
	canceled_by?: number | null;
	canceled_at?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface CreateUsageCleanupTaskRequest {
	start_date: string;
	end_date: string;
	user_id?: number;
	api_key_id?: number;
	account_id?: number;
	group_id?: number;
	model?: string | null;
	request_type?: UsageRequestType | null;
	stream?: boolean | null;
	billing_type?: number | null;
	timezone?: string;
}

const USAGE_BASE = '/api/v1/admin/usage';

export async function listAdminUsage(
	params: AdminUsageQueryParams = {}
): Promise<PaginatedResponse<AdminUsageLog>> {
	return getPaginated<AdminUsageLog>(`${USAGE_BASE}${buildQuery({ ...params })}`);
}

export async function getAdminUsageStats(
	params: Omit<AdminUsageQueryParams, 'page' | 'page_size' | 'exact_total' | 'sort_by' | 'sort_order'> = {}
): Promise<AdminUsageStatsResponse> {
	return apiClient.get<AdminUsageStatsResponse>(`${USAGE_BASE}/stats${buildQuery({ ...params })}`);
}

export async function searchAdminUsageUsers(keyword: string): Promise<SimpleUsageUser[]> {
	return apiClient.get<SimpleUsageUser[]>(
		`${USAGE_BASE}/search-users${buildQuery({ q: keyword.trim() })}`
	);
}

export async function searchAdminUsageApiKeys(
	userId?: number,
	keyword?: string
): Promise<SimpleUsageApiKey[]> {
	return apiClient.get<SimpleUsageApiKey[]>(
		`${USAGE_BASE}/search-api-keys${buildQuery({ user_id: userId, q: keyword?.trim() })}`
	);
}

export async function listUsageCleanupTasks(
	params: { page?: number; page_size?: number } = {}
): Promise<PaginatedResponse<UsageCleanupTask>> {
	return getPaginated<UsageCleanupTask>(`${USAGE_BASE}/cleanup-tasks${buildQuery(params)}`);
}

export async function createUsageCleanupTask(
	payload: CreateUsageCleanupTaskRequest
): Promise<UsageCleanupTask> {
	return apiClient.post<UsageCleanupTask>(`${USAGE_BASE}/cleanup-tasks`, payload);
}

export async function cancelUsageCleanupTask(
	taskId: number
): Promise<{ id: number; status: string }> {
	return apiClient.post<{ id: number; status: string }>(
		`${USAGE_BASE}/cleanup-tasks/${taskId}/cancel`
	);
}

export const adminUsageApi = {
	listAdminUsage,
	getAdminUsageStats,
	searchAdminUsageUsers,
	searchAdminUsageApiKeys,
	listUsageCleanupTasks,
	createUsageCleanupTask,
	cancelUsageCleanupTask
};
