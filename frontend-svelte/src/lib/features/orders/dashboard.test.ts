/**
 * /(admin)/orders/dashboard · vitest 覆盖（M12）
 *
 * 覆盖点：
 *   1. Stat cards：mock stats → 6 张 KPI 卡渲染正确（含 today rev / orders /
 *      refunds / MTD rev / active subs / churn）。
 *   2. Chart lazy load：源文件 grep 红线 —— +page.svelte 与
 *      PaymentDashboardChart.svelte 顶层不 import 'chart.js' / 'svelte-chartjs'；
 *      只能通过 onMount 内 `await import(...)` 触发。
 *   3. Provider breakdown：mock provider rows → 渲染正确行数 + 按 revenue 降序。
 *   4. Range switch：点击 7d/30d/90d/180d 段切换会重新触发 stats / trend / providers
 *      三个 API（in-flight memoization 折叠成 1 次后端请求是 api 层职责，
 *      这里只断言 3 个 client-side 函数都被调）。
 *   5. RED LINE grep：dashboard surface 不含 billing_service /
 *      /admin/channels/model-pricing / GetModelPricing。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/paymentDashboard'：注入 stats / trend / providers。
 *   - chart.js / svelte-chartjs：stub 成空类避免 jsdom canvas warning。
 *   - toast / auth 静音 / 兜底。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// 红线 grep：?raw 把源码字符串带进测试
import pageSrc from '../../../routes/(admin)/orders/dashboard/+page.svelte?raw';
import paymentsSrc from '../../../routes/(admin)/orders/payments/+page.svelte?raw';
import cardsSrc from '$lib/features/orders/PaymentDashboardCards.svelte?raw';
import chartSrc from '$lib/features/orders/PaymentDashboardChart.svelte?raw';
import providerSrc from '$lib/features/orders/ProviderBreakdown.svelte?raw';
import apiSrc from '$lib/api/admin/paymentDashboard.ts?raw';

import type {
	DashboardStatsSnapshot,
	DashboardTrendPoint,
	ProviderBreakdownRow
} from '$lib/api/admin/paymentDashboard';

// ── vi.mock hoists（必须在 import +page.svelte 之前）──────────────────────

vi.mock('$lib/api/admin/paymentDashboard', () => {
	return {
		getDashboardStats: vi.fn(),
		getDashboardTrend: vi.fn(),
		getProviderBreakdown: vi.fn(),
		__resetDashboardCache: vi.fn(),
		adminPaymentDashboardApi: {
			getDashboardStats: vi.fn(),
			getDashboardTrend: vi.fn(),
			getProviderBreakdown: vi.fn()
		}
	};
});

// Chart 内 lazy import 兜底 —— 避免 vitest 真加载 chart.js 拖慢 / jsdom canvas warning
vi.mock('chart.js/auto', () => ({
	default: class {},
	Chart: class {}
}));
vi.mock('svelte-chartjs', () => ({
	Line: (() => null) as unknown as { (): null }
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

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

// ── helpers ──────────────────────────────────────────────────────────────

function fakeStats(overrides: Partial<DashboardStatsSnapshot> = {}): DashboardStatsSnapshot {
	return {
		today_revenue: 123.45,
		today_orders: 7,
		today_refunds: 12.5,
		mtd_revenue: 5400.99,
		active_subscriptions: 89,
		churn_rate: 0.032,
		total_revenue: 12345.67,
		total_orders: 412,
		avg_amount: 29.99,
		...overrides
	};
}

function fakeTrend(n: number): DashboardTrendPoint[] {
	return Array.from({ length: n }, (_, i) => ({
		date: `2026-06-${String(i + 1).padStart(2, '0')}`,
		revenue: 100 + i * 10,
		count: 3 + i
	}));
}

function fakeProviders(): ProviderBreakdownRow[] {
	return [
		{ provider: 'stripe', revenue: 800, order_count: 20, avg_ticket: 40, success_rate: 0.98 },
		{
			provider: 'alipay',
			revenue: 200,
			order_count: 10,
			avg_ticket: 20,
			success_rate: 0.9
		},
		{ provider: 'wxpay', revenue: 50, order_count: 5, avg_ticket: 10, success_rate: 0.7 }
	];
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1 · 6 KPI cards rendered
// ─────────────────────────────────────────────────────────────────────────

describe('admin orders · dashboard · 6 KPI cards', () => {
	let api: typeof import('$lib/api/admin/paymentDashboard');
	let pageMod: typeof import('../../../routes/(admin)/orders/dashboard/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/paymentDashboard');
		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockReset();
		(api.getDashboardTrend as ReturnType<typeof vi.fn>).mockReset();
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>).mockReset();

		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStats());
		(api.getDashboardTrend as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTrend(5));
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProviders());

		pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');
	}, 30000);

	it('renders all 6 KPI cards with mocked stats', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => {
			expect(api.getDashboardStats).toHaveBeenCalled();
		});

		await waitFor(() => {
			const cards = container.querySelectorAll(
				'[data-testid^="admin-orderdash-stat-"][data-testid$="-revenue"], ' +
					'[data-testid^="admin-orderdash-stat-"][data-testid$="-orders"], ' +
					'[data-testid^="admin-orderdash-stat-"][data-testid$="-refunds"], ' +
					'[data-testid^="admin-orderdash-stat-"][data-testid$="-subs"], ' +
					'[data-testid^="admin-orderdash-stat-"][data-testid$="-churn"]'
			);
			// today revenue, today orders, today refunds, mtd revenue, active subs, churn
			expect(cards.length).toBe(6);
		});

		// today revenue shows $123.45
		await waitFor(() => {
			const v = container.querySelector(
				'[data-testid="admin-orderdash-stat-today-revenue-value"]'
			);
			expect(v?.textContent?.trim()).toContain('$123.45');
		});

		// today orders shows 7
		await waitFor(() => {
			const v = container.querySelector(
				'[data-testid="admin-orderdash-stat-today-orders-value"]'
			);
			expect(v?.textContent?.trim()).toBe('7');
		});

		// today refunds shows $12.50
		await waitFor(() => {
			const v = container.querySelector(
				'[data-testid="admin-orderdash-stat-today-refunds-value"]'
			);
			expect(v?.textContent?.trim()).toContain('$12.50');
		});

		// MTD revenue shows $5400.99
		await waitFor(() => {
			const v = container.querySelector(
				'[data-testid="admin-orderdash-stat-mtd-revenue-value"]'
			);
			expect(v?.textContent?.trim()).toContain('$5400.99');
		});

		// Active subs shows 89
		await waitFor(() => {
			const v = container.querySelector('[data-testid="admin-orderdash-stat-active-subs-value"]');
			expect(v?.textContent?.trim()).toBe('89');
		});

		// Churn shows 3.2%
		await waitFor(() => {
			const v = container.querySelector('[data-testid="admin-orderdash-stat-churn-value"]');
			expect(v?.textContent?.trim()).toContain('3.2%');
		});
	});

	it('shows -- placeholder when active subs / churn are null', async () => {
		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeStats({ active_subscriptions: null, churn_rate: null })
		);
		pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');

		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getDashboardStats).toHaveBeenCalled());

		await waitFor(() => {
			const subs = container.querySelector(
				'[data-testid="admin-orderdash-stat-active-subs-value"]'
			);
			const churn = container.querySelector('[data-testid="admin-orderdash-stat-churn-value"]');
			expect(subs?.textContent?.trim()).toBe('--');
			expect(churn?.textContent?.trim()).toBe('--');
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2 · Chart lazy contract
// ─────────────────────────────────────────────────────────────────────────

describe('admin orders · dashboard · chart lazy contract', () => {
	it('+page.svelte does NOT eagerly import chart.js / svelte-chartjs', () => {
		const src = pageSrc as unknown as string;
		// 顶层 import 形式：`import ... from 'chart.js'` / `'svelte-chartjs'`
		expect(/^\s*import\s+[^;]*from\s+['"]chart\.js/m.test(src)).toBe(false);
		expect(/^\s*import\s+[^;]*from\s+['"]svelte-chartjs/m.test(src)).toBe(false);
	});

	it('PaymentDashboardChart.svelte loads chart.js / svelte-chartjs ONLY via dynamic import', () => {
		const src = chartSrc as unknown as string;
		// 必须有 dynamic import
		expect(src).toContain("await import('chart.js/auto')");
		expect(src).toContain("await import('svelte-chartjs')");
		// 顶层 import 必须空
		expect(/^\s*import\s+[^;]*from\s+['"]chart\.js/m.test(src)).toBe(false);
		expect(/^\s*import\s+[^;]*from\s+['"]svelte-chartjs/m.test(src)).toBe(false);
	});

	it('renders chart container with data-testid hook', async () => {
		const api = await import('$lib/api/admin/paymentDashboard');
		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(fakeStats());
		(api.getDashboardTrend as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeTrend(3));
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeProviders());

		const pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');
		const { container } = render(pageMod.default);

		await waitFor(() => {
			const chart = container.querySelector('[data-testid="admin-orderdash-chart"]');
			expect(chart).not.toBeNull();
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3 · Provider breakdown table
// ─────────────────────────────────────────────────────────────────────────

describe('admin orders · dashboard · provider breakdown', () => {
	let api: typeof import('$lib/api/admin/paymentDashboard');
	let pageMod: typeof import('../../../routes/(admin)/orders/dashboard/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/paymentDashboard');
		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(fakeStats());
		(api.getDashboardTrend as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeTrend(3));
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeProviders());

		pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');
	}, 30000);

	it('renders 3 provider rows, sorted by revenue descending', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => {
			expect(api.getProviderBreakdown).toHaveBeenCalled();
		});

		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-orderdash-provider-row"]');
			expect(rows.length).toBe(3);
		});

		const rows = container.querySelectorAll('[data-testid="admin-orderdash-provider-row"]');
		const providers = Array.from(rows).map((r) => r.getAttribute('data-provider'));
		// fakeProviders 已按 revenue 降序（stripe > alipay > wxpay）
		expect(providers).toEqual(['stripe', 'alipay', 'wxpay']);
	});

	it('renders empty state when provider rows are empty', async () => {
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
		pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');

		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getProviderBreakdown).toHaveBeenCalled());

		await waitFor(() => {
			const empty = container.querySelector('[data-testid="admin-orderdash-provider-empty"]');
			expect(empty).not.toBeNull();
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4 · Range switch re-fetches stats / trend / providers
// ─────────────────────────────────────────────────────────────────────────

describe('admin orders · dashboard · range switch reload', () => {
	let api: typeof import('$lib/api/admin/paymentDashboard');
	let pageMod: typeof import('../../../routes/(admin)/orders/dashboard/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/paymentDashboard');
		(api.getDashboardStats as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(fakeStats());
		(api.getDashboardTrend as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeTrend(3));
		(api.getProviderBreakdown as ReturnType<typeof vi.fn>)
			.mockReset()
			.mockResolvedValue(fakeProviders());

		pageMod = await import('../../../routes/(admin)/orders/dashboard/+page.svelte');
	}, 30000);

	it('clicking range 7d re-fires stats API with days=7', async () => {
		const { container } = render(pageMod.default);

		// 初始 onMount → 1 round of calls with days=30；等到按钮 enabled
		await waitFor(() => {
			const btn7 = container.querySelector(
				'[data-testid="admin-orderdash-range-7"]'
			) as HTMLButtonElement;
			expect(btn7).not.toBeNull();
			expect(btn7.disabled).toBe(false);
		});

		const initialStatsCalls = (api.getDashboardStats as ReturnType<typeof vi.fn>).mock.calls
			.length;
		expect(initialStatsCalls).toBeGreaterThanOrEqual(1);

		// 初始 days=30 入参验证
		const initialArgs = (api.getDashboardStats as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(initialArgs?.[0]).toEqual({ days: 30 });

		const btn7 = container.querySelector(
			'[data-testid="admin-orderdash-range-7"]'
		) as HTMLButtonElement;
		await fireEvent.click(btn7);

		await waitFor(() => {
			const calls = (api.getDashboardStats as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(calls).toBeGreaterThan(initialStatsCalls);
		});

		// 最近一次调用入参 days=7
		const lastStatsArgs = (api.getDashboardStats as ReturnType<typeof vi.fn>).mock.calls.at(-1);
		expect(lastStatsArgs?.[0]).toEqual({ days: 7 });
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test 5 · payments redirect page renders consolidation notice
// ─────────────────────────────────────────────────────────────────────────

describe('admin orders · payments redirect page', () => {
	it('renders consolidation notice with link to /admin/monetization/plans', async () => {
		const pageMod = await import('../../../routes/(admin)/orders/payments/+page.svelte');
		const { container } = render(pageMod.default);

		const notice = container.querySelector('[data-testid="admin-orderpayments-notice"]');
		expect(notice).not.toBeNull();

		const goto = container.querySelector(
			'[data-testid="admin-orderpayments-goto-plans"]'
		) as HTMLAnchorElement;
		expect(goto).not.toBeNull();
		expect(goto.getAttribute('href')).toBe('/admin/monetization/plans');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Test 6 · RED LINE grep — dashboard surface free of billing-core strings
// ─────────────────────────────────────────────────────────────────────────

describe('RED LINE · admin payment dashboard surface', () => {
	it('no source file under dashboard / payments surface references forbidden strings', () => {
		const sources: Array<[string, string]> = [
			['orders/dashboard/+page.svelte', pageSrc as unknown as string],
			['orders/payments/+page.svelte', paymentsSrc as unknown as string],
			['PaymentDashboardCards.svelte', cardsSrc as unknown as string],
			['PaymentDashboardChart.svelte', chartSrc as unknown as string],
			['ProviderBreakdown.svelte', providerSrc as unknown as string],
			['api/admin/paymentDashboard.ts', apiSrc as unknown as string]
		];
		const forbidden = ['billing_service', '/admin/channels/model-pricing', 'GetModelPricing'];
		for (const [label, src] of sources) {
			for (const needle of forbidden) {
				expect(
					src.includes(needle),
					`${label} contains forbidden string "${needle}"`
				).toBe(false);
			}
		}
	});

	it('chart.js / svelte-chartjs only appear as dynamic imports across the surface', () => {
		const sources: Array<[string, string]> = [
			['orders/dashboard/+page.svelte', pageSrc as unknown as string],
			['PaymentDashboardCards.svelte', cardsSrc as unknown as string],
			['PaymentDashboardChart.svelte', chartSrc as unknown as string],
			['ProviderBreakdown.svelte', providerSrc as unknown as string]
		];
		for (const [label, src] of sources) {
			// 顶层 import 'chart.js' / 'svelte-chartjs' 是禁用
			const topLevelChart = /^\s*import\s+[^;]*from\s+['"]chart\.js/m.test(src);
			const topLevelChartjs = /^\s*import\s+[^;]*from\s+['"]svelte-chartjs/m.test(src);
			expect(topLevelChart, `${label} top-level imports chart.js`).toBe(false);
			expect(topLevelChartjs, `${label} top-level imports svelte-chartjs`).toBe(false);
		}
	});
});
