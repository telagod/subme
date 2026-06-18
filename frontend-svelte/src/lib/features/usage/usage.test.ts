/**
 * /(user)/usage · vitest 覆盖（M7+ usage analytics）
 *
 * 覆盖点：
 *   1. List rendering：mock listUsage → 渲染流水行数 = mocked items.length
 *   2. Filter Select sentinel：endpoint / groupBy / models Select 不含 value="" ——
 *      reshadcn-migration 红线。
 *   3. Export CSV：点击 Export 按钮 → exportCsv 被调一次；
 *      实际 exportCsv 实现走 listUsage loop + Blob + URL.createObjectURL；
 *      额外断言 URL.createObjectURL 在直接调用 exportCsv 实现时被触发。
 *   4. Chart lazy contract：源文件 grep —— 既无 +page.svelte 也无 TimeseriesChart
 *      顶层 import 'chart.js'；rg sentinel 红线。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/user/usage'：替换为 vi.fn() 注入。
 *     - listUsage / getUsageSummary / getUsageTrend → mock 数据
 *     - exportCsv → spy（断言被调用）
 *   - vi.mock '$lib/stores/toast.svelte'：静音
 *   - vi.mock 'chart.js/auto' + 'svelte-chartjs'：jsdom 下避免真模块加载
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UsageEntry, UsageSummary, UsageTrendPoint } from '$lib/api/user/usage';

// vi.mock hoists —— 必须在 import +page.svelte 之前
vi.mock('$lib/api/user/usage', () => {
	return {
		listUsage: vi.fn(),
		getUsageSummary: vi.fn(),
		getUsageTrend: vi.fn(),
		exportCsv: vi.fn(),
		userUsageApi: {
			listUsage: vi.fn(),
			getUsageSummary: vi.fn(),
			getUsageTrend: vi.fn(),
			exportCsv: vi.fn()
		}
	};
});

// toast 静音
vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

// Chart 内 lazy import 兜底 —— 避免 vitest 真加载 chart.js 拖慢 / 触发 jsdom canvas warning
vi.mock('chart.js/auto', () => ({
	default: class {},
	Chart: class {}
}));
vi.mock('svelte-chartjs', () => ({
	Line: (() => null) as unknown as { (): null }
}));

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {
		nav: { usage: 'Usage' },
		user: {
			usage: {
				pageTitle: 'Usage',
				pageSubtitle: 'Review API usage',
				refresh: 'Refresh',
				retry: 'Retry',
				exportCsv: 'Export CSV',
				exporting: 'Exporting…',
				exportSuccess: 'CSV export started',
				exportFailed: 'Failed to export CSV',
				startDate: 'From',
				endDate: 'To',
				modelsFilter: 'Models',
				allModels: 'All models',
				endpointFilter: 'Endpoint',
				allEndpoints: 'All endpoints',
				groupBy: 'Group by',
				groupDay: 'Day',
				groupHour: 'Hour',
				groupModel: 'Model',
				groupEndpoint: 'Endpoint',
				totalRequests: 'Total requests',
				totalTokens: 'Total tokens',
				totalCost: 'Total cost',
				chartTitle: 'Usage over time',
				chart: {
					legendInput: 'Input tokens',
					legendOutput: 'Output tokens',
					legendRequests: 'Requests',
					loading: 'Loading chart…',
					empty: 'No usage in this range',
					failed: 'Failed to load chart'
				},
				colTimestamp: 'Time',
				colModel: 'Model',
				colEndpoint: 'Endpoint',
				colInputTokens: 'Input',
				colOutputTokens: 'Output',
				colCost: 'Cost',
				colStatus: 'Status',
				colLatency: 'Latency',
				emptyTitle: 'No usage',
				emptyDescription: 'widen',
				pageOf: 'Page {page} of {pages}',
				prevPage: 'Previous',
				nextPage: 'Next',
				errors: {
					summaryFailed: 'Failed to load summary',
					listFailed: 'Failed to load list',
					trendFailed: 'Failed to load trend'
				}
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── fixtures ──────────────────────────────────────────────────────────

function fakeEntry(over: Partial<UsageEntry> = {}): UsageEntry {
	return {
		id: 'row-1',
		timestamp: '2026-06-15T12:00:00Z',
		model: 'claude-3-5-sonnet',
		endpoint: '/v1/chat/completions',
		inputTokens: 100,
		outputTokens: 50,
		cost: 0.0125,
		status: 'ok',
		latencyMs: 450,
		...over
	};
}

function fakeSummary(over: Partial<UsageSummary> = {}): UsageSummary {
	return {
		totalRequests: 3,
		totalTokens: 450,
		totalCost: 0.0375,
		...over
	};
}

function fakeTrend(): UsageTrendPoint[] {
	return [
		{ bucket: '2026-06-13', requests: 1, inputTokens: 50, outputTokens: 20, cost: 0.005 },
		{ bucket: '2026-06-14', requests: 2, inputTokens: 100, outputTokens: 40, cost: 0.012 }
	];
}

// ────────────────────────────────────────────────────────────────────────
// 1) List rendering · mocked entries
// ────────────────────────────────────────────────────────────────────────

describe('usage page · list renders mocked entries', () => {
	let api: typeof import('$lib/api/user/usage');
	let pageMod: typeof import('../../../routes/(user)/usage/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/usage');
		(api.listUsage as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockReset();
		(api.exportCsv as ReturnType<typeof vi.fn>).mockReset();

		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSummary());
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTrend());
		(api.listUsage as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				fakeEntry({ id: 'a', model: 'claude-3-5-sonnet' }),
				fakeEntry({ id: 'b', model: 'claude-3-opus', inputTokens: 200 }),
				fakeEntry({ id: 'c', model: 'gpt-4', inputTokens: 300 })
			],
			total: 3,
			pages: 1
		});

		pageMod = await import('../../../routes/(user)/usage/+page.svelte');
	});

	it('renders 3 rows + populates summary cards', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => expect(api.listUsage).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="usage-list-row"]');
			expect(rows.length).toBe(3);
		});

		// Summary cards populated from getUsageSummary mock
		await waitFor(() => {
			const requests = container.querySelector('[data-testid="usage-requests-value"]');
			const tokens = container.querySelector('[data-testid="usage-tokens-value"]');
			const cost = container.querySelector('[data-testid="usage-cost-value"]');
			expect(requests?.textContent?.replace(/\s/g, '')).toBe('3');
			expect(tokens?.textContent?.replace(/\s/g, '')).toBe('450');
			expect(cost?.textContent).toContain('$0.0375');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 2) Filter Select sentinel · __all__ only; no value=""
// ────────────────────────────────────────────────────────────────────────

describe('usage page · Select sentinel contract', () => {
	let api: typeof import('$lib/api/user/usage');
	let pageMod: typeof import('../../../routes/(user)/usage/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/usage');
		(api.listUsage as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockReset();
		(api.exportCsv as ReturnType<typeof vi.fn>).mockReset();

		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSummary());
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTrend());
		(api.listUsage as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [fakeEntry()],
			total: 1,
			pages: 1
		});

		pageMod = await import('../../../routes/(user)/usage/+page.svelte');
	});

	it('all filter Selects use __all__ sentinel; no <option value=""> in markup', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => {
			const endpoint = container.querySelector('[data-testid="usage-endpoint-filter"]');
			expect(endpoint).not.toBeNull();
		});

		const html = container.innerHTML;

		// reshadcn-migration 红线：严禁 <option value="">
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		// endpoint Select 必须含 __all__ sentinel
		const endpointSel = container.querySelector(
			'[data-testid="usage-endpoint-filter"]'
		) as HTMLSelectElement;
		expect(endpointSel.querySelector('option[value="__all__"]')).not.toBeNull();

		// models Select 必须含 __all__ sentinel（默认选中）
		const modelsSel = container.querySelector(
			'[data-testid="usage-models-filter"]'
		) as HTMLSelectElement;
		expect(modelsSel).not.toBeNull();
		expect(modelsSel.querySelector('option[value="__all__"]')).not.toBeNull();

		// groupBy Select 不含 __all__（业务上必须二选其一），但同样禁空字符串 value
		const groupBySel = container.querySelector(
			'[data-testid="usage-groupby"]'
		) as HTMLSelectElement;
		expect(groupBySel).not.toBeNull();
		// 必须有 day/hour/model/endpoint 四个选项
		expect(groupBySel.querySelector('option[value="day"]')).not.toBeNull();
		expect(groupBySel.querySelector('option[value="hour"]')).not.toBeNull();
		expect(groupBySel.querySelector('option[value="model"]')).not.toBeNull();
		expect(groupBySel.querySelector('option[value="endpoint"]')).not.toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────
// 3) Export CSV · click triggers exportCsv API call
// ────────────────────────────────────────────────────────────────────────

describe('usage page · Export CSV', () => {
	let api: typeof import('$lib/api/user/usage');
	let pageMod: typeof import('../../../routes/(user)/usage/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/usage');
		(api.listUsage as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockReset();
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockReset();
		(api.exportCsv as ReturnType<typeof vi.fn>).mockReset();

		(api.getUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue(fakeSummary());
		(api.getUsageTrend as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTrend());
		(api.listUsage as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [fakeEntry()],
			total: 1,
			pages: 1
		});
		(api.exportCsv as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		pageMod = await import('../../../routes/(user)/usage/+page.svelte');
	});

	it('click Export → exportCsv() called once with current filter', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => {
			const btn = container.querySelector('[data-testid="usage-export-btn"]');
			expect(btn).not.toBeNull();
		});

		const btn = container.querySelector('[data-testid="usage-export-btn"]') as HTMLButtonElement;
		await fireEvent.click(btn);

		await waitFor(() => {
			expect(api.exportCsv).toHaveBeenCalledTimes(1);
			const arg = (api.exportCsv as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(arg).toBeDefined();
			expect(arg.startDate).toBeTruthy();
			expect(arg.endDate).toBeTruthy();
			expect(arg.models).toBe('__all__');
			expect(arg.endpoint).toBe('__all__');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 3b) exportCsv impl · triggers blob URL download
//
// 顶层 vi.mock('$lib/api/user/usage') 让 +page.svelte 拿 mocked exportCsv；
// 但这里要测真实 exportCsv 实现 —— 用 vi.importActual 绕过 hoisted mock，
// 拿真实模块（其内部 apiClient.get 也是真模块；我们改成 listUsage 直接 stub）。
// ────────────────────────────────────────────────────────────────────────

describe('exportCsv impl · Blob + URL.createObjectURL download', () => {
	it('builds CSV from rows + triggers anchor click with usage-*.csv name', async () => {
		// 拿真实模块（绕过文件顶部 vi.mock）
		const actual = await vi.importActual<typeof import('$lib/api/user/usage')>(
			'$lib/api/user/usage'
		);

		// Spy URL.createObjectURL —— jsdom 默认无此 API，直接挂上。
		const createSpy = vi.fn(() => 'blob:mock-url');
		const revokeSpy = vi.fn();
		(URL as unknown as { createObjectURL: typeof createSpy }).createObjectURL = createSpy;
		(URL as unknown as { revokeObjectURL: typeof revokeSpy }).revokeObjectURL = revokeSpy;

		// Spy anchor click —— 不要让浏览器真的导航
		const origCreate = document.createElement.bind(document);
		let clickedAnchor: HTMLAnchorElement | null = null;
		const createElSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			const el = origCreate(tag) as HTMLElement;
			if (tag === 'a') {
				clickedAnchor = el as HTMLAnchorElement;
				(el as HTMLAnchorElement).click = vi.fn();
			}
			return el as unknown as HTMLElement;
		});

		// 真实 exportCsv 内部会调 listUsage —— listUsage 走真实 apiClient.get；
		// 这里用 fetch stub 兜住单次 HTTP 调用，让 listUsage 返回 1 行 → 触发 CSV/Blob/anchor。
		const origFetch = globalThis.fetch;
		const fetchSpy = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					items: [
						{
							id: 1,
							created_at: '2026-06-15T12:00:00Z',
							model: 'claude-3-5-sonnet',
							endpoint: '/v1/chat/completions',
							input_tokens: 100,
							output_tokens: 50,
							actual_cost: 0.01,
							status: 'ok',
							duration_ms: 450
						}
					],
					total: 1,
					pages: 1
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		});
		globalThis.fetch = fetchSpy as unknown as typeof fetch;

		try {
			await actual.exportCsv({
				startDate: '2026-06-13',
				endDate: '2026-06-19'
			});

			expect(fetchSpy).toHaveBeenCalled();
			expect(createSpy).toHaveBeenCalledTimes(1);
			expect(clickedAnchor).not.toBeNull();
			expect((clickedAnchor as unknown as HTMLAnchorElement).href).toContain('blob:');
			expect((clickedAnchor as unknown as HTMLAnchorElement).download).toMatch(
				/^usage-.*\.csv$/
			);
		} finally {
			createElSpy.mockRestore();
			globalThis.fetch = origFetch;
		}
	});
});

// ────────────────────────────────────────────────────────────────────────
// 4) Chart lazy contract · no static chart.js import in page / chart src
// ────────────────────────────────────────────────────────────────────────

describe('chart lazy contract · sentinel rg test', () => {
	it('+page.svelte does NOT statically import chart.js / svelte-chartjs', () => {
		const p = resolve(
			__dirname,
			'..',
			'..',
			'..',
			'routes',
			'(user)',
			'usage',
			'+page.svelte'
		);
		const src = readFileSync(p, 'utf8');
		// 顶层 static import 'chart.js' / 'svelte-chartjs' 严禁出现。
		// 注意：matching `import ... from 'chart.js'`（with or without quote style）。
		expect(/^\s*import\b[^\n]*['"]chart\.js(\/|['"])/m.test(src)).toBe(false);
		expect(/^\s*import\b[^\n]*['"]svelte-chartjs['"]/m.test(src)).toBe(false);
	});

	it('TimeseriesChart.svelte uses ONLY dynamic import for chart.js / svelte-chartjs', () => {
		const p = resolve(__dirname, 'TimeseriesChart.svelte');
		const src = readFileSync(p, 'utf8');

		// 顶层 import 句必须不命中 chart.js / svelte-chartjs
		const lines = src.split('\n');
		for (const ln of lines) {
			const trimmed = ln.trim();
			if (trimmed.startsWith('import ') && !trimmed.includes('await import')) {
				expect(trimmed.includes('chart.js')).toBe(false);
				expect(trimmed.includes('svelte-chartjs')).toBe(false);
			}
		}

		// 必须存在 dynamic import 形式
		expect(src.includes("await import('chart.js/auto')")).toBe(true);
		expect(src.includes("await import('svelte-chartjs')")).toBe(true);
	});
});
