import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export interface TLSFingerprintProfile {
	id: number;
	name: string;
	description?: string | null;
	enable_grease?: boolean;
	cipher_suites?: number[];
	curves?: number[];
	point_formats?: number[];
	signature_algorithms?: number[];
	alpn_protocols?: string[];
	supported_versions?: number[];
	key_share_groups?: number[];
	psk_modes?: number[];
	extensions?: number[];
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export type CreateProfileRequest = Partial<TLSFingerprintProfile> & { name: string };
export type UpdateProfileRequest = Partial<TLSFingerprintProfile>;

const BASE = '/api/v1/admin/tls-fingerprint-profiles';

export async function list(): Promise<TLSFingerprintProfile[]> {
	const raw = await apiClient.get<ApiEnvelope<TLSFingerprintProfile[]>>(BASE);
	return unwrapData(raw);
}

export async function getById(id: number): Promise<TLSFingerprintProfile> {
	const raw = await apiClient.get<ApiEnvelope<TLSFingerprintProfile>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function create(payload: CreateProfileRequest): Promise<TLSFingerprintProfile> {
	const raw = await apiClient.post<ApiEnvelope<TLSFingerprintProfile>>(BASE, payload);
	return unwrapData(raw);
}

export async function update(
	id: number,
	payload: UpdateProfileRequest
): Promise<TLSFingerprintProfile> {
	const raw = await apiClient.put<ApiEnvelope<TLSFingerprintProfile>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function deleteProfile(id: number): Promise<{ message?: string }> {
	const raw = await apiClient.delete<ApiEnvelope<{ message?: string }>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export const tlsFingerprintProfileAPI = {
	list,
	getById,
	create,
	update,
	delete: deleteProfile
};

export default tlsFingerprintProfileAPI;
