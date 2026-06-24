import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import apiSrc from '$lib/api/user/redeem.ts?raw';
import pageSrc from '../../../routes/(user)/redeem/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	formatHistoryValue,
	formatMoney,
	formatResultDetail,
	historyTitleKey,
	isAdminAdjustment,
	isBalanceType,
	isSubscriptionType
} from './redeem';
import type { RedeemHistoryItem } from '$lib/api/user/redeem';

vi.mock('$lib/api/user/redeem', () => ({
	getRedeemHistory: vi.fn(),
	redeemCode: vi.fn(),
	userRedeemApi: {}
}));

const refreshUser = vi.fn();

vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		get user() {
			return { id: 1, email: 'demo@example.com', balance: 42.5, concurrency: 7 };
		},
		refreshUser
	}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

beforeAll(async () => {
	addMessages('en', {
		common: { refresh: 'Refresh', unknown: 'Unknown' },
		redeem: {
			title: 'Redeem Code',
			description: 'Enter a code',
			currentBalance: 'Current Balance',
			concurrency: 'Concurrency',
			requests: 'requests',
			redeemCodeLabel: 'Redeem Code',
			redeemCodePlaceholder: 'Enter code',
			redeemCodeHint: 'Case-sensitive',
			redeeming: 'Redeeming...',
			redeemButton: 'Redeem Code',
			redeemSuccess: 'Code Redeemed Successfully!',
			redeemFailed: 'Redemption Failed',
			newBalance: 'New Balance',
			newConcurrency: 'New Concurrency',
			recentActivity: 'Recent Activity',
			historyWillAppear: 'History appears here',
			balanceAddedRedeem: 'Balance Added',
			balanceAddedAdmin: 'Balance Added Admin',
			balanceDeductedAdmin: 'Balance Deducted Admin',
			concurrencyAddedRedeem: 'Concurrency Added',
			concurrencyAddedAdmin: 'Concurrency Added Admin',
			concurrencyReducedAdmin: 'Concurrency Reduced Admin',
			subscriptionAssigned: 'Subscription Assigned',
			adminAdjustment: 'Admin Adjustment',
			codeRedeemSuccess: 'Code redeemed successfully!',
			failedToRedeem: 'Failed',
			pleaseEnterCode: 'Please enter a redeem code'
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('user redeem helpers', () => {
	it('formats balance, concurrency, and subscription history rows', () => {
		const balance: RedeemHistoryItem = {
			id: 1,
			code: 'BAL',
			type: 'balance',
			value: 12.5,
			status: 'used',
			used_at: '2026-01-01T00:00:00Z',
			created_at: '2026-01-01T00:00:00Z'
		};
		const sub: RedeemHistoryItem = {
			...balance,
			id: 2,
			type: 'subscription',
			value: 30,
			validity_days: 30,
			group: { id: 1, name: 'Pro' }
		};
		expect(isBalanceType(balance.type)).toBe(true);
		expect(isSubscriptionType(sub.type)).toBe(true);
		expect(isAdminAdjustment('admin_concurrency')).toBe(true);
		expect(formatMoney(12.5)).toBe('$12.50');
		expect(formatHistoryValue(balance)).toBe('+$12.50');
		expect(formatHistoryValue(sub)).toBe('30 days - Pro');
		expect(historyTitleKey(balance)).toBe('redeem.balanceAddedRedeem');
	});

	it('keeps page and API wired to Vue redeem contract', () => {
		expect(apiSrc).toContain('/api/v1/redeem');
		expect(apiSrc).toContain('/api/v1/redeem/history');
		expect(pageSrc).toContain('data-testid="redeem-page"');
		expect(pageSrc).toContain('data-testid="redeem-history-row"');
		expect(pageSrc).toContain('auth.refreshUser()');
		expect(rerouteSrc).not.toContain("'/redeem'");
		expect(formatResultDetail({ message: 'ok', type: 'subscription', value: 30, group_name: 'Pro', validity_days: 30 })).toBe('Pro · 30 days');
	});
});

describe('user redeem page', () => {
	let api: typeof import('$lib/api/user/redeem');
	let pageMod: typeof import('../../../routes/(user)/redeem/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/redeem');
		(api.getRedeemHistory as ReturnType<typeof vi.fn>).mockReset();
		(api.redeemCode as ReturnType<typeof vi.fn>).mockReset();
		refreshUser.mockReset();
		(api.getRedeemHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
			{
				id: 1,
				code: 'BALANCE-CODE',
				type: 'balance',
				value: 10,
				status: 'used',
				used_at: '2026-01-01T00:00:00Z',
				created_at: '2026-01-01T00:00:00Z'
			}
		]);
		(api.redeemCode as ReturnType<typeof vi.fn>).mockResolvedValue({
			message: 'ok',
			type: 'balance',
			value: 10,
			new_balance: 52.5
		});
		refreshUser.mockResolvedValue(undefined);
		pageMod = await import('../../../routes/(user)/redeem/+page.svelte');
	});

	it('renders current balance, concurrency, and history', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getRedeemHistory).toHaveBeenCalled());
		expect(container.querySelector('[data-testid="redeem-balance-value"]')?.textContent).toContain('$42.50');
		expect(container.querySelector('[data-testid="redeem-concurrency-value"]')?.textContent).toContain('7');
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="redeem-history-row"]').length).toBe(1);
		});
	});

	it('submits a code, refreshes user, and shows success', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getRedeemHistory).toHaveBeenCalled());
		const input = container.querySelector('[data-testid="redeem-code-input"]') as HTMLInputElement;
		const button = container.querySelector('[data-testid="redeem-submit"]') as HTMLButtonElement;
		await fireEvent.input(input, { target: { value: 'PROMO-1' } });
		await fireEvent.click(button);
		await waitFor(() => expect(api.redeemCode).toHaveBeenCalledWith('PROMO-1'));
		await waitFor(() => expect(refreshUser).toHaveBeenCalled());
		await waitFor(() => expect(container.querySelector('[data-testid="redeem-success"]')).not.toBeNull());
	});
});
