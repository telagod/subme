import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export interface ErrorPassthroughRule {
	id: number;
	name: string;
	enabled: boolean;
	match_pattern?: string;
	status_code?: number;
	priority?: number;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export type SaveErrorPassthroughRuleRequest = Partial<ErrorPassthroughRule>;

const BASE = '/api/v1/admin/error-passthrough-rules';

export async function list(): Promise<ErrorPassthroughRule[]> {
	const raw = await apiClient.get<ApiEnvelope<ErrorPassthroughRule[]>>(BASE);
	return unwrapData(raw);
}

export async function getById(id: number): Promise<ErrorPassthroughRule> {
	const raw = await apiClient.get<ApiEnvelope<ErrorPassthroughRule>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function create(payload: SaveErrorPassthroughRuleRequest): Promise<ErrorPassthroughRule> {
	const raw = await apiClient.post<ApiEnvelope<ErrorPassthroughRule>>(BASE, payload);
	return unwrapData(raw);
}

export async function update(
	id: number,
	payload: SaveErrorPassthroughRuleRequest
): Promise<ErrorPassthroughRule> {
	const raw = await apiClient.put<ApiEnvelope<ErrorPassthroughRule>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function deleteRule(id: number): Promise<{ message?: string }> {
	const raw = await apiClient.delete<ApiEnvelope<{ message?: string }>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function toggleEnabled(id: number, enabled: boolean): Promise<ErrorPassthroughRule> {
	return update(id, { enabled });
}

export const errorPassthroughAPI = {
	list,
	getById,
	create,
	update,
	deleteRule,
	toggleEnabled
};

export default errorPassthroughAPI;
