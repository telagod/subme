import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import {
	batchDeleteAccounts,
	checkMixedChannelRisk,
	createAccount,
	createScheduledTestPlan,
	deleteScheduledTestPlan,
	exchangeCode,
	exchangeOpenAICode,
	exportAccountData,
	generateAuthUrl,
	generateOpenAIAuthUrl,
	getAccount,
	getBatchAccountTodayStats,
	importCodexSession,
	listScheduledTestPlans,
	listScheduledTestResults,
	previewSyncFromCRS,
	refreshOpenAIToken,
	syncFromCRS,
	testAccountStream,
	updateScheduledTestPlan
} from './accounts';
import {
	createChannel,
	deleteChannel,
	getChannel,
	getModelDefaultPricing,
	syncPricingModels,
	updateChannel
} from './channels';
import {
	batchSetGroupRPMOverrides,
	getGroup,
	getModelsListCandidates,
	listGroupRPMOverrides,
	updateGroupSortOrder
} from './groups';
import {
	batchCreateProxies,
	batchDeleteProxies,
	checkProxyQuality,
	createProxy,
	exportProxyData,
	getProxy,
	importProxyData
} from './proxies';

vi.mock('../client', () => ({
	apiClient: {
		delete: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		streamPost: vi.fn(),
		put: vi.fn()
	}
}));

const mockedApi = apiClient as unknown as {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
	streamPost: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('M13 admin supply API facades', () => {
	it('unwraps account envelopes and targets backend /api/v1 admin routes', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { id: 7, name: 'acct' } });
		await expect(getAccount(7)).resolves.toEqual({ id: 7, name: 'acct' });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/accounts/7');

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 8, name: 'created' } });
		await expect(createAccount({ name: 'created', platform: 'openai' })).resolves.toEqual({
			id: 8,
			name: 'created'
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts', {
			name: 'created',
			platform: 'openai'
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { stats: { '7': { requests: 1 } } } });
		await expect(getBatchAccountTodayStats([7])).resolves.toEqual({ stats: { '7': { requests: 1 } } });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/today-stats/batch', {
			account_ids: [7]
		});

		const stream = new Response();
		mockedApi.streamPost.mockResolvedValueOnce(stream);
		await expect(testAccountStream(7, { model_id: 'gpt-4.1', mode: 'compact' })).resolves.toBe(stream);
		expect(mockedApi.streamPost).toHaveBeenCalledWith('/api/v1/admin/accounts/7/test', {
			model_id: 'gpt-4.1',
			mode: 'compact'
		}, undefined);

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { success: 1, failed: 0 } });
		await expect(batchDeleteAccounts([7])).resolves.toEqual({ success: 1, failed: 0 });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/batch-delete', { ids: [7] });

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { accounts: [] } });
		await expect(exportAccountData({ ids: [7], includeProxies: false })).resolves.toEqual({ accounts: [] });
			expect(mockedApi.get).toHaveBeenCalledWith(
				'/api/v1/admin/accounts/data?ids=7&include_proxies=false'
			);
		});

		it('covers account scheduled test plan facades', async () => {
			mockedApi.get.mockResolvedValueOnce({ code: 0, data: [{ id: 11, account_id: 7, model_id: 'gpt-4.1' }] });
			await expect(listScheduledTestPlans(7)).resolves.toEqual([{ id: 11, account_id: 7, model_id: 'gpt-4.1' }]);
			expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/accounts/7/scheduled-test-plans');

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 12, account_id: 7, model_id: 'gpt-4.2' } });
			await expect(
				createScheduledTestPlan({
					account_id: 7,
					model_id: 'gpt-4.2',
					cron_expression: '0 * * * *',
					enabled: true,
					max_results: 25,
					auto_recover: true
				})
			).resolves.toEqual({ id: 12, account_id: 7, model_id: 'gpt-4.2' });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/scheduled-test-plans', {
				account_id: 7,
				model_id: 'gpt-4.2',
				cron_expression: '0 * * * *',
				enabled: true,
				max_results: 25,
				auto_recover: true
			});

			mockedApi.put.mockResolvedValueOnce({ code: 0, data: { id: 12, enabled: false } });
			await expect(updateScheduledTestPlan(12, { enabled: false })).resolves.toEqual({ id: 12, enabled: false });
			expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/scheduled-test-plans/12', { enabled: false });

			mockedApi.get.mockResolvedValueOnce({ code: 0, data: [{ id: 30, status: 'success' }] });
			await expect(listScheduledTestResults(12, 10)).resolves.toEqual([{ id: 30, status: 'success' }]);
			expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/scheduled-test-plans/12/results?limit=10');

			mockedApi.delete.mockResolvedValueOnce({ code: 0, data: { message: 'deleted' } });
			await deleteScheduledTestPlan(12);
			expect(mockedApi.delete).toHaveBeenCalledWith('/api/v1/admin/scheduled-test-plans/12');
		});

		it('adds group parity endpoints for sort, models, rate multipliers, and rpm overrides', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { id: 3, name: 'gold' } });
		await expect(getGroup(3)).resolves.toEqual({ id: 3, name: 'gold' });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/groups/3');

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { models: ['claude-4'] } });
		await expect(getModelsListCandidates(0, 'anthropic')).resolves.toEqual(['claude-4']);
		expect(mockedApi.get).toHaveBeenCalledWith(
			'/api/v1/admin/groups/0/models-list-candidates?platform=anthropic'
		);

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { message: 'ok' } });
		await updateGroupSortOrder([{ id: 3, sort_order: 1 }]);
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/groups/sort-order', {
			updates: [{ id: 3, sort_order: 1 }]
		});

		mockedApi.get.mockResolvedValueOnce({
			code: 0,
			data: [
				{ user_id: 1, rpm_override: null },
				{ user_id: 2, user_email: 'u@example.test', rpm_override: 60 }
			]
		});
		await expect(listGroupRPMOverrides(3)).resolves.toEqual([
			{
				rpm_override: 60,
				user_email: 'u@example.test',
				user_id: 2,
				user_name: undefined,
				user_notes: undefined,
				user_status: undefined
			}
		]);
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/groups/3/rate-multipliers');

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { message: 'ok' } });
		await batchSetGroupRPMOverrides(3, [{ user_id: 2, rpm_override: 60 }]);
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/groups/3/rpm-overrides', {
			entries: [{ user_id: 2, rpm_override: 60 }]
		});
	});

		it('adds proxy parity endpoints for quality, batch ops, and import/export', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { id: 9, name: 'proxy' } });
		await expect(getProxy(9)).resolves.toEqual({ id: 9, name: 'proxy' });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/proxies/9');

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 10, name: 'new-proxy' } });
		await expect(
			createProxy({ name: 'new-proxy', protocol: 'socks5h', host: '127.0.0.1', port: 1080 })
		).resolves.toEqual({ id: 10, name: 'new-proxy' });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/proxies', {
			host: '127.0.0.1',
			name: 'new-proxy',
			port: 1080,
			protocol: 'socks5h'
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { success: true, score: 98 } });
		await expect(checkProxyQuality(9)).resolves.toEqual({ success: true, score: 98 });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/proxies/9/quality-check', {});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { created: 1, skipped: 0 } });
		await expect(
			batchCreateProxies([{ protocol: 'http', host: '192.0.2.1', port: 8080 }])
		).resolves.toEqual({ created: 1, skipped: 0 });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/proxies/batch', {
			proxies: [{ protocol: 'http', host: '192.0.2.1', port: 8080 }]
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { deleted_ids: [9], skipped: [] } });
		await expect(batchDeleteProxies([9])).resolves.toEqual({ deleted_ids: [9], skipped: [] });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/proxies/batch-delete', { ids: [9] });

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { proxies: [] } });
		await expect(exportProxyData({ filters: { protocol: 'socks5h', status: 'active', search: 'edge', sort_order: 'desc' } })).resolves.toEqual({
			proxies: []
		});
			expect(mockedApi.get).toHaveBeenCalledWith(
				'/api/v1/admin/proxies/data?protocol=socks5h&status=active&search=edge&sort_order=desc'
			);

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { proxy_created: 1, proxy_failed: 0 } });
		await expect(importProxyData({ data: { proxies: [{ id: 9 }] } })).resolves.toEqual({
			proxy_created: 1,
			proxy_failed: 0
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/proxies/data', {
			data: { proxies: [{ id: 9 }] }
		});
		});

		it('covers account audit leftovers for mixed-channel, CRS, Codex import, and OAuth helpers', async () => {
			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { has_risk: false } });
			await expect(checkMixedChannelRisk({ group_ids: [1] })).resolves.toEqual({ has_risk: false });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/check-mixed-channel', {
				group_ids: [1]
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { items: [] } });
			await expect(importCodexSession({ content: '{}' })).resolves.toEqual({ items: [] });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/import/codex-session', {
				content: '{}'
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { new_accounts: [] } });
			await expect(
				previewSyncFromCRS({ base_url: 'https://crs.example', username: 'admin', password: 'pw' })
			).resolves.toEqual({ new_accounts: [] });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/sync/crs/preview', {
				base_url: 'https://crs.example',
				password: 'pw',
				username: 'admin'
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { created: 1 } });
			await expect(
				syncFromCRS({ base_url: 'https://crs.example', username: 'admin', password: 'pw', sync_proxies: true })
			).resolves.toEqual({ created: 1 });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/sync/crs', {
				base_url: 'https://crs.example',
				password: 'pw',
				sync_proxies: true,
				username: 'admin'
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { url: 'https://auth.example' } });
			await expect(generateAuthUrl({ redirect_uri: 'https://app.example/cb' })).resolves.toEqual({
				url: 'https://auth.example'
			});
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/generate-auth-url', {
				redirect_uri: 'https://app.example/cb'
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { access_token: 'tok' } });
			await expect(exchangeCode({ code: 'abc' })).resolves.toEqual({ access_token: 'tok' });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/accounts/exchange-code', { code: 'abc' });

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { auth_url: 'https://openai.example/start' } });
			await expect(generateOpenAIAuthUrl({ proxy_id: 9 })).resolves.toEqual({
				auth_url: 'https://openai.example/start'
			});
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/openai/generate-auth-url', { proxy_id: 9 });

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { access_token: 'openai-token' } });
			await expect(exchangeOpenAICode({ code: 'oa-code', session_id: 'sess', state: 'state' })).resolves.toEqual({
				access_token: 'openai-token'
			});
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/openai/exchange-code', {
				code: 'oa-code',
				session_id: 'sess',
				state: 'state'
			});

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { access_token: 'refreshed' } });
			await expect(refreshOpenAIToken({ refresh_token: 'rt' })).resolves.toEqual({ access_token: 'refreshed' });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/openai/refresh-token', { refresh_token: 'rt' });
		});

		it('covers channel facade parity while pages remain read-only', async () => {
			mockedApi.get.mockResolvedValueOnce({ code: 0, data: { id: 5, name: 'main' } });
			await expect(getChannel(5)).resolves.toEqual({ id: 5, name: 'main' });
			expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/channels/5');

			mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 6, name: 'new' } });
			await expect(createChannel({ name: 'new' })).resolves.toEqual({ id: 6, name: 'new' });
			expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/channels', { name: 'new' });

			mockedApi.put.mockResolvedValueOnce({ code: 0, data: { id: 6, status: 'inactive' } });
			await expect(updateChannel(6, { status: 'inactive' })).resolves.toEqual({ id: 6, status: 'inactive' });
			expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/channels/6', { status: 'inactive' });

			mockedApi.delete.mockResolvedValueOnce({ code: 0, data: null });
			await deleteChannel(6);
			expect(mockedApi.delete).toHaveBeenCalledWith('/api/v1/admin/channels/6');

			mockedApi.get.mockResolvedValueOnce({ code: 0, data: { found: true, input_price: 1 } });
			await expect(getModelDefaultPricing('gpt-4.1')).resolves.toEqual({ found: true, input_price: 1 });
			expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/channels/model-pricing?model=gpt-4.1');

			mockedApi.get.mockResolvedValueOnce({ code: 0, data: { models: ['gpt-4.1'] } });
			await expect(syncPricingModels('openai')).resolves.toEqual({ models: ['gpt-4.1'] });
			expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/channels/pricing/sync-models?platform=openai');
		});
	});
