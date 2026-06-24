/**
 * Admin Ops API · Svelte rewrite (Phase C M13)
 *
 * GROUND TRUTH: backend/internal/server/routes/admin.go registerOpsRoutes
 * (group `/api/v1/admin/ops`) + handler/admin/ops_*.go + service/ops_*models.go.
 *
 * All shapes below are verified against the Go DTOs (json tags). Fields that the
 * backend emits as Go `*T` (nullable) are typed `T | null`; `omitempty` fields
 * are typed optional. Pointer-int percentiles come back as `*int` → `number | null`.
 *
 * Wire conventions:
 *   - Non-paginated GETs are wrapped by response.Success → { code,message,data }.
 *     We unwrap via unwrapData(). Some handlers Success(gin.H{...}) directly, so
 *     the unwrapped payload is the bare object.
 *   - Paginated lists go through response.Paginated → data:{ items,total,page,page_size,pages }.
 *     We route those through getPaginated().
 *   - Query strings are assembled with buildQuery (drops undefined/null/'').
 *
 * Feature gating (opsMonitoringEnabled / ops_realtime_monitoring_enabled /
 * ops_query_mode_default) is read by the PAGE via settingsRegistry.getSettings()
 * — intentionally NOT duplicated here to keep a single source of truth.
 */
import { apiClient } from '../client';
import {
	buildQuery,
	getPaginated,
	unwrapData,
	type ApiEnvelope,
	type PaginatedResponse
} from './supply';

// ── Shared scalar / enum types ───────────────────────────────────────────────

export type OpsTimeRange = '5m' | '30m' | '1h' | '6h' | '24h';
export type OpsQueryMode = 'auto' | 'raw' | 'preagg';
export type OpsSeverity = 'P0' | 'P1' | 'P2' | 'P3' | string;
export type OpsAlertStatus = 'firing' | 'resolved' | 'manual_resolved';

export interface OpsPercentiles {
	p50_ms?: number | null;
	p90_ms?: number | null;
	p95_ms?: number | null;
	p99_ms?: number | null;
	avg_ms?: number | null;
	max_ms?: number | null;
}

export interface OpsRateSummary {
	current?: number;
	peak?: number;
	avg?: number;
}

export interface OpsSystemMetricsSnapshot {
	id?: number;
	created_at?: string;
	window_minutes?: number;
	cpu_usage_percent?: number | null;
	memory_used_mb?: number | null;
	memory_total_mb?: number | null;
	memory_usage_percent?: number | null;
	db_ok?: boolean | null;
	redis_ok?: boolean | null;
	db_conn_active?: number | null;
	db_conn_idle?: number | null;
	db_conn_waiting?: number | null;
	redis_conn_total?: number | null;
	redis_conn_idle?: number | null;
	goroutine_count?: number | null;
	concurrency_queue_depth?: number | null;
	account_switch_count?: number | null;
	[key: string]: unknown;
}

export interface OpsJobHeartbeat {
	job_name: string;
	last_run_at?: string | null;
	last_success_at?: string | null;
	last_error_at?: string | null;
	last_error?: string | null;
	last_duration_ms?: number | null;
	last_result?: string | null;
	updated_at?: string;
	[key: string]: unknown;
}

// ── Dashboard overview / snapshot ────────────────────────────────────────────

export interface OpsDashboardOverview {
	start_time?: string;
	end_time?: string;
	platform?: string;
	group_id?: number | null;
	health_score?: number;
	system_metrics?: OpsSystemMetricsSnapshot | null;
	job_heartbeats?: OpsJobHeartbeat[] | null;
	success_count?: number;
	error_count_total?: number;
	business_limited_count?: number;
	error_count_sla?: number;
	request_count_total?: number;
	request_count_sla?: number;
	token_consumed?: number;
	sla?: number;
	error_rate?: number;
	upstream_error_rate?: number;
	upstream_error_count_excl_429_529?: number;
	upstream_429_count?: number;
	upstream_529_count?: number;
	qps?: OpsRateSummary;
	tps?: OpsRateSummary;
	duration?: OpsPercentiles;
	ttft?: OpsPercentiles;
	[key: string]: unknown;
}

export interface OpsThroughputTrendPoint {
	bucket_start: string;
	request_count?: number;
	token_consumed?: number;
	switch_count?: number;
	qps?: number;
	tps?: number;
	[key: string]: unknown;
}

export interface OpsThroughputPlatformBreakdownItem {
	platform: string;
	request_count?: number;
	token_consumed?: number;
}

export interface OpsThroughputGroupBreakdownItem {
	group_id: number;
	group_name: string;
	request_count?: number;
	token_consumed?: number;
}

export interface OpsThroughputTrendResponse {
	bucket?: string;
	points?: OpsThroughputTrendPoint[];
	by_platform?: OpsThroughputPlatformBreakdownItem[];
	top_groups?: OpsThroughputGroupBreakdownItem[];
}

export interface OpsErrorTrendPoint {
	bucket_start: string;
	error_count_total?: number;
	business_limited_count?: number;
	error_count_sla?: number;
	upstream_error_count_excl_429_529?: number;
	upstream_429_count?: number;
	upstream_529_count?: number;
	[key: string]: unknown;
}

export interface OpsErrorTrendResponse {
	bucket?: string;
	points?: OpsErrorTrendPoint[];
}

export interface OpsDashboardSnapshotV2Response {
	generated_at: string;
	overview?: OpsDashboardOverview | null;
	throughput_trend?: OpsThroughputTrendResponse | null;
	error_trend?: OpsErrorTrendResponse | null;
}

export interface OpsLatencyHistogramBucket {
	range: string;
	count: number;
}

export interface OpsLatencyHistogramResponse {
	start_time?: string;
	end_time?: string;
	platform?: string;
	group_id?: number | null;
	total_requests?: number;
	buckets?: OpsLatencyHistogramBucket[];
}

export interface OpsErrorDistributionItem {
	status_code: number;
	total: number;
	sla: number;
	business_limited: number;
}

export interface OpsErrorDistributionResponse {
	total: number;
	items: OpsErrorDistributionItem[];
}

export interface OpsOpenAITokenStatsItem {
	model: string;
	request_count: number;
	avg_tokens_per_sec?: number | null;
	avg_first_token_ms?: number | null;
	total_output_tokens: number;
	avg_duration_ms: number;
	requests_with_first_token: number;
}

export interface OpsOpenAITokenStatsResponse {
	time_range: string;
	start_time: string;
	end_time: string;
	platform?: string;
	group_id?: number | null;
	items: OpsOpenAITokenStatsItem[];
	total: number;
	page?: number;
	page_size?: number;
	top_n?: number | null;
}

// ── Realtime concurrency / availability / traffic ────────────────────────────

export interface PlatformConcurrencyInfo {
	platform: string;
	current_in_use: number;
	max_capacity: number;
	load_percentage: number;
	waiting_in_queue: number;
}

export interface GroupConcurrencyInfo {
	group_id: number;
	group_name: string;
	platform: string;
	current_in_use: number;
	max_capacity: number;
	load_percentage: number;
	waiting_in_queue: number;
}

export interface AccountConcurrencyInfo {
	account_id: number;
	account_name: string;
	platform: string;
	group_id: number;
	group_name: string;
	current_in_use: number;
	max_capacity: number;
	load_percentage: number;
	waiting_in_queue: number;
}

export interface UserConcurrencyInfo {
	user_id: number;
	user_email: string;
	username: string;
	current_in_use: number;
	max_capacity: number;
	load_percentage: number;
	waiting_in_queue: number;
}

export interface OpsConcurrencyStatsResponse {
	enabled: boolean;
	// Backend always emits all three keys; typed optional so downstream consumers
	// (and fixtures) may treat absent dimensions defensively without a cast.
	platform: Record<string, PlatformConcurrencyInfo>;
	group?: Record<string, GroupConcurrencyInfo>;
	account?: Record<string, AccountConcurrencyInfo>;
	timestamp?: string;
}

export interface OpsUserConcurrencyStatsResponse {
	enabled: boolean;
	user: Record<string, UserConcurrencyInfo>;
	timestamp?: string;
}

export interface PlatformAvailability {
	platform: string;
	total_accounts: number;
	available_count: number;
	rate_limit_count: number;
	error_count: number;
}

export interface GroupAvailability {
	group_id: number;
	group_name: string;
	platform: string;
	total_accounts: number;
	available_count: number;
	rate_limit_count: number;
	error_count: number;
}

export interface AccountAvailability {
	account_id: number;
	account_name: string;
	platform: string;
	group_id: number;
	group_name: string;
	status: string;
	is_available: boolean;
	is_rate_limited: boolean;
	is_overloaded: boolean;
	has_error: boolean;
	rate_limit_reset_at?: string | null;
	rate_limit_remaining_sec?: number | null;
	overload_until?: string | null;
	overload_remaining_sec?: number | null;
	error_message?: string;
	temp_unschedulable_until?: string | null;
}

export interface OpsAccountAvailabilityStatsResponse {
	enabled: boolean;
	// Backend always emits all three keys; typed optional (see concurrency note).
	platform: Record<string, PlatformAvailability>;
	group?: Record<string, GroupAvailability>;
	account?: Record<string, AccountAvailability>;
	timestamp?: string;
}

export interface OpsRealtimeTrafficSummary {
	window?: string;
	start_time?: string;
	end_time?: string;
	platform?: string;
	group_id?: number | null;
	qps?: OpsRateSummary;
	tps?: OpsRateSummary;
}

export interface OpsRealtimeTrafficSummaryResponse {
	enabled: boolean;
	summary?: OpsRealtimeTrafficSummary | null;
	timestamp?: string;
}

// ── Alert rules / events / silences ──────────────────────────────────────────

export type AlertMetricType = string;
export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | string;

export interface AlertRule {
	id?: number;
	name: string;
	description?: string;
	enabled: boolean;
	severity: OpsSeverity;
	metric_type: AlertMetricType;
	operator: AlertOperator;
	threshold: number;
	window_minutes: number;
	sustained_minutes: number;
	cooldown_minutes: number;
	notify_email: boolean;
	filters?: Record<string, unknown> | null;
	last_triggered_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface AlertEvent {
	id: number;
	rule_id: number;
	severity: OpsSeverity;
	status: OpsAlertStatus | string;
	title?: string;
	description?: string;
	metric_value?: number | null;
	threshold_value?: number | null;
	dimensions?: Record<string, unknown> | null;
	fired_at: string;
	resolved_at?: string | null;
	email_sent: boolean;
	created_at: string;
	[key: string]: unknown;
}

export interface AlertEventsQuery {
	limit?: number;
	status?: string;
	severity?: string;
	email_sent?: boolean;
	time_range?: string;
	start_time?: string;
	end_time?: string;
	before_fired_at?: string;
	before_id?: number;
	platform?: string;
	group_id?: number | null;
}

export interface CreateAlertSilenceRequest {
	rule_id: number;
	platform: string;
	group_id?: number | null;
	region?: string | null;
	until: string; // RFC3339
	reason?: string;
}

// ── Email notification config ────────────────────────────────────────────────

export interface EmailAlertConfig {
	enabled: boolean;
	recipients: string[];
	min_severity: string;
	rate_limit_per_hour: number;
	batching_window_seconds: number;
	include_resolved_alerts: boolean;
}

export interface EmailReportConfig {
	enabled: boolean;
	recipients: string[];
	daily_summary_enabled: boolean;
	daily_summary_schedule: string;
	weekly_summary_enabled: boolean;
	weekly_summary_schedule: string;
	error_digest_enabled: boolean;
	error_digest_schedule: string;
	error_digest_min_count: number;
	account_health_enabled: boolean;
	account_health_schedule: string;
	account_health_error_rate_threshold: number;
}

export interface EmailNotificationConfig {
	alert: EmailAlertConfig;
	report: EmailReportConfig;
}

// ── Runtime settings (alert / logging) ───────────────────────────────────────

export interface OpsDistributedLockSettings {
	enabled: boolean;
	key: string;
	ttl_seconds: number;
}

export interface OpsAlertSilenceEntry {
	rule_id?: number | null;
	severities?: string[];
	until_rfc3339: string;
	reason: string;
}

export interface OpsAlertSilencingSettings {
	enabled: boolean;
	global_until_rfc3339: string;
	global_reason: string;
	entries?: OpsAlertSilenceEntry[];
}

export interface OpsMetricThresholds {
	sla_percent_min?: number | null;
	ttft_p99_ms_max?: number | null;
	request_error_rate_percent_max?: number | null;
	upstream_error_rate_percent_max?: number | null;
}

export interface OpsAlertRuntimeSettings {
	evaluation_interval_seconds: number;
	distributed_lock: OpsDistributedLockSettings;
	silencing: OpsAlertSilencingSettings;
	thresholds: OpsMetricThresholds;
}

export type OpsLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type OpsStacktraceLevel = 'none' | 'error' | 'fatal';

export interface OpsRuntimeLogConfig {
	level: OpsLogLevel;
	enable_sampling: boolean;
	sampling_initial: number;
	sampling_thereafter: number;
	caller: boolean;
	stacktrace_level: OpsStacktraceLevel;
	retention_days: number;
	source?: string;
	updated_at?: string;
	updated_by_user_id?: number;
	extra?: Record<string, unknown>;
}

// ── Advanced settings ────────────────────────────────────────────────────────

export interface OpsDataRetentionSettings {
	cleanup_enabled: boolean;
	cleanup_schedule: string;
	error_log_retention_days: number;
	minute_metrics_retention_days: number;
	hourly_metrics_retention_days: number;
}

export interface OpsAggregationSettings {
	aggregation_enabled: boolean;
}

export interface OpsOpenAIAccountQuotaAutoPauseSettings {
	default_threshold_5h: number;
	default_threshold_7d: number;
}

export interface OpsAdvancedSettings {
	data_retention: OpsDataRetentionSettings;
	aggregation: OpsAggregationSettings;
	openai_account_quota_auto_pause: OpsOpenAIAccountQuotaAutoPauseSettings;
	ignore_count_tokens_errors: boolean;
	ignore_context_canceled: boolean;
	ignore_no_available_accounts: boolean;
	ignore_invalid_api_key_errors: boolean;
	ignore_insufficient_balance_errors: boolean;
	display_openai_token_stats: boolean;
	display_alert_events: boolean;
	auto_refresh_enabled: boolean;
	auto_refresh_interval_seconds: number;
}

// ── Error logs (request-errors / upstream-errors / legacy errors) ────────────

export interface OpsErrorLog {
	id: number;
	created_at: string;
	phase?: string;
	type?: string;
	error_owner?: string;
	error_source?: string;
	severity?: string;
	status_code?: number;
	platform?: string;
	model?: string;
	resolved?: boolean;
	resolved_at?: string | null;
	resolved_by_user_id?: number | null;
	resolved_by_user_name?: string;
	client_request_id?: string;
	request_id?: string;
	message?: string;
	user_id?: number | null;
	user_email?: string;
	api_key_id?: number | null;
	account_id?: number | null;
	account_name?: string;
	group_id?: number | null;
	group_name?: string;
	client_ip?: string | null;
	request_path?: string;
	stream?: boolean;
	inbound_endpoint?: string;
	upstream_endpoint?: string;
	requested_model?: string;
	upstream_model?: string;
	request_type?: number | null;
	api_key_name?: string;
	api_key_deleted?: boolean;
	api_key_prefix?: string;
	[key: string]: unknown;
}

export interface OpsErrorDetail extends OpsErrorLog {
	error_body?: string;
	user_agent?: string;
	upstream_status_code?: number | null;
	upstream_error_message?: string;
	upstream_error_detail?: string;
	upstream_errors?: string;
	auth_latency_ms?: number | null;
	routing_latency_ms?: number | null;
	upstream_latency_ms?: number | null;
	response_latency_ms?: number | null;
	time_to_first_token_ms?: number | null;
	is_business_limited?: boolean;
	attempted_key_prefix?: string;
	deleted_key_owner_user_id?: number | null;
	deleted_key_owner_email?: string;
	deleted_key_name?: string;
}

export interface OpsErrorListQueryParams {
	page?: number;
	page_size?: number;
	time_range?: string;
	start_time?: string;
	end_time?: string;
	platform?: string;
	group_id?: number | null;
	account_id?: number | null;
	user_id?: number | null;
	api_key_id?: number | null;
	model?: string;
	phase?: string;
	error_owner?: string;
	error_source?: string;
	resolved?: boolean;
	view?: string;
	q?: string;
	status_codes?: string;
	/** UI sentinel: include "other" (non-listed) status codes; backend ignores unknown keys. */
	status_codes_other?: boolean;
}

// ── Request drilldown (success + error) ──────────────────────────────────────

export type OpsRequestKind = 'success' | 'error';

export interface OpsRequestDetail {
	kind: OpsRequestKind;
	created_at: string;
	request_id: string;
	platform?: string;
	model?: string;
	duration_ms?: number | null;
	status_code?: number | null;
	error_id?: number | null;
	phase?: string;
	severity?: string;
	message?: string;
	user_id?: number | null;
	api_key_id?: number | null;
	account_id?: number | null;
	group_id?: number | null;
	stream?: boolean;
}

export interface OpsRequestDetailsParams {
	time_range?: string;
	start_time?: string;
	end_time?: string;
	kind?: 'success' | 'error' | 'all';
	platform?: string;
	group_id?: number | null;
	user_id?: number | null;
	api_key_id?: number | null;
	account_id?: number | null;
	model?: string;
	request_id?: string;
	q?: string;
	min_duration_ms?: number;
	max_duration_ms?: number;
	sort?: 'created_at_desc' | 'duration_desc';
	page?: number;
	page_size?: number;
}

// ── Indexed system logs ──────────────────────────────────────────────────────

export type OpsSystemLogTimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d';

export interface OpsSystemLog {
	id: number;
	created_at: string;
	level: string;
	component: string;
	message: string;
	request_id?: string;
	client_request_id?: string;
	user_id?: number | null;
	account_id?: number | null;
	platform?: string;
	model?: string;
	extra?: Record<string, unknown>;
}

export interface OpsSystemLogQuery {
	page?: number;
	page_size?: number;
	time_range?: OpsSystemLogTimeRange;
	start_time?: string;
	end_time?: string;
	level?: string;
	component?: string;
	request_id?: string;
	client_request_id?: string;
	user_id?: number | null;
	account_id?: number | null;
	platform?: string;
	model?: string;
	q?: string;
}

export interface OpsSystemLogCleanupRequest {
	start_time?: string;
	end_time?: string;
	level?: string;
	component?: string;
	request_id?: string;
	client_request_id?: string;
	user_id?: number | null;
	account_id?: number | null;
	platform?: string;
	model?: string;
	q?: string;
}

export interface OpsSystemLogSinkHealth {
	queue_depth: number;
	queue_capacity: number;
	dropped_count: number;
	write_failed_count: number;
	written_count: number;
	avg_write_delay_ms: number;
	last_error?: string;
}

// ── Common request param shape ───────────────────────────────────────────────

export interface OpsDashboardParams {
	time_range?: OpsTimeRange;
	start_time?: string;
	end_time?: string;
	platform?: string;
	group_id?: number | null;
	mode?: OpsQueryMode;
}

export interface OpsOpenAITokenStatsParams {
	time_range?: '30m' | '1h' | '1d' | '15d' | '30d';
	platform?: string;
	group_id?: number | null;
	page?: number;
	page_size?: number;
	top_n?: number;
}

const OPS_BASE = '/api/v1/admin/ops';

function getUnwrapped<T>(path: string): Promise<T> {
	return apiClient.get<T | ApiEnvelope<T>>(path).then((raw) => unwrapData(raw));
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function getOpsDashboardSnapshot(
	params: OpsDashboardParams = {}
): Promise<OpsDashboardSnapshotV2Response> {
	return getUnwrapped<OpsDashboardSnapshotV2Response>(
		`${OPS_BASE}/dashboard/snapshot-v2${buildQuery({ ...params })}`
	);
}

export function getOpsDashboardOverview(
	params: OpsDashboardParams = {}
): Promise<OpsDashboardOverview> {
	return getUnwrapped<OpsDashboardOverview>(
		`${OPS_BASE}/dashboard/overview${buildQuery({ ...params })}`
	);
}

export function getOpsThroughputTrend(
	params: OpsDashboardParams = {}
): Promise<OpsThroughputTrendResponse> {
	return getUnwrapped<OpsThroughputTrendResponse>(
		`${OPS_BASE}/dashboard/throughput-trend${buildQuery({ ...params })}`
	);
}

export function getOpsLatencyHistogram(
	params: OpsDashboardParams = {}
): Promise<OpsLatencyHistogramResponse> {
	return getUnwrapped<OpsLatencyHistogramResponse>(
		`${OPS_BASE}/dashboard/latency-histogram${buildQuery({ ...params })}`
	);
}

export function getOpsErrorTrend(params: OpsDashboardParams = {}): Promise<OpsErrorTrendResponse> {
	return getUnwrapped<OpsErrorTrendResponse>(
		`${OPS_BASE}/dashboard/error-trend${buildQuery({ ...params })}`
	);
}

export function getOpsErrorDistribution(
	params: OpsDashboardParams = {}
): Promise<OpsErrorDistributionResponse> {
	return getUnwrapped<OpsErrorDistributionResponse>(
		`${OPS_BASE}/dashboard/error-distribution${buildQuery({ ...params })}`
	);
}

export function getOpsOpenAITokenStats(
	params: OpsOpenAITokenStatsParams = {}
): Promise<OpsOpenAITokenStatsResponse> {
	return getUnwrapped<OpsOpenAITokenStatsResponse>(
		`${OPS_BASE}/dashboard/openai-token-stats${buildQuery({ ...params })}`
	);
}

// ── Realtime signals ─────────────────────────────────────────────────────────

export function getOpsConcurrencyStats(
	params: { platform?: string; group_id?: number } = {}
): Promise<OpsConcurrencyStatsResponse> {
	return getUnwrapped<OpsConcurrencyStatsResponse>(
		`${OPS_BASE}/concurrency${buildQuery({ ...params })}`
	);
}

export function getOpsUserConcurrencyStats(): Promise<OpsUserConcurrencyStatsResponse> {
	return getUnwrapped<OpsUserConcurrencyStatsResponse>(`${OPS_BASE}/user-concurrency`);
}

export function getOpsAccountAvailability(
	params: { platform?: string; group_id?: number } = {}
): Promise<OpsAccountAvailabilityStatsResponse> {
	return getUnwrapped<OpsAccountAvailabilityStatsResponse>(
		`${OPS_BASE}/account-availability${buildQuery({ ...params })}`
	);
}

export function getOpsRealtimeTraffic(
	params: { window?: string; platform?: string; group_id?: number } = {}
): Promise<OpsRealtimeTrafficSummaryResponse> {
	return getUnwrapped<OpsRealtimeTrafficSummaryResponse>(
		`${OPS_BASE}/realtime-traffic${buildQuery({ window: params.window ?? '1m', ...params })}`
	);
}

// ── Alert rules ──────────────────────────────────────────────────────────────

export function listOpsAlertRules(): Promise<AlertRule[]> {
	return getUnwrapped<AlertRule[]>(`${OPS_BASE}/alert-rules`).then((v) => v ?? []);
}

export function createOpsAlertRule(body: AlertRule): Promise<AlertRule> {
	return apiClient
		.post<AlertRule | ApiEnvelope<AlertRule>>(`${OPS_BASE}/alert-rules`, body)
		.then((raw) => unwrapData(raw));
}

export function updateOpsAlertRule(id: number, body: Partial<AlertRule>): Promise<AlertRule> {
	return apiClient
		.put<AlertRule | ApiEnvelope<AlertRule>>(`${OPS_BASE}/alert-rules/${id}`, body)
		.then((raw) => unwrapData(raw));
}

export async function deleteOpsAlertRule(id: number): Promise<void> {
	await apiClient.delete(`${OPS_BASE}/alert-rules/${id}`);
}

// ── Alert events ─────────────────────────────────────────────────────────────

export function listOpsAlertEvents(params: AlertEventsQuery = {}): Promise<AlertEvent[]> {
	return getUnwrapped<AlertEvent[]>(`${OPS_BASE}/alert-events${buildQuery({ ...params })}`).then(
		(v) => v ?? []
	);
}

export function getOpsAlertEvent(id: number): Promise<AlertEvent> {
	return getUnwrapped<AlertEvent>(`${OPS_BASE}/alert-events/${id}`);
}

export async function updateOpsAlertEventStatus(
	id: number,
	status: 'resolved' | 'manual_resolved'
): Promise<void> {
	await apiClient.put(`${OPS_BASE}/alert-events/${id}/status`, { status });
}

export async function createOpsAlertSilence(body: CreateAlertSilenceRequest): Promise<void> {
	await apiClient.post(`${OPS_BASE}/alert-silences`, body);
}

// ── Email notification config ────────────────────────────────────────────────

export function getOpsEmailNotificationConfig(): Promise<EmailNotificationConfig> {
	return getUnwrapped<EmailNotificationConfig>(`${OPS_BASE}/email-notification/config`);
}

export function updateOpsEmailNotificationConfig(
	body: EmailNotificationConfig
): Promise<EmailNotificationConfig> {
	return apiClient
		.put<EmailNotificationConfig | ApiEnvelope<EmailNotificationConfig>>(
			`${OPS_BASE}/email-notification/config`,
			body
		)
		.then((raw) => unwrapData(raw));
}

// ── Runtime settings ─────────────────────────────────────────────────────────

export function getOpsAlertRuntimeSettings(): Promise<OpsAlertRuntimeSettings> {
	return getUnwrapped<OpsAlertRuntimeSettings>(`${OPS_BASE}/runtime/alert`);
}

export function updateOpsAlertRuntimeSettings(
	body: OpsAlertRuntimeSettings
): Promise<OpsAlertRuntimeSettings> {
	return apiClient
		.put<OpsAlertRuntimeSettings | ApiEnvelope<OpsAlertRuntimeSettings>>(
			`${OPS_BASE}/runtime/alert`,
			body
		)
		.then((raw) => unwrapData(raw));
}

export function getOpsRuntimeLogConfig(): Promise<OpsRuntimeLogConfig> {
	return getUnwrapped<OpsRuntimeLogConfig>(`${OPS_BASE}/runtime/logging`);
}

export function updateOpsRuntimeLogConfig(
	body: OpsRuntimeLogConfig
): Promise<OpsRuntimeLogConfig> {
	return apiClient
		.put<OpsRuntimeLogConfig | ApiEnvelope<OpsRuntimeLogConfig>>(
			`${OPS_BASE}/runtime/logging`,
			body
		)
		.then((raw) => unwrapData(raw));
}

export function resetOpsRuntimeLogConfig(): Promise<OpsRuntimeLogConfig> {
	return apiClient
		.post<OpsRuntimeLogConfig | ApiEnvelope<OpsRuntimeLogConfig>>(
			`${OPS_BASE}/runtime/logging/reset`,
			{}
		)
		.then((raw) => unwrapData(raw));
}

// ── Advanced settings ────────────────────────────────────────────────────────

export function getOpsAdvancedSettings(): Promise<OpsAdvancedSettings> {
	return getUnwrapped<OpsAdvancedSettings>(`${OPS_BASE}/advanced-settings`);
}

export function updateOpsAdvancedSettings(
	body: OpsAdvancedSettings
): Promise<OpsAdvancedSettings> {
	return apiClient
		.put<OpsAdvancedSettings | ApiEnvelope<OpsAdvancedSettings>>(
			`${OPS_BASE}/advanced-settings`,
			body
		)
		.then((raw) => unwrapData(raw));
}

// ── Metric thresholds ────────────────────────────────────────────────────────

export function getOpsMetricThresholds(): Promise<OpsMetricThresholds> {
	return getUnwrapped<OpsMetricThresholds>(`${OPS_BASE}/settings/metric-thresholds`);
}

export async function updateOpsMetricThresholds(body: OpsMetricThresholds): Promise<void> {
	await apiClient.put(`${OPS_BASE}/settings/metric-thresholds`, body);
}

// ── Request errors ───────────────────────────────────────────────────────────

export function listOpsRequestErrors(
	params: OpsErrorListQueryParams = {}
): Promise<PaginatedResponse<OpsErrorLog>> {
	return getPaginated<OpsErrorLog>(`${OPS_BASE}/request-errors${buildQuery({ ...params })}`);
}

export function getOpsRequestErrorDetail(id: number): Promise<OpsErrorDetail> {
	return getUnwrapped<OpsErrorDetail>(`${OPS_BASE}/request-errors/${id}`);
}

export function listOpsRequestErrorUpstreamErrors(
	id: number,
	params: OpsErrorListQueryParams = {},
	opt: { include_detail?: boolean } = {}
): Promise<PaginatedResponse<OpsErrorDetail>> {
	const query = buildQuery({
		...params,
		include_detail: opt.include_detail ? 1 : undefined
	});
	return getPaginated<OpsErrorDetail>(`${OPS_BASE}/request-errors/${id}/upstream-errors${query}`);
}

export async function resolveOpsRequestError(id: number, resolved: boolean): Promise<void> {
	await apiClient.put(`${OPS_BASE}/request-errors/${id}/resolve`, { resolved });
}

// ── Upstream errors ──────────────────────────────────────────────────────────

export function listOpsUpstreamErrors(
	params: OpsErrorListQueryParams = {}
): Promise<PaginatedResponse<OpsErrorLog>> {
	return getPaginated<OpsErrorLog>(`${OPS_BASE}/upstream-errors${buildQuery({ ...params })}`);
}

export function getOpsUpstreamErrorDetail(id: number): Promise<OpsErrorDetail> {
	return getUnwrapped<OpsErrorDetail>(`${OPS_BASE}/upstream-errors/${id}`);
}

export async function resolveOpsUpstreamError(id: number, resolved: boolean): Promise<void> {
	await apiClient.put(`${OPS_BASE}/upstream-errors/${id}/resolve`, { resolved });
}

// ── Legacy unified error logs ────────────────────────────────────────────────

export function listOpsErrorLogs(
	params: OpsErrorListQueryParams = {}
): Promise<PaginatedResponse<OpsErrorLog>> {
	return getPaginated<OpsErrorLog>(`${OPS_BASE}/errors${buildQuery({ ...params })}`);
}

export function getOpsErrorLogDetail(id: number): Promise<OpsErrorDetail> {
	return getUnwrapped<OpsErrorDetail>(`${OPS_BASE}/errors/${id}`);
}

export async function resolveOpsErrorLog(id: number, resolved: boolean): Promise<void> {
	await apiClient.put(`${OPS_BASE}/errors/${id}/resolve`, { resolved });
}

// ── Request drilldown ────────────────────────────────────────────────────────

export function listOpsRequestDetails(
	params: OpsRequestDetailsParams = {}
): Promise<PaginatedResponse<OpsRequestDetail>> {
	return getPaginated<OpsRequestDetail>(`${OPS_BASE}/requests${buildQuery({ ...params })}`);
}

// ── System logs ──────────────────────────────────────────────────────────────

export function listOpsSystemLogs(
	params: OpsSystemLogQuery = {}
): Promise<PaginatedResponse<OpsSystemLog>> {
	return getPaginated<OpsSystemLog>(`${OPS_BASE}/system-logs${buildQuery({ ...params })}`);
}

export function cleanupOpsSystemLogs(
	body: OpsSystemLogCleanupRequest = {}
): Promise<{ deleted: number }> {
	return apiClient
		.post<{ deleted: number } | ApiEnvelope<{ deleted: number }>>(
			`${OPS_BASE}/system-logs/cleanup`,
			body
		)
		.then((raw) => unwrapData(raw));
}

export function getOpsSystemLogSinkHealth(): Promise<OpsSystemLogSinkHealth> {
	return getUnwrapped<OpsSystemLogSinkHealth>(`${OPS_BASE}/system-logs/health`);
}

// ── Facade ───────────────────────────────────────────────────────────────────

export const adminOpsApi = {
	// dashboard
	getOpsDashboardSnapshot,
	getOpsDashboardOverview,
	getOpsThroughputTrend,
	getOpsLatencyHistogram,
	getOpsErrorTrend,
	getOpsErrorDistribution,
	getOpsOpenAITokenStats,
	// realtime
	getOpsConcurrencyStats,
	getOpsUserConcurrencyStats,
	getOpsAccountAvailability,
	getOpsRealtimeTraffic,
	// alert rules
	listOpsAlertRules,
	createOpsAlertRule,
	updateOpsAlertRule,
	deleteOpsAlertRule,
	// alert events
	listOpsAlertEvents,
	getOpsAlertEvent,
	updateOpsAlertEventStatus,
	createOpsAlertSilence,
	// email notification
	getOpsEmailNotificationConfig,
	updateOpsEmailNotificationConfig,
	// runtime
	getOpsAlertRuntimeSettings,
	updateOpsAlertRuntimeSettings,
	getOpsRuntimeLogConfig,
	updateOpsRuntimeLogConfig,
	resetOpsRuntimeLogConfig,
	// advanced + thresholds
	getOpsAdvancedSettings,
	updateOpsAdvancedSettings,
	getOpsMetricThresholds,
	updateOpsMetricThresholds,
	// request errors
	listOpsRequestErrors,
	getOpsRequestErrorDetail,
	listOpsRequestErrorUpstreamErrors,
	resolveOpsRequestError,
	// upstream errors
	listOpsUpstreamErrors,
	getOpsUpstreamErrorDetail,
	resolveOpsUpstreamError,
	// legacy errors
	listOpsErrorLogs,
	getOpsErrorLogDetail,
	resolveOpsErrorLog,
	// requests + system logs
	listOpsRequestDetails,
	listOpsSystemLogs,
	cleanupOpsSystemLogs,
	getOpsSystemLogSinkHealth
};
