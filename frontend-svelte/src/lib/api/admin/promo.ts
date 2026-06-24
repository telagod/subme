import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';

export type PromoCodeStatus = 'active' | 'disabled';

export interface PromoCode {
	id: number;
	code: string;
	bonus_amount: number;
	max_uses: number;
	used_count: number;
	status: PromoCodeStatus;
	expires_at: string | number | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface PromoCodeUsage {
	id: number;
	promo_code_id: number;
	user_id: number;
	bonus_amount: number;
	used_at: string;
	user?: { id: number; email: string; username?: string | null } | null;
}

export interface PromoCodeFilters {
	status?: string;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface CreatePromoCodeRequest {
	code?: string;
	bonus_amount: number;
	max_uses?: number;
	expires_at?: number | null;
	notes?: string;
}

export interface UpdatePromoCodeRequest {
	code?: string;
	bonus_amount?: number;
	max_uses?: number;
	status?: PromoCodeStatus;
	expires_at?: number | null;
	notes?: string;
}

const PROMO_BASE = '/api/v1/admin/promo-codes';

export async function listPromoCodes(
	page = 1,
	pageSize = 20,
	filters: PromoCodeFilters = {}
): Promise<PaginatedResponse<PromoCode>> {
	return getPaginated<PromoCode>(
		`${PROMO_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export async function getPromoCode(id: number): Promise<PromoCode> {
	return unwrapData(await apiClient.get<PromoCode | ApiEnvelope<PromoCode>>(`${PROMO_BASE}/${id}`));
}

export async function createPromoCode(payload: CreatePromoCodeRequest): Promise<PromoCode> {
	return unwrapData(await apiClient.post<PromoCode | ApiEnvelope<PromoCode>>(PROMO_BASE, payload));
}

export async function updatePromoCode(id: number, payload: UpdatePromoCodeRequest): Promise<PromoCode> {
	return unwrapData(await apiClient.put<PromoCode | ApiEnvelope<PromoCode>>(`${PROMO_BASE}/${id}`, payload));
}

export async function deletePromoCode(id: number): Promise<{ message: string }> {
	return unwrapData(await apiClient.delete<{ message: string } | ApiEnvelope<{ message: string }>>(`${PROMO_BASE}/${id}`));
}

export function listPromoCodeUsages(
	id: number,
	page = 1,
	pageSize = 20
): Promise<PaginatedResponse<PromoCodeUsage>> {
	return getPaginated<PromoCodeUsage>(
		`${PROMO_BASE}/${id}/usages${buildQuery({ page, page_size: pageSize })}`
	);
}

export const adminPromoApi = {
	listPromoCodes,
	getPromoCode,
	createPromoCode,
	updatePromoCode,
	deletePromoCode,
	listPromoCodeUsages
};
