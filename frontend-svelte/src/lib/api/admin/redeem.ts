import { apiClient } from '../client';
import { buildQuery, getPaginated, type PaginatedResponse } from './supply';

export type RedeemCodeType = 'balance' | 'concurrency' | 'subscription' | 'invitation';
export type RedeemCodeStatus = 'active' | 'used' | 'expired' | 'unused' | 'disabled';

export interface RedeemCode {
	id: number;
	code: string;
	type: RedeemCodeType;
	value: number;
	status: RedeemCodeStatus;
	used_by: number | null;
	used_at: string | null;
	created_at: string;
	expires_at?: string | null;
	updated_at?: string;
	notes?: string | null;
	group_id?: number | null;
	validity_days?: number | null;
	group?: { id: number; name: string } | null;
	user?: { id: number; email: string; username?: string | null } | null;
}

export interface RedeemCodeFilters {
	type?: RedeemCodeType;
	status?: RedeemCodeStatus;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface GenerateRedeemCodesRequest {
	count: number;
	type: RedeemCodeType;
	value: number;
	group_id?: number | null;
	validity_days?: number;
	expires_at?: string | null;
	expires_in_days?: number;
}

export interface BatchUpdateRedeemCodeFields {
	status?: 'unused' | 'disabled';
	expires_at?: string | null;
	notes?: string;
	group_id?: number | null;
}

export interface RedeemStats {
	total_codes: number;
	active_codes: number;
	used_codes: number;
	expired_codes: number;
	total_value_distributed: number;
	by_type: Record<string, number>;
}

const REDEEM_BASE = '/api/v1/admin/redeem-codes';

export async function listRedeemCodes(
	page = 1,
	pageSize = 20,
	filters: RedeemCodeFilters = {}
): Promise<PaginatedResponse<RedeemCode>> {
	return getPaginated<RedeemCode>(
		`${REDEEM_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export function getRedeemCode(id: number): Promise<RedeemCode> {
	return apiClient.get<RedeemCode>(`${REDEEM_BASE}/${id}`);
}

export function generateRedeemCodes(payload: GenerateRedeemCodesRequest): Promise<RedeemCode[]> {
	return apiClient.post<RedeemCode[]>(`${REDEEM_BASE}/generate`, payload);
}

export function deleteRedeemCode(id: number): Promise<{ message: string }> {
	return apiClient.delete<{ message: string }>(`${REDEEM_BASE}/${id}`);
}

export function batchDeleteRedeemCodes(ids: number[]): Promise<{ deleted: number; message: string }> {
	return apiClient.post<{ deleted: number; message: string }>(`${REDEEM_BASE}/batch-delete`, { ids });
}

export function batchUpdateRedeemCodes(
	ids: number[],
	fields: BatchUpdateRedeemCodeFields
): Promise<{ updated: number; message: string }> {
	return apiClient.post<{ updated: number; message: string }>(`${REDEEM_BASE}/batch-update`, {
		ids,
		fields
	});
}

export function expireRedeemCode(id: number): Promise<RedeemCode> {
	return apiClient.post<RedeemCode>(`${REDEEM_BASE}/${id}/expire`);
}

export function getRedeemStats(): Promise<RedeemStats> {
	return apiClient.get<RedeemStats>(`${REDEEM_BASE}/stats`);
}

export const adminRedeemApi = {
	listRedeemCodes,
	getRedeemCode,
	generateRedeemCodes,
	deleteRedeemCode,
	batchDeleteRedeemCodes,
	batchUpdateRedeemCodes,
	expireRedeemCode,
	getRedeemStats
};
