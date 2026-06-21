import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { DashboardSnapshot } from '$lib/api/admin/dashboard';
import { buildKpis, topGroups, topModels, topUsers } from './dashboard';

const mockSnapshot = vi.fn();

vi.mock('$lib/api/admin/dashboard', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/api/admin/dashboard')>('$lib/api/admin/dashboard');
	return {
		...actual,
		getDashboardSnapshot: (...args: unknown[]) => mockSnapshot(...args)
	};
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeSnapshot(): DashboardSnapshot {
	return {
		stats: {
			total_api_keys: 12,
			active_api_keys: 10,
			total_accounts: 8,
			normal_accounts: 7,
			error_accounts: 1,
			today_requests: 1234,
			total_requests: 98765,
			total_users: 77,
			today_new_users: 3,
			today_tokens: 456789,
			total_tokens: 9876543,
			today_actual_cost: 1.2345,
			total_actual_cost: 55.5,
			rpm: 22,
			tpm: 333,
			average_duration_ms: 1250,
			active_users: 5
		},
		trend: [
			{ date: '2026-06-17', requests: 10, tokens: 100, actual_cost: 0.1 },
			{ date: '2026-06-18', requests: 20, tokens: 200, actual_cost: 0.2 }
		],
		models: [
			{ model: 'cheap', requests: 10, tokens: 100, actual_cost: 0.1 },
			{ model: 'expensive', requests: 5, tokens: 50, actual_cost: 9 }
		],
		groups: [
			{ group_name: 'low', requests: 3, tokens: 30, actual_cost: 0.3 },
			{ group_name: 'high', requests: 40, tokens: 400, actual_cost: 4 }
		],
		users_trend: [
			{ user_email: 'a@example.com', requests: 1, tokens: 10, actual_cost: 0.1 },
			{ user_email: 'b@example.com', requests: 2, tokens: 20, actual_cost: 2 }
		]
	};
}

describe('admin dashboard helpers', () => {
	it('builds KPI cards and ranks model/group/user tables', () => {
		const snapshot = fakeSnapshot();
		const kpis = buildKpis(snapshot.stats!);
		expect(kpis).toHaveLength(8);
		expect(kpis[0]).toMatchObject({ key: 'api-keys', value: '12', sub: '10 active' });
		expect(topModels(snapshot)[0].model).toBe('expensive');
		expect(topGroups(snapshot)[0].group_name).toBe('high');
		expect(topUsers(snapshot)[0].user_email).toBe('b@example.com');
	});
});

describe('admin dashboard page', () => {
	beforeEach(() => {
		mockSnapshot.mockReset();
		mockSnapshot.mockResolvedValue(fakeSnapshot());
	});

	it('loads snapshot-v2 and renders kpis plus ranking tables', async () => {
		const pageMod = await import('../../../routes/admin/dashboard/+page.svelte');
		const { container } = render(pageMod.default);

		await waitFor(() => {
			expect(mockSnapshot).toHaveBeenCalledWith({ granularity: 'day' });
			expect(container.querySelectorAll('[data-testid="dashboard-kpi"]').length).toBe(8);
			expect(container.querySelectorAll('[data-testid="chart-island"]').length).toBeGreaterThanOrEqual(1);
			expect(container.querySelectorAll('[data-testid="dashboard-group-row"]').length).toBe(2);
			expect(container.querySelectorAll('[data-testid="dashboard-user-row"]').length).toBe(2);
		});

		expect(container.querySelector('[data-testid="admin-dashboard-page"]')).not.toBeNull();
	});
});
