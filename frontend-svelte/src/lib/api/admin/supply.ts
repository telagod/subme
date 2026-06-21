import { apiClient } from '../client';

export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page?: number;
	page_size?: number;
	data?: T[];
}

export interface ApiEnvelope<T> {
	code?: number;
	message?: string;
	data?: T;
}

type PaginatedLike<T> = PaginatedResponse<T> | { data?: T[]; total?: number; page?: number; page_size?: number };
type RawPaginated<T> = PaginatedLike<T> | T[] | ApiEnvelope<PaginatedLike<T> | T[]>;

export function unwrapData<T>(raw: T | ApiEnvelope<T>): T {
	if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
		return (raw as ApiEnvelope<T>).data as T;
	}
	return raw as T;
}

export function buildQuery(params: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}

export async function getPaginated<T>(path: string): Promise<PaginatedResponse<T>> {
	const raw = await apiClient.get<RawPaginated<T>>(path);
	const payload = unwrapData<PaginatedLike<T> | T[]>(raw);
	if (Array.isArray(payload)) {
		return { items: payload, data: payload, total: payload.length };
	}
	if (!payload || typeof payload !== 'object') {
		throw new Error(`Expected JSON pagination payload from ${path}`);
	}
	const safePayload = (payload ?? {}) as PaginatedLike<T>;
	const maybeItems = 'items' in safePayload ? safePayload.items : undefined;
	const items = maybeItems ?? safePayload.data ?? [];
	return {
		...safePayload,
		items,
		data: safePayload.data ?? items,
		total: safePayload.total ?? items.length
	};
}
