/**
 * User Available Channels API · Svelte rewrite
 *
 * Vue parity:
 *   - GET /api/v1/channels/available
 *
 * The endpoint is already filtered server-side by current user permissions and
 * the available-channels feature switch. This facade keeps only display types.
 */
import { apiClient } from '../client';

export type UserBillingMode = 'token' | 'per_request' | 'image' | 'tiered' | string;

export interface UserAvailableGroup {
	id: number;
	name: string;
	platform: string;
	subscription_type: string;
	rate_multiplier: number;
	is_exclusive: boolean;
}

export interface UserPricingInterval {
	min_tokens: number;
	max_tokens: number | null;
	tier_label?: string;
	input_price: number | null;
	output_price: number | null;
	cache_write_price: number | null;
	cache_read_price: number | null;
	per_request_price: number | null;
}

export interface UserSupportedModelPricing {
	billing_mode: UserBillingMode;
	input_price: number | null;
	output_price: number | null;
	cache_write_price: number | null;
	cache_read_price: number | null;
	image_output_price: number | null;
	per_request_price: number | null;
	intervals: UserPricingInterval[];
}

export interface UserSupportedModel {
	name: string;
	platform: string;
	pricing: UserSupportedModelPricing | null;
}

export interface UserChannelPlatformSection {
	platform: string;
	groups: UserAvailableGroup[];
	supported_models: UserSupportedModel[];
}

export interface UserAvailableChannel {
	name: string;
	description: string;
	platforms: UserChannelPlatformSection[];
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

export async function getAvailableChannels(): Promise<UserAvailableChannel[]> {
	const resp = await apiClient.get<UserAvailableChannel[] | Wrapped<UserAvailableChannel[]>>(
		'/api/v1/channels/available'
	);
	return unwrap(resp) ?? [];
}

export const userChannelsApi = {
	getAvailableChannels
};
