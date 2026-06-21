/**
 * User Groups API · Svelte rewrite
 *
 * Only the group-rate endpoint is needed by /available-channels. API key group
 * selection can grow this facade later without coupling the page to admin APIs.
 */
import { apiClient } from '../client';

interface Wrapped<T> {
	data?: T;
}

function unwrap<T>(value: T | Wrapped<T> | null | undefined): T | undefined {
	if (!value) return undefined;
	if (typeof value === 'object' && 'data' in value) return (value as Wrapped<T>).data;
	return value as T;
}

export async function getUserGroupRates(): Promise<Record<number, number>> {
	const resp = await apiClient.get<Record<number, number> | null | Wrapped<Record<number, number> | null>>(
		'/api/v1/groups/rates'
	);
	return unwrap(resp) ?? {};
}

export const userGroupsApi = {
	getUserGroupRates
};
