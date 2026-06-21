import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface ChannelMonitorTemplate {
	id: number;
	name: string;
	description?: string | null;
	provider?: string;
	config?: Record<string, unknown>;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export type SaveChannelMonitorTemplateRequest = Partial<ChannelMonitorTemplate>;
export type ChannelMonitorTemplateApplyRequest = Record<string, unknown>;
export type ChannelMonitorTemplateApplyResult = Record<string, unknown>;
export interface ChannelMonitorTemplateFilters {
	provider?: string;
	api_mode?: string;
}
export interface AssociatedMonitorBrief {
	id: number;
	name: string;
	provider: string;
	api_mode: string;
	enabled: boolean;
}

interface ListResponse<T> {
	items?: T[];
}

const BASE = '/api/v1/admin/channel-monitor-templates';

export async function list(filters: ChannelMonitorTemplateFilters = {}): Promise<ChannelMonitorTemplate[]> {
	const raw = await apiClient.get<ApiEnvelope<ChannelMonitorTemplate[] | ListResponse<ChannelMonitorTemplate>>>(
		`${BASE}${buildQuery({ ...filters })}`
	);
	const payload = unwrapData(raw);
	return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function get(id: number): Promise<ChannelMonitorTemplate> {
	const raw = await apiClient.get<ApiEnvelope<ChannelMonitorTemplate>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function create(
	payload: SaveChannelMonitorTemplateRequest
): Promise<ChannelMonitorTemplate> {
	const raw = await apiClient.post<ApiEnvelope<ChannelMonitorTemplate>>(BASE, payload);
	return unwrapData(raw);
}

export async function update(
	id: number,
	payload: SaveChannelMonitorTemplateRequest
): Promise<ChannelMonitorTemplate> {
	const raw = await apiClient.put<ApiEnvelope<ChannelMonitorTemplate>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function del(id: number): Promise<void> {
	await apiClient.delete<ApiEnvelope<void>>(`${BASE}/${id}`);
}

export async function apply(
	id: number,
	payload: ChannelMonitorTemplateApplyRequest
): Promise<ChannelMonitorTemplateApplyResult> {
	const raw = await apiClient.post<ApiEnvelope<ChannelMonitorTemplateApplyResult>>(
		`${BASE}/${id}/apply`,
		payload
	);
	return unwrapData(raw);
}

export async function listAssociatedMonitors(id: number): Promise<AssociatedMonitorBrief[]> {
	const raw = await apiClient.get<ApiEnvelope<AssociatedMonitorBrief[] | ListResponse<AssociatedMonitorBrief>>>(
		`${BASE}/${id}/monitors`
	);
	const payload = unwrapData(raw);
	return Array.isArray(payload) ? payload : payload.items ?? [];
}

export const channelMonitorTemplateAPI = {
	list,
	get,
	create,
	update,
	delete: del,
	apply,
	listAssociatedMonitors
};

export default channelMonitorTemplateAPI;
