/**
 * /(admin)/monetization/subscriptions · vitest 覆盖（M22）
 *
 * 覆盖点：
 *   1. Subscriptions list mock 10 行 → 渲染 admin-subs-row 数 = 10
 *   2. Status filter Select 使用 '__all__' 哨兵 + DOM 不含 <option value="">
 *   3. Row click → SubscriptionDetailDrawer 打开 + getAdminSub 被调用（detail fetch）
 *   4. Revoke 确认面板 → revokeSub(id) API 被调用（DELETE /admin/subscriptions/:id，无 reason）
 *   5. 红线 grep：subscription surface 不出现 billing_service / channels/model-pricing / GetModelPricing
 *
 * 注：subscription 后端无 refund/cancel/audit-log 端点（只有 assign/extend/reset-quota/revoke）；
 *    旧的 refundSub/forceCancelSub/getAuditLog/RefundDialog 已在 B0 止血批次删除。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/subscriptions' / '$lib/api/admin/plans'
 *   - 各 describe 在 beforeEach 重置 mock + 重新 import page 模块
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// 红线 grep：?raw 把源码字符串带进测试
import pageSrc from '../../../../routes/admin/monetization/subscriptions/+page.svelte?raw';
import drawerSrc from '$lib/features/monetization/subscriptions-admin/SubscriptionDetailDrawer.svelte?raw';
import apiSrc from '$lib/api/admin/subscriptions.ts?raw';

import type { AdminSubscription } from '$lib/api/admin/subscriptions';

vi.mock('$lib/api/admin/subscriptions', () => {
	return {
		listAdminSubs: vi.fn(),
		getAdminSub: vi.fn(),
		revokeSub: vi.fn(),
		extendSub: vi.fn(),
		resetQuotaSub: vi.fn(),
		adminSubscriptionsApi: {
			listAdminSubs: vi.fn(),
			getAdminSub: vi.fn(),
			revokeSub: vi.fn(),
			extendSub: vi.fn(),
			resetQuotaSub: vi.fn()
		}
	};
});

vi.mock('$lib/api/admin/plans', () => {
	return {
		listPlans: vi.fn().mockResolvedValue([]),
		listGroups: vi.fn().mockResolvedValue([])
	};
});

vi.mock('$lib/stores/toast.svelte', async () => {
	return {
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		dismiss: vi.fn(),
		toasts: { list: [] }
	};
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeSub(over: Partial<AdminSubscription> = {}): AdminSubscription {
	return {
		id: 1,
		user_id: 1001,
		user_email: 'alice@example.com',
		plan_id: 11,
		plan_name: 'Pro',
		group_id: 5,
		group_name: 'VIP',
		platform: 'anthropic',
		status: 'active',
		started_at: '2026-05-01T00:00:00Z',
		expires_at: '2026-07-01T00:00:00Z',
		cancelled_at: null,
		mtd_cost: 12.5,
		price_paid: 29.99,
		currency: 'USD',
		remaining_value: 15,
		...over
	};
}

function fakeListResponse(n: number) {
	const data: AdminSubscription[] = Array.from({ length: n }, (_, i) =>
		fakeSub({
			id: 100 + i,
			user_id: 1000 + i,
			user_email: `u${i}@example.com`,
			plan_name: i % 2 === 0 ? 'Pro' : 'Starter'
		})
	);
	return { data, total: n, page: 1, page_size: 20 };
}

// ─────────────────────────────────────────────────────────────────
// Test 1 · list renders 10 rows
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · list rendering', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/admin/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时；给到 30s
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(10));

		pageMod = await import(
			'../../../../routes/admin/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('renders 10 mock rows', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminSubs).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBe(10);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 2 · status filter sentinel
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · status filter sentinel', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/admin/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(5));

		pageMod = await import(
			'../../../../routes/admin/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('status filter uses __all__ sentinel; no empty-string option', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminSubs).toHaveBeenCalled());

		const sentinelOpt = container.querySelector(
			'[data-testid="admin-subs-status-filter"] option[value="__all__"]'
		);
		expect(sentinelOpt).not.toBeNull();

		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 3 · row click → drawer open + audit log fetched
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · detail drawer wiring', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/admin/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(3));
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockImplementation(async (id) =>
			fakeSub({ id })
		);

		pageMod = await import(
			'../../../../routes/admin/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('row click opens drawer and fetches detail', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-subs-row"]'
		) as HTMLElement;
		const subId = firstRow.getAttribute('data-sub-id');
		expect(subId).toBeTruthy();

		await fireEvent.click(firstRow);

		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="sub-detail-drawer"]');
			expect(drawer).not.toBeNull();
		});

		await waitFor(() => {
			expect(api.getAdminSub).toHaveBeenCalled();
		});
	});

	it('SubscriptionDetailDrawer uses StandardDrawer instead of a hand-rolled bits overlay', () => {
		expect(drawerSrc).toContain('StandardDrawer');
		expect(drawerSrc).toContain('data-testid="sub-detail-drawer"');
		expect(drawerSrc).not.toContain('Dialog.Overlay');
		expect(drawerSrc).not.toContain('fixed inset-0');
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 4 · revoke confirm → revokeSub(id) (DELETE /admin/subscriptions/:id)
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · revoke', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/admin/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockReset();
		(api.revokeSub as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(2));
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockImplementation(async (id) =>
			fakeSub({ id })
		);
		(api.revokeSub as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		pageMod = await import(
			'../../../../routes/admin/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('revoke confirm panel calls revokeSub with the subscription id', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-subs-row"]'
		) as HTMLElement;
		await fireEvent.click(firstRow);

		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="sub-detail-drawer"]');
			expect(drawer).not.toBeNull();
		});
		await waitFor(() => {
			expect(api.getAdminSub).toHaveBeenCalled();
		});

		// 打开 revoke 确认面板（无 reason —— DELETE 不带 body）
		await waitFor(() => {
			const cancelBtn = document.body.querySelector(
				'[data-testid="sub-detail-cancel-btn"]'
			) as HTMLButtonElement;
			expect(cancelBtn).not.toBeNull();
		});
		const cancelBtn = document.body.querySelector(
			'[data-testid="sub-detail-cancel-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(cancelBtn);

		await waitFor(() => {
			const panel = document.body.querySelector('[data-testid="sub-detail-cancel-panel"]');
			expect(panel).not.toBeNull();
		});

		const confirmBtn = document.body.querySelector(
			'[data-testid="sub-detail-cancel-confirm"]'
		) as HTMLButtonElement;
		expect(confirmBtn).not.toBeNull();
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.revokeSub).toHaveBeenCalled();
			const [id] = (api.revokeSub as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(id).toBeTruthy();
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 5 · RED LINE grep
// ─────────────────────────────────────────────────────────────────

describe('RED LINE · admin subscriptions surface must not reference billing core', () => {
	it('no source file under subscriptions surface references forbidden strings', () => {
		const sources: Array<[string, string]> = [
			['subscriptions/+page.svelte', pageSrc as unknown as string],
			['SubscriptionDetailDrawer.svelte', drawerSrc as unknown as string],
			['api/admin/subscriptions.ts', apiSrc as unknown as string]
		];
		const forbidden = [
			'billing_service',
			'/admin/channels/model-pricing',
			'GetModelPricing'
		];
		for (const [label, src] of sources) {
			for (const needle of forbidden) {
				expect(
					src.includes(needle),
					`${label} contains forbidden string "${needle}"`
				).toBe(false);
			}
		}
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 6 · CONTRACT GUARD — no call targets an unregistered route
// ─────────────────────────────────────────────────────────────────

describe('CONTRACT GUARD · admin subscriptions API only targets registered backend routes', () => {
	/**
	 * Exhaustive allowlist of admin subscription routes from
	 * backend/internal/server/routes/admin.go:517-535.
	 *
	 * Every API helper in $lib/api/admin/subscriptions.ts MUST hit one of
	 * these and nothing else. If the backend adds a new route, add it here
	 * first — forcing a deliberate opt-in rather than silent 404s.
	 */
	const REGISTERED_ROUTE_PATTERNS: RegExp[] = [
		// GET  /admin/subscriptions           — List
		/^\/api\/v1\/admin\/subscriptions(\?.*)?$/,
		// GET  /admin/subscriptions/:id       — GetByID
		/^\/api\/v1\/admin\/subscriptions\/\d+$/,
		// GET  /admin/subscriptions/:id/progress — GetProgress
		/^\/api\/v1\/admin\/subscriptions\/\d+\/progress$/,
		// POST /admin/subscriptions/assign    — Assign
		/^\/api\/v1\/admin\/subscriptions\/assign$/,
		// POST /admin/subscriptions/bulk-assign — BulkAssign
		/^\/api\/v1\/admin\/subscriptions\/bulk-assign$/,
		// POST /admin/subscriptions/:id/extend — Extend
		/^\/api\/v1\/admin\/subscriptions\/\d+\/extend$/,
		// POST /admin/subscriptions/:id/reset-quota — ResetQuota
		/^\/api\/v1\/admin\/subscriptions\/\d+\/reset-quota$/,
		// DELETE /admin/subscriptions/:id     — Revoke
		/^\/api\/v1\/admin\/subscriptions\/\d+$/,
		// GET  /admin/groups/:id/subscriptions — ListByGroup
		/^\/api\/v1\/admin\/groups\/\d+\/subscriptions(\?.*)?$/,
		// GET  /admin/users/:id/subscriptions  — ListByUser
		/^\/api\/v1\/admin\/users\/\d+\/subscriptions(\?.*)?$/
	];

	function isRegistered(path: string): boolean {
		return REGISTERED_ROUTE_PATTERNS.some((re) => re.test(path));
	}

	it('API source only contains paths that match registered routes', () => {
		// Extract all URL path literals from the API source code.
		// Matches strings like '/api/v1/admin/subscriptions...' and template parts.
		const pathLiterals = (apiSrc as unknown as string).match(
			/['"`]\/api\/v1\/admin\/[^'"`$]+['"`]/g
		) ?? [];

		// Also extract template literal path prefixes (before ${...})
		const templateParts = (apiSrc as unknown as string).match(
			/`\/api\/v1\/admin\/[^`]*`/g
		) ?? [];

		// Combine and deduplicate, stripping quotes
		const allPaths = [...new Set([...pathLiterals, ...templateParts])]
			.map(p => p.replace(/^['"`]|['"`]$/g, ''));

		expect(allPaths.length).toBeGreaterThan(0);

		// For template literals with ${...}, replace interpolation with a sample numeric id
		for (const raw of allPaths) {
			const concrete = raw.replace(/\$\{[^}]+\}/g, '42');
			expect(
				isRegistered(concrete),
				`API source contains path targeting unregistered route: ${raw} (resolved: ${concrete})`
			).toBe(true);
		}
	});

	it('explicitly rejects phantom routes that previously caused 404s', () => {
		const phantomRoutes = [
			'/api/v1/admin/subscriptions/1/cancel',
			'/api/v1/admin/subscriptions/1/refund',
			'/api/v1/admin/subscriptions/1/audit-log'
		];
		for (const route of phantomRoutes) {
			expect(
				isRegistered(route),
				`Phantom route "${route}" should NOT match any registered pattern`
			).toBe(false);
		}
	});
});
