/**
 * User Redeem API · Svelte rewrite
 *
 * Vue route parity:
 *   - POST /api/v1/redeem
 *   - GET  /api/v1/redeem/history
 *
 * The backend normally responds through response.Success({ data: ... }); this
 * facade also accepts direct payloads so tests and older deployments stay cheap.
 */
import { apiClient } from '../client';

export type RedeemResultType =
	| 'balance'
	| 'concurrency'
	| 'subscription'
	| 'invitation'
	| 'admin_balance'
	| 'admin_concurrency'
	| string;

export interface RedeemResult {
	message: string;
	type: RedeemResultType;
	value: number;
	new_balance?: number;
	new_concurrency?: number;
	group_name?: string;
	validity_days?: number;
}

export interface RedeemHistoryGroup {
	id: number;
	name: string;
}

export interface RedeemHistoryItem {
	id: number;
	code: string;
	type: RedeemResultType;
	value: number;
	status: string;
	used_at: string;
	created_at: string;
	notes?: string;
	group_id?: number;
	validity_days?: number;
	group?: RedeemHistoryGroup;
}

interface Wrapped<T> {
	data?: T;
}

function unwrap<T>(value: T | Wrapped<T>): T {
	if (value && typeof value === 'object' && 'data' in value) {
		return (value as Wrapped<T>).data as T;
	}
	return value as T;
}

export async function redeemCode(code: string): Promise<RedeemResult> {
	const resp = await apiClient.post<RedeemResult | Wrapped<RedeemResult>>('/api/v1/redeem', {
		code
	});
	return unwrap(resp);
}

export async function getRedeemHistory(): Promise<RedeemHistoryItem[]> {
	const resp = await apiClient.get<RedeemHistoryItem[] | Wrapped<RedeemHistoryItem[]>>(
		'/api/v1/redeem/history'
	);
	return unwrap(resp) ?? [];
}

export const userRedeemApi = {
	redeemCode,
	getRedeemHistory
};
