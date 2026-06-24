import { apiClient } from '../client';
import type { BodyOverrideMode, APIMode, Provider } from './channelMonitor';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface ChannelMonitorTemplate {
	id: number;
	name: string;
	provider: Provider;
	api_mode: APIMode;
	description: string;
	extra_headers: Record<string, string>;
	body_override_mode: BodyOverrideMode;
	body_override: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	associated_monitors: number;
}

export interface CreateTemplateRequest {
	name: string;
	provider: Provider;
	api_mode?: APIMode;
	description?: string;
	extra_headers?: Record<string, string>;
	body_override_mode?: BodyOverrideMode;
	body_override?: Record<string, unknown> | null;
}

export type UpdateTemplateRequest = Partial<Omit<CreateTemplateRequest, 'provider'>>;

export interface ApplyTemplateRequest {
	monitor_ids: number[];
}

export interface ApplyTemplateResult {
	affected: number;
}

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
	payload: CreateTemplateRequest
): Promise<ChannelMonitorTemplate> {
	const raw = await apiClient.post<ApiEnvelope<ChannelMonitorTemplate>>(BASE, payload);
	return unwrapData(raw);
}

export async function update(
	id: number,
	payload: UpdateTemplateRequest
): Promise<ChannelMonitorTemplate> {
	const raw = await apiClient.put<ApiEnvelope<ChannelMonitorTemplate>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function del(id: number): Promise<void> {
	await apiClient.delete<ApiEnvelope<void>>(`${BASE}/${id}`);
}

export async function apply(
	id: number,
	monitorIds: number[]
): Promise<ApplyTemplateResult> {
	const raw = await apiClient.post<ApiEnvelope<ApplyTemplateResult>>(
		`${BASE}/${id}/apply`,
		{ monitor_ids: monitorIds }
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
