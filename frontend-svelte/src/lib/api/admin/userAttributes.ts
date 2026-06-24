import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface UserAttributeDefinition {
	id: number;
	key: string;
	label: string;
	type?: string;
	enabled?: boolean;
	sort_order?: number;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface UserAttributeValue {
	definition_id?: number;
	key?: string;
	value: string;
	[key: string]: unknown;
}

export type CreateUserAttributeRequest = Partial<UserAttributeDefinition> & {
	key: string;
	label: string;
};
export type UpdateUserAttributeRequest = Partial<UserAttributeDefinition>;
export type UserAttributeValuesMap = Record<string | number, string | null>;

export interface BatchUserAttributesResponse {
	attributes: Record<number, Record<number, string>>;
}

const BASE = '/api/v1/admin/user-attributes';

export async function listDefinitions(): Promise<UserAttributeDefinition[]> {
	const raw = await apiClient.get<ApiEnvelope<UserAttributeDefinition[]>>(BASE);
	return unwrapData(raw);
}

export async function listEnabledDefinitions(): Promise<UserAttributeDefinition[]> {
	const raw = await apiClient.get<ApiEnvelope<UserAttributeDefinition[]>>(
		`${BASE}${buildQuery({ enabled: true })}`
	);
	return unwrapData(raw);
}

export async function createDefinition(
	payload: CreateUserAttributeRequest
): Promise<UserAttributeDefinition> {
	const raw = await apiClient.post<ApiEnvelope<UserAttributeDefinition>>(BASE, payload);
	return unwrapData(raw);
}

export async function updateDefinition(
	id: number,
	payload: UpdateUserAttributeRequest
): Promise<UserAttributeDefinition> {
	const raw = await apiClient.put<ApiEnvelope<UserAttributeDefinition>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function deleteDefinition(id: number): Promise<{ message?: string }> {
	const raw = await apiClient.delete<ApiEnvelope<{ message?: string }>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function reorderDefinitions(ids: number[]): Promise<{ message?: string }> {
	const raw = await apiClient.put<ApiEnvelope<{ message?: string }>>(`${BASE}/reorder`, { ids });
	return unwrapData(raw);
}

export async function getUserAttributeValues(userId: number): Promise<UserAttributeValue[]> {
	const raw = await apiClient.get<ApiEnvelope<UserAttributeValue[]>>(
		`/api/v1/admin/users/${userId}/attributes`
	);
	return unwrapData(raw);
}

export async function updateUserAttributeValues(
	userId: number,
	values: UserAttributeValuesMap
): Promise<{ message?: string }> {
	const raw = await apiClient.put<ApiEnvelope<{ message?: string }>>(
		`/api/v1/admin/users/${userId}/attributes`,
		{ values }
	);
	return unwrapData(raw);
}

export async function getBatchUserAttributes(userIds: number[]): Promise<BatchUserAttributesResponse> {
	const raw = await apiClient.post<ApiEnvelope<BatchUserAttributesResponse>>(`${BASE}/batch`, {
		user_ids: userIds
	});
	return unwrapData(raw);
}

export const userAttributesAPI = {
	listDefinitions,
	listEnabledDefinitions,
	createDefinition,
	updateDefinition,
	deleteDefinition,
	reorderDefinitions,
	getUserAttributeValues,
	updateUserAttributeValues,
	getBatchUserAttributes
};

export default userAttributesAPI;
