/**
 * OpsLatencyChart · vitest 覆盖
 *
 * 覆盖点：
 *   1. RED LINE grep — 组件顶层不得 import 'chart.js' / 'svelte-chartjs'，
 *      只能在 onMount 内 `await import(...)`（vendor-chunk-tdz-trap）。
 *   2. RED LINE grep — 不得出现 raw hex（#xxxxxx）配色（Zinc-only）。
 *   3. loading state → loading sentinel 渲染。
 *   4. latencyData === null → error sentinel 渲染。
 *   5. total_requests === 0 / 空 buckets → empty sentinel 渲染。
 *   6. 有数据 → total_requests caption 渲染（含本地化数字）。
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

import componentSrc from './OpsLatencyChart.svelte?raw';
import OpsLatencyChart from './OpsLatencyChart.svelte';
import type { OpsLatencyHistogramResponse } from '$lib/api/admin/ops';

// chart.js / svelte-chartjs lazy import 兜底 —— 避免真加载 + jsdom canvas warning
vi.mock('chart.js/auto', () => ({ default: class {}, Chart: class {} }));
vi.mock('svelte-chartjs', () => ({ Bar: (() => null) as unknown as { (): null } }));

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeHistogram(
	overrides: Partial<OpsLatencyHistogramResponse> = {}
): OpsLatencyHistogramResponse {
	return {
		total_requests: 1234,
		buckets: [
			{ range: '0-100ms', count: 800 },
			{ range: '100-500ms', count: 300 },
			{ range: '500ms-1s', count: 100 },
			{ range: '>1s', count: 34 }
		],
		...overrides
	};
}

describe('OpsLatencyChart · lazy island red line', () => {
	it('does NOT top-level import chart.js / svelte-chartjs', () => {
		expect(componentSrc).not.toMatch(/^\s*import\s+.*from\s+['"]chart\.js/m);
		expect(componentSrc).not.toMatch(/^\s*import\s+.*from\s+['"]svelte-chartjs['"]/m);
		// 仅允许 onMount 内的 dynamic import
		expect(componentSrc).toMatch(/await import\(['"]chart\.js\/auto['"]\)/);
		expect(componentSrc).toMatch(/await import\(['"]svelte-chartjs['"]\)/);
	});

	it('contains NO raw hex colors (Zinc-only)', () => {
		expect(componentSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});
});

describe('OpsLatencyChart · states', () => {
	it('renders loading sentinel when loading', () => {
		const { getByTestId } = render(OpsLatencyChart, { latencyData: null, loading: true });
		expect(getByTestId('ops-latency-chart-loading')).toBeTruthy();
	});

	it('renders error sentinel when latencyData is null and not loading', () => {
		const { getByTestId } = render(OpsLatencyChart, { latencyData: null, loading: false });
		expect(getByTestId('ops-latency-chart-error')).toBeTruthy();
	});

	it('renders empty sentinel when total_requests is 0', () => {
		const { getByTestId } = render(OpsLatencyChart, {
			latencyData: fakeHistogram({ total_requests: 0, buckets: [] }),
			loading: false
		});
		expect(getByTestId('ops-latency-chart-empty')).toBeTruthy();
	});

	it('renders total_requests caption when data present', async () => {
		const { getByTestId } = render(OpsLatencyChart, {
			latencyData: fakeHistogram(),
			loading: false
		});
		await waitFor(() => {
			const caption = getByTestId('ops-latency-chart-total');
			expect(caption.textContent).toContain('1,234');
		});
	});
});
