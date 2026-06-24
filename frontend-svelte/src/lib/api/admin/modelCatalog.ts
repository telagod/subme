/**
 * Model Catalog API · 管理端 OpenRouter 定价（POC 5 · 编辑版）
 *
 * 红线（memory `openrouter-pricing-done` 二次澄清）：
 *   - UNTOUCHABLE: 后端计费 service（billing-side）的取价函数
 *     —— 计费/扣费真实事实源，含 fallback 链（gpt-5.4→gpt-5、Anthropic/OpenAI 家族、
 *     dynamic priority tiers）。本文件不引用、不依赖。
 *   - UNTOUCHABLE: 后端 channel 路由下的 model-pricing 只读展示端点。
 *   - IN-SCOPE（5 端点全可编辑）: /admin/model-catalog/*。本 POC 全部 6 个函数包装于此。
 *
 * 与 Vue tree 的差异：
 *   - Vue 用 axios，svelte 用 fetch wrapper（apiClient）。
 *   - Vue `listModelCatalog / getModelCatalogDetail / syncCatalog /
 *     syncModelEndpoints / putModelOverride / deleteModelOverride` 一一对应
 *     `listModels / getModel / syncCatalog / syncModel / upsertOverride / deleteOverride`。
 *   - 类型 1:1 verbatim 自 frontend/src/api/v1/admin/modelCatalog.ts。
 */
import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

// ── 类型契约（与 backend handler model catalog 对齐） ────────────────────

export interface CatalogProvider {
	provider: string;
	tag: string;
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	uptime_1d?: number; // 0..1
	quant?: string;
}

export interface CatalogModelBaseline {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	source?: string; // "openrouter" | "litellm" | "override" | "fallback" | ""
}

export interface ModelPriceOverride {
	model_id: string;
	pinned_provider_tag?: string;
	manual_input?: number | null;
	manual_output?: number | null;
	manual_cache_read?: number | null;
	manual_cache_write?: number | null;
	note?: string;
	updated_by?: number;
	updated_at: string;
}

export interface CatalogModelDetail {
	id: string;
	name: string;
	description?: string;
	context_len?: number;
	modalities?: string[];
	capabilities?: string[];
	providers: CatalogProvider[];
	baseline?: CatalogModelBaseline;
	overridden?: boolean;
	override?: ModelPriceOverride | null;
}

export interface CatalogListItemBaseline {
	input: number;
	output: number;
	cache_read: number;
	cache_write: number;
	source: string;
}

export interface CatalogModelListItem {
	id: string;
	name: string;
	description?: string;
	context_len?: number;
	capabilities?: string[];
	baseline?: CatalogListItemBaseline;
	provider_count?: number;
	has_override?: boolean;
}

export interface CatalogListResponse {
	models: CatalogModelListItem[];
	last_updated: string; // RFC3339 or ""
}

export interface UpsertOverridePayload {
	model_id: string;
	pinned_provider_tag?: string;
	// per-token USD（UI 收集 per-MTok 后 ÷ 1e6 再下发）
	manual_input?: number | null;
	manual_output?: number | null;
	manual_cache_read?: number | null;
	manual_cache_write?: number | null;
	note?: string;
}

export interface SyncModelCatalogResult {
	synced: number;
}

// ── 端点（路径与 Vue 一致，仅前置 /api 前缀 —— 与 svelte apiClient 契约对齐） ─

const BASE = '/api/v1/admin/model-catalog';

export const modelCatalogApi = {
	/** GET /admin/model-catalog —— 列出全部 catalog 模型 */
	async listModels(): Promise<CatalogListResponse> {
		return unwrapData(await apiClient.get<CatalogListResponse | ApiEnvelope<CatalogListResponse>>(BASE));
	},

	/** GET /admin/model-catalog/detail?model=<slug> —— 拉模型详情 + providers + override */
	async getModel(slug: string): Promise<CatalogModelDetail> {
		return unwrapData(await apiClient.get<CatalogModelDetail | ApiEnvelope<CatalogModelDetail>>(
			`${BASE}/detail?model=${encodeURIComponent(slug)}`
		));
	},

	/** POST /admin/model-catalog/sync （空 body）—— 同步全 catalog */
	async syncCatalog(): Promise<SyncModelCatalogResult> {
		return unwrapData(await apiClient.post<SyncModelCatalogResult | ApiEnvelope<SyncModelCatalogResult>>(`${BASE}/sync`, {}));
	},

	/** POST /admin/model-catalog/sync {models:[slug]} —— 单模型 lazy endpoint 同步 */
	async syncModel(slug: string): Promise<void> {
		await apiClient.post<void>(`${BASE}/sync`, { models: [slug] });
	},

	/** PUT /admin/model-catalog/override —— upsert override（pinned 或 manual） */
	async upsertOverride(payload: UpsertOverridePayload): Promise<ModelPriceOverride> {
		return unwrapData(await apiClient.put<ModelPriceOverride | ApiEnvelope<ModelPriceOverride>>(`${BASE}/override`, payload));
	},

	/** DELETE /admin/model-catalog/override?model=<slug> —— 删除 override 恢复 auto */
	async deleteOverride(slug: string): Promise<void> {
		await apiClient.delete<void>(`${BASE}/override?model=${encodeURIComponent(slug)}`);
	}
};

export default modelCatalogApi;
