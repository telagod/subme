import { buildQuery, getPaginated, type PaginatedResponse } from './supply';
import { apiClient } from '../client';

export type ModerationMode = 'off' | 'observe' | 'pre_block';
export type KeywordBlockingMode = 'keyword_only' | 'keyword_and_api' | 'api_only';
export type ContentModerationModelFilterType = 'all' | 'include' | 'exclude';
export type ContentModerationAPIKeyStatusValue = 'unknown' | 'ok' | 'error' | 'frozen';

export interface ContentModerationModelFilter {
	type: ContentModerationModelFilterType;
	models: string[];
}

export interface ContentModerationAPIKeyStatus {
	index: number;
	key_hash: string;
	masked: string;
	status: ContentModerationAPIKeyStatusValue;
	failure_count: number;
	success_count: number;
	last_error: string;
	last_checked_at?: string;
	frozen_until?: string;
	last_latency_ms: number;
	last_http_status: number;
	last_tested: boolean;
	configured: boolean;
}

export interface ContentModerationConfig {
	enabled: boolean;
	mode: ModerationMode;
	base_url: string;
	model: string;
	api_key_configured: boolean;
	api_key_masked: string;
	api_key_count: number;
	api_key_masks: string[];
	api_key_statuses: ContentModerationAPIKeyStatus[];
	timeout_ms: number;
	sample_rate: number;
	all_groups: boolean;
	group_ids: number[];
	record_non_hits: boolean;
	thresholds: Record<string, number>;
	worker_count: number;
	queue_size: number;
	block_status: number;
	block_message: string;
	email_on_hit: boolean;
	auto_ban_enabled: boolean;
	ban_threshold: number;
	violation_window_hours: number;
	retry_count: number;
	hit_retention_days: number;
	non_hit_retention_days: number;
	pre_hash_check_enabled: boolean;
	blocked_keywords: string[];
	keyword_blocking_mode: KeywordBlockingMode;
	model_filter: ContentModerationModelFilter;
}

export interface UpdateContentModerationConfig {
	enabled?: boolean;
	mode?: ModerationMode;
	base_url?: string;
	model?: string;
	api_key?: string;
	api_keys?: string[];
	api_keys_mode?: 'append' | 'replace';
	delete_api_key_hashes?: string[];
	clear_api_key?: boolean;
	timeout_ms?: number;
	sample_rate?: number;
	all_groups?: boolean;
	group_ids?: number[];
	record_non_hits?: boolean;
	thresholds?: Record<string, number>;
	worker_count?: number;
	queue_size?: number;
	block_status?: number;
	block_message?: string;
	email_on_hit?: boolean;
	auto_ban_enabled?: boolean;
	ban_threshold?: number;
	violation_window_hours?: number;
	retry_count?: number;
	hit_retention_days?: number;
	non_hit_retention_days?: number;
	pre_hash_check_enabled?: boolean;
	blocked_keywords?: string[];
	keyword_blocking_mode?: KeywordBlockingMode;
	model_filter?: ContentModerationModelFilter;
}

export interface ContentModerationRuntimeStatus {
	enabled: boolean;
	risk_control_enabled: boolean;
	mode: ModerationMode;
	worker_count: number;
	max_workers: number;
	active_workers: number;
	idle_workers: number;
	queue_size: number;
	queue_length: number;
	queue_usage_percent: number;
	enqueued: number;
	dropped: number;
	processed: number;
	errors: number;
	pre_block_active: number;
	pre_block_checked: number;
	pre_block_allowed: number;
	pre_block_blocked: number;
	pre_block_errors: number;
	pre_block_avg_latency_ms: number;
	pre_block_api_key_active: number;
	pre_block_api_key_available_count: number;
	pre_block_api_key_total_calls: number;
	pre_block_api_key_loads: ContentModerationAPIKeyLoad[];
	api_key_statuses: ContentModerationAPIKeyStatus[];
	flagged_hash_count: number;
	last_cleanup_at?: string;
	last_cleanup_deleted_hit: number;
	last_cleanup_deleted_non_hit: number;
}

export interface ContentModerationAPIKeyLoad {
	index: number;
	key_hash: string;
	masked: string;
	status: ContentModerationAPIKeyStatusValue;
	active: number;
	total: number;
	success: number;
	errors: number;
	avg_latency_ms: number;
	last_latency_ms: number;
	last_http_status: number;
}

export interface TestContentModerationAPIKeysPayload {
	api_keys?: string[];
	base_url?: string;
	model?: string;
	timeout_ms?: number;
	prompt?: string;
	images?: string[];
}

export interface ContentModerationTestAuditResult {
	flagged: boolean;
	highest_category: string;
	highest_score: number;
	composite_score: number;
	category_scores: Record<string, number>;
	thresholds: Record<string, number>;
}

export interface TestContentModerationAPIKeysResponse {
	items: ContentModerationAPIKeyStatus[];
	audit_result?: ContentModerationTestAuditResult;
	image_count: number;
}

export interface ContentModerationLog {
	id: number;
	request_id: string;
	user_id: number | null;
	user_email: string;
	api_key_id: number | null;
	api_key_name: string;
	group_id: number | null;
	group_name: string;
	endpoint: string;
	provider: string;
	model: string;
	mode: string;
	action: string;
	flagged: boolean;
	highest_category: string;
	highest_score: number;
	category_scores: Record<string, number>;
	threshold_snapshot: Record<string, number>;
	input_excerpt: string;
	upstream_latency_ms: number | null;
	error: string;
	violation_count: number;
	auto_banned: boolean;
	email_sent: boolean;
	user_status: string;
	queue_delay_ms: number | null;
	created_at: string;
}

export interface ListContentModerationLogsParams {
	page?: number;
	page_size?: number;
	result?: string;
	group_id?: number;
	endpoint?: string;
	search?: string;
	from?: string;
	to?: string;
}

export interface ContentModerationUnbanUserResponse {
	user_id: number;
	status: string;
}

export interface DeleteFlaggedHashResponse {
	input_hash: string;
	deleted: boolean;
}

export interface ClearFlaggedHashesResponse {
	deleted: number;
}

const RISK_BASE = '/api/v1/admin/risk-control';

export function getRiskConfig(): Promise<ContentModerationConfig> {
	return apiClient.get<ContentModerationConfig>(`${RISK_BASE}/config`);
}

export function updateRiskConfig(
	payload: UpdateContentModerationConfig
): Promise<ContentModerationConfig> {
	return apiClient.put<ContentModerationConfig>(`${RISK_BASE}/config`, payload);
}

export function getRiskStatus(): Promise<ContentModerationRuntimeStatus> {
	return apiClient.get<ContentModerationRuntimeStatus>(`${RISK_BASE}/status`);
}

export function testRiskApiKeys(
	payload: TestContentModerationAPIKeysPayload = {}
): Promise<TestContentModerationAPIKeysResponse> {
	return apiClient.post<TestContentModerationAPIKeysResponse>(`${RISK_BASE}/api-keys/test`, payload);
}

export function listRiskLogs(
	params: ListContentModerationLogsParams = {}
): Promise<PaginatedResponse<ContentModerationLog>> {
	return getPaginated<ContentModerationLog>(`${RISK_BASE}/logs${buildQuery({ ...params })}`);
}

export function unbanRiskUser(userId: number): Promise<ContentModerationUnbanUserResponse> {
	return apiClient.post<ContentModerationUnbanUserResponse>(
		`${RISK_BASE}/users/${userId}/unban`
	);
}

export function deleteFlaggedHash(inputHash: string): Promise<DeleteFlaggedHashResponse> {
	return requestWithJson<DeleteFlaggedHashResponse>('DELETE', `${RISK_BASE}/hashes`, {
		input_hash: inputHash
	});
}

export function clearFlaggedHashes(): Promise<ClearFlaggedHashesResponse> {
	return apiClient.delete<ClearFlaggedHashesResponse>(`${RISK_BASE}/hashes/all`);
}

async function requestWithJson<T>(method: string, path: string, body?: unknown): Promise<T> {
	const cfg = typeof window !== 'undefined'
		? (window as unknown as { __APP_CONFIG__?: { apiBase?: string } }).__APP_CONFIG__
		: undefined;
	const rawToken = typeof window !== 'undefined' ? window.localStorage.getItem('auth.token') : null;
	let token: string | null = null;
	try {
		if (rawToken?.startsWith('__v1__:')) token = JSON.parse(rawToken.slice('__v1__:'.length));
	} catch {
		token = null;
	}
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(`${cfg?.apiBase ?? ''}${path}`, {
		method,
		headers,
		credentials: 'include',
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	const parsed = text ? JSON.parse(text) : undefined;
	if (!res.ok) {
		const message =
			parsed && typeof parsed === 'object'
				? ((parsed as Record<string, unknown>).message as string | undefined) ??
					((parsed as Record<string, unknown>).error as string | undefined)
				: undefined;
		throw new Error(message ?? `HTTP ${res.status}`);
	}
	return parsed as T;
}

export const riskControlApi = {
	getRiskConfig,
	updateRiskConfig,
	getRiskStatus,
	testRiskApiKeys,
	listRiskLogs,
	unbanRiskUser,
	deleteFlaggedHash,
	clearFlaggedHashes
};
