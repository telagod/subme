import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';

export type GroupPlatform =
	| 'anthropic'
	| 'openai'
	| 'gemini'
	| 'antigravity'
	| 'openai-responses'
	| string;

export type GroupStatus = 'active' | 'inactive' | string;
export type SubscriptionType = 'standard' | 'subscription' | string;

export interface ModelsListConfig {
	enabled: boolean;
	models: string[];
}

export interface OpenAIMessagesDispatchModelConfig {
	opus_mapped_model?: string;
	sonnet_mapped_model?: string;
	haiku_mapped_model?: string;
	exact_model_mappings?: Record<string, string>;
}

export interface AdminGroup {
	id: number;
	name: string;
	description?: string;
	platform: GroupPlatform;
	status: GroupStatus;
	sort_order?: number;
	rate_multiplier?: number;
	is_exclusive?: boolean;
	subscription_type?: SubscriptionType;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
	allow_image_generation?: boolean;
	image_rate_independent?: boolean;
	image_rate_multiplier?: number;
	image_price_1k?: number | null;
	image_price_2k?: number | null;
	image_price_4k?: number | null;
	claude_code_only?: boolean;
	fallback_group_id?: number | null;
	fallback_group_id_on_invalid_request?: number | null;
	max_concurrent_requests?: number;
	rpm_limit?: number;
	billing_enabled?: boolean;
	require_oauth_only?: boolean;
	require_privacy_set?: boolean;
		mcp_xml_inject?: boolean;
		allow_messages_dispatch?: boolean;
		default_mapped_model?: string;
		messages_dispatch_model_config?: OpenAIMessagesDispatchModelConfig;
		model_routing?: Record<string, number[]> | null;
		model_routing_enabled?: boolean;
		copy_accounts_from_group_ids?: number[];
		available_accounts?: number;
		ratelimit_accounts?: number;
		total_accounts?: number;
	models?: string[];
	models_list_config?: ModelsListConfig;
	supported_model_scopes?: string[];
	channel_id?: number | null;
	channel_name?: string | null;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface GroupFilters {
	platform?: string;
	status?: string;
	is_exclusive?: boolean;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface SaveGroupPayload {
	name: string;
	description?: string;
	platform: string;
	status?: string;
	rate_multiplier?: number;
	max_concurrent_requests?: number | null;
	rpm_limit?: number | null;
	is_exclusive?: boolean;
	subscription_type?: string;
	daily_limit_usd?: number | null;
	weekly_limit_usd?: number | null;
	monthly_limit_usd?: number | null;
	allow_image_generation?: boolean;
	image_rate_independent?: boolean;
	image_rate_multiplier?: number;
	image_price_1k?: number | null;
	image_price_2k?: number | null;
	image_price_4k?: number | null;
	claude_code_only?: boolean;
	fallback_group_id?: number | null;
	fallback_group_id_on_invalid_request?: number | null;
	require_oauth_only?: boolean;
	require_privacy_set?: boolean;
		mcp_xml_inject?: boolean;
		allow_messages_dispatch?: boolean;
		default_mapped_model?: string;
		messages_dispatch_model_config?: OpenAIMessagesDispatchModelConfig;
		model_routing?: Record<string, number[]> | null;
		model_routing_enabled?: boolean;
		copy_accounts_from_group_ids?: number[];
		models_list_config?: ModelsListConfig;
		supported_model_scopes?: string[];
		[key: string]: unknown;
}

export interface GroupRateMultiplierEntry {
	user_id: number;
	user_name?: string;
	user_email?: string;
	user_notes?: string;
	user_status?: string;
	rate_multiplier?: number | null;
	rpm_override?: number | null;
}

export interface GroupRPMOverrideEntry {
	user_id: number;
	user_name?: string;
	user_email?: string;
	user_notes?: string;
	user_status?: string;
	rpm_override: number;
}

export interface GroupUsageSummary {
	group_id: number;
	today_cost: number;
	total_cost: number;
}

export interface GroupCapacitySummary {
	group_id: number;
	concurrency_used: number;
	concurrency_max: number;
	sessions_used: number;
	sessions_max: number;
	rpm_used: number;
	rpm_max: number;
}

const GROUPS_BASE = '/api/v1/admin/groups';

export async function listGroups(
	page = 1,
	pageSize = 20,
	filters: GroupFilters = {}
): Promise<PaginatedResponse<AdminGroup>> {
	return getPaginated<AdminGroup>(
		`${GROUPS_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export async function listAllGroups(platform?: string): Promise<AdminGroup[]> {
	const raw = await apiClient.get<AdminGroup[] | ApiEnvelope<AdminGroup[]>>(
		`${GROUPS_BASE}/all${buildQuery({ platform })}`
	);
	return unwrapData(raw) ?? [];
}

export async function listAllGroupsIncludingInactive(): Promise<AdminGroup[]> {
	const raw = await apiClient.get<AdminGroup[] | ApiEnvelope<AdminGroup[]>>(
		`${GROUPS_BASE}/all${buildQuery({ include_inactive: true })}`
	);
	return unwrapData(raw) ?? [];
}

export async function getGroup(id: number): Promise<AdminGroup> {
	const raw = await apiClient.get<AdminGroup | ApiEnvelope<AdminGroup>>(`${GROUPS_BASE}/${id}`);
	return unwrapData(raw);
}

export async function getModelsListCandidates(id: number, platform?: string): Promise<string[]> {
	const raw = await apiClient.get<{ models?: string[] } | ApiEnvelope<{ models?: string[] }>>(
		`${GROUPS_BASE}/${id}/models-list-candidates${buildQuery({ platform })}`
	);
	return unwrapData(raw)?.models ?? [];
}

export async function createGroup(payload: SaveGroupPayload): Promise<AdminGroup> {
	return unwrapData(await apiClient.post<AdminGroup | ApiEnvelope<AdminGroup>>(GROUPS_BASE, payload));
}

export async function updateGroup(id: number, payload: Partial<SaveGroupPayload>): Promise<AdminGroup> {
	return unwrapData(await apiClient.put<AdminGroup | ApiEnvelope<AdminGroup>>(`${GROUPS_BASE}/${id}`, payload));
}

export async function deleteGroup(id: number): Promise<void> {
	await apiClient.delete<void>(`${GROUPS_BASE}/${id}`);
}

export async function updateGroupStatus(id: number, status: 'active' | 'inactive'): Promise<AdminGroup> {
	return updateGroup(id, { status });
}

export async function getGroupStats(id: number): Promise<Record<string, unknown>> {
	return unwrapData(
		await apiClient.get<Record<string, unknown> | ApiEnvelope<Record<string, unknown>>>(
			`${GROUPS_BASE}/${id}/stats`
		)
	);
}

export function listGroupApiKeys(id: number, page = 1, pageSize = 20): Promise<PaginatedResponse<unknown>> {
	return getPaginated<unknown>(`${GROUPS_BASE}/${id}/api-keys${buildQuery({ page, page_size: pageSize })}`);
}

export async function listGroupRateMultipliers(id: number): Promise<GroupRateMultiplierEntry[]> {
	const raw = await apiClient.get<GroupRateMultiplierEntry[] | ApiEnvelope<GroupRateMultiplierEntry[]>>(
		`${GROUPS_BASE}/${id}/rate-multipliers`
	);
	return unwrapData(raw) ?? [];
}

export async function clearGroupRateMultipliers(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${GROUPS_BASE}/${id}/rate-multipliers`);
}

export async function batchSetGroupRateMultipliers(
	id: number,
	entries: Array<{ user_id: number; rate_multiplier: number }>
): Promise<void> {
	await apiClient.put<unknown>(`${GROUPS_BASE}/${id}/rate-multipliers`, { entries });
}

export async function listGroupRPMOverrides(id: number): Promise<GroupRPMOverrideEntry[]> {
	const entries = await listGroupRateMultipliers(id);
	return entries
		.filter((entry) => entry.rpm_override != null)
		.map((entry) => ({
			user_id: entry.user_id,
			user_name: entry.user_name,
			user_email: entry.user_email,
			user_notes: entry.user_notes,
			user_status: entry.user_status,
			rpm_override: entry.rpm_override as number
		}));
}

export async function batchSetGroupRPMOverrides(
	id: number,
	entries: Array<{ user_id: number; rpm_override: number }>
): Promise<void> {
	await apiClient.put<unknown>(`${GROUPS_BASE}/${id}/rpm-overrides`, { entries });
}

export async function clearGroupRPMOverrides(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${GROUPS_BASE}/${id}/rpm-overrides`);
}

export async function updateGroupSortOrder(updates: Array<{ id: number; sort_order: number }>): Promise<void> {
	await apiClient.put<unknown>(`${GROUPS_BASE}/sort-order`, { updates });
}

export async function getGroupUsageSummary(timezone?: string): Promise<GroupUsageSummary[]> {
	const raw = await apiClient.get<GroupUsageSummary[] | ApiEnvelope<GroupUsageSummary[]>>(
		`${GROUPS_BASE}/usage-summary${buildQuery({ timezone })}`
	);
	return unwrapData(raw) ?? [];
}

export async function getGroupCapacitySummary(): Promise<GroupCapacitySummary[]> {
	const raw = await apiClient.get<GroupCapacitySummary[] | ApiEnvelope<GroupCapacitySummary[]>>(
		`${GROUPS_BASE}/capacity-summary`
	);
	return unwrapData(raw) ?? [];
}

export const adminGroupsApi = {
	listGroups,
	listAllGroups,
	listAllGroupsIncludingInactive,
	getGroup,
	getModelsListCandidates,
	createGroup,
	updateGroup,
	deleteGroup,
	updateGroupStatus,
	getGroupStats,
	listGroupApiKeys,
	listGroupRateMultipliers,
	clearGroupRateMultipliers,
	batchSetGroupRateMultipliers,
	listGroupRPMOverrides,
	batchSetGroupRPMOverrides,
	clearGroupRPMOverrides,
	updateGroupSortOrder,
	getGroupUsageSummary,
	getGroupCapacitySummary
};

export default adminGroupsApi;
