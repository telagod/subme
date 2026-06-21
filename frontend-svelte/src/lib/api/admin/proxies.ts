import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';

export type ProxyStatus = 'active' | 'inactive' | 'disabled' | 'expired' | string;

export interface Proxy {
	id: number;
	name: string;
	protocol: string;
	host: string;
	port: number;
	username?: string;
	password?: string;
	status: ProxyStatus;
	accounts_count?: number;
	total_accounts?: number;
	quality_score?: number | null;
	last_tested_at?: string | null;
	last_test_success?: boolean | null;
	expires_at?: string | null;
	fallback_mode?: string | null;
	backup_proxy_id?: number | null;
	expiry_warn_days?: number | null;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface ProxyAccountSummary {
	id: number;
	name: string;
	platform?: string;
	type?: string;
	status?: string;
}

export interface ProxyFilters {
	protocol?: string;
	status?: string;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface SaveProxyPayload {
	name: string;
	protocol: string;
	host: string;
	port: number;
	username?: string;
	password?: string;
	status?: string;
	expires_at?: number | null;
	fallback_mode?: string | null;
	backup_proxy_id?: number | null;
	expiry_warn_days?: number | null;
}

export interface ProxyTestResult {
	success: boolean;
	message: string;
	latency_ms?: number;
	ip_address?: string;
	city?: string;
	region?: string;
	country?: string;
	country_code?: string;
}

export interface ProxyQualityCheckResult {
	success: boolean;
	score?: number;
	message?: string;
	results?: Array<Record<string, unknown>>;
	[key: string]: unknown;
}

export interface ProxyStats {
	total_accounts: number;
	active_accounts: number;
	total_requests: number;
	success_rate: number;
	average_latency: number;
}

export interface ProxyBatchDeleteResult {
	deleted_ids: number[];
	skipped: Array<{ id: number; reason: string }>;
}

export interface ProxyBatchCreateResult {
	created: number;
	skipped: number;
}

export type AdminDataPayload = Record<string, unknown>;
export type AdminDataImportResult = Record<string, unknown>;

const PROXIES_BASE = '/api/v1/admin/proxies';

export async function listProxies(
	page = 1,
	pageSize = 20,
	filters: ProxyFilters = {}
): Promise<PaginatedResponse<Proxy>> {
	return getPaginated<Proxy>(
		`${PROXIES_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export async function listAllProxies(): Promise<Proxy[]> {
	const raw = await apiClient.get<Proxy[] | ApiEnvelope<Proxy[]>>(
		`${PROXIES_BASE}/all${buildQuery({ with_count: true })}`
	);
	return unwrapData(raw) ?? [];
}

export async function getProxy(id: number): Promise<Proxy> {
	const raw = await apiClient.get<Proxy | ApiEnvelope<Proxy>>(`${PROXIES_BASE}/${id}`);
	return unwrapData(raw);
}

export async function createProxy(payload: SaveProxyPayload): Promise<Proxy> {
	return unwrapData(await apiClient.post<Proxy | ApiEnvelope<Proxy>>(PROXIES_BASE, payload));
}

export async function updateProxy(id: number, payload: Partial<SaveProxyPayload>): Promise<Proxy> {
	return unwrapData(await apiClient.put<Proxy | ApiEnvelope<Proxy>>(`${PROXIES_BASE}/${id}`, payload));
}

export async function deleteProxy(id: number): Promise<void> {
	await apiClient.delete<void>(`${PROXIES_BASE}/${id}`);
}

export async function testProxy(id: number): Promise<ProxyTestResult> {
	return unwrapData(
		await apiClient.post<ProxyTestResult | ApiEnvelope<ProxyTestResult>>(`${PROXIES_BASE}/${id}/test`, {})
	);
}

export async function checkProxyQuality(id: number): Promise<ProxyQualityCheckResult> {
	return unwrapData(
		await apiClient.post<ProxyQualityCheckResult | ApiEnvelope<ProxyQualityCheckResult>>(
			`${PROXIES_BASE}/${id}/quality-check`,
			{}
		)
	);
}

export async function getProxyStats(id: number): Promise<ProxyStats> {
	return unwrapData(await apiClient.get<ProxyStats | ApiEnvelope<ProxyStats>>(`${PROXIES_BASE}/${id}/stats`));
}

export async function listProxyAccounts(id: number): Promise<ProxyAccountSummary[]> {
	const raw = await apiClient.get<ProxyAccountSummary[] | ApiEnvelope<ProxyAccountSummary[]>>(
		`${PROXIES_BASE}/${id}/accounts`
	);
	return unwrapData(raw) ?? [];
}

export async function updateProxyStatus(id: number, status: 'active' | 'inactive'): Promise<Proxy> {
	return updateProxy(id, { status });
}

export async function batchCreateProxies(
	proxies: Array<{ protocol: string; host: string; port: number; username?: string; password?: string }>
): Promise<ProxyBatchCreateResult> {
	return unwrapData(
		await apiClient.post<ProxyBatchCreateResult | ApiEnvelope<ProxyBatchCreateResult>>(`${PROXIES_BASE}/batch`, {
			proxies
		})
	);
}

export async function batchDeleteProxies(ids: number[]): Promise<ProxyBatchDeleteResult> {
	return unwrapData(
		await apiClient.post<ProxyBatchDeleteResult | ApiEnvelope<ProxyBatchDeleteResult>>(
			`${PROXIES_BASE}/batch-delete`,
			{ ids }
		)
	);
}

export async function exportProxyData(options: {
	ids?: number[];
	filters?: ProxyFilters;
} = {}): Promise<AdminDataPayload> {
	const params: Record<string, unknown> = {};
	if (options.ids?.length) {
		params.ids = options.ids.join(',');
	} else if (options.filters) {
		Object.assign(params, options.filters);
	}
	return unwrapData(
		await apiClient.get<AdminDataPayload | ApiEnvelope<AdminDataPayload>>(
			`${PROXIES_BASE}/data${buildQuery(params)}`
		)
	);
}

export async function importProxyData(payload: { data: AdminDataPayload }): Promise<AdminDataImportResult> {
	return unwrapData(
		await apiClient.post<AdminDataImportResult | ApiEnvelope<AdminDataImportResult>>(
			`${PROXIES_BASE}/data`,
			payload
		)
	);
}

export const adminProxiesApi = {
	listProxies,
	listAllProxies,
	getProxy,
	createProxy,
	updateProxy,
	deleteProxy,
	testProxy,
	checkProxyQuality,
	getProxyStats,
	listProxyAccounts,
	updateProxyStatus,
	batchCreateProxies,
	batchDeleteProxies,
	exportProxyData,
	importProxyData
};

export default adminProxiesApi;
