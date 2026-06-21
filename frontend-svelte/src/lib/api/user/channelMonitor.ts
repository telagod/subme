/**
 * User Channel Monitor API · Svelte rewrite
 *
 * Vue parity:
 *   - GET /api/v1/channel-monitors
 *   - GET /api/v1/channel-monitors/:id/status
 *
 * Read-only user surface. Admin mutation endpoints intentionally stay in
 * $lib/api/admin/channelMonitor.
 */
import { apiClient } from '../client';
import type { MonitorStatus, Provider } from '../admin/channelMonitor';

export type { MonitorStatus, Provider };

export interface UserMonitorExtraModel {
	model: string;
	status: MonitorStatus;
	latency_ms: number | null;
}

export interface MonitorTimelinePoint {
	status: MonitorStatus;
	latency_ms: number | null;
	ping_latency_ms: number | null;
	checked_at: string;
}

export interface UserMonitorView {
	id: number;
	name: string;
	provider: Provider;
	group_name: string;
	primary_model: string;
	primary_status: MonitorStatus;
	primary_latency_ms: number | null;
	primary_ping_latency_ms: number | null;
	availability_7d: number;
	extra_models: UserMonitorExtraModel[];
	timeline: MonitorTimelinePoint[];
}

export interface UserMonitorListResponse {
	items: UserMonitorView[];
}

export interface UserMonitorModelDetail {
	model: string;
	latest_status: MonitorStatus;
	latest_latency_ms: number | null;
	availability_7d: number;
	availability_15d: number;
	availability_30d: number;
	avg_latency_7d_ms: number | null;
}

export interface UserMonitorDetail {
	id: number;
	name: string;
	provider: Provider;
	group_name: string;
	models: UserMonitorModelDetail[];
}

interface Wrapped<T> {
	data?: T;
}

function unwrap<T>(value: T | Wrapped<T>): T {
	if (value && typeof value === 'object' && 'data' in value) {
		return (value as Wrapped<T>).data as T;
	}
	return value as T;
}

export async function listUserChannelMonitors(): Promise<UserMonitorListResponse> {
	const resp = await apiClient.get<UserMonitorListResponse | Wrapped<UserMonitorListResponse>>(
		'/api/v1/channel-monitors'
	);
	return unwrap(resp) ?? { items: [] };
}

export async function getUserChannelMonitorStatus(id: number): Promise<UserMonitorDetail> {
	const resp = await apiClient.get<UserMonitorDetail | Wrapped<UserMonitorDetail>>(
		`/api/v1/channel-monitors/${id}/status`
	);
	return unwrap(resp);
}

export const userChannelMonitorApi = {
	listUserChannelMonitors,
	getUserChannelMonitorStatus
};
