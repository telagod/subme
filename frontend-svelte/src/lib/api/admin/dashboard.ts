import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface DashboardStats {
	total_api_keys?: number;
	active_api_keys?: number;
	total_accounts?: number;
	normal_accounts?: number;
	error_accounts?: number;
	today_requests?: number;
	total_requests?: number;
	total_users?: number;
	today_new_users?: number;
	active_users?: number;
	today_tokens?: number;
	total_tokens?: number;
	today_cost?: number;
	total_cost?: number;
	today_actual_cost?: number;
	total_actual_cost?: number;
	today_account_cost?: number;
	total_account_cost?: number;
	rpm?: number;
	tpm?: number;
	average_duration_ms?: number;
	uptime?: number;
	[key: string]: unknown;
}

export interface TrendDataPoint {
	date?: string;
	time?: string;
	requests?: number;
	tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface ModelStat {
	model?: string;
	name?: string;
	requests?: number;
	tokens?: number;
	total_tokens?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface GroupStat {
	group_id?: number;
	group_name?: string;
	name?: string;
	requests?: number;
	tokens?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface UserUsageTrendPoint {
	user_id?: number;
	user_email?: string;
	email?: string;
	requests?: number;
	tokens?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface DashboardSnapshot {
	generated_at?: string;
	start_date?: string;
	end_date?: string;
	granularity?: string;
	stats?: DashboardStats;
	trend?: TrendDataPoint[];
	models?: ModelStat[];
	groups?: GroupStat[];
	users_trend?: UserUsageTrendPoint[];
}

export interface DashboardSnapshotParams {
	start_date?: string;
	end_date?: string;
	granularity?: 'day' | 'hour';
	include_stats?: boolean;
	include_trend?: boolean;
	include_model_stats?: boolean;
	include_group_stats?: boolean;
	include_users_trend?: boolean;
	users_trend_limit?: number;
}

export interface UserSpendingRankingItem {
	user_id: number;
	username?: string;
	email?: string;
	requests?: number;
	tokens?: number;
	actual_cost?: number;
	cost?: number;
	[key: string]: unknown;
}

export interface UserSpendingRankingResponse {
	ranking?: UserSpendingRankingItem[];
	total_actual_cost?: number;
	total_requests?: number;
	total_tokens?: number;
}

export interface UserUsageTrendResponse {
	trend?: UserUsageTrendDetailPoint[];
}

export interface UserUsageTrendDetailPoint {
	user_id: number;
	username?: string;
	email?: string;
	date: string;
	tokens: number;
	requests?: number;
	cost?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface ModelStatsParams {
	start_date?: string;
	end_date?: string;
	model_source?: 'requested' | 'upstream' | 'mapping';
	user_id?: number;
	model?: string;
	api_key_id?: number;
	account_id?: number;
	group_id?: number;
	request_type?: string;
	stream?: boolean;
	billing_type?: number | null;
}

export interface ModelStatsResponse {
	models?: ModelStat[];
}

const DASHBOARD_BASE = '/api/v1/admin/dashboard';

export async function getDashboardSnapshot(
	params: DashboardSnapshotParams = {}
): Promise<DashboardSnapshot> {
	const raw = await apiClient.get<DashboardSnapshot | ApiEnvelope<DashboardSnapshot>>(
		`${DASHBOARD_BASE}/snapshot-v2${buildQuery({
			include_stats: true,
			include_trend: true,
			include_model_stats: true,
			include_group_stats: true,
			include_users_trend: true,
			users_trend_limit: 12,
			...params
		})}`
	);
	return unwrapData(raw) ?? {};
}

export async function getUserSpendingRanking(
	params: { start_date?: string; end_date?: string; limit?: number } = {}
): Promise<UserSpendingRankingResponse> {
	const raw = await apiClient.get<UserSpendingRankingResponse | ApiEnvelope<UserSpendingRankingResponse>>(
		`${DASHBOARD_BASE}/users-ranking${buildQuery({ limit: 12, ...params })}`
	);
	return unwrapData(raw) ?? {};
}

export async function getUserUsageTrend(
	params: { start_date?: string; end_date?: string; granularity?: 'day' | 'hour'; limit?: number } = {}
): Promise<UserUsageTrendResponse> {
	const raw = await apiClient.get<UserUsageTrendResponse | ApiEnvelope<UserUsageTrendResponse>>(
		`${DASHBOARD_BASE}/users-trend${buildQuery({ limit: 12, ...params })}`
	);
	return unwrapData(raw) ?? {};
}

export async function getModelStats(
	params: ModelStatsParams = {}
): Promise<ModelStatsResponse> {
	const raw = await apiClient.get<ModelStatsResponse | ApiEnvelope<ModelStatsResponse>>(
		`${DASHBOARD_BASE}/models${buildQuery({ ...params })}`
	);
	return unwrapData(raw) ?? {};
}

export const adminDashboardApi = {
	getDashboardSnapshot,
	getUserSpendingRanking,
	getUserUsageTrend,
	getModelStats
};

export default adminDashboardApi;
