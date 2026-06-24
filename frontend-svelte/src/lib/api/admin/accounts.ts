import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';
import type { AdminGroup } from './groups';
import type { Proxy } from './proxies';

export type AccountStatus = 'active' | 'inactive' | 'error' | 'rate_limited' | 'disabled' | string;

export interface AccountCredentials {
	pool_mode?: boolean;
	pool_mode_retry_count?: number;
	pool_mode_retry_status_codes?: number[];
	[key: string]: unknown;
}

export interface Account {
	id: number;
	name: string;
	email?: string;
	platform: string;
	type: string;
	status: AccountStatus;
	priority?: number;
	weight?: number;
	concurrency?: number;
	rate_multiplier?: number;
	schedulable?: boolean;
	is_schedulable?: boolean;
	privacy_mode?: boolean;
	credentials?: AccountCredentials;
	group_ids?: number[];
	groups?: AdminGroup[];
	proxy_id?: number | null;
	proxy?: Proxy | null;
	proxy_fallback_origin_id?: number | null;
	error_message?: string | null;
	last_used_at?: string | null;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface AccountFilters {
	platform?: string;
	type?: string;
	status?: string;
	group?: string;
	search?: string;
	privacy_mode?: string;
	schedulable?: string;
	has_proxy?: string;
	lite?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface BulkOperationResult {
	success: number;
	failed: number;
	errors?: Array<{ id: number; error: string }>;
	results?: Array<Record<string, unknown>>;
}

export type SaveAccountPayload = Partial<Account> & Record<string, unknown>;
export type AccountStats = Record<string, unknown>;
export type AccountUsageInfo = Record<string, unknown>;
export type WindowStats = Record<string, unknown>;
export type AccountModel = Record<string, unknown>;
export type TempUnschedulableStatus = Record<string, unknown>;
export type AdminDataPayload = Record<string, unknown>;
export type AdminDataImportResult = Record<string, unknown>;
export type AccountOAuthPayload = Record<string, unknown>;
export type AccountOAuthResult = Record<string, unknown>;
export type OpenAIOAuthPayload = Record<string, unknown>;
export type OpenAIOAuthResult = Record<string, unknown>;
export type CRSPreviewResult = Record<string, unknown>;
export type CRSSyncResult = Record<string, unknown>;
export type CodexSessionImportResult = Record<string, unknown>;
export type MixedChannelCheckResult = Record<string, unknown>;

export interface AccountTestPayload {
	model_id?: string;
	prompt?: string;
	mode?: string;
}

export interface AccountTestEvent {
	type: string;
	text?: string;
	model?: string;
	status?: string;
	code?: string;
	image_url?: string;
	mime_type?: string;
	data?: unknown;
	success?: boolean;
	error?: string;
}

export interface ScheduledTestPlan {
	id: number;
	account_id: number;
	model_id: string;
	cron_expression: string;
	enabled: boolean;
	max_results: number;
	auto_recover: boolean;
	last_run_at: string | null;
	next_run_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface ScheduledTestResult {
	id: number;
	plan_id: number;
	status: string;
	response_text: string;
	error_message: string;
	latency_ms: number;
	started_at: string;
	finished_at: string;
	created_at: string;
}

export interface CreateScheduledTestPlanPayload {
	account_id: number;
	model_id: string;
	cron_expression: string;
	enabled?: boolean;
	max_results?: number;
	auto_recover?: boolean;
}

export interface UpdateScheduledTestPlanPayload {
	model_id?: string;
	cron_expression?: string;
	enabled?: boolean;
	max_results?: number;
	auto_recover?: boolean;
}

export interface OpenAIRateLimit {
	name?: string;
	used?: number;
	limit?: number;
	resets_at?: string;
	[key: string]: unknown;
}

export interface OpenAIAdditionalRateLimit {
	limit_name: string;
	metered_feature: string;
	rate_limit?: OpenAIRateLimit | null;
}

export interface OpenAIRateLimitResetCredits {
	available_count: number;
}

export interface OpenAIQuotaUsage {
	user_id?: string;
	account_id?: string;
	email?: string;
	plan_type?: string;
	rate_limit?: OpenAIRateLimit | null;
	additional_rate_limits?: OpenAIAdditionalRateLimit[];
	rate_limit_reset_credits?: OpenAIRateLimitResetCredits | null;
	fetched_at: number;
	[key: string]: unknown;
}

export interface OpenAIQuotaResetCredit {
	id?: string;
	reset_type?: string;
	status?: string;
	granted_at?: string;
	expires_at?: string;
	redeem_started_at?: string;
	redeemed_at?: string;
}

export interface OpenAIQuotaResetResult {
	code: string;
	credit?: OpenAIQuotaResetCredit | null;
	windows_reset: number;
	[key: string]: unknown;
}

const ACCOUNTS_BASE = '/api/v1/admin/accounts';
const SCHEDULED_TESTS_BASE = '/api/v1/admin/scheduled-test-plans';

export async function listAccounts(
	page = 1,
	pageSize = 20,
	filters: AccountFilters = {}
): Promise<PaginatedResponse<Account>> {
	return getPaginated<Account>(
		`${ACCOUNTS_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export async function getAccount(id: number): Promise<Account> {
	return unwrapData(await apiClient.get<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}`));
}

export async function createAccount(payload: SaveAccountPayload): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(ACCOUNTS_BASE, payload));
}

export async function updateAccount(id: number, payload: SaveAccountPayload): Promise<Account> {
	return unwrapData(await apiClient.put<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}`, payload));
}

export async function deleteAccount(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${ACCOUNTS_BASE}/${id}`);
}

export async function checkMixedChannelRisk(payload: Record<string, unknown>): Promise<MixedChannelCheckResult> {
	return unwrapData(
		await apiClient.post<MixedChannelCheckResult | ApiEnvelope<MixedChannelCheckResult>>(
			`${ACCOUNTS_BASE}/check-mixed-channel`,
			payload
		)
	);
}

export async function importCodexSession(payload: Record<string, unknown>): Promise<CodexSessionImportResult> {
	return unwrapData(
		await apiClient.post<CodexSessionImportResult | ApiEnvelope<CodexSessionImportResult>>(
			`${ACCOUNTS_BASE}/import/codex-session`,
			payload
		)
	);
}

export async function previewSyncFromCRS(payload: {
	base_url: string;
	username: string;
	password: string;
}): Promise<CRSPreviewResult> {
	return unwrapData(
		await apiClient.post<CRSPreviewResult | ApiEnvelope<CRSPreviewResult>>(
			`${ACCOUNTS_BASE}/sync/crs/preview`,
			payload
		)
	);
}

export async function syncFromCRS(payload: {
	base_url: string;
	username: string;
	password: string;
	sync_proxies?: boolean;
	selected_account_ids?: string[];
}): Promise<CRSSyncResult> {
	return unwrapData(
		await apiClient.post<CRSSyncResult | ApiEnvelope<CRSSyncResult>>(`${ACCOUNTS_BASE}/sync/crs`, payload)
	);
}

export async function updateAccountStatus(id: number, status: 'active' | 'inactive'): Promise<Account> {
	return updateAccount(id, { status });
}

export async function testAccount(id: number): Promise<{ success: boolean; message: string; latency_ms?: number }> {
	return unwrapData(
		await apiClient.post<
			{ success: boolean; message: string; latency_ms?: number } | ApiEnvelope<{ success: boolean; message: string; latency_ms?: number }>
		>(`${ACCOUNTS_BASE}/${id}/test`, {})
	);
}

export async function testAccountStream(
	id: number,
	payload: AccountTestPayload = {},
	init?: RequestInit
): Promise<Response> {
	return apiClient.streamPost(`${ACCOUNTS_BASE}/${id}/test`, payload, init);
}

export async function setAccountSchedulable(id: number, schedulable: boolean): Promise<Account> {
	return unwrapData(
		await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/schedulable`, { schedulable })
	);
}

export async function clearAccountError(id: number): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/clear-error`, {}));
}

export async function refreshAccount(id: number): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/refresh`, {}));
}

export async function revertProxyFallback(id: number): Promise<void> {
	await apiClient.post<void>(`${ACCOUNTS_BASE}/${id}/revert-proxy-fallback`, {});
}

export async function recoverAccountState(id: number): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/recover-state`, {}));
}

export async function applyOAuthCredentials(
	id: number,
	payload: { type: 'oauth' | 'setup-token'; credentials: Record<string, unknown>; extra?: Record<string, unknown> }
): Promise<Account> {
	return unwrapData(
		await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/apply-oauth-credentials`, payload)
	);
}

export async function setAccountPrivacy(id: number, privacy_mode: boolean): Promise<Account> {
	return unwrapData(
		await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/set-privacy`, { privacy_mode })
	);
}

export async function getAccountStats(id: number, days = 30): Promise<AccountStats> {
	return unwrapData(
		await apiClient.get<AccountStats | ApiEnvelope<AccountStats>>(
			`${ACCOUNTS_BASE}/${id}/stats${buildQuery({ days })}`
		)
	);
}

export async function getAccountUsage(id: number, params: { source?: 'passive' | 'active'; force?: boolean } = {}): Promise<AccountUsageInfo> {
	return unwrapData(
		await apiClient.get<AccountUsageInfo | ApiEnvelope<AccountUsageInfo>>(
			`${ACCOUNTS_BASE}/${id}/usage${buildQuery({ source: params.source, force: params.force ? 'true' : undefined })}`
		)
	);
}

export async function clearAccountRateLimit(id: number): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/clear-rate-limit`, {}));
}

export async function resetAccountQuota(id: number): Promise<Account> {
	return unwrapData(await apiClient.post<Account | ApiEnvelope<Account>>(`${ACCOUNTS_BASE}/${id}/reset-quota`, {}));
}

export async function queryOpenAIQuota(id: number): Promise<OpenAIQuotaUsage> {
	return unwrapData(await apiClient.get<OpenAIQuotaUsage | ApiEnvelope<OpenAIQuotaUsage>>(`/api/v1/admin/openai/accounts/${id}/quota`));
}

export async function resetOpenAIQuota(id: number): Promise<OpenAIQuotaResetResult> {
	return unwrapData(await apiClient.post<OpenAIQuotaResetResult | ApiEnvelope<OpenAIQuotaResetResult>>(`/api/v1/admin/openai/accounts/${id}/reset-quota`, {}));
}

export async function generateOpenAIAuthUrl(payload: OpenAIOAuthPayload = {}): Promise<OpenAIOAuthResult> {
	return unwrapData(
		await apiClient.post<OpenAIOAuthResult | ApiEnvelope<OpenAIOAuthResult>>(
			'/api/v1/admin/openai/generate-auth-url',
			payload
		)
	);
}

export async function exchangeOpenAICode(payload: OpenAIOAuthPayload): Promise<OpenAIOAuthResult> {
	return unwrapData(
		await apiClient.post<OpenAIOAuthResult | ApiEnvelope<OpenAIOAuthResult>>(
			'/api/v1/admin/openai/exchange-code',
			payload
		)
	);
}

export async function refreshOpenAIToken(payload: OpenAIOAuthPayload): Promise<OpenAIOAuthResult> {
	return unwrapData(
		await apiClient.post<OpenAIOAuthResult | ApiEnvelope<OpenAIOAuthResult>>(
			'/api/v1/admin/openai/refresh-token',
			payload
		)
	);
}

export async function getTempUnschedulable(id: number): Promise<TempUnschedulableStatus> {
	return unwrapData(
		await apiClient.get<TempUnschedulableStatus | ApiEnvelope<TempUnschedulableStatus>>(
			`${ACCOUNTS_BASE}/${id}/temp-unschedulable`
		)
	);
}

export async function clearTempUnschedulable(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${ACCOUNTS_BASE}/${id}/temp-unschedulable`);
}

export async function getAccountTodayStats(id: number): Promise<WindowStats> {
	return unwrapData(
		await apiClient.get<WindowStats | ApiEnvelope<WindowStats>>(`${ACCOUNTS_BASE}/${id}/today-stats`)
	);
}

export async function getBatchAccountTodayStats(accountIds: number[]): Promise<{ stats: Record<string, WindowStats> }> {
	return unwrapData(
		await apiClient.post<{ stats: Record<string, WindowStats> } | ApiEnvelope<{ stats: Record<string, WindowStats> }>>(
			`${ACCOUNTS_BASE}/today-stats/batch`,
			{ account_ids: accountIds }
		)
	);
}

export async function getAccountModels(id: number): Promise<AccountModel[]> {
	return unwrapData(
		await apiClient.get<AccountModel[] | ApiEnvelope<AccountModel[]>>(`${ACCOUNTS_BASE}/${id}/models`)
	) ?? [];
}

export async function listScheduledTestPlans(accountId: number): Promise<ScheduledTestPlan[]> {
	return unwrapData(
		await apiClient.get<ScheduledTestPlan[] | ApiEnvelope<ScheduledTestPlan[]>>(
			`${ACCOUNTS_BASE}/${accountId}/scheduled-test-plans`
		)
	) ?? [];
}

export async function createScheduledTestPlan(payload: CreateScheduledTestPlanPayload): Promise<ScheduledTestPlan> {
	return unwrapData(
		await apiClient.post<ScheduledTestPlan | ApiEnvelope<ScheduledTestPlan>>(SCHEDULED_TESTS_BASE, payload)
	);
}

export async function updateScheduledTestPlan(
	id: number,
	payload: UpdateScheduledTestPlanPayload
): Promise<ScheduledTestPlan> {
	return unwrapData(
		await apiClient.put<ScheduledTestPlan | ApiEnvelope<ScheduledTestPlan>>(
			`${SCHEDULED_TESTS_BASE}/${id}`,
			payload
		)
	);
}

export async function deleteScheduledTestPlan(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${SCHEDULED_TESTS_BASE}/${id}`);
}

export async function listScheduledTestResults(planId: number, limit = 50): Promise<ScheduledTestResult[]> {
	return unwrapData(
		await apiClient.get<ScheduledTestResult[] | ApiEnvelope<ScheduledTestResult[]>>(
			`${SCHEDULED_TESTS_BASE}/${planId}/results${buildQuery({ limit })}`
		)
	) ?? [];
}

export async function syncAccountModels(id: number): Promise<{ models: string[] }> {
	return unwrapData(
		await apiClient.post<{ models: string[] } | ApiEnvelope<{ models: string[] }>>(
			`${ACCOUNTS_BASE}/${id}/models/sync-upstream`,
			{}
		)
	);
}

export async function previewSyncUpstreamModels(payload: Record<string, unknown>): Promise<{ models: string[] }> {
	return unwrapData(
		await apiClient.post<{ models: string[] } | ApiEnvelope<{ models: string[] }>>(
			`${ACCOUNTS_BASE}/models/sync-upstream-preview`,
			payload
		)
	);
}

export async function batchCreateAccounts(accounts: SaveAccountPayload[]): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(`${ACCOUNTS_BASE}/batch`, { accounts })
	);
}

export async function batchUpdateAccountCredentials(payload: {
	account_ids: number[];
	field: string;
	value: unknown;
}): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(
			`${ACCOUNTS_BASE}/batch-update-credentials`,
			payload
		)
	);
}

export async function bulkUpdateAccounts(payload: Record<string, unknown>): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(`${ACCOUNTS_BASE}/bulk-update`, payload)
	);
}

export async function batchClearAccountErrors(ids: number[]): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(
			`${ACCOUNTS_BASE}/batch-clear-error`,
			{ ids }
		)
	);
}

export async function batchRefreshAccounts(ids: number[]): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(`${ACCOUNTS_BASE}/batch-refresh`, {
			ids
		})
	);
}

export async function batchDeleteAccounts(ids: number[]): Promise<BulkOperationResult> {
	return unwrapData(
		await apiClient.post<BulkOperationResult | ApiEnvelope<BulkOperationResult>>(`${ACCOUNTS_BASE}/batch-delete`, { ids })
	);
}

export async function exportAccountData(options: {
	ids?: number[];
	filters?: AccountFilters;
	includeProxies?: boolean;
} = {}): Promise<AdminDataPayload> {
	const params: Record<string, unknown> = {};
	if (options.ids?.length) {
		params.ids = options.ids.join(',');
	} else if (options.filters) {
		Object.assign(params, options.filters);
	}
	if (options.includeProxies === false) params.include_proxies = 'false';
	return unwrapData(
		await apiClient.get<AdminDataPayload | ApiEnvelope<AdminDataPayload>>(
			`${ACCOUNTS_BASE}/data${buildQuery(params)}`
		)
	);
}

export async function importAccountData(payload: {
	data: AdminDataPayload;
	skip_default_group_bind?: boolean;
}): Promise<AdminDataImportResult> {
	return unwrapData(
		await apiClient.post<AdminDataImportResult | ApiEnvelope<AdminDataImportResult>>(`${ACCOUNTS_BASE}/data`, payload)
	);
}

export async function getAntigravityDefaultModelMapping(): Promise<Record<string, string>> {
	return unwrapData(
		await apiClient.get<Record<string, string> | ApiEnvelope<Record<string, string>>>(
			`${ACCOUNTS_BASE}/antigravity/default-model-mapping`
		)
	);
}

export async function generateAuthUrl(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/generate-auth-url`,
			payload
		)
	);
}

export async function generateSetupTokenUrl(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/generate-setup-token-url`,
			payload
		)
	);
}

export async function exchangeCode(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/exchange-code`,
			payload
		)
	);
}

export async function exchangeSetupTokenCode(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/exchange-setup-token-code`,
			payload
		)
	);
}

export async function cookieAuth(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/cookie-auth`,
			payload
		)
	);
}

export async function setupTokenCookieAuth(payload: AccountOAuthPayload): Promise<AccountOAuthResult> {
	return unwrapData(
		await apiClient.post<AccountOAuthResult | ApiEnvelope<AccountOAuthResult>>(
			`${ACCOUNTS_BASE}/setup-token-cookie-auth`,
			payload
		)
	);
}

export const adminAccountsApi = {
	listAccounts,
	getAccount,
	createAccount,
	updateAccount,
	deleteAccount,
	checkMixedChannelRisk,
	importCodexSession,
	previewSyncFromCRS,
	syncFromCRS,
	updateAccountStatus,
	testAccount,
	testAccountStream,
	setAccountSchedulable,
	clearAccountError,
	refreshAccount,
	revertProxyFallback,
	recoverAccountState,
	applyOAuthCredentials,
	setAccountPrivacy,
	getAccountStats,
	getAccountUsage,
	clearAccountRateLimit,
	resetAccountQuota,
	getTempUnschedulable,
	clearTempUnschedulable,
	getAccountTodayStats,
	getBatchAccountTodayStats,
	getAccountModels,
	listScheduledTestPlans,
	createScheduledTestPlan,
	updateScheduledTestPlan,
	deleteScheduledTestPlan,
	listScheduledTestResults,
	syncAccountModels,
	previewSyncUpstreamModels,
	batchCreateAccounts,
	batchUpdateAccountCredentials,
	bulkUpdateAccounts,
	batchClearAccountErrors,
	batchRefreshAccounts,
	batchDeleteAccounts,
	exportAccountData,
	importAccountData,
	getAntigravityDefaultModelMapping,
	generateOpenAIAuthUrl,
	exchangeOpenAICode,
	refreshOpenAIToken,
	generateAuthUrl,
	generateSetupTokenUrl,
	exchangeCode,
	exchangeSetupTokenCode,
	cookieAuth,
	setupTokenCookieAuth
};

export default adminAccountsApi;
