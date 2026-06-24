import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { apiClient } from '$lib/api/client';
import { getPaginated } from '$lib/api/admin/supply';
import accountsApiSrc from '$lib/api/admin/accounts.ts?raw';
import channelsApiSrc from '$lib/api/admin/channels.ts?raw';
import groupsApiSrc from '$lib/api/admin/groups.ts?raw';
import plansApiSrc from '$lib/api/admin/plans.ts?raw';
import proxiesApiSrc from '$lib/api/admin/proxies.ts?raw';
import channelsPageSrc from '../../../routes/admin/channels/+page.svelte?raw';
import channelPricingPageSrc from '../../../routes/admin/channels/pricing/+page.svelte?raw';
import accountsPageSrcRaw from '../../../routes/admin/accounts/+page.svelte?raw';
import accountFilterBarSrc from '$lib/features/account/AccountFilterBar.svelte?raw';
import accountsTableSrc from '$lib/features/account/AccountsTable.svelte?raw';
import groupsPageSrcRaw from '../../../routes/admin/groups/+page.svelte?raw';
import proxiesPageSrcRaw from '../../../routes/admin/proxies/+page.svelte?raw';
import groupFilterBarSrc from '$lib/features/groups/GroupFilterBar.svelte?raw';
import groupEditDialogSrc from '$lib/features/groups/GroupEditDialog.svelte?raw';
import proxiesTableSrc from '$lib/features/proxies/ProxiesTable.svelte?raw';
import proxyEditDialogSrc from '$lib/features/proxies/ProxyEditDialog.svelte?raw';

const accountsPageSrc = [accountsPageSrcRaw, accountFilterBarSrc, accountsTableSrc].join('\n');
const groupsPageSrc = [groupsPageSrcRaw, groupFilterBarSrc, groupEditDialogSrc].join('\n');
const proxiesPageSrc = [proxiesPageSrcRaw, proxiesTableSrc, proxyEditDialogSrc].join('\n');

import {
	accountIsSchedulable,
	accountPoolMode,
	flattenChannelPricing,
	formatGroupNames,
	formatPrice,
	proxyAccountCount,
	summarizeAccounts,
	summarizeChannels,
	summarizeGroups,
	summarizeProxies
} from './supply';
import type { Account } from '$lib/api/admin/accounts';
import type { Channel } from '$lib/api/admin/channels';
import type { AdminGroup } from '$lib/api/admin/groups';
import type { Proxy } from '$lib/api/admin/proxies';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		delete: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		streamPost: vi.fn(),
		put: vi.fn()
	}
}));

vi.mock('$lib/api/admin/accounts', () => ({
	batchClearAccountErrors: vi.fn(),
	batchCreateAccounts: vi.fn(),
	batchDeleteAccounts: vi.fn(),
	batchRefreshAccounts: vi.fn(),
	batchUpdateAccountCredentials: vi.fn(),
		bulkUpdateAccounts: vi.fn(),
		checkMixedChannelRisk: vi.fn(),
		clearAccountRateLimit: vi.fn(),
		clearAccountError: vi.fn(),
		createScheduledTestPlan: vi.fn(),
		deleteScheduledTestPlan: vi.fn(),
		applyOAuthCredentials: vi.fn(),
		cookieAuth: vi.fn(),
	createAccount: vi.fn(),
	exchangeCode: vi.fn(),
	exchangeOpenAICode: vi.fn(),
	exchangeSetupTokenCode: vi.fn(),
	exportAccountData: vi.fn(),
	generateAuthUrl: vi.fn(),
	generateOpenAIAuthUrl: vi.fn(),
	generateSetupTokenUrl: vi.fn(),
	getAccountModels: vi.fn(),
		getAccountStats: vi.fn(),
		getAccountUsage: vi.fn(),
		getAntigravityDefaultModelMapping: vi.fn(),
		getTempUnschedulable: vi.fn(),
		listScheduledTestPlans: vi.fn(),
		listScheduledTestResults: vi.fn(),
			importCodexSession: vi.fn(),
		importAccountData: vi.fn(),
		listAccounts: vi.fn(),
		previewSyncFromCRS: vi.fn(),
		previewSyncUpstreamModels: vi.fn(),
		queryOpenAIQuota: vi.fn(),
		refreshAccount: vi.fn(),
		refreshOpenAIToken: vi.fn(),
		recoverAccountState: vi.fn(),
		resetAccountQuota: vi.fn(),
		resetOpenAIQuota: vi.fn(),
		revertProxyFallback: vi.fn(),
		setAccountPrivacy: vi.fn(),
	setAccountSchedulable: vi.fn(),
	clearTempUnschedulable: vi.fn(),
	setupTokenCookieAuth: vi.fn(),
	syncAccountModels: vi.fn(),
	syncFromCRS: vi.fn(),
	testAccount: vi.fn(),
	testAccountStream: vi.fn(),
		updateAccount: vi.fn(),
		updateAccountStatus: vi.fn(),
		updateScheduledTestPlan: vi.fn()
	}));

vi.mock('$lib/api/admin/errorPassthrough', () => ({
	create: vi.fn(),
	deleteRule: vi.fn(),
	getById: vi.fn(),
	list: vi.fn(),
	toggleEnabled: vi.fn(),
	update: vi.fn()
}));

vi.mock('$lib/api/admin/groups', () => ({
	batchSetGroupRateMultipliers: vi.fn(),
	batchSetGroupRPMOverrides: vi.fn(),
	clearGroupRateMultipliers: vi.fn(),
	clearGroupRPMOverrides: vi.fn(),
	createGroup: vi.fn(),
	deleteGroup: vi.fn(),
	getGroupCapacitySummary: vi.fn(),
	getGroupUsageSummary: vi.fn(),
	getModelsListCandidates: vi.fn(),
	listGroupRateMultipliers: vi.fn(),
	listAllGroups: vi.fn(),
	listGroups: vi.fn(),
	updateGroup: vi.fn(),
	updateGroupSortOrder: vi.fn(),
	updateGroupStatus: vi.fn()
		}));

vi.mock('$lib/api/admin/users', () => ({
	listUsers: vi.fn()
}));

vi.mock('$lib/api/admin/channels', () => ({
	createChannel: vi.fn(),
	deleteChannel: vi.fn(),
	getChannel: vi.fn(),
	getModelDefaultPricing: vi.fn(),
	listChannels: vi.fn(),
	syncPricingModels: vi.fn(),
	updateChannel: vi.fn()
}));

vi.mock('$lib/api/admin/proxies', () => ({
	batchCreateProxies: vi.fn(),
	batchDeleteProxies: vi.fn(),
	checkProxyQuality: vi.fn(),
	createProxy: vi.fn(),
	deleteProxy: vi.fn(),
	exportProxyData: vi.fn(),
	importProxyData: vi.fn(),
	listAllProxies: vi.fn(),
	listProxies: vi.fn(),
	listProxyAccounts: vi.fn(),
	testProxy: vi.fn(),
	updateProxy: vi.fn(),
	updateProxyStatus: vi.fn()
}));

vi.mock('$lib/api/admin/tlsFingerprintProfile', () => ({
	create: vi.fn(),
	deleteProfile: vi.fn(),
	getById: vi.fn(),
	list: vi.fn(),
	update: vi.fn()
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	dismiss: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	showSuccess: vi.fn(),
	toasts: { list: [] }
}));

beforeAll(async () => {
	addMessages('en', {
		common: { refresh: 'Refresh' },
		admin: {
			accountsQuench: { title: 'Account Pool', description: 'Account pool', searchPlaceholder: 'Search accounts' },
			groups: { title: 'Groups & Routing', description: 'Groups' },
			proxies: { title: 'Proxies', description: 'Proxies' }
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

beforeEach(() => {
	vi.clearAllMocks();
});

function streamResponse(lines: string[]) {
	const encoder = new TextEncoder();
	const chunks = lines.map((line) => encoder.encode(line));
	let index = 0;
	return {
		body: {
			getReader: () => ({
				read: vi.fn().mockImplementation(async () => {
					if (index >= chunks.length) return { done: true, value: undefined };
					return { done: false, value: chunks[index++] };
				})
			})
		}
	} as unknown as Response;
}

describe('M13 supply helpers', () => {
	it('derives account pool and scheduling state from existing account fields', () => {
		const accounts: Account[] = [
			{
				id: 1,
				name: 'pool',
				platform: 'openai',
				type: 'api_key',
				status: 'active',
				schedulable: false,
				credentials: { pool_mode: true },
				groups: [{ id: 10, name: 'gold', platform: 'openai', status: 'active' }]
			},
			{
				id: 2,
				name: 'oauth',
				platform: 'claude',
				type: 'oauth',
				status: 'inactive',
				is_schedulable: true,
				group_ids: [20, 21]
			}
		];

		expect(accountPoolMode(accounts[0])).toBe(true);
		expect(accountIsSchedulable(accounts[0])).toBe(false);
		expect(accountIsSchedulable(accounts[1])).toBe(true);
		expect(formatGroupNames(accounts[0])).toBe('gold');
		expect(formatGroupNames(accounts[1])).toBe('#20, #21');
		expect(summarizeAccounts(accounts)).toEqual([
			{ label: 'Total', labelKey: 'admin.accounts.statsTotal', value: 2 },
			{ label: 'Active', labelKey: 'admin.accounts.statsActive', value: 1 },
			{ label: 'Pool mode', labelKey: 'admin.accounts.statsPoolMode', value: 1 },
			{ label: 'Schedulable', labelKey: 'admin.accounts.statsSchedulable', value: 1 }
		]);
	});

	it('summarizes groups and proxies without requiring new backend schema', () => {
		const groups: AdminGroup[] = [
			{ id: 1, name: 'public', platform: 'claude', status: 'active', total_accounts: 2 },
			{ id: 2, name: 'private', platform: 'openai', status: 'inactive', is_exclusive: true, total_accounts: 3 }
		];
		const proxies: Proxy[] = [
			{ id: 1, name: 'p1', protocol: 'socks5', host: '127.0.0.1', port: 1080, status: 'active', accounts_count: 2 },
			{ id: 2, name: 'p2', protocol: 'http', host: '10.0.0.1', port: 8080, status: 'expired', total_accounts: 4 }
		];

		expect(summarizeGroups(groups)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Exclusive', value: 1 },
			{ label: 'Accounts', value: 5 }
		]);
		expect(proxyAccountCount(proxies[1])).toBe(4);
		expect(summarizeProxies(proxies)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Expired', value: 1 },
			{ label: 'Accounts', value: 6 }
		]);
	});

	it('flattens channel pricing as a read-only virtual table', () => {
		const channels: Channel[] = [
			{
				id: 7,
				name: 'premium',
				status: 'active',
				group_ids: [1, 2],
				model_pricing: [
					{
						platform: 'openai',
						models: ['gpt-4.1', 'gpt-4.1-mini'],
						billing_mode: 'token',
						input_price: 0.000001,
						output_price: 0.000003,
						cache_write_price: null,
						cache_read_price: null,
						per_request_price: null
					}
				]
			},
			{ id: 8, name: 'empty', status: 'inactive', model_pricing: [] }
		];

		const rows = flattenChannelPricing(channels);
		expect(rows.map((r) => r.model)).toEqual(['gpt-4.1', 'gpt-4.1-mini', 'No explicit pricing']);
		expect(rows[0].channel.name).toBe('premium');
		expect(formatPrice(rows[0].pricing?.input_price)).toBe('$1.00e-6');
		expect(summarizeChannels(channels)).toEqual([
			{ label: 'Channels', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Groups', value: 2 },
			{ label: 'Pricing rows', value: 2 }
		]);
	});

	it('unwraps backend Success(PaginatedData) envelopes for admin tables', async () => {
		(apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			code: 0,
			message: 'success',
			data: {
				items: [{ id: 1, name: 'row' }],
				total: 7,
				page: 2,
				page_size: 20
			}
		});

		const resp = await getPaginated<{ id: number; name: string }>('/api/v1/admin/accounts?page=2');

		expect(apiClient.get).toHaveBeenCalledWith('/api/v1/admin/accounts?page=2');
		expect(resp.items).toEqual([{ id: 1, name: 'row' }]);
		expect(resp.total).toBe(7);
		expect(resp.page).toBe(2);
		expect(resp.page_size).toBe(20);
	});
});

describe('M13 supply red lines', () => {
	it('adds admin API facades for the four supply slices', () => {
		expect(accountsApiSrc).toContain('/api/v1/admin/accounts');
		expect(groupsApiSrc).toContain('/api/v1/admin/groups');
		expect(proxiesApiSrc).toContain('/api/v1/admin/proxies');
		expect(channelsApiSrc).toContain('/api/v1/admin/channels');
		expect(plansApiSrc).toContain('/api/v1/admin/groups');
		expect(accountsApiSrc).not.toContain('/api/admin/accounts');
		expect(groupsApiSrc).not.toContain('/api/admin/groups');
		expect(proxiesApiSrc).not.toContain('/api/admin/proxies');
		expect(channelsApiSrc).not.toContain('/api/admin/channels');
		expect(plansApiSrc).not.toContain('/api/admin/groups');
	});

	it('keeps groups and proxies aligned with backend validation contracts', () => {
		expect(groupsApiSrc).toContain("'anthropic'");
		expect(groupsPageSrc).toContain("['anthropic', 'openai', 'gemini', 'antigravity']");
		const platformOptions = groupsPageSrc.match(/const PLATFORM_OPTIONS = \[(.*?)\];/s)?.[1] ?? '';
		expect(platformOptions).not.toContain("'claude'");
		expect(platformOptions).not.toContain("'sora'");
		expect(platformOptions).not.toContain("'codex'");
		expect(proxiesPageSrc).toContain("'socks5h'");
		expect(proxiesApiSrc).toContain('expires_at?: number | null');
		expect(proxiesPageSrc).toContain('expiryUnixSeconds');
	});

	it('keeps channel pricing read-only while the channel list owns basic writes', () => {
		expect(channelsApiSrc).toContain('listChannels');
		expect(channelsApiSrc).toContain('createChannel');
		expect(channelsApiSrc).toContain('updateChannel');
		expect(channelsApiSrc).toContain('deleteChannel');
		expect(channelsApiSrc).toContain('/model-pricing');
		expect(channelsApiSrc).toContain('/pricing/sync-models');
		expect(channelPricingPageSrc).toMatch(/read-only|readonly|Read-only/);
		expect(channelPricingPageSrc).not.toContain('/model-pricing');
		expect(channelPricingPageSrc).not.toContain('createChannel');
		expect(channelPricingPageSrc).not.toContain('updateChannel');
		expect(channelPricingPageSrc).not.toContain('deleteChannel');
		expect(channelsPageSrc).toContain('ChannelFormDialog');
		expect(channelsPageSrc).toContain('updateChannel');
		expect(channelsPageSrc).toContain('deleteChannel');
	});

	it('uses non-empty select sentinels on M13 route pages', () => {
		for (const src of [accountsPageSrc, groupsPageSrc, proxiesPageSrc, channelsPageSrc, channelPricingPageSrc]) {
			expect(src).toMatch(/value=\{ALL\}|value:\s*ALL/);
			expect(src).not.toMatch(/<option\s+value=["']["']/);
		}
	});

	it('uses standard UI primitives instead of raw controls on M13 route pages', () => {
		for (const src of [accountsPageSrc, groupsPageSrc, proxiesPageSrc, channelsPageSrc, channelPricingPageSrc]) {
			expect(src).not.toMatch(/<(input|select|button|textarea)(\s|>)/);
		}
	});
});

describe('M13 supply pages', () => {
	const account: Account = {
		id: 101,
		name: 'pool-openai',
			email: 'pool@example.test',
			platform: 'openai',
			type: 'oauth',
		status: 'active',
		schedulable: true,
		credentials: { pool_mode: true },
		groups: [{ id: 7, name: 'gold', platform: 'openai', status: 'active' }],
		proxy: { id: 9, name: 'proxy-a', protocol: 'socks5', host: '127.0.0.1', port: 1080, status: 'active' }
	};
		const group: AdminGroup = {
			id: 7,
			name: 'gold',
			description: 'High capacity',
			platform: 'openai',
			status: 'active',
			sort_order: 3,
			total_accounts: 3,
			channel_name: 'premium'
		};
	const proxy: Proxy = {
		id: 9,
		name: 'proxy-a',
		protocol: 'socks5',
		host: '127.0.0.1',
		port: 1080,
		status: 'active',
		accounts_count: 2
	};

	it('renders the accounts pool table and triggers account refresh through the admin facade', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.getAccountStats as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.getAccountUsage as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.getAccountModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.refreshAccount as ReturnType<typeof vi.fn>).mockResolvedValue(account);
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.listAccounts).toHaveBeenCalledWith(1, 20, expect.objectContaining({ lite: 'true' })));
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		let row = container.querySelector('[data-testid="account-row"]') as HTMLElement;

		expect(container.textContent).toContain('pool-openai');
		const platformFilter = container.querySelector('[data-testid="accounts-platform-filter"]') as HTMLSelectElement;
		expect([...platformFilter.options].map((o) => o.value)).toContain('__all__');
		expect([...platformFilter.options].some((o) => o.value === '')).toBe(false);
		const typeFilter = container.querySelector('[data-testid="accounts-type-filter"]') as HTMLSelectElement;
		expect([...typeFilter.options].map((o) => o.value)).toEqual(expect.arrayContaining(['__all__', 'oauth', 'setup-token', 'bedrock']));
		expect([...typeFilter.options].some((o) => o.value === '')).toBe(false);
		const privacyFilter = container.querySelector('[data-testid="accounts-privacy-filter"]') as HTMLSelectElement;
		expect([...privacyFilter.options].map((o) => o.value)).toContain('__unset__');
		const schedulableFilter = container.querySelector('[data-testid="accounts-schedulable-filter"]') as HTMLSelectElement;
		const hasProxyFilter = container.querySelector('[data-testid="accounts-has-proxy-filter"]') as HTMLSelectElement;
		const groupFilter = container.querySelector('[data-testid="accounts-group-filter"]') as HTMLInputElement;

		await fireEvent.change(typeFilter, { target: { value: 'oauth' } });
		await fireEvent.change(privacyFilter, { target: { value: 'training_off' } });
		await fireEvent.change(schedulableFilter, { target: { value: 'false' } });
		await fireEvent.change(hasProxyFilter, { target: { value: 'true' } });
		await fireEvent.input(groupFilter, { target: { value: 'ungrouped' } });
		await fireEvent.click(within(container).getByRole('button', { name: 'Apply' }));
		await waitFor(() =>
			expect(api.listAccounts).toHaveBeenCalledWith(
				1,
				20,
				expect.objectContaining({
					type: 'oauth',
					group: 'ungrouped',
					privacy_mode: 'training_off',
					schedulable: 'false',
					has_proxy: 'true'
				})
			)
		);

		row = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: 'Refresh token' }));
		await waitFor(() => expect(api.refreshAccount).toHaveBeenCalledWith(101));
	});

	it('runs row-level account ReAuth and conditional account actions', async () => {
		const api = await import('$lib/api/admin/accounts');
		const openaiAccount: Account = {
			...account,
			credentials: { pool_mode: true, refresh_token: 'rt-existing' },
			extra: { model_rate_limits: { 'gpt-4.1': { rate_limit_reset_at: '2035-01-01T00:00:00Z' } } }
		};
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [openaiAccount], total: 1 });
		(api.generateOpenAIAuthUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
			auth_url: 'https://auth.openai.example/start?state=STATE2',
			session_id: 'openai-session'
		});
		(api.exchangeOpenAICode as ReturnType<typeof vi.fn>).mockResolvedValue({
			access_token: 'access-new',
			refresh_token: 'refresh-new',
			expires_at: 1893456000,
			email: 'pool@example.test',
			name: 'Pool User',
			privacy_mode: 'training_off'
		});
		(api.refreshOpenAIToken as ReturnType<typeof vi.fn>).mockResolvedValue({
			access_token: 'access-refresh',
			refresh_token: 'refresh-again',
			expires_at: 1893457000
		});
		(api.applyOAuthCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(openaiAccount);
		(api.setAccountPrivacy as ReturnType<typeof vi.fn>).mockResolvedValue(openaiAccount);
		(api.recoverAccountState as ReturnType<typeof vi.fn>).mockResolvedValue(openaiAccount);
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const row = container.querySelector('[data-testid="account-row"]') as HTMLElement;

		expect(within(row).getByRole('button', { name: 'ReAuth' })).not.toBeNull();
		expect(within(row).getByRole('button', { name: 'Refresh token' })).not.toBeNull();
		expect(within(row).getByRole('button', { name: 'Privacy' })).not.toBeNull();
		expect(within(row).getByRole('button', { name: 'Recover' })).not.toBeNull();
		expect(within(row).queryByRole('button', { name: 'Reset quota' })).toBeNull();

		await fireEvent.click(within(row).getByRole('button', { name: 'Privacy' }));
		await waitFor(() => expect(api.setAccountPrivacy).toHaveBeenCalledWith(101, true));
		const recoveredRow = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(recoveredRow).getByRole('button', { name: 'Recover' }));
		await waitFor(() => expect(api.recoverAccountState).toHaveBeenCalledWith(101));

		const reauthRow = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(reauthRow).getByRole('button', { name: 'ReAuth' }));
		await waitFor(() => expect(document.querySelector('[data-testid="account-reauth-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="account-reauth-dialog"]') as HTMLElement;
		expect((within(dialog).getByTestId('account-reauth-refresh-token') as HTMLInputElement).value).toBe('rt-existing');

		await fireEvent.input(within(dialog).getByTestId('account-reauth-redirect-uri'), {
			target: { value: 'https://app.example/reauth' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Generate auth URL' }));
		await waitFor(() =>
			expect(api.generateOpenAIAuthUrl).toHaveBeenCalledWith({
				proxy_id: 9,
				redirect_uri: 'https://app.example/reauth'
			})
		);
		await waitFor(() => expect((within(dialog).getByTestId('account-reauth-session-id') as HTMLInputElement).value).toBe('openai-session'));
		expect((within(dialog).getByTestId('account-reauth-state') as HTMLInputElement).value).toBe('STATE2');

		await fireEvent.input(within(dialog).getByTestId('account-reauth-code'), { target: { value: 'CODE2' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Exchange code' }));
		await waitFor(() =>
			expect(api.exchangeOpenAICode).toHaveBeenCalledWith({
				code: 'CODE2',
				proxy_id: 9,
				redirect_uri: 'https://app.example/reauth',
				session_id: 'openai-session',
				state: 'STATE2'
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('account-reauth-exchange-result').textContent).toContain('access-new'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh token' }));
		await waitFor(() =>
			expect(api.refreshOpenAIToken).toHaveBeenCalledWith({
				refresh_token: 'rt-existing',
				proxy_id: 9,
				redirect_uri: 'https://app.example/reauth'
			})
		);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply credentials' }));
		await waitFor(() =>
			expect(api.applyOAuthCredentials).toHaveBeenCalledWith(101, {
				type: 'oauth',
				credentials: {
					access_token: 'access-refresh',
					expires_at: 1893457000,
					refresh_token: 'refresh-again'
				},
				extra: undefined
			})
		);
	});

	it('opens account tools and runs account runtime actions', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.getAccountStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			requests: 12,
			total_tokens: 345,
			total_cost: 6.5
		});
		(api.getAccountUsage as ReturnType<typeof vi.fn>).mockResolvedValue({ source: 'active' });
			(api.getAccountModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'gpt-4.1', display_name: 'GPT 4.1', type: 'model' }
			]);
			(api.listScheduledTestPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
				{
					id: 301,
					account_id: 101,
					model_id: 'gpt-4.1',
					cron_expression: '*/30 * * * *',
					enabled: true,
					max_results: 100,
					auto_recover: false,
					last_run_at: '2030-01-01T00:00:00Z',
					next_run_at: '2030-01-01T00:30:00Z',
					created_at: '2030-01-01T00:00:00Z',
					updated_at: '2030-01-01T00:00:00Z'
				}
			]);
			(api.listScheduledTestResults as ReturnType<typeof vi.fn>).mockResolvedValue([
				{
					id: 401,
					plan_id: 301,
					status: 'success',
					response_text: 'pong',
					error_message: '',
					latency_ms: 42,
					started_at: '2030-01-01T00:00:00Z',
					finished_at: '2030-01-01T00:00:01Z',
					created_at: '2030-01-01T00:00:01Z'
				}
			]);
			(api.createScheduledTestPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 302,
				account_id: 101,
				model_id: 'gpt-4.2',
				cron_expression: '0 * * * *',
				enabled: true,
				max_results: 25,
				auto_recover: true
			});
				(api.updateScheduledTestPlan as ReturnType<typeof vi.fn>).mockImplementation((_id, payload) =>
					Promise.resolve({
						id: 301,
						account_id: 101,
						model_id: payload.model_id ?? 'gpt-4.1',
						cron_expression: payload.cron_expression ?? '*/30 * * * *',
						enabled: payload.enabled ?? true,
						max_results: payload.max_results ?? 100,
						auto_recover: payload.auto_recover ?? false,
						last_run_at: null,
						next_run_at: null,
						created_at: '2030-01-01T00:00:00Z',
						updated_at: '2030-01-01T00:01:00Z'
					})
				);
			(api.deleteScheduledTestPlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(api.testAccountStream as ReturnType<typeof vi.fn>).mockResolvedValue(
				streamResponse([
					'data: {"type":"test_start","model":"gpt-image-1"}\n\n',
					'data: {"type":"content","text":"hello stream"}\n\n',
					'data: {"type":"image","image_url":"data:image/png;base64,QUJD","mime_type":"image/png"}\n\n',
					'data: {"type":"test_complete","success":true}\n\n'
				])
			);
		(api.recoverAccountState as ReturnType<typeof vi.fn>).mockResolvedValue(account);
			(api.clearAccountRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(account);
			(api.resetAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue(account);
			(api.queryOpenAIQuota as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					email: 'pool@example.test',
					plan_type: 'plus',
					rate_limit_reset_credits: { available_count: 2 },
					fetched_at: 1
				})
				.mockResolvedValueOnce({
					email: 'pool@example.test',
					plan_type: 'plus',
					rate_limit_reset_credits: { available_count: 1 },
					fetched_at: 2
				});
			(api.resetOpenAIQuota as ReturnType<typeof vi.fn>).mockResolvedValue({ code: 'ok', windows_reset: 2 });
			(api.syncAccountModels as ReturnType<typeof vi.fn>).mockResolvedValue({ models: ['gpt-4.1', 'gpt-4.2'] });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const row = container.querySelector('[data-testid="account-row"]') as HTMLElement;

		await fireEvent.click(within(row).getByRole('button', { name: /Tools/ }));
			await waitFor(() => expect(api.getAccountStats).toHaveBeenCalledWith(101, 30));
			expect(api.getAccountUsage).toHaveBeenCalledWith(101, { source: 'active' });
			expect(api.getAccountModels).toHaveBeenCalledWith(101);
			expect(api.listScheduledTestPlans).toHaveBeenCalledWith(101);
			await waitFor(() => expect(document.body.textContent).toContain('GPT 4.1'));
			expect(document.body.textContent).toContain('Scheduled tests');
			expect(document.body.textContent).toContain('345');

			await fireEvent.click(within(document.body).getByTestId('account-scheduled-add'));
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-model'), {
				target: { value: 'gpt-4.2' }
			});
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-cron'), {
				target: { value: '0 * * * *' }
			});
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-max-results'), {
				target: { value: '25' }
			});
			await fireEvent.click(within(document.body).getByTestId('account-scheduled-auto-recover'));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Save plan' }));
			await waitFor(() =>
				expect(api.createScheduledTestPlan).toHaveBeenCalledWith({
					account_id: 101,
					model_id: 'gpt-4.2',
					cron_expression: '0 * * * *',
					enabled: true,
					auto_recover: true,
					max_results: 25
				})
			);

			const scheduledTests = within(document.body).getByTestId('account-scheduled-tests');
			const scheduledRow = within(scheduledTests).getByTestId('account-scheduled-row');
			await fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Results' }));
			await waitFor(() => expect(api.listScheduledTestResults).toHaveBeenCalledWith(301, 50));
			await waitFor(() => expect(document.body.textContent).toContain('pong'));
			await fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Edit' }));
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-edit-model'), {
				target: { value: 'gpt-4.1-mini' }
			});
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-edit-cron'), {
				target: { value: '*/15 * * * *' }
			});
			await fireEvent.input(within(document.body).getByTestId('account-scheduled-edit-max-results'), {
				target: { value: '50' }
			});
			await fireEvent.click(within(document.body).getByTestId('account-scheduled-edit-auto-recover'));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Save edit' }));
			await waitFor(() =>
				expect(api.updateScheduledTestPlan).toHaveBeenCalledWith(301, {
					model_id: 'gpt-4.1-mini',
					cron_expression: '*/15 * * * *',
					enabled: true,
					auto_recover: true,
					max_results: 50
				})
			);
			await fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Disable' }));
			await waitFor(() => expect(api.updateScheduledTestPlan).toHaveBeenCalledWith(301, { enabled: false }));
			await fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Delete' }));
			await waitFor(() => expect(api.deleteScheduledTestPlan).toHaveBeenCalledWith(301));

			await fireEvent.input(within(document.body).getByTestId('account-test-manual-model'), {
				target: { value: 'gpt-image-1' }
			});
			await fireEvent.input(within(document.body).getByTestId('account-test-prompt'), {
				target: { value: 'draw a test image' }
			});
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Test' }));
			await waitFor(() =>
				expect(api.testAccountStream).toHaveBeenCalledWith(101, {
					model_id: 'gpt-image-1',
					mode: undefined,
					prompt: 'draw a test image'
				})
			);
			await waitFor(() => expect(within(document.body).getByTestId('account-test-output').textContent).toContain('hello stream'));
			await waitFor(() => expect(within(document.body).getByTestId('account-test-images')).toBeTruthy());
		await fireEvent.click(within(document.body).getByRole('button', { name: 'Recover state' }));
		await waitFor(() => expect(api.recoverAccountState).toHaveBeenCalledWith(101));
		await fireEvent.click(within(document.body).getByRole('button', { name: 'Clear rate limit' }));
		await waitFor(() => expect(api.clearAccountRateLimit).toHaveBeenCalledWith(101));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Reset quota' }));
			await waitFor(() => expect(api.resetAccountQuota).toHaveBeenCalledWith(101));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Query OpenAI quota' }));
			await waitFor(() => expect(api.queryOpenAIQuota).toHaveBeenCalledWith(101));
			await waitFor(() => expect(within(document.body).getByTestId('openai-quota-credit-count').textContent).toBe('2'));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Use reset credit' }));
			await waitFor(() => expect(api.resetOpenAIQuota).toHaveBeenCalledWith(101));
			await waitFor(() => expect(within(document.body).getByTestId('openai-quota-reset-result').textContent).toContain('Reset 2 windows'));
			await fireEvent.click(within(document.body).getByRole('button', { name: 'Sync models' }));
		await waitFor(() => expect(api.syncAccountModels).toHaveBeenCalledWith(101));
		await waitFor(() => expect(document.body.textContent).toContain('gpt-4.2'));
	});

	it('opens and clears account temporary unschedulable status', async () => {
		const api = await import('$lib/api/admin/accounts');
		const heldAccount = {
			...account,
			status: 'temp_unschedulable',
			temp_unschedulable_until: '2030-01-01T00:00:00Z',
			temp_unschedulable_reason: 'rate spike'
		};
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [heldAccount], total: 1 });
		(api.getTempUnschedulable as ReturnType<typeof vi.fn>).mockResolvedValue({
			until: '2030-01-01T00:00:00Z',
			reason: 'rate spike'
		});
		(api.clearTempUnschedulable as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('temp hold'));
		await fireEvent.click(within(container).getByRole('button', { name: 'temp hold' }));
		await waitFor(() => expect(api.getTempUnschedulable).toHaveBeenCalledWith(101));
		await waitFor(() => expect(document.querySelector('[data-testid="account-temp-unsched-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="account-temp-unsched-dialog"]') as HTMLElement;
		await waitFor(() => expect(within(dialog).getByTestId('account-temp-unsched-json').textContent).toContain('rate spike'));

		await fireEvent.click(within(dialog).getByTestId('account-temp-unsched-clear'));
		await waitFor(() => expect(api.clearTempUnschedulable).toHaveBeenCalledWith(101));
	});

	it.skip('runs account data tools for selected export, import, batch create, bulk update, credentials, and delete (export/import endpoints not implemented)', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.getAccountStats as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.getAccountUsage as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.getAccountModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.exportAccountData as ReturnType<typeof vi.fn>).mockResolvedValue({ accounts: [{ id: 101, name: 'pool-openai' }] });
		(api.importAccountData as ReturnType<typeof vi.fn>).mockResolvedValue({ imported: 1 });
		(api.batchCreateAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 1, failed: 0 });
		(api.bulkUpdateAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 1, failed: 0 });
		(api.batchUpdateAccountCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 1, failed: 0 });
		(api.batchDeleteAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 1, failed: 0 });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const row = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('checkbox', { name: 'Select account' }));

		await fireEvent.click(within(container).getByRole('button', { name: 'Export selected' }));
		await waitFor(() => expect(api.exportAccountData).toHaveBeenCalledWith({ ids: [101], includeProxies: true }));
		await waitFor(() => expect(document.querySelector('[data-testid="account-data-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="account-data-dialog"]') as HTMLElement;
		const dataArea = within(dialog).getByTestId('account-data-json') as HTMLTextAreaElement;
		await waitFor(() => expect(dataArea.value).toContain('pool-openai'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Import data' }));
		await waitFor(() => expect(api.importAccountData).toHaveBeenCalledWith({ data: { accounts: [{ id: 101, name: 'pool-openai' }] } }));

		const batchArea = within(dialog).getByTestId('account-batch-json') as HTMLTextAreaElement;
		await fireEvent.input(batchArea, {
			target: { value: '[{"name":"created","platform":"openai","type":"api_key","status":"active"}]' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
		await waitFor(() =>
			expect(api.batchCreateAccounts).toHaveBeenCalledWith([
				{ name: 'created', platform: 'openai', type: 'api_key', status: 'active' }
			])
		);

		const bulkArea = within(dialog).getByTestId('account-bulk-json') as HTMLTextAreaElement;
		await fireEvent.input(bulkArea, { target: { value: '{"status":"inactive"}' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply update' }));
		await waitFor(() => expect(api.bulkUpdateAccounts).toHaveBeenCalledWith({ ids: [101], updates: { status: 'inactive' } }));

		const credentialField = within(dialog).getByTestId('account-credential-field') as HTMLInputElement;
		const credentialValue = within(dialog).getByTestId('account-credential-value') as HTMLInputElement;
		await fireEvent.input(credentialField, { target: { value: 'api_key' } });
		await fireEvent.input(credentialValue, { target: { value: '"sk-test"' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Update credential' }));
		await waitFor(() =>
			expect(api.batchUpdateAccountCredentials).toHaveBeenCalledWith({
				account_ids: [101],
				field: 'api_key',
				value: 'sk-test'
			})
		);

		await fireEvent.click(within(container).getByRole('button', { name: 'Delete selected' }));
		await waitFor(() => expect(document.querySelector('[data-testid="accounts-delete-dialog"]')).not.toBeNull());
		expect(api.batchDeleteAccounts).not.toHaveBeenCalled();
		await fireEvent.click(within(document.body).getByTestId('accounts-delete-confirm'));
		await waitFor(() => expect(api.batchDeleteAccounts).toHaveBeenCalledWith([101]));
	});

	it('runs filtered account bulk actions from current account filters', async () => {
		const api = await import('$lib/api/admin/accounts');
		const secondAccount = { ...account, id: 202, name: 'pool-openai-secondary' };
		(api.listAccounts as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({ items: [account], total: 1 })
			.mockResolvedValueOnce({ items: [account], total: 2 })
			.mockResolvedValueOnce({ items: [account, secondAccount], total: 2 })
			.mockResolvedValueOnce({ items: [account], total: 1 });
		(api.batchRefreshAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 2, failed: 0 });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const search = within(container).getByTestId('accounts-search') as HTMLInputElement;
		await fireEvent.input(search, { target: { value: 'pool' } });
		await waitFor(() => expect(container.textContent).toContain('1 filter'));

		await fireEvent.click(within(container).getByRole('button', { name: 'Refresh filtered' }));
		await waitFor(() =>
			expect(api.listAccounts).toHaveBeenCalledWith(
				1,
				1,
				expect.objectContaining({
					search: 'pool',
					lite: 'true'
				})
			)
		);
		await waitFor(() => expect(document.querySelector('[data-testid="accounts-filtered-bulk-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="accounts-filtered-bulk-dialog"]') as HTMLElement;
		await waitFor(() => expect(dialog.textContent).toContain('2 accounts'));

		await fireEvent.click(within(dialog).getByTestId('accounts-filtered-confirm'));
		await waitFor(() =>
			expect(api.listAccounts).toHaveBeenCalledWith(
				1,
				500,
				expect.objectContaining({
					search: 'pool',
					lite: 'true'
				})
			)
		);
		await waitFor(() => expect(api.batchRefreshAccounts).toHaveBeenCalledWith([101, 202]));
	});

	it('runs account bulk edit for selected and filtered account sets', async () => {
		const api = await import('$lib/api/admin/accounts');
		const secondAccount = { ...account, id: 202, name: 'pool-openai-secondary' };
		(api.listAccounts as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({ items: [account], total: 1 })
			.mockResolvedValueOnce({ items: [account], total: 1 })
			.mockResolvedValueOnce({ items: [account], total: 2 })
			.mockResolvedValueOnce({ items: [account, secondAccount], total: 2 })
			.mockResolvedValueOnce({ items: [account], total: 1 });
		(api.bulkUpdateAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ success: 1, failed: 0 });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const row = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('checkbox', { name: 'Select account' }));
		await fireEvent.click(within(container).getByRole('button', { name: 'Edit selected' }));
		await waitFor(() => expect(document.querySelector('[data-testid="accounts-bulk-edit-dialog"]')).not.toBeNull());
		let dialog = document.querySelector('[data-testid="accounts-bulk-edit-dialog"]') as HTMLElement;
		await fireEvent.input(within(dialog).getByTestId('accounts-bulk-edit-json'), {
			target: { value: '{"status":"inactive","schedulable":false}' }
		});
		await fireEvent.click(within(dialog).getByTestId('accounts-bulk-edit-confirm'));
		await waitFor(() =>
			expect(api.bulkUpdateAccounts).toHaveBeenCalledWith({
				ids: [101],
				updates: { status: 'inactive', schedulable: false }
			})
		);

		const search = within(container).getByTestId('accounts-search') as HTMLInputElement;
		await fireEvent.input(search, { target: { value: 'pool' } });
		await waitFor(() => expect(container.textContent).toContain('1 filter'));
		await fireEvent.click(within(container).getByRole('button', { name: /Edit filtered/ }));
		await waitFor(() =>
			expect(api.listAccounts).toHaveBeenCalledWith(
				1,
				1,
				expect.objectContaining({
					search: 'pool',
					lite: 'true'
				})
			)
		);
		await waitFor(() => expect(document.querySelector('[data-testid="accounts-bulk-edit-dialog"]')).not.toBeNull());
		dialog = document.querySelector('[data-testid="accounts-bulk-edit-dialog"]') as HTMLElement;
		await waitFor(() => expect(dialog.textContent).toContain('2 accounts'));
		await fireEvent.input(within(dialog).getByTestId('accounts-bulk-edit-json'), {
			target: { value: '{"priority":5}' }
		});
		await fireEvent.click(within(dialog).getByTestId('accounts-bulk-edit-confirm'));
		await waitFor(() =>
			expect(api.bulkUpdateAccounts).toHaveBeenLastCalledWith({
				ids: [101, 202],
				updates: { priority: 5 }
			})
		);
	});

	it('creates accounts from the account pool form with pool and routing fields', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.createAccount as ReturnType<typeof vi.fn>).mockResolvedValue({ ...account, id: 202, name: 'created-account' });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));

		await fireEvent.click(within(container).getByRole('button', { name: 'New account' }));
		await waitFor(() => expect(document.querySelector('[data-testid="account-dialog"]')).not.toBeNull());
		let dialog = document.querySelector('[data-testid="account-dialog"]') as HTMLElement;
		await fireEvent.input(within(dialog).getByTestId('account-form-name'), { target: { value: 'created-account' } });
		await fireEvent.input(within(dialog).getByTestId('account-form-email'), { target: { value: 'created@example.test' } });
		await fireEvent.input(within(dialog).getByTestId('account-form-groups'), { target: { value: '7, 8' } });
		await fireEvent.input(within(dialog).getByTestId('account-form-proxy'), { target: { value: '9' } });
		await fireEvent.input(within(dialog).getByTestId('account-form-credentials'), { target: { value: '{"api_key":"sk-test"}' } });
		await fireEvent.click(within(dialog).getByTestId('account-form-pool'));
		expect((within(dialog).getByTestId('account-form-name') as HTMLInputElement).value).toBe('created-account');
		const createSave = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
		expect(createSave.disabled).toBe(false);
		await fireEvent.click(createSave);
		await waitFor(() =>
			expect(api.createAccount).toHaveBeenCalledWith(expect.objectContaining({
				name: 'created-account',
				email: 'created@example.test',
				platform: 'openai',
				type: 'api_key',
				status: 'active',
				group_ids: [7, 8],
				proxy_id: 9,
				schedulable: true,
				privacy_mode: false,
				credentials: { api_key: 'sk-test', pool_mode: true }
			}))
		);
	});

	it('edits accounts from the account pool form with pool and routing fields', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.updateAccount as ReturnType<typeof vi.fn>).mockResolvedValue({ ...account, name: 'edited-account' });
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		const row = container.querySelector('[data-testid="account-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
		await waitFor(() => expect(document.querySelector('[data-testid="account-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="account-dialog"]') as HTMLElement;
		await fireEvent.input(within(dialog).getByTestId('account-form-name'), { target: { value: 'edited-account' } });
		await fireEvent.input(within(dialog).getByTestId('account-form-groups'), { target: { value: '10' } });
		await fireEvent.click(within(dialog).getByTestId('account-form-privacy'));
		const editSave = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
		expect(editSave.disabled).toBe(false);
		await fireEvent.click(editSave);
		await waitFor(() =>
			expect(api.updateAccount).toHaveBeenCalledWith(
				101,
				expect.objectContaining({
					name: 'edited-account',
					group_ids: [10],
					proxy_id: 9,
					privacy_mode: true,
					credentials: { pool_mode: true }
				})
			)
			);
		});

	it.skip('runs account advanced tools for CRS preview/sync and Codex session import (backend endpoints not implemented)', async () => {
		const api = await import('$lib/api/admin/accounts');
		const errorApi = await import('$lib/api/admin/errorPassthrough');
		const tlsApi = await import('$lib/api/admin/tlsFingerprintProfile');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(errorApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 5, name: 'pass-429', enabled: true, match_pattern: 'rate_limit', status_code: 429 }
		]);
		(errorApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 6, name: 'created', enabled: true });
		(errorApi.deleteRule as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(errorApi.toggleEnabled as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 5, name: 'pass-429', enabled: false });
		(tlsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 4, name: 'chrome', description: 'browser', alpn_protocols: ['h2'] }
		]);
		(tlsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 8, name: 'firefox' });
		(tlsApi.deleteProfile as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.previewSyncFromCRS as ReturnType<typeof vi.fn>).mockResolvedValue({
			new_accounts: [{ crs_account_id: 'crs-1', name: 'remote-a' }],
			existing_accounts: []
		});
		(api.syncFromCRS as ReturnType<typeof vi.fn>).mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0 });
		(api.importCodexSession as ReturnType<typeof vi.fn>).mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0 });
		(api.checkMixedChannelRisk as ReturnType<typeof vi.fn>).mockResolvedValue({ risky: false, conflicts: [] });
		(api.previewSyncUpstreamModels as ReturnType<typeof vi.fn>).mockResolvedValue({ models: ['gpt-4.1', 'gpt-4o'] });
		(api.getAntigravityDefaultModelMapping as ReturnType<typeof vi.fn>).mockResolvedValue({
			'gemini-2.5-pro': 'gemini-2.5-pro'
		});
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));

			await fireEvent.click(within(container).getByRole('button', { name: 'Advanced tools' }));
			await waitFor(() => expect(document.querySelector('[data-testid="account-advanced-dialog"]')).not.toBeNull());
			const dialog = document.querySelector('[data-testid="account-advanced-dialog"]') as HTMLElement;

			await waitFor(() => expect(errorApi.list).toHaveBeenCalled());
			await waitFor(() => expect(tlsApi.list).toHaveBeenCalled());
			const passthroughList = within(dialog).getByTestId('error-passthrough-list');
			await waitFor(() => expect(passthroughList.textContent).toContain('pass-429'));
			await fireEvent.click(within(passthroughList).getByRole('button', { name: 'Disable' }));
			await waitFor(() => expect(errorApi.toggleEnabled).toHaveBeenCalledWith(5, false));
			await fireEvent.input(within(dialog).getByTestId('error-passthrough-json'), {
				target: { value: '{"name":"created","enabled":true,"match_pattern":"timeout","status_code":504}' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Create passthrough rule' }));
			await waitFor(() =>
				expect(errorApi.create).toHaveBeenCalledWith({
					name: 'created',
					enabled: true,
					match_pattern: 'timeout',
					status_code: 504
				})
			);
			await fireEvent.click(within(passthroughList).getByRole('button', { name: 'Delete' }));
			await waitFor(() => expect(errorApi.deleteRule).toHaveBeenCalledWith(5));

			const tlsList = within(dialog).getByTestId('tls-profile-list');
			await waitFor(() => expect(tlsList.textContent).toContain('chrome'));
			await fireEvent.input(within(dialog).getByTestId('tls-profile-json'), {
				target: { value: '{"name":"firefox","enable_grease":false,"alpn_protocols":["h2"]}' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Create TLS profile' }));
			await waitFor(() =>
				expect(tlsApi.create).toHaveBeenCalledWith({
					name: 'firefox',
					enable_grease: false,
					alpn_protocols: ['h2']
				})
			);
			await fireEvent.click(within(tlsList).getByRole('button', { name: 'Delete' }));
			await waitFor(() => expect(tlsApi.deleteProfile).toHaveBeenCalledWith(4));

			await fireEvent.input(within(dialog).getByTestId('crs-base-url'), { target: { value: 'https://crs.example' } });
			await fireEvent.input(within(dialog).getByTestId('crs-username'), { target: { value: 'admin' } });
			await fireEvent.input(within(dialog).getByTestId('crs-password'), { target: { value: 'pw' } });
		await fireEvent.input(within(dialog).getByTestId('crs-selected-ids'), { target: { value: 'crs-1 crs-2' } });

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Preview CRS' }));
		await waitFor(() =>
			expect(api.previewSyncFromCRS).toHaveBeenCalledWith({
				base_url: 'https://crs.example',
				username: 'admin',
				password: 'pw'
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('crs-preview-result').textContent).toContain('remote-a'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Sync CRS' }));
		await waitFor(() =>
			expect(api.syncFromCRS).toHaveBeenCalledWith({
				base_url: 'https://crs.example',
				username: 'admin',
				password: 'pw',
				sync_proxies: true,
				selected_account_ids: ['crs-1', 'crs-2']
			})
		);

		await fireEvent.input(within(dialog).getByTestId('codex-account-name'), { target: { value: 'codex-import' } });
		await fireEvent.input(within(dialog).getByTestId('codex-group-ids'), { target: { value: '7, 8' } });
		await fireEvent.input(within(dialog).getByTestId('codex-proxy-id'), { target: { value: '9' } });
		await fireEvent.input(within(dialog).getByTestId('codex-session-content'), { target: { value: '{"accessToken":"at"}' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Import Codex sessions' }));
		await waitFor(() =>
			expect(api.importCodexSession).toHaveBeenCalledWith({
				content: '{"accessToken":"at"}',
				update_existing: true,
				name: 'codex-import',
				group_ids: [7, 8],
				proxy_id: 9
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('codex-import-result').textContent).toContain('created'));

		await fireEvent.input(within(dialog).getByTestId('mixed-risk-json'), { target: { value: '{"account_ids":[101]}' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Check mixed risk' }));
		await waitFor(() => expect(api.checkMixedChannelRisk).toHaveBeenCalledWith({ account_ids: [101] }));
		await waitFor(() => expect(within(dialog).getByTestId('mixed-risk-result').textContent).toContain('conflicts'));

		await fireEvent.input(within(dialog).getByTestId('upstream-models-json'), {
			target: { value: '{"platform":"openai","credentials":{"api_key":"sk-test"}}' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Preview upstream models' }));
		await waitFor(() =>
			expect(api.previewSyncUpstreamModels).toHaveBeenCalledWith({
				platform: 'openai',
				credentials: { api_key: 'sk-test' }
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('upstream-models-result').textContent).toContain('gpt-4.1'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Load Antigravity defaults' }));
		await waitFor(() => expect(api.getAntigravityDefaultModelMapping).toHaveBeenCalled());
		await waitFor(() =>
			expect(within(dialog).getByTestId('antigravity-default-mapping').textContent).toContain('gemini-2.5-pro')
		);
	});

	it.skip('runs the account OAuth helper through URL generation, code exchange, and credential apply (opens from Advanced tools which was removed)', async () => {
		const api = await import('$lib/api/admin/accounts');
		(api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [account], total: 1 });
		(api.generateAuthUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
			auth_url: 'https://auth.example/start?state=STATE1',
			session_id: 'sess-1'
		});
		(api.generateSetupTokenUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
			auth_url: 'https://auth.example/setup?state=SETUP1',
			session_id: 'setup-sess'
		});
		(api.exchangeCode as ReturnType<typeof vi.fn>).mockResolvedValue({
			access_token: 'tok',
			refresh_token: 'rt'
		});
		(api.exchangeSetupTokenCode as ReturnType<typeof vi.fn>).mockResolvedValue({
			setup_token: 'setup-token'
		});
		(api.cookieAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
			access_token: 'cookie-token'
		});
		(api.setupTokenCookieAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
			setup_token: 'cookie-setup-token'
		});
		(api.applyOAuthCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(account);
		const page = await import('../../../routes/admin/accounts/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('pool-openai'));
		await fireEvent.click(within(container).getByRole('button', { name: 'Advanced tools' }));
		await waitFor(() => expect(document.querySelector('[data-testid="account-advanced-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="account-advanced-dialog"]') as HTMLElement;

		await fireEvent.input(within(dialog).getByTestId('oauth-proxy-id'), { target: { value: '9' } });
		await fireEvent.input(within(dialog).getByTestId('oauth-redirect-uri'), { target: { value: 'https://app.example/callback' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Generate auth URL' }));
		await waitFor(() =>
			expect(api.generateAuthUrl).toHaveBeenCalledWith({
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback'
			})
		);
		await waitFor(() => expect((within(dialog).getByTestId('oauth-session-id') as HTMLInputElement).value).toBe('sess-1'));
		expect((within(dialog).getByTestId('oauth-state') as HTMLInputElement).value).toBe('STATE1');

		await fireEvent.input(within(dialog).getByTestId('oauth-code'), { target: { value: 'CODE1' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Exchange code' }));
		await waitFor(() =>
			expect(api.exchangeCode).toHaveBeenCalledWith({
				code: 'CODE1',
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback',
				session_id: 'sess-1',
				state: 'STATE1'
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('oauth-exchange-result').textContent).toContain('access_token'));

		await fireEvent.input(within(dialog).getByTestId('oauth-account-id'), { target: { value: '101' } });
		await fireEvent.input(within(dialog).getByTestId('oauth-extra-json'), { target: { value: '{"plan_type":"plus"}' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply credentials' }));
		await waitFor(() =>
			expect(api.applyOAuthCredentials).toHaveBeenCalledWith(101, {
				type: 'oauth',
				credentials: {
					access_token: 'tok',
					refresh_token: 'rt'
				},
				extra: { plan_type: 'plus' }
			})
		);

		await fireEvent.change(within(dialog).getByTestId('oauth-mode'), { target: { value: 'setup-token' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Generate auth URL' }));
		await waitFor(() =>
			expect(api.generateSetupTokenUrl).toHaveBeenCalledWith({
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback'
			})
		);
		await waitFor(() => expect((within(dialog).getByTestId('oauth-session-id') as HTMLInputElement).value).toBe('setup-sess'));
		await fireEvent.input(within(dialog).getByTestId('oauth-code'), { target: { value: 'SETUP-CODE' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Exchange code' }));
		await waitFor(() =>
			expect(api.exchangeSetupTokenCode).toHaveBeenCalledWith({
				code: 'SETUP-CODE',
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback',
				session_id: 'setup-sess',
				state: 'SETUP1'
			})
		);

		await fireEvent.change(within(dialog).getByTestId('oauth-mode'), { target: { value: 'oauth' } });
		await fireEvent.input(within(dialog).getByTestId('oauth-cookie-key'), { target: { value: 'COOKIE1' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cookie auth' }));
		await waitFor(() =>
			expect(api.cookieAuth).toHaveBeenCalledWith({
				code: 'COOKIE1',
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback'
			})
		);

		await fireEvent.change(within(dialog).getByTestId('oauth-mode'), { target: { value: 'setup-token' } });
		await fireEvent.input(within(dialog).getByTestId('oauth-cookie-key'), { target: { value: 'COOKIE2' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cookie auth' }));
		await waitFor(() =>
			expect(api.setupTokenCookieAuth).toHaveBeenCalledWith({
				code: 'COOKIE2',
				proxy_id: 9,
				redirect_uri: 'https://app.example/callback'
			})
		);
	});

		it('renders groups and toggles group status through the admin facade', async () => {
			const api = await import('$lib/api/admin/groups');
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [group], total: 1 });
		(api.listGroupRateMultipliers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.getGroupUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ group_id: 7, today_cost: 3.5, total_cost: 42 }
		]);
		(api.getGroupCapacitySummary as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ group_id: 7, concurrency_used: 1, concurrency_max: 3, sessions_used: 2, sessions_max: 4, rpm_used: 5, rpm_max: 60 }
		]);
		(api.getModelsListCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.updateGroupStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...group, status: 'inactive' });
		const page = await import('../../../routes/admin/groups/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.listGroups).toHaveBeenCalledWith(1, 20, expect.objectContaining({ sort_by: 'sort_order' })));
		await waitFor(() => expect(container.textContent).toContain('gold'));
		const row = container.querySelector('[data-testid="group-row"]') as HTMLElement;

			expect(container.textContent).toContain('gold');
			await waitFor(() => expect(within(row).getByTestId('group-usage-summary').textContent).toContain('today $3.50'));
			expect(within(row).getByTestId('group-usage-summary').textContent).toContain('total $42.00');
			expect(within(row).getByTestId('group-capacity-summary').textContent).toContain('rpm 5 / 60');
			const statusFilter = container.querySelector('[data-testid="groups-status-filter"]') as HTMLSelectElement;
		expect([...statusFilter.options].map((o) => o.value)).toContain('__all__');
		expect([...statusFilter.options].some((o) => o.value === '')).toBe(false);
		const platformFilter = container.querySelector('[data-testid="groups-platform-filter"]') as HTMLSelectElement;
		const platformValues = [...platformFilter.options].map((o) => o.value);
		expect(platformValues).toEqual(expect.arrayContaining(['__all__', 'anthropic', 'openai', 'gemini', 'antigravity']));
		expect(platformValues).not.toEqual(expect.arrayContaining(['claude', 'sora', 'codex']));

		await fireEvent.click(within(row).getByRole('button', { name: 'Disable' }));
			await waitFor(() => expect(api.updateGroupStatus).toHaveBeenCalledWith(7, 'inactive'));
		});

		it('creates, edits, toggles, and deletes channels through the admin facade', async () => {
			const api = await import('$lib/api/admin/channels');
				const channel: Channel = {
					id: 7,
					name: 'premium',
					description: 'Premium routing',
					status: 'active',
					billing_model_source: 'upstream',
					group_ids: [1, 2],
					model_mapping: { openai: { 'gpt-4o': 'gpt-4.1' } },
					model_pricing: [
						{
							platform: 'anthropic',
							models: ['claude-*'],
							billing_mode: 'per_request',
							input_price: null,
							output_price: null,
							cache_write_price: null,
							cache_read_price: null,
							image_output_price: null,
							per_request_price: 0.02,
							intervals: [
								{
									min_tokens: 0,
									max_tokens: null,
									tier_label: 'large',
									input_price: null,
									output_price: null,
									cache_write_price: null,
									cache_read_price: null,
									per_request_price: 0.05,
									sort_order: 0
								}
							]
						}
					]
				};
			(api.listChannels as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [channel], total: 1 });
			(api.createChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ ...channel, id: 8, name: 'created' });
			(api.updateChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ ...channel, status: 'disabled' });
			(api.deleteChannel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			const page = await import('../../../routes/admin/channels/+page.svelte');

			const { container } = render(page.default);
			await waitFor(() => expect(api.listChannels).toHaveBeenCalledWith(1, 20, expect.objectContaining({ sort_by: 'created_at' })));
			await waitFor(() => expect(container.textContent).toContain('premium'));
			expect(container.textContent).toContain('pricing matrix remains read-only');

			await fireEvent.click(within(container).getByRole('button', { name: 'New channel' }));
			await waitFor(() => expect(document.querySelector('[data-testid="channel-dialog"]')).not.toBeNull());
			let dialog = document.querySelector('[data-testid="channel-dialog"]') as HTMLElement;
			await fireEvent.input(within(dialog).getByTestId('channel-form-name'), { target: { value: 'created' } });
			await fireEvent.input(within(dialog).getByTestId('channel-form-description'), { target: { value: 'Created channel' } });
			await fireEvent.input(within(dialog).getByTestId('channel-form-groups'), { target: { value: '1 2' } });
			await fireEvent.input(within(dialog).getByTestId('channel-form-mapping'), {
				target: { value: '{"openai":{"gpt-4o":"gpt-4.1"}}' }
			});
			await fireEvent.change(within(dialog).getByTestId('channel-form-billing-source'), {
				target: { value: 'requested' }
			});
			await fireEvent.click(within(dialog).getByTestId('channel-add-pricing'));
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-platform-0'), {
				target: { value: 'openai' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-models-0'), {
				target: { value: 'gpt-4o, gpt-4.1' }
			});
			await fireEvent.change(within(dialog).getByTestId('channel-pricing-billing-0'), {
				target: { value: 'token' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-input-0'), {
				target: { value: '0.000001' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-output-0'), {
				target: { value: '0.000003' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-cache-write-0'), {
				target: { value: '0.0000004' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-cache-read-0'), {
				target: { value: '0.0000002' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-image-output-0'), {
				target: { value: '0.00004' }
			});
			await fireEvent.click(within(dialog).getByTestId('channel-pricing-add-interval-0'));
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-max-0-0'), {
				target: { value: '200000' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-label-0-0'), {
				target: { value: 'long-context' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-input-0-0'), {
				target: { value: '0.000002' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-output-0-0'), {
				target: { value: '0.000004' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-cache-write-0-0'), {
				target: { value: '0.0000006' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-cache-read-0-0'), {
				target: { value: '0.0000003' }
			});
			await fireEvent.click(within(dialog).getByTestId('channel-form-restrict-models'));
			await fireEvent.click(within(dialog).getByTestId('channel-form-account-stats'));
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
			await waitFor(() =>
				expect(api.createChannel).toHaveBeenCalledWith({
					name: 'created',
					description: 'Created channel',
					status: 'active',
					billing_model_source: 'requested',
					restrict_models: true,
					apply_pricing_to_account_stats: true,
					group_ids: [1, 2],
					model_pricing: [
						{
							platform: 'openai',
							models: ['gpt-4o', 'gpt-4.1'],
							billing_mode: 'token',
							// 表单按 $/MTok 录入，持久化时 mTokToPerToken = 录入值 / 1e6（per_request 不转）
							input_price: 1e-12,
							output_price: 3e-12,
							cache_write_price: 4e-13,
							cache_read_price: 2e-13,
							image_output_price: 4e-11,
							per_request_price: null,
							intervals: [
								{
									min_tokens: 0,
									max_tokens: 200000,
									tier_label: 'long-context',
									input_price: 2e-12,
									output_price: 4e-12,
									cache_write_price: 6e-13,
									cache_read_price: 3e-13,
									per_request_price: null,
									sort_order: 0
								}
							]
						}
					],
					model_mapping: { openai: { 'gpt-4o': 'gpt-4.1' } }
				})
			);

			const row = container.querySelector('[data-testid="channels-row"]') as HTMLElement;
			await fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
			await waitFor(() => expect(document.querySelector('[data-testid="channel-dialog"]')).not.toBeNull());
			dialog = document.querySelector('[data-testid="channel-dialog"]') as HTMLElement;
			expect((within(dialog).getByTestId('channel-form-billing-source') as HTMLSelectElement).value).toBe('upstream');
			expect((within(dialog).getByTestId('channel-pricing-models-0') as HTMLTextAreaElement).value).toBe('claude-*');
			expect((within(dialog).getByTestId('channel-pricing-interval-request-0-0') as HTMLInputElement).value).toBe('0.05');
			await fireEvent.input(within(dialog).getByTestId('channel-form-name'), { target: { value: 'premium-edited' } });
			await fireEvent.change(within(dialog).getByTestId('channel-form-billing-source'), {
				target: { value: 'channel_mapped' }
			});
			await fireEvent.input(within(dialog).getByTestId('channel-pricing-interval-request-0-0'), {
				target: { value: '0.06' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
			await waitFor(() =>
				expect(api.updateChannel).toHaveBeenCalledWith(
					7,
					expect.objectContaining({
						name: 'premium-edited',
						billing_model_source: 'channel_mapped',
						group_ids: [1, 2],
						model_pricing: [
							{
								platform: 'anthropic',
								models: ['claude-*'],
								billing_mode: 'per_request',
								input_price: null,
								output_price: null,
								cache_write_price: null,
								cache_read_price: null,
								image_output_price: null,
								per_request_price: 0.02,
								intervals: [
									{
										min_tokens: 0,
										max_tokens: null,
										tier_label: 'large',
										input_price: null,
										output_price: null,
										cache_write_price: null,
										cache_read_price: null,
										per_request_price: 0.06,
										sort_order: 0
									}
								]
							}
						],
						model_mapping: { openai: { 'gpt-4o': 'gpt-4.1' } }
					})
				)
			);

			await waitFor(() => {
				const currentRow = container.querySelector('[data-testid="channels-row"]') as HTMLElement;
				const currentDisable = within(currentRow).getByRole('button', { name: 'Disable' }) as HTMLButtonElement;
				expect(currentDisable.disabled).toBe(false);
			});
			const statusRow = container.querySelector('[data-testid="channels-row"]') as HTMLElement;
			const disableButton = within(statusRow).getByRole('button', { name: 'Disable' }) as HTMLButtonElement;
			await fireEvent.click(disableButton);
			await waitFor(() => expect(api.updateChannel).toHaveBeenCalledWith(7, { status: 'disabled' }));
			await waitFor(() => {
				const currentRow = container.querySelector('[data-testid="channels-row"]') as HTMLElement;
				const currentDelete = within(currentRow).getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
				expect(currentDelete.disabled).toBe(false);
			});
			const deleteRow = container.querySelector('[data-testid="channels-row"]') as HTMLElement;
			const deleteButton = within(deleteRow).getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
			await fireEvent.click(deleteButton);
			await waitFor(() => expect(document.querySelector('[data-testid="channel-delete-dialog"]')).not.toBeNull());
			expect(api.deleteChannel).not.toHaveBeenCalled();
			await fireEvent.click(within(document.body).getByTestId('channel-delete-confirm'));
			await waitFor(() => expect(api.deleteChannel).toHaveBeenCalledWith(7));
		});

		it('saves group advanced policy fields through create and edit payloads', async () => {
		const api = await import('$lib/api/admin/groups');
			(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({
				items: [
						{
							...group,
							total_accounts: 3,
							supported_model_scopes: ['claude', 'gemini_text', 'gemini_image'],
							allow_messages_dispatch: true,
							model_routing_enabled: true,
							model_routing: { 'claude-opus-*': [101, 102] },
							messages_dispatch_model_config: {
							opus_mapped_model: 'gpt-5.4',
							sonnet_mapped_model: 'gpt-5.3-codex',
							haiku_mapped_model: 'gpt-5.4-mini',
							exact_model_mappings: { 'claude-opus-4': 'gpt-5.4' }
						}
					}
				],
				total: 1
			});
		(api.getModelsListCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(['gpt-4.1', 'gpt-4o', 'gpt-4.1-mini']);
		(api.createGroup as ReturnType<typeof vi.fn>).mockResolvedValue({ ...group, id: 8, name: 'silver' });
		(api.updateGroup as ReturnType<typeof vi.fn>).mockResolvedValue({
				...group,
				supported_model_scopes: ['claude', 'gemini_text'],
				model_routing_enabled: true,
				model_routing: { 'claude-opus-*': [101, 102] },
				daily_limit_usd: 12.5,
			weekly_limit_usd: 70,
				monthly_limit_usd: 240,
				allow_image_generation: true,
				image_rate_independent: true,
				image_rate_multiplier: 1.25,
				image_price_1k: 0.134,
				image_price_2k: 0.201,
				image_price_4k: 0.268,
						claude_code_only: true,
						fallback_group_id: 11,
						fallback_group_id_on_invalid_request: 12,
						allow_messages_dispatch: true,
						messages_dispatch_model_config: {
							opus_mapped_model: 'gpt-5.4',
							sonnet_mapped_model: 'gpt-5.3-codex',
							haiku_mapped_model: 'gpt-5.4-mini',
							exact_model_mappings: {
								'claude-opus-4': 'gpt-5.4',
								'claude-haiku-3.5': 'gpt-5.4-mini'
							}
						},
							models_list_config: { enabled: true, models: ['gpt-4.1', 'gpt-4o'] },
					require_oauth_only: true,
					require_privacy_set: true,
					mcp_xml_inject: false
		});
		const page = await import('../../../routes/admin/groups/+page.svelte');

		const createView = render(page.default);
		await waitFor(() => expect(createView.container.textContent).toContain('gold'));

		await fireEvent.click(within(createView.container).getByRole('button', { name: /New group/ }));
			await waitFor(() => expect(document.querySelector('[data-testid="group-dialog"]')).not.toBeNull());
			let dialog = document.querySelector('[data-testid="group-dialog"]') as HTMLElement;
				await fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'silver' } });
				await fireEvent.change(within(dialog).getByTestId('group-platform-select'), { target: { value: 'openai' } });
				await fireEvent.change(within(dialog).getByTestId('group-copy-accounts-select'), { target: { value: '7' } });
				await fireEvent.click(within(dialog).getByRole('button', { name: 'Add source' }));
				await fireEvent.input(within(dialog).getByTestId('group-daily-limit'), { target: { value: '10.5' } });
			await fireEvent.input(within(dialog).getByTestId('group-weekly-limit'), { target: { value: '50' } });
		await fireEvent.input(within(dialog).getByTestId('group-monthly-limit'), { target: { value: '200' } });
		await fireEvent.click(within(dialog).getByTestId('group-allow-image'));
		await fireEvent.click(within(dialog).getByTestId('group-image-independent'));
		await fireEvent.input(within(dialog).getByTestId('group-image-multiplier'), { target: { value: '1.5' } });
		await fireEvent.input(within(dialog).getByTestId('group-image-price-1k'), { target: { value: '0.134' } });
		await fireEvent.input(within(dialog).getByTestId('group-image-price-2k'), { target: { value: '0.201' } });
		await fireEvent.input(within(dialog).getByTestId('group-image-price-4k'), { target: { value: '0.268' } });
			await fireEvent.click(within(dialog).getByTestId('group-claude-code-only'));
			await fireEvent.input(within(dialog).getByTestId('group-fallback-id'), { target: { value: '11' } });
				await fireEvent.input(within(dialog).getByTestId('group-invalid-fallback-id'), { target: { value: '12' } });
				await fireEvent.click(within(dialog).getByTestId('group-model-routing-enabled'));
				await fireEvent.click(within(dialog).getByRole('button', { name: 'Add routing rule' }));
				await fireEvent.input(within(dialog).getByTestId('group-routing-pattern-0'), { target: { value: 'claude-opus-*' } });
				await fireEvent.input(within(dialog).getByTestId('group-routing-accounts-0'), { target: { value: '101, 102, 102, x' } });
				await waitFor(() => expect(within(dialog).getByTestId('group-messages-dispatch-enabled')).toBeTruthy());
			await fireEvent.click(within(dialog).getByTestId('group-messages-dispatch-enabled'));
			await fireEvent.input(within(dialog).getByTestId('group-messages-opus'), { target: { value: ' gpt-5.4 ' } });
			await fireEvent.input(within(dialog).getByTestId('group-messages-sonnet'), { target: { value: ' gpt-5.3-codex ' } });
			await fireEvent.input(within(dialog).getByTestId('group-messages-haiku'), { target: { value: ' gpt-5.4-mini ' } });
			await fireEvent.input(within(dialog).getByTestId('group-messages-exact'), {
				target: { value: ' claude-opus-4 = gpt-5.4 \nclaude-haiku-3.5=>gpt-5.4-mini\n=ignored' }
			});
				await fireEvent.click(within(dialog).getByTestId('group-models-list-enabled'));
			await waitFor(() => expect(api.getModelsListCandidates).toHaveBeenCalledWith(0, 'openai'));
		await waitFor(() => expect(within(dialog).getByTestId('group-models-list-items').textContent).toContain('gpt-4.1-mini'));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Invert' }));
		await fireEvent.click(within(dialog).getByTestId('group-models-list-item-gpt-4.1'));
		await fireEvent.click(within(dialog).getByTestId('group-models-list-item-gpt-4o'));
		await fireEvent.click(within(dialog).getByTestId('group-require-oauth'));
		await fireEvent.click(within(dialog).getByTestId('group-require-privacy'));
		await fireEvent.click(within(dialog).getByTestId('group-mcp-xml'));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(api.createGroup).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'silver',
					daily_limit_usd: 10.5,
					weekly_limit_usd: 50,
					monthly_limit_usd: 200,
					allow_image_generation: true,
					image_rate_independent: true,
					image_rate_multiplier: 1.5,
					image_price_1k: 0.134,
					image_price_2k: 0.201,
					image_price_4k: 0.268,
						claude_code_only: true,
						fallback_group_id: 11,
						fallback_group_id_on_invalid_request: 12,
						copy_accounts_from_group_ids: [7],
						model_routing_enabled: true,
						model_routing: { 'claude-opus-*': [101, 102] },
						models_list_config: { enabled: true, models: ['gpt-4.1', 'gpt-4o'] },
					require_oauth_only: true,
					require_privacy_set: true,
					mcp_xml_inject: false,
					supported_model_scopes: ['claude', 'gemini_text', 'gemini_image']
				})
			)
			);

		createView.unmount();
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
					{
						...group,
						total_accounts: 3,
						supported_model_scopes: ['claude', 'gemini_text', 'gemini_image'],
						model_routing_enabled: true,
						model_routing: { 'claude-opus-*': [101, 102] },
						daily_limit_usd: 12.5,
					weekly_limit_usd: 70,
					monthly_limit_usd: 240,
					allow_image_generation: true,
					image_rate_independent: true,
					image_rate_multiplier: 1.25,
						image_price_1k: 0.134,
						image_price_2k: 0.201,
						image_price_4k: 0.268,
						claude_code_only: true,
						fallback_group_id: 11,
						fallback_group_id_on_invalid_request: 12,
						allow_messages_dispatch: true,
						messages_dispatch_model_config: {
							opus_mapped_model: 'gpt-5.4',
							sonnet_mapped_model: 'gpt-5.3-codex',
							haiku_mapped_model: 'gpt-5.4-mini',
							exact_model_mappings: {
								'claude-opus-4': 'gpt-5.4',
								'claude-haiku-3.5': 'gpt-5.4-mini'
							}
						},
						models_list_config: { enabled: true, models: ['gpt-4.1', 'gpt-4o'] },
						require_oauth_only: true,
					require_privacy_set: false,
					mcp_xml_inject: false
				}
			],
			total: 1
		});
			const editView = render(page.default);
		await waitFor(() => expect(editView.container.textContent).toContain('gold'));
		const row = editView.container.querySelector('[data-testid="group-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
		await waitFor(() => expect(document.querySelector('[data-testid="group-dialog"]')).not.toBeNull());
			dialog = document.querySelector('[data-testid="group-dialog"]') as HTMLElement;
		await waitFor(() => expect(api.getModelsListCandidates).toHaveBeenCalledWith(7, 'openai'));
		const savedModelRow = within(dialog).getByTestId('group-models-list-item-gpt-4.1').closest('div') as HTMLElement;
		await fireEvent.click(within(savedModelRow).getByRole('button', { name: 'Down' }));
		await fireEvent.input(within(dialog).getByTestId('group-daily-limit'), { target: { value: '15' } });
		await fireEvent.input(within(dialog).getByTestId('group-image-multiplier'), { target: { value: '1.75' } });
			await fireEvent.input(within(dialog).getByTestId('group-image-price-4k'), { target: { value: '0.333' } });
			await fireEvent.input(within(dialog).getByTestId('group-fallback-id'), { target: { value: '' } });
			await fireEvent.input(within(dialog).getByTestId('group-invalid-fallback-id'), { target: { value: '13' } });
			await fireEvent.input(within(dialog).getByTestId('group-messages-sonnet'), { target: { value: 'gpt-5.3-codex-pro' } });
				await fireEvent.input(within(dialog).getByTestId('group-messages-exact'), {
					target: { value: 'claude-opus-4=gpt-5.4\nclaude-sonnet-4=gpt-5.3-codex-pro' }
				});
				await fireEvent.input(within(dialog).getByTestId('group-routing-pattern-0'), { target: { value: 'claude-sonnet-*' } });
				await fireEvent.input(within(dialog).getByTestId('group-routing-accounts-0'), { target: { value: '103 104' } });
				await fireEvent.click(within(dialog).getByTestId('group-models-list-item-gpt-4.1-mini'));
		await fireEvent.click(within(dialog).getByTestId('group-require-privacy'));
		await fireEvent.click(within(dialog).getByTestId('group-mcp-xml'));
		await fireEvent.click(within(dialog).getByTestId('group-scope-gemini_image'));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(api.updateGroup).toHaveBeenCalledWith(
				7,
				expect.objectContaining({
					daily_limit_usd: 15,
					weekly_limit_usd: 70,
					monthly_limit_usd: 240,
					allow_image_generation: true,
					image_rate_independent: true,
					image_rate_multiplier: 1.75,
					image_price_1k: 0.134,
					image_price_2k: 0.201,
					image_price_4k: 0.333,
							claude_code_only: true,
							fallback_group_id: 0,
							fallback_group_id_on_invalid_request: 13,
							copy_accounts_from_group_ids: [],
							model_routing_enabled: true,
							model_routing: { 'claude-sonnet-*': [103, 104] },
							allow_messages_dispatch: true,
						messages_dispatch_model_config: {
							opus_mapped_model: 'gpt-5.4',
							sonnet_mapped_model: 'gpt-5.3-codex-pro',
							haiku_mapped_model: 'gpt-5.4-mini',
							exact_model_mappings: {
								'claude-opus-4': 'gpt-5.4',
								'claude-sonnet-4': 'gpt-5.3-codex-pro'
							}
						},
						models_list_config: { enabled: true, models: ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'] },
					require_oauth_only: true,
					require_privacy_set: true,
					mcp_xml_inject: true,
					supported_model_scopes: ['claude', 'gemini_text']
				})
			)
		);
	});

	it('saves group sort order through the admin facade', async () => {
		const api = await import('$lib/api/admin/groups');
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [group], total: 1 });
		(api.updateGroupSortOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		const page = await import('../../../routes/admin/groups/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('gold'));
		const sortInput = container.querySelector('[data-testid="group-sort-input"]') as HTMLInputElement;
		expect(sortInput.value).toBe('3');

		await fireEvent.input(sortInput, { target: { value: '9' } });
		await fireEvent.click(within(container).getByRole('button', { name: 'Save sort' }));
		await waitFor(() => expect(api.updateGroupSortOrder).toHaveBeenCalledWith([{ id: 7, sort_order: 9 }]));
	});

	it('confirms group deletion in a standard dialog before calling the admin facade', async () => {
		const api = await import('$lib/api/admin/groups');
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [group], total: 1 });
		(api.deleteGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		const page = await import('../../../routes/admin/groups/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('gold'));
		const row = container.querySelector('[data-testid="group-row"]') as HTMLElement;

		await fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(document.querySelector('[data-testid="groups-confirm-dialog"]')).not.toBeNull());
		expect(api.deleteGroup).not.toHaveBeenCalled();
		await fireEvent.click(within(document.body).getByTestId('groups-confirm-action'));
		await waitFor(() => expect(api.deleteGroup).toHaveBeenCalledWith(7));
	});

	it('opens group controls and saves rate multipliers plus RPM overrides', async () => {
		const api = await import('$lib/api/admin/groups');
		const usersApi = await import('$lib/api/admin/users');
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [group], total: 1 });
		(api.listGroupRateMultipliers as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ user_id: 42, user_name: 'Ada', rate_multiplier: 1.2, rpm_override: 60 }
		]);
		(usersApi.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [{ id: 77, email: 'grace@example.test', username: 'Grace', role: 'user', status: 'active' }],
			total: 1
		});
		(api.getGroupUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ group_id: 7, today_cost: 3.5, total_cost: 42 }
		]);
		(api.getGroupCapacitySummary as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ group_id: 7, concurrency_used: 1, concurrency_max: 3, sessions_used: 2, sessions_max: 4, rpm_used: 5, rpm_max: 60 }
		]);
		(api.getModelsListCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(['gpt-4.1', 'gpt-4.1-mini']);
		(api.batchSetGroupRateMultipliers as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		(api.batchSetGroupRPMOverrides as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		const page = await import('../../../routes/admin/groups/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('gold'));
		const row = container.querySelector('[data-testid="group-row"]') as HTMLElement;

		await fireEvent.click(within(row).getByRole('button', { name: /Controls/ }));
		await waitFor(() => expect(api.listGroupRateMultipliers).toHaveBeenCalledWith(7));
		expect(api.getModelsListCandidates).toHaveBeenCalledWith(7, 'openai');
		await waitFor(() => expect(document.body.textContent).toContain('$3.50'));
		expect(document.body.textContent).toContain('5 / 60');
		expect(document.body.textContent).toContain('gpt-4.1-mini');
		expect(document.body.textContent).toContain('Ada');
		const controlsDialog = document.querySelector('[data-testid="group-controls-dialog"]') as HTMLElement;

		await fireEvent.input(within(controlsDialog).getByTestId('group-user-search'), {
			target: { value: 'grace' }
		});
		await fireEvent.click(within(controlsDialog).getByTestId('group-user-search-run'));
		await waitFor(() => expect(usersApi.listUsers).toHaveBeenCalledWith(1, 10, { search: 'grace' }));
		await fireEvent.click(within(controlsDialog).getByRole('button', { name: /grace@example.test/ }));
		await waitFor(() => expect(within(controlsDialog).getByTestId('group-selected-user').textContent).toContain('#77'));
		await fireEvent.input(within(controlsDialog).getByTestId('group-rate-new-value'), {
			target: { value: '2' }
		});
		await fireEvent.click(within(controlsDialog).getAllByRole('button', { name: 'Add' })[0]);
		await fireEvent.input(within(controlsDialog).getByTestId('group-rate-batch-factor'), {
			target: { value: '0.5' }
		});
		await fireEvent.click(within(controlsDialog).getByRole('button', { name: 'Apply factor' }));

		const rateList = document.querySelector('[data-testid="group-rate-list"]') as HTMLElement;
		const rateInput = within(rateList).getByDisplayValue('0.6') as HTMLInputElement;
		await fireEvent.input(rateInput, { target: { value: '1.5' } });
		await fireEvent.click(within(document.body).getByRole('button', { name: 'Save rates' }));
		await waitFor(() =>
			expect(api.batchSetGroupRateMultipliers).toHaveBeenCalledWith(7, [
				{ user_id: 42, rate_multiplier: 1.5 },
				{ user_id: 77, rate_multiplier: 1 }
			])
		);

		await fireEvent.input(within(controlsDialog).getByTestId('group-rpm-new-value'), {
			target: { value: '120' }
		});
		await fireEvent.click(within(controlsDialog).getAllByRole('button', { name: 'Add' })[1]);
		const rpmList = document.querySelector('[data-testid="group-rpm-list"]') as HTMLElement;
		const rpmInput = within(rpmList).getByDisplayValue('60') as HTMLInputElement;
		await fireEvent.input(rpmInput, { target: { value: '90' } });
		await fireEvent.click(within(document.body).getByRole('button', { name: 'Save RPM' }));
		await waitFor(() =>
			expect(api.batchSetGroupRPMOverrides).toHaveBeenCalledWith(7, [
				{ user_id: 42, rpm_override: 90 },
				{ user_id: 77, rpm_override: 120 }
			])
		);

		await fireEvent.click(within(controlsDialog).getAllByRole('button', { name: 'Clear' })[0]);
		await waitFor(() => expect(document.querySelector('[data-testid="groups-confirm-dialog"]')).not.toBeNull());
		await fireEvent.click(within(document.body).getByTestId('groups-confirm-action'));
		await waitFor(() => expect(api.clearGroupRateMultipliers).toHaveBeenCalledWith(7));

		await fireEvent.click(within(controlsDialog).getAllByRole('button', { name: 'Clear' })[1]);
		await waitFor(() => expect(document.querySelector('[data-testid="groups-confirm-dialog"]')).not.toBeNull());
		await fireEvent.click(within(document.body).getByTestId('groups-confirm-action'));
		await waitFor(() => expect(api.clearGroupRPMOverrides).toHaveBeenCalledWith(7));
	});

	it('renders proxies and opens proxy account usage', async () => {
		const api = await import('$lib/api/admin/proxies');
		(api.listProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [proxy], total: 1 });
		(api.listProxyAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 101, name: 'pool-openai', platform: 'openai', type: 'api_key', status: 'active' }
		]);
		const page = await import('../../../routes/admin/proxies/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.listProxies).toHaveBeenCalledWith(1, 20, expect.objectContaining({ sort_by: 'created_at' })));
		await waitFor(() => expect(container.textContent).toContain('proxy-a'));
		const row = container.querySelector('[data-testid="proxy-row"]') as HTMLElement;

		expect(container.textContent).toContain('proxy-a');
		const protocolFilter = container.querySelector('[data-testid="proxies-protocol-filter"]') as HTMLSelectElement;
		expect([...protocolFilter.options].map((o) => o.value)).toContain('__all__');
		expect([...protocolFilter.options].map((o) => o.value)).toContain('socks5h');
		expect([...protocolFilter.options].some((o) => o.value === '')).toBe(false);

		await fireEvent.click(within(row).getByRole('button', { name: '2 accounts' }));
		await waitFor(() => expect(api.listProxyAccounts).toHaveBeenCalledWith(9));
		await waitFor(() => expect(document.body.textContent).toContain('pool-openai'));
	});

	it('runs proxy quality and connectivity actions', async () => {
		const api = await import('$lib/api/admin/proxies');
		const allProxy = { ...proxy, id: 10, name: 'proxy-b', host: '192.0.2.11' };
		(api.listProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [proxy], total: 2 });
		(api.listAllProxies as ReturnType<typeof vi.fn>).mockResolvedValue([proxy, allProxy]);
		(api.testProxy as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, message: 'ok', latency_ms: 42 });
		(api.checkProxyQuality as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			score: 98,
			summary: 'all targets reachable',
			exit_ip: '203.0.113.9',
			country: 'US',
			base_latency_ms: 35,
			items: [{ target: 'openai', status: 'ok', http_status: 200, latency_ms: 41, message: 'ok' }]
		});
		const page = await import('../../../routes/admin/proxies/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('proxy-a'));

		const row = container.querySelector('[data-testid="proxy-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('checkbox', { name: 'Select proxy' }));
		await fireEvent.click(within(row).getByRole('button', { name: 'Quality' }));
		await waitFor(() => expect(api.checkProxyQuality).toHaveBeenCalledWith(9));
		await waitFor(() => expect(document.querySelector('[data-testid="proxy-quality-dialog"]')).not.toBeNull());
		const qualityDialog = document.querySelector('[data-testid="proxy-quality-dialog"]') as HTMLElement;
		expect(within(qualityDialog).getByTestId('proxy-quality-score').textContent).toContain('98');
		expect(within(qualityDialog).getByTestId('proxy-quality-summary').textContent).toContain('all targets reachable');
		expect(within(qualityDialog).getByTestId('proxy-quality-targets').textContent).toContain('openai');

		const batchTest = within(container).getByRole('button', { name: 'Test selected' }) as HTMLButtonElement;
		await waitFor(() => expect(batchTest.disabled).toBe(false));
		await fireEvent.click(batchTest);
		await waitFor(() => expect(api.testProxy).toHaveBeenCalledWith(9));
		await waitFor(() => expect(container.querySelector('[data-testid="proxy-batch-action-result"]')?.textContent).toContain('Proxy tests: 1/1 passed'));
		const batchQuality = within(container).getByRole('button', { name: 'Quality selected' }) as HTMLButtonElement;
		await waitFor(() => expect(batchQuality.disabled).toBe(false));
		await fireEvent.click(batchQuality);
		await waitFor(() => expect(api.checkProxyQuality).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(container.querySelector('[data-testid="proxy-batch-action-result"]')?.textContent).toContain('Proxy quality: 1/1 passed'));

		const allTest = within(container).getByRole('button', { name: 'Test all' }) as HTMLButtonElement;
		await waitFor(() => expect(allTest.disabled).toBe(false));
		await fireEvent.click(allTest);
		await waitFor(() => expect(api.listAllProxies).toHaveBeenCalled());
		await waitFor(() => expect(api.testProxy).toHaveBeenCalledWith(10));
		await waitFor(() => expect(container.querySelector('[data-testid="proxy-batch-action-result"]')?.textContent).toContain('Proxy tests: 2/2 passed'));
		const allQuality = within(container).getByRole('button', { name: 'Quality all' }) as HTMLButtonElement;
		await waitFor(() => expect(allQuality.disabled).toBe(false));
		await fireEvent.click(allQuality);
		await waitFor(() => expect(api.checkProxyQuality).toHaveBeenCalledWith(10));
		await waitFor(() => expect(api.checkProxyQuality).toHaveBeenCalledTimes(4));
		await waitFor(() => expect(container.querySelector('[data-testid="proxy-batch-action-result"]')?.textContent).toContain('Proxy quality: 2/2 passed'));
	});

	it('runs proxy data tools for selected export, import, batch create, and delete', async () => {
		const api = await import('$lib/api/admin/proxies');
		(api.listProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [proxy], total: 1 });
		(api.exportProxyData as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({ proxies: [{ id: 9, name: 'proxy-a' }] })
			.mockResolvedValueOnce({ proxies: [{ id: 10, name: 'proxy-filtered' }] });
		(api.importProxyData as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({ proxy_created: 1, proxy_reused: 0, proxy_failed: 0 })
			.mockResolvedValueOnce({
				proxy_created: 1,
				proxy_reused: 0,
				proxy_failed: 1,
				errors: [{ error: 'bad proxy row' }]
			});
		(api.batchCreateProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ created: 1 });
		(api.batchDeleteProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: 1 });
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		const createObjectURL = vi.fn(() => 'blob:proxy-data');
		const revokeObjectURL = vi.fn();
		Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
		Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
		const page = await import('../../../routes/admin/proxies/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('proxy-a'));
		const row = container.querySelector('[data-testid="proxy-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('checkbox', { name: 'Select proxy' }));

		await fireEvent.click(within(container).getByRole('button', { name: 'Export selected' }));
		await waitFor(() => expect(api.exportProxyData).toHaveBeenCalledWith({ ids: [9] }));
		await waitFor(() => expect(document.querySelector('[data-testid="proxy-data-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="proxy-data-dialog"]') as HTMLElement;
		const dataArea = within(dialog).getByTestId('proxy-data-json') as HTMLTextAreaElement;
		await waitFor(() => expect(dataArea.value).toContain('proxy-a'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Import data' }));
		await waitFor(() => expect(api.importProxyData).toHaveBeenCalledWith({ data: { proxies: [{ id: 9, name: 'proxy-a' }] } }));
		await waitFor(() => expect(within(dialog).getByTestId('proxy-data-import-result').textContent).toContain('Created 1'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Export filtered' }));
		await waitFor(() =>
			expect(api.exportProxyData).toHaveBeenCalledWith({
				filters: { protocol: undefined, status: undefined, search: undefined, sort_by: 'created_at', sort_order: 'desc' }
			})
		);
		await waitFor(() => expect(dataArea.value).toContain('proxy-filtered'));

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Download JSON' }));
		expect(createObjectURL).toHaveBeenCalled();
		expect(appendSpy).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();

		const file = new File(['{"proxies":[{"id":10,"name":"file-proxy"}]}'], 'proxies.json', {
			type: 'application/json'
		});
		const fileInput = within(dialog).getByTestId('proxy-data-file') as HTMLInputElement;
		await fireEvent.change(fileInput, { target: { files: [file] } });
		await waitFor(() =>
			expect(api.importProxyData).toHaveBeenLastCalledWith({
				data: { proxies: [{ id: 10, name: 'file-proxy' }] }
			})
		);
		await waitFor(() => expect(within(dialog).getByTestId('proxy-data-file-name').textContent).toContain('proxies.json'));
		await waitFor(() => expect(within(dialog).getByTestId('proxy-data-import-errors').textContent).toContain('bad proxy row'));

			const batchArea = within(dialog).getByTestId('proxy-batch-json') as HTMLTextAreaElement;
			await fireEvent.input(batchArea, {
				target: { value: '[{"protocol":"socks5","host":"10.0.0.2","port":1080}]' }
			});
			await waitFor(() => expect(within(dialog).getByTestId('proxy-batch-parse-summary').textContent).toContain('Valid 1'));
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
			await waitFor(() =>
				expect(api.batchCreateProxies).toHaveBeenCalledWith([
					{ protocol: 'socks5', host: '10.0.0.2', port: 1080 }
				])
			);

			await fireEvent.input(batchArea, {
				target: {
					value: [
						'socks5://127.0.0.1:1080',
						'http://user:pass@192.0.2.10:8080',
						'bad-proxy',
						'socks5://127.0.0.1:1080'
					].join('\n')
				}
			});
			const parseSummary = within(dialog).getByTestId('proxy-batch-parse-summary');
			await waitFor(() => expect(parseSummary.textContent).toContain('Valid 2'));
			expect(parseSummary.textContent).toContain('Invalid 1');
			expect(parseSummary.textContent).toContain('Duplicate 1');
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
			await waitFor(() =>
				expect(api.batchCreateProxies).toHaveBeenLastCalledWith([
					{
						name: 'socks5-127.0.0.1-1080',
						protocol: 'socks5',
						host: '127.0.0.1',
						port: 1080,
						username: '',
						password: '',
						status: 'active'
					},
					{
						name: 'http-192.0.2.10-8080',
						protocol: 'http',
						host: '192.0.2.10',
						port: 8080,
						username: 'user',
						password: 'pass',
						status: 'active'
					}
				])
			);

			await fireEvent.click(within(container).getByRole('button', { name: 'Delete selected' }));
		await waitFor(() => expect(document.querySelector('[data-testid="proxies-delete-dialog"]')).not.toBeNull());
		expect(api.batchDeleteProxies).not.toHaveBeenCalled();
		await fireEvent.click(within(document.body).getByTestId('proxies-delete-confirm'));
		await waitFor(() => expect(api.batchDeleteProxies).toHaveBeenCalledWith([9]));
		await waitFor(() => expect(container.querySelector('[data-testid="proxy-batch-action-result"]')?.textContent).toContain('Deleted 1 selected proxy'));
	});

	it('creates proxies with backend-compatible Unix-second expiry payloads', async () => {
		const api = await import('$lib/api/admin/proxies');
		(api.listProxies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
		(api.createProxy as ReturnType<typeof vi.fn>).mockResolvedValue(proxy);
		const page = await import('../../../routes/admin/proxies/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.listProxies).toHaveBeenCalled());

		await fireEvent.click(within(container).getByRole('button', { name: 'New proxy' }));
		await waitFor(() => expect(document.querySelector('[data-testid="proxy-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="proxy-dialog"]') as HTMLElement;
		const inputs = within(dialog).getAllByRole('textbox') as HTMLInputElement[];
		await fireEvent.input(inputs[0], { target: { value: 'created-proxy' } });
		await fireEvent.input(inputs[1], { target: { value: '192.0.2.10' } });
		const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;
		await fireEvent.input(dateInput, { target: { value: '2030-01-01' } });
		await fireEvent.input(within(dialog).getByTestId('proxy-form-warn-days'), { target: { value: '5' } });
		await fireEvent.change(within(dialog).getByTestId('proxy-form-fallback-mode'), { target: { value: 'proxy' } });
		await fireEvent.input(within(dialog).getByTestId('proxy-form-backup-proxy'), { target: { value: '12' } });

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(api.createProxy).toHaveBeenCalledWith(expect.objectContaining({
				backup_proxy_id: 12,
				expires_at: 1893456000,
				expiry_warn_days: 5,
				fallback_mode: 'proxy',
				host: '192.0.2.10',
				name: 'created-proxy'
			}))
		);
	});

	it('edits proxy fallback mode and clears backup proxy outside proxy fallback', async () => {
		const api = await import('$lib/api/admin/proxies');
		(api.listProxies as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [{ ...proxy, fallback_mode: 'proxy', backup_proxy_id: 12, expiry_warn_days: 5 }],
			total: 1
		});
		(api.updateProxy as ReturnType<typeof vi.fn>).mockResolvedValue(proxy);
		const page = await import('../../../routes/admin/proxies/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(container.textContent).toContain('proxy-a'));
		const row = container.querySelector('[data-testid="proxy-row"]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
		await waitFor(() => expect(document.querySelector('[data-testid="proxy-dialog"]')).not.toBeNull());
		const dialog = document.querySelector('[data-testid="proxy-dialog"]') as HTMLElement;

		expect((within(dialog).getByTestId('proxy-form-fallback-mode') as HTMLSelectElement).value).toBe('proxy');
		expect((within(dialog).getByTestId('proxy-form-backup-proxy') as HTMLInputElement).value).toBe('12');
		await fireEvent.change(within(dialog).getByTestId('proxy-form-fallback-mode'), { target: { value: 'direct' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

		await waitFor(() =>
			expect(api.updateProxy).toHaveBeenCalledWith(
				9,
				expect.objectContaining({
					backup_proxy_id: null,
					expiry_warn_days: 5,
					fallback_mode: 'direct'
				})
			)
		);
	});
});
