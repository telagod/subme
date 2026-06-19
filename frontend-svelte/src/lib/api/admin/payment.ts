/**
 * Admin Payment API · Svelte rewrite（M12 · payment tab）
 *
 * 端口自 frontend/src/api/admin/payment.ts。本批次仅落地 provider 实例 CRUD
 * （PaymentProviderListSection.svelte 唯一依赖面）—— 全局 payment_* 配置走
 * settingsApi.patchSettings 主流水线，不在这里二次包装。
 *
 * 安全红线（CLAUDE.md billing）：本文件不涉及 billing_service.GetModelPricing
 * 或 /admin/channels/model-pricing，纯 /admin/payment/providers 表面。
 *
 * 与 Vue tree 差异：
 *   - shape 保持 snake_case，UI 直接消费。
 *   - 全部走 apiClient（401 兜底已统一）。
 */
import { apiClient } from '../client';

export interface ProviderInstance {
	id: number;
	provider_key: string;
	name: string;
	config: Record<string, string>;
	supported_types: string[];
	enabled: boolean;
	payment_mode: string;
	refund_enabled: boolean;
	allow_user_refund: boolean;
	limits: string;
	sort_order: number;
}

interface ListProvidersResponse {
	data?: ProviderInstance[];
	providers?: ProviderInstance[];
	items?: ProviderInstance[];
}

export async function listProviders(): Promise<ProviderInstance[]> {
	const raw = await apiClient.get<ProviderInstance[] | ListProvidersResponse>(
		'/api/admin/payment/providers'
	);
	if (Array.isArray(raw)) return raw;
	return raw.data ?? raw.providers ?? raw.items ?? [];
}

export async function createProvider(
	payload: Partial<ProviderInstance>
): Promise<ProviderInstance> {
	return apiClient.post<ProviderInstance>('/api/admin/payment/providers', payload);
}

export async function updateProvider(
	id: number,
	payload: Partial<ProviderInstance>
): Promise<ProviderInstance> {
	return apiClient.put<ProviderInstance>(`/api/admin/payment/providers/${id}`, payload);
}

export async function deleteProvider(id: number): Promise<void> {
	await apiClient.delete<void>(`/api/admin/payment/providers/${id}`);
}

export const adminPaymentApi = {
	listProviders,
	createProvider,
	updateProvider,
	deleteProvider
};

export default adminPaymentApi;
