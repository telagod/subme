import { describe, expect, it } from 'vitest';
import usersApiSrc from '$lib/api/admin/users.ts?raw';
import usersPageSrc from '../../../routes/admin/users/+page.svelte?raw';
import detailDrawerSrc from './UserDetailDrawer.svelte?raw';
import overviewTabSrc from './UserOverviewTab.svelte?raw';
import subsTabSrc from './UserSubscriptionsTab.svelte?raw';
import keysTabSrc from './UserKeysTab.svelte?raw';
import ordersTabSrc from './UserOrdersTab.svelte?raw';
import usageTabSrc from './UserUsageTab.svelte?raw';
import riskTabSrc from './UserRiskTab.svelte?raw';
import {
	formatMoney,
	roleTone,
	statusTone,
	summarizeUsers,
	userDisplayName,
	userGroups,
	userInitial
} from './users';
import type { AdminUser } from '$lib/api/admin/users';

describe('admin users helpers', () => {
	const users: AdminUser[] = [
		{
			id: 1,
			email: 'root@example.com',
			username: 'root',
			role: 'admin',
			status: 'active',
			balance: 12.345,
			groups: [{ id: 10, name: 'vip' }]
		},
		{
			id: 2,
			email: 'alice@example.com',
			role: 'user',
			status: 'disabled',
			balance: 3,
			allowed_groups: [20, 21]
		}
	];

	it('summarizes list state and formats display values', () => {
		expect(summarizeUsers(users)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Admins', value: 1 },
			{ label: 'Balance', value: 15.35 }
		]);
		expect(userDisplayName(users[0])).toBe('root');
		expect(userInitial(users[1])).toBe('A');
		expect(userGroups(users[0])).toBe('vip');
		expect(userGroups(users[1])).toBe('#20, #21');
		expect(formatMoney(1.2)).toBe('$1.20');
		expect(statusTone('active')).toContain('emerald');
		expect(roleTone('admin')).toContain('primary');
	});

	it('keeps the admin users surface on the existing users API contract', () => {
		expect(usersApiSrc).toContain("const USERS_BASE = '/api/v1/admin/users'");
		expect(usersApiSrc).toContain('toggleUserStatus');
		expect(usersApiSrc).toContain('getUserUsage');
		expect(usersApiSrc).toContain('getUserAPIKeys');
		expect(usersApiSrc).toContain('getBalanceHistory');
		expect(usersApiSrc).not.toContain("const USERS_BASE = '/admin/users'");
		expect(usersApiSrc).not.toContain("'/api/admin/users'");
		expect(usersApiSrc).not.toContain('"/api/admin/users"');
		expect(usersPageSrc).toContain('data-testid="admin-users-row"');
		expect(usersPageSrc).toMatch(/VirtualTable|<table/);
	});
});

describe('admin user detail drawer', () => {
	it('imports all 6 tab components', () => {
		expect(detailDrawerSrc).toContain('UserOverviewTab');
		expect(detailDrawerSrc).toContain('UserSubscriptionsTab');
		expect(detailDrawerSrc).toContain('UserKeysTab');
		expect(detailDrawerSrc).toContain('UserOrdersTab');
		expect(detailDrawerSrc).toContain('UserUsageTab');
		expect(detailDrawerSrc).toContain('UserRiskTab');
	});

	it('uses StandardDrawer with wide layout', () => {
		expect(detailDrawerSrc).toContain('StandardDrawer');
		expect(detailDrawerSrc).toContain('width="lg"');
		expect(detailDrawerSrc).toContain('data-testid="user-detail-drawer"');
	});

	it('has balance-adjust button and dialog', () => {
		expect(detailDrawerSrc).toContain('BalanceAdjustDialog');
		expect(detailDrawerSrc).toContain('adjustBalance');
	});

	it('has KPI bar with month cost', () => {
		expect(detailDrawerSrc).toContain('kpiBalance');
		expect(detailDrawerSrc).toContain('kpiMonthCost');
		expect(detailDrawerSrc).toContain('kpiSubscription');
	});

	it('shows username in header when available', () => {
		expect(detailDrawerSrc).toContain('user.username');
	});

	it('has tab navigation with role=tablist', () => {
		expect(detailDrawerSrc).toContain('role="tablist"');
		expect(detailDrawerSrc).toContain('role="tab"');
		expect(detailDrawerSrc).toContain('role="tabpanel"');
	});

	it('has status toggle and enable/disable in footer', () => {
		expect(detailDrawerSrc).toContain('handleToggleStatus');
		expect(detailDrawerSrc).toContain("variant={user.status === 'active' ? 'destructive' : 'default'}");
	});
});

describe('user detail tab source parity', () => {
	it('overview tab has 4 KPI cards and info rows', () => {
		expect(overviewTabSrc).toContain('kpiRequests');
		expect(overviewTabSrc).toContain('kpiMonthCost');
		expect(overviewTabSrc).toContain('kpiTokens');
		expect(overviewTabSrc).toContain('kpiConcurrency');
		expect(overviewTabSrc).toContain('infoId');
		expect(overviewTabSrc).toContain('infoEmail');
		expect(overviewTabSrc).toContain('infoRegistered');
	});

	it('subscriptions tab shows plan name and cost breakdown', () => {
		expect(subsTabSrc).toContain('plan_name');
		expect(subsTabSrc).toContain('mtd_cost');
		expect(subsTabSrc).toContain('price_paid');
		expect(subsTabSrc).toContain('statusLabel');
	});

	it('keys tab masks key values and shows quota', () => {
		expect(keysTabSrc).toContain('mask(key.key)');
		expect(keysTabSrc).toContain('key.quota');
		expect(keysTabSrc).toContain('key.quota_used');
	});

	it('orders tab shows order type and amount formatting', () => {
		expect(ordersTabSrc).toContain('order_type');
		expect(ordersTabSrc).toContain('fmtAmount');
		expect(ordersTabSrc).toContain('statusTone');
	});

	it('usage tab has stats cards and model table', () => {
		expect(usageTabSrc).toContain('usageRequests');
		expect(usageTabSrc).toContain('usageCost');
		expect(usageTabSrc).toContain('usageTokens');
		expect(usageTabSrc).toContain('row.model');
	});

	it('risk tab filters by user_id and shows badges', () => {
		expect(riskTabSrc).toContain('l.user_id === user.id');
		expect(riskTabSrc).toContain('riskFlagged');
		expect(riskTabSrc).toContain('riskBanned');
		expect(riskTabSrc).toContain('riskPassed');
	});

	it('all tabs use lazy-load pattern with active guard', () => {
		for (const src of [subsTabSrc, keysTabSrc, ordersTabSrc, usageTabSrc, riskTabSrc]) {
			expect(src).toContain('if (active');
			expect(src).toContain('loaded');
		}
	});

	it('all tabs use $_() for i18n strings', () => {
		for (const src of [detailDrawerSrc, overviewTabSrc, subsTabSrc, keysTabSrc, ordersTabSrc, usageTabSrc, riskTabSrc]) {
			expect(src).toContain("$_('admin.users.");
		}
	});
});
