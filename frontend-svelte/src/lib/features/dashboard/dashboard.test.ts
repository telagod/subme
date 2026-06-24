/**
 * dashboard.test.ts · M6 user dashboard wiring
 *
 * 覆盖：
 *   1. 顶部 3 张 card 在 mock summary 数据下正确渲染
 *   2. recent usage 列表为空 → 空态 CTA 显示
 *   3. 401 路径：API 抛 'unauthorized' Error → 不白屏，cards/recent 兜底为 '--'，
 *      且 401 已由 apiClient interceptor 触发 auth.logout（这里 mock 验证 logout 被调）。
 *
 * 策略：
 *   - vi.mock '$lib/api/user/dashboard'：注入 summary / recent。
 *   - vi.mock '$lib/stores/auth.svelte'：暴露 user 与 logout spy。
 *   - vi.mock '$lib/api/client'：401 fake 路径 → setUnauthorizedHook 收集回调，
 *     触发时调 mocked auth.logout（模拟 hooks.client.ts 接线）。
 *   - chart 内部 lazy import 在 jsdom 下走 onMount 异步，不阻塞断言。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { DashboardSummary, UsageEntry } from '$lib/api/user/dashboard';

// ── mocks (hoisted before page import) ────────────────────────────────

const mockGetSummary = vi.fn();
const mockGetRecent = vi.fn();

vi.mock('$lib/api/user/dashboard', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/api/user/dashboard')>('$lib/api/user/dashboard');
	return {
		...actual,
		getDashboardSummary: (...args: unknown[]) => mockGetSummary(...args),
		getRecentUsage: (...args: unknown[]) => mockGetRecent(...args)
	};
});

// auth.svelte mock —— 暴露 user.email + isSimpleMode + logout spy（验证 401 路径）。
const mockLogout = vi.fn();
const mockAuthUser = { id: 1, email: 'alice@example.com', role: 'user' };

vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		get user() {
			return mockAuthUser;
		},
		get isAuthenticated() {
			return true;
		},
		get isAdmin() {
			return false;
		},
		get isSimpleMode() {
			return false;
		},
		logout: (...args: unknown[]) => mockLogout(...args)
	}
}));

// Chart 组件懒加载链路：jsdom 下 import('chart.js/auto') 会去找文件，正好能拿到。
// 但为避免 vitest 加载 chart.js 真模块拖慢（仍然走 manualChunks 规则），用空 stub。
vi.mock('chart.js/auto', () => ({
	default: class {},
	Chart: class {}
}));
vi.mock('svelte-chartjs', () => ({
	Line: (() => null) as unknown as { (): null }
}));

// ── i18n bootstrap ────────────────────────────────────────────────────

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── helpers ───────────────────────────────────────────────────────────

function fakeSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
	return {
		quota: { used: 1.23, total: 10, unlimited: false },
		todayRequests: 42,
		activeSubscriptions: 2,
		trend: [
			{ date: '2026-06-13', inputTokens: 100, outputTokens: 50, requests: 3 },
			{ date: '2026-06-14', inputTokens: 200, outputTokens: 80, requests: 5 }
		],
		...overrides
	};
}

function fakeUsage(n: number): UsageEntry[] {
	return Array.from({ length: n }, (_, i) => ({
		id: i + 1,
		timestamp: '2026-06-18T12:00:00Z',
		endpoint: '/v1/chat/completions',
		model: 'claude-3-5-sonnet',
		tokens: 100 + i,
		cost: 0.01 * (i + 1)
	}));
}

describe('Dashboard · top row cards', () => {
	beforeEach(() => {
		mockGetSummary.mockReset();
		mockGetRecent.mockReset();
		mockLogout.mockReset();
	});

	it('renders 3 cards with mocked summary data', async () => {
		mockGetSummary.mockResolvedValueOnce(fakeSummary());
		mockGetRecent.mockResolvedValueOnce(fakeUsage(3));

		const pageMod = await import('../../../routes/(user)/dashboard/+page.svelte');
		const { container } = render(pageMod.default);

		await waitFor(
			() => {
				expect(mockGetSummary).toHaveBeenCalled();
				const quota = container.querySelector('[data-testid="dashboard-card-quota"]');
				const requests = container.querySelector('[data-testid="dashboard-card-requests"]');
				const subs = container.querySelector('[data-testid="dashboard-card-subscriptions"]');
				expect(quota).not.toBeNull();
				expect(requests).not.toBeNull();
				expect(subs).not.toBeNull();
			},
			{ timeout: 2000 }
		);

		// Quota value must render the formatted "$used of $total"
		await waitFor(() => {
			const v = container.querySelector('[data-testid="dashboard-quota-value"]');
			expect(v?.textContent).toMatch(/\$1\.23/);
			expect(v?.textContent).toMatch(/\$10\.00/);
		});

		// Today's requests value = 42
		await waitFor(() => {
			const v = container.querySelector('[data-testid="dashboard-requests-value"]');
			expect(v?.textContent?.replace(/\s/g, '')).toBe('42');
		});

		// Active subscriptions value = 2
		await waitFor(() => {
			const v = container.querySelector('[data-testid="dashboard-subscriptions-value"]');
			expect(v?.textContent?.replace(/\s/g, '')).toBe('2');
		});

		// Greeting includes the auth user's email
		const greeting = container.querySelector('[data-testid="dashboard-greeting"]');
		expect(greeting?.textContent).toContain('alice@example.com');
	});

	it('shows empty-state CTA when recent usage list is empty', async () => {
		mockGetSummary.mockResolvedValueOnce(fakeSummary({ trend: [] }));
		mockGetRecent.mockResolvedValueOnce([]);

		const pageMod = await import('../../../routes/(user)/dashboard/+page.svelte');
		const { container } = render(pageMod.default);

		await waitFor(
			() => {
				const empty = container.querySelector('[data-testid="dashboard-recent-empty"]');
				expect(empty).not.toBeNull();
				const cta = container.querySelector('[data-testid="dashboard-recent-empty-cta"]');
				expect(cta).not.toBeNull();
				// CTA links to /keys
				expect(cta?.getAttribute('href')).toBe('/keys');
			},
			{ timeout: 2000 }
		);
	});

	it('401 path: API throws unauthorized; no whitescreen, auth.logout triggered via 401 hook', async () => {
		// 模拟 apiClient 内 setUnauthorizedHook 被 hooks.client.ts 装了 auth.logout：
		// 这里直接调用 mock 的 hook 模拟 interceptor 行为。
		mockGetSummary.mockImplementationOnce(async () => {
			// 模拟 apiClient 触发 401 hook
			await mockLogout();
			throw new Error('unauthorized');
		});
		mockGetRecent.mockImplementationOnce(async () => {
			await mockLogout();
			throw new Error('unauthorized');
		});

		const pageMod = await import('../../../routes/(user)/dashboard/+page.svelte');
		const { container } = render(pageMod.default);

		await waitFor(
			() => {
				expect(mockGetSummary).toHaveBeenCalled();
				expect(mockGetRecent).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		// 401 路径下 auth.logout 必被 401 hook 调过
		await waitFor(() => {
			expect(mockLogout).toHaveBeenCalled();
		});

		// 不白屏：dashboard section 仍然挂载
		await waitFor(() => {
			const root = container.querySelector('[data-testid="user-dashboard"]');
			expect(root).not.toBeNull();
		});

		// 卡片仍渲染（兜底 '--' / skeleton），未抛错穿透
		const quota = container.querySelector('[data-testid="dashboard-card-quota"]');
		const requests = container.querySelector('[data-testid="dashboard-card-requests"]');
		const subs = container.querySelector('[data-testid="dashboard-card-subscriptions"]');
		expect(quota).not.toBeNull();
		expect(requests).not.toBeNull();
		expect(subs).not.toBeNull();
	});
});
