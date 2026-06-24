import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export interface UpdateApiKeyGroupRequest {
	group_id?: number | null;
}

export interface ApiKeyGroupUpdateResult {
	message?: string;
	[key: string]: unknown;
}

const BASE = '/api/v1/admin/api-keys';

export async function updateApiKeyGroup(
	id: number,
	payload: UpdateApiKeyGroupRequest
): Promise<ApiKeyGroupUpdateResult> {
	const raw = await apiClient.put<ApiEnvelope<ApiKeyGroupUpdateResult>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export const apiKeysAPI = {
	updateApiKeyGroup
};

export default apiKeysAPI;
