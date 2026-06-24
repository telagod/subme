import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import apiSrc from '$lib/api/user/channels.ts?raw';
import groupsSrc from '$lib/api/user/groups.ts?raw';
import pageSrc from '../../../routes/(user)/available-channels/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	exclusiveGroups,
	filterAvailableChannels,
	groupRateLabel,
	modelPricingLabel,
	publicGroups
} from './available-channels';
import type { UserAvailableChannel } from '$lib/api/user/channels';

vi.mock('$lib/api/user/channels', () => ({
	getAvailableChannels: vi.fn(),
	userChannelsApi: {}
}));

vi.mock('$lib/api/user/groups', () => ({
	getUserGroupRates: vi.fn(),
	userGroupsApi: {}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

const fixture: UserAvailableChannel[] = [
	{
		name: 'Primary',
		description: 'Fast models',
		platforms: [
			{
				platform: 'openai',
				groups: [
					{ id: 1, name: 'Public', platform: 'openai', subscription_type: 'standard', rate_multiplier: 1, is_exclusive: false },
					{ id: 2, name: 'VIP', platform: 'openai', subscription_type: 'subscription', rate_multiplier: 0.8, is_exclusive: true }
				],
				supported_models: [
					{
						name: 'gpt-4o',
						platform: 'openai',
						pricing: {
							billing_mode: 'token',
							input_price: 2e-6,
							output_price: 8e-6,
							cache_write_price: null,
							cache_read_price: null,
							image_output_price: null,
							per_request_price: null,
							intervals: []
						}
					}
				]
			}
		]
	}
];

beforeAll(async () => {
	addMessages('en', {
		common: { refresh: 'Refresh' },
		nav: { availableChannels: 'Available Channels' },
		availableChannels: {
			description: 'desc',
			searchPlaceholder: 'Search',
			empty: 'No available channels',
			noModels: 'No models',
			noPricing: 'No pricing',
			exclusive: 'Exclusive',
			public: 'Public',
			columns: {
				name: 'Channel',
				description: 'Description',
				platform: 'Platform',
				groups: 'Groups',
				supportedModels: 'Models'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('available channels helpers', () => {
	it('filters by channel, platform, group, and model dimensions', () => {
		expect(filterAvailableChannels(fixture, 'fast')).toHaveLength(1);
		expect(filterAvailableChannels(fixture, 'vip')[0].platforms).toHaveLength(1);
		expect(filterAvailableChannels(fixture, 'gpt-4o')[0].platforms).toHaveLength(1);
		expect(filterAvailableChannels(fixture, 'missing')).toHaveLength(0);
	});

	it('splits groups and formats pricing/rates', () => {
		const section = fixture[0].platforms[0];
		expect(publicGroups(section).map((g) => g.name)).toEqual(['Public']);
		expect(exclusiveGroups(section).map((g) => g.name)).toEqual(['VIP']);
		expect(groupRateLabel(section.groups[1], { 2: 0.5 })).toBe('0.50x');
		expect(modelPricingLabel(section.supported_models[0])).toBe('in $2/1M · out $8/1M'); // 2e-6 per-token → $2/MTok
	});

	it('keeps page and APIs wired to Vue available-channels contract', () => {
		expect(apiSrc).toContain('/api/v1/channels/available');
		expect(groupsSrc).toContain('/api/v1/groups/rates');
		expect(pageSrc).toContain('data-testid="available-channels-page"');
		expect(pageSrc).toContain('data-testid="available-channel-row"');
		expect(rerouteSrc).not.toContain("'/available-channels'");
	});
});

describe('available channels page', () => {
	let api: typeof import('$lib/api/user/channels');
	let groups: typeof import('$lib/api/user/groups');
	let pageMod: typeof import('../../../routes/(user)/available-channels/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/channels');
		groups = await import('$lib/api/user/groups');
		(api.getAvailableChannels as ReturnType<typeof vi.fn>).mockReset();
		(groups.getUserGroupRates as ReturnType<typeof vi.fn>).mockReset();
		(api.getAvailableChannels as ReturnType<typeof vi.fn>).mockResolvedValue(fixture);
		(groups.getUserGroupRates as ReturnType<typeof vi.fn>).mockResolvedValue({ 2: 0.5 });
		pageMod = await import('../../../routes/(user)/available-channels/+page.svelte');
	});

	it('renders API rows and filters them by search', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getAvailableChannels).toHaveBeenCalled());
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="available-channel-row"]').length).toBe(1);
		});
		expect(container.textContent).toContain('gpt-4o');
		expect(container.textContent).toContain('0.50x');

		const search = container.querySelector('[data-testid="available-channels-search"]') as HTMLInputElement;
		await fireEvent.input(search, { target: { value: 'missing' } });
		await waitFor(() => {
			expect(container.querySelector('[data-testid="available-channels-empty"]')).not.toBeNull();
		});
	});
});
