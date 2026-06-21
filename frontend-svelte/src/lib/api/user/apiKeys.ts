/**
 * User API Keys · 用户端密钥 REST 客户端（M6）
 *
 * 端点对齐 Vue tree（frontend/src/api/keys.ts）：
 *   - GET    /api/v1/keys                 listKeys(params)
 *   - GET    /api/v1/keys/:id             getKey(id)
 *   - POST   /api/v1/keys                 createKey(payload)
 *   - DELETE /api/v1/keys/:id             revokeKey(id)    ← 后端语义 = HARD delete
 *
 * 设计：
 *   - 不引 axios；走 apiClient（已统一 401 兜底）。
 *   - Vue 用 PaginatedResponse<ApiKey>{ items, total, pages }；这里返回同 shape，
 *     但只暴露 listKeys() 简写：默认 page=1, page_size=50。需要分页的调用方自取 raw。
 *   - 类型字段下划线 → camelCase 在 mapper 里转一次，UI 只摸 camelCase。
 *
 * RED LINE:
 *   - 不在此层处理 plaintext key 显示策略 —— 那是 KeysView 的事。
 *   - 不缓存 list 结果 —— 由 +page.svelte 自行 stale。
 */
import { apiClient } from '../client';

// ── 公共类型 ─────────────────────────────────────────────────────────────

export type ApiKeyStatus = 'active' | 'inactive' | 'quota_exhausted' | 'expired';

/** UI-friendly ApiKey shape（camelCase）。listKeys / getKey 返回的就是这个。 */
export interface ApiKey {
	id: number;
	name: string;
	/** Plaintext key —— 仅创建响应返回；list 路径下后端会返回脱敏值或空。 */
	key?: string;
	/** 前缀（如 'sk-ant-mirror-'）。 */
	prefix: string;
	/** 后缀（脱敏尾段，4 字符）。 */
	suffix: string;
	/** 已用配额（USD）。 */
	quotaUsed: number;
	/** 总配额（USD）；0 = 无限。 */
	quotaTotal: number;
	status: ApiKeyStatus;
	createdAt: string;
	lastUsedAt: string | null;
	expiresAt: string | null;
}

export interface ListKeysParams {
	page?: number;
	page_size?: number;
	search?: string;
	status?: ApiKeyStatus | '__all__';
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface PaginatedKeys {
	items: ApiKey[];
	total: number;
	pages: number;
}

export interface CreateKeyPayload {
	name: string;
	group_id?: number;
	quota?: number;
	expires_in_days?: number;
	custom_key?: string;
}

export interface UpdateKeyPayload {
	name?: string;
	group_id?: number | null;
	status?: 'active' | 'inactive';
	quota?: number | null;
	expires_at?: string | null;
	reset_quota?: boolean;
}

export interface AvailableGroup {
	id: number;
	name: string;
	description: string;
	platform: string;
	rate_multiplier: number;
	subscription_type: string;
}

/** Raw backend response shape (snake_case)。不暴露给 UI。 */
interface RawApiKey {
	id: number;
	name: string;
	key?: string;
	/** 后端可能返回完整 key 或脱敏 prefix-suffix；mapper 兼容。 */
	prefix?: string;
	suffix?: string;
	quota_used?: number;
	quota?: number;
	status: ApiKeyStatus;
	created_at: string;
	last_used_at?: string | null;
	expires_at?: string | null;
}

interface RawPaginated {
	items: RawApiKey[];
	total: number;
	pages: number;
}

/**
 * Mask 显示：从 key plaintext 抽 prefix（首 8 字符）+ suffix（末 4 字符）。
 * 后端若已经提供 prefix/suffix 则直接用，避免在前端碰 plaintext。
 */
function deriveMask(raw: RawApiKey): { prefix: string; suffix: string } {
	if (raw.prefix || raw.suffix) {
		return { prefix: raw.prefix ?? '', suffix: raw.suffix ?? '' };
	}
	const k = raw.key ?? '';
	if (k.length <= 12) return { prefix: k, suffix: '' };
	return { prefix: k.slice(0, 8), suffix: k.slice(-4) };
}

function mapKey(raw: RawApiKey): ApiKey {
	const { prefix, suffix } = deriveMask(raw);
	return {
		id: raw.id,
		name: raw.name,
		key: raw.key,
		prefix,
		suffix,
		quotaUsed: raw.quota_used ?? 0,
		quotaTotal: raw.quota ?? 0,
		status: raw.status,
		createdAt: raw.created_at,
		lastUsedAt: raw.last_used_at ?? null,
		expiresAt: raw.expires_at ?? null
	};
}

// ── API 入口 ─────────────────────────────────────────────────────────────

function buildQuery(params: ListKeysParams = {}): string {
	const q: Record<string, string> = {};
	q.page = String(params.page ?? 1);
	q.page_size = String(params.page_size ?? 50);
	if (params.search) q.search = params.search;
	// '__all__' sentinel → 不发 status 参数；服务端默认返回所有。
	if (params.status && params.status !== '__all__') q.status = params.status;
	if (params.sort_by) q.sort_by = params.sort_by;
	if (params.sort_order) q.sort_order = params.sort_order;
	const usp = new URLSearchParams(q);
	const s = usp.toString();
	return s ? `?${s}` : '';
}

export async function listKeys(params: ListKeysParams = {}): Promise<PaginatedKeys> {
	const resp = await apiClient.get<RawPaginated>(`/api/v1/keys${buildQuery(params)}`);
	return {
		items: (resp.items ?? []).map(mapKey),
		total: resp.total ?? 0,
		pages: resp.pages ?? 0
	};
}

export async function getKey(id: number): Promise<ApiKey> {
	const raw = await apiClient.get<RawApiKey>(`/api/v1/keys/${id}`);
	return mapKey(raw);
}

export async function createKey(payload: CreateKeyPayload): Promise<ApiKey> {
	const raw = await apiClient.post<RawApiKey>(`/api/v1/keys`, payload);
	return mapKey(raw);
}

/**
 * DELETE /api/v1/keys/:id —— 后端语义为 HARD delete（无 soft-revoke 路由）。
 * Vue tree 同点：soft-revoke 走 `PUT { status: 'inactive' }`，本 M6 范围不暴露。
 */
export async function updateKey(id: number, payload: UpdateKeyPayload): Promise<ApiKey> {
	const raw = await apiClient.put<RawApiKey>(`/api/v1/keys/${id}`, payload);
	return mapKey(raw);
}

export async function revokeKey(id: number): Promise<void> {
	await apiClient.delete<unknown>(`/api/v1/keys/${id}`);
}

export async function getAvailableGroups(): Promise<AvailableGroup[]> {
	const resp = await apiClient.get<AvailableGroup[] | { data?: AvailableGroup[] }>(
		'/api/v1/groups/available'
	);
	if (Array.isArray(resp)) return resp;
	return resp?.data ?? [];
}

export const userApiKeysApi = {
	listKeys,
	getKey,
	createKey,
	updateKey,
	revokeKey,
	getAvailableGroups
};
