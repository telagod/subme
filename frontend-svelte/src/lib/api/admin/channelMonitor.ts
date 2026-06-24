import { apiClient } from '../client';
import { buildQuery, getPaginated, type PaginatedResponse } from './supply';

export type Provider = 'openai' | 'anthropic' | 'gemini';
export type MonitorStatus = 'operational' | 'degraded' | 'failed' | 'error';
export type BodyOverrideMode = 'off' | 'merge' | 'replace';
export type APIMode = 'chat_completions' | 'responses';

export interface ExtraModelStatus {
	model: string;
	status: MonitorStatus | '';
	latency_ms: number | null;
}

export interface ChannelMonitor {
	id: number;
	name: string;
	provider: Provider;
	api_mode: APIMode;
	endpoint: string;
	api_key_masked: string;
	api_key_decrypt_failed?: boolean;
	primary_model: string;
	extra_models: string[];
	group_name: string;
	enabled: boolean;
	interval_seconds: number;
	jitter_seconds: number;
	last_checked_at: string | null;
	created_by: number;
	created_at: string;
	updated_at: string;
	primary_status: MonitorStatus | '';
	primary_latency_ms: number | null;
	availability_7d: number;
	extra_models_status: ExtraModelStatus[];
	template_id: number | null;
	extra_headers: Record<string, string>;
	body_override_mode: BodyOverrideMode;
	body_override: Record<string, unknown> | null;
}

export interface ChannelMonitorFilters {
	page?: number;
	page_size?: number;
	provider?: Provider;
	enabled?: boolean;
	search?: string;
}

export interface CreateChannelMonitorRequest {
	name: string;
	provider: Provider;
	api_mode?: APIMode;
	endpoint: string;
	api_key: string;
	primary_model: string;
	extra_models?: string[];
	group_name?: string;
	enabled?: boolean;
	interval_seconds: number;
	jitter_seconds?: number;
	template_id?: number | null;
	extra_headers?: Record<string, string>;
	body_override_mode?: BodyOverrideMode;
	body_override?: Record<string, unknown> | null;
}

export type UpdateChannelMonitorRequest = Partial<CreateChannelMonitorRequest> & {
	clear_template?: boolean;
};

export interface CheckResult {
	model: string;
	status: MonitorStatus;
	latency_ms: number | null;
	ping_latency_ms: number | null;
	message: string;
	checked_at: string;
}

export interface RunNowResponse {
	results: CheckResult[];
}

export interface HistoryItem extends CheckResult {
	id: number;
}

interface ApiEnvelope<T> {
	data?: T;
}

function unwrap<T>(value: T | ApiEnvelope<T>): T {
	if (value && typeof value === 'object' && 'data' in value) {
		return (value as ApiEnvelope<T>).data as T;
	}
	return value as T;
}

const MONITORS_BASE = '/api/v1/admin/channel-monitors';

export function listChannelMonitors(
	params: ChannelMonitorFilters = {}
): Promise<PaginatedResponse<ChannelMonitor>> {
	return getPaginated<ChannelMonitor>(`${MONITORS_BASE}${buildQuery({ ...params })}`);
}

export function getChannelMonitor(id: number): Promise<ChannelMonitor> {
	return apiClient
		.get<ChannelMonitor | ApiEnvelope<ChannelMonitor>>(`${MONITORS_BASE}/${id}`)
		.then(unwrap);
}

export function createChannelMonitor(
	payload: CreateChannelMonitorRequest
): Promise<ChannelMonitor> {
	return apiClient
		.post<ChannelMonitor | ApiEnvelope<ChannelMonitor>>(MONITORS_BASE, payload)
		.then(unwrap);
}

export function updateChannelMonitor(
	id: number,
	payload: UpdateChannelMonitorRequest
): Promise<ChannelMonitor> {
	return apiClient
		.put<ChannelMonitor | ApiEnvelope<ChannelMonitor>>(`${MONITORS_BASE}/${id}`, payload)
		.then(unwrap);
}

export function deleteChannelMonitor(id: number): Promise<void> {
	return apiClient.delete<void>(`${MONITORS_BASE}/${id}`);
}

export function runChannelMonitorNow(id: number): Promise<RunNowResponse> {
	return apiClient
		.post<RunNowResponse | ApiEnvelope<RunNowResponse>>(`${MONITORS_BASE}/${id}/run`)
		.then(unwrap);
}

export function listChannelMonitorHistory(
	id: number,
	params: { model?: string; limit?: number } = {}
): Promise<{ items: HistoryItem[] }> {
	return apiClient
		.get<{ items: HistoryItem[] } | ApiEnvelope<{ items: HistoryItem[] }>>(
			`${MONITORS_BASE}/${id}/history${buildQuery(params)}`
		)
		.then(unwrap);
}

export const adminChannelMonitorApi = {
	listChannelMonitors,
	getChannelMonitor,
	createChannelMonitor,
	updateChannelMonitor,
	deleteChannelMonitor,
	runChannelMonitorNow,
	listChannelMonitorHistory
};
