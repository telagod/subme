import { apiClient } from '../client';
import { buildQuery, getPaginated, unwrapData, type ApiEnvelope, type PaginatedResponse } from './supply';

export type BillingMode = 'token' | 'per_request' | 'image' | string;

export interface PricingInterval {
	id?: number;
	min_tokens: number;
	max_tokens: number | null;
	tier_label: string;
	input_price: number | null;
	output_price: number | null;
	cache_write_price: number | null;
	cache_read_price: number | null;
	per_request_price: number | null;
	sort_order?: number;
}

export interface ChannelModelPricing {
	platform: string;
	models: string[];
	billing_mode: BillingMode;
	input_price: number | null;
	output_price: number | null;
	cache_write_price: number | null;
	cache_read_price: number | null;
	image_output_price?: number | null;
	per_request_price: number | null;
	intervals?: PricingInterval[];
}

export interface AccountStatsPricingRule {
	name: string;
	group_ids: number[];
	account_ids: number[];
	pricing: ChannelModelPricing[];
}

export interface Channel {
	id: number;
	name: string;
	description?: string;
	status: string;
	billing_model_source?: string;
	restrict_models?: boolean;
	group_ids?: number[];
	group_names?: string[];
	model_pricing?: ChannelModelPricing[];
	model_mapping?: Record<string, Record<string, string>>;
	apply_pricing_to_account_stats?: boolean;
	account_stats_pricing_rules?: AccountStatsPricingRule[];
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface ChannelFilters {
	status?: string;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

const CHANNELS_BASE = '/api/v1/admin/channels';

export type SaveChannelPayload = Partial<Channel> & Record<string, unknown>;

export interface ModelDefaultPricingProvider {
	provider: string;
	tag: string;
	input: number;
	output: number;
}

export interface ModelDefaultPricing {
	found: boolean;
	input_price?: number;
	output_price?: number;
	cache_write_price?: number;
	cache_read_price?: number;
	image_output_price?: number;
	source?: string;
	slug?: string;
	description?: string;
	capabilities?: string[];
	context_len?: number;
	providers?: ModelDefaultPricingProvider[];
}

export async function listChannels(
	page = 1,
	pageSize = 20,
	filters: ChannelFilters = {}
): Promise<PaginatedResponse<Channel>> {
	return getPaginated<Channel>(
		`${CHANNELS_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export async function getChannel(id: number): Promise<Channel> {
	return unwrapData(await apiClient.get<Channel | ApiEnvelope<Channel>>(`${CHANNELS_BASE}/${id}`));
}

export async function createChannel(payload: SaveChannelPayload): Promise<Channel> {
	return unwrapData(await apiClient.post<Channel | ApiEnvelope<Channel>>(CHANNELS_BASE, payload));
}

export async function updateChannel(id: number, payload: SaveChannelPayload): Promise<Channel> {
	return unwrapData(await apiClient.put<Channel | ApiEnvelope<Channel>>(`${CHANNELS_BASE}/${id}`, payload));
}

export async function deleteChannel(id: number): Promise<void> {
	await apiClient.delete<unknown>(`${CHANNELS_BASE}/${id}`);
}

export async function getModelDefaultPricing(model: string): Promise<ModelDefaultPricing> {
	return unwrapData(
		await apiClient.get<ModelDefaultPricing | ApiEnvelope<ModelDefaultPricing>>(
			`${CHANNELS_BASE}/model-pricing${buildQuery({ model })}`
		)
	);
}

export async function syncPricingModels(platform: string): Promise<{ models: string[] }> {
	return unwrapData(
		await apiClient.get<{ models: string[] } | ApiEnvelope<{ models: string[] }>>(
			`${CHANNELS_BASE}/pricing/sync-models${buildQuery({ platform })}`
		)
	);
}

export const adminChannelsApi = {
	listChannels,
	getChannel,
	createChannel,
	updateChannel,
	deleteChannel,
	getModelDefaultPricing,
	syncPricingModels
};

export default adminChannelsApi;
