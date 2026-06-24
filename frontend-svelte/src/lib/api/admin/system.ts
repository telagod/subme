import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface ReleaseInfo {
	name: string;
	body: string;
	published_at: string;
	html_url: string;
}

export interface VersionInfo {
	current_version?: string;
	latest_version?: string;
	has_update?: boolean;
	release_info?: ReleaseInfo;
	cached?: boolean;
	warning?: string;
	build_type?: string;
	version?: string;
	[key: string]: unknown;
}

export interface UpdateResult {
	message: string;
	need_restart?: boolean;
	[key: string]: unknown;
}

const BASE = '/api/v1/admin/system';

export async function getVersion(): Promise<VersionInfo> {
	const raw = await apiClient.get<ApiEnvelope<VersionInfo>>(`${BASE}/version`);
	return unwrapData(raw);
}

export async function checkUpdates(force = false): Promise<VersionInfo> {
	const raw = await apiClient.get<ApiEnvelope<VersionInfo>>(
		`${BASE}/check-updates${buildQuery({ force: force || undefined })}`
	);
	return unwrapData(raw);
}

export async function performUpdate(payload: Record<string, unknown> = {}): Promise<UpdateResult> {
	const raw = await apiClient.post<ApiEnvelope<UpdateResult>>(`${BASE}/update`, payload);
	return unwrapData(raw);
}

export async function rollback(payload: Record<string, unknown> = {}): Promise<UpdateResult> {
	const raw = await apiClient.post<ApiEnvelope<UpdateResult>>(`${BASE}/rollback`, payload);
	return unwrapData(raw);
}

export async function restartService(payload: Record<string, unknown> = {}): Promise<{ message: string }> {
	const raw = await apiClient.post<ApiEnvelope<{ message: string }>>(`${BASE}/restart`, payload);
	return unwrapData(raw);
}

export const systemAPI = {
	getVersion,
	checkUpdates,
	performUpdate,
	rollback,
	restartService
};

export default systemAPI;
