import { describe, expect, it } from 'vitest';
import chartSrc from './OpsErrorTrendChart.svelte?raw';

/**
 * OpsErrorTrendChart 契约测试（?raw 源断言，与 admin-ops/ops.test.ts 同款策略）。
 * 不渲染 chart island（chart.js 在 onMount dynamic import，jsdom 无 canvas）。
 */
describe('OpsErrorTrendChart', () => {
	it('is a LAZY island: chart.js only via dynamic import inside onMount, never top-level', () => {
		// 顶层禁止 static import chart.js / svelte-chartjs（vendor-chunk TDZ 红线）。
		expect(chartSrc).not.toMatch(/^\s*import[^\n]*from\s+['"]chart\.js/m);
		expect(chartSrc).not.toMatch(/^\s*import[^\n]*from\s+['"]svelte-chartjs/m);
		// dynamic import 必须存在。
		expect(chartSrc).toContain("await import('chart.js/auto')");
		expect(chartSrc).toContain("await import('svelte-chartjs')");
		expect(chartSrc).toContain('onMount');
	});

	it('exposes exactly the wired props', () => {
		for (const prop of [
			'points',
			'loading',
			'timeRange',
			'onOpenRequestErrors',
			'onOpenUpstreamErrors'
		]) {
			expect(chartSrc).toContain(prop);
		}
	});

	it('renders all six error datasets', () => {
		for (const field of [
			'error_count_total',
			'business_limited_count',
			'error_count_sla',
			'upstream_error_count_excl_429_529',
			'upstream_429_count',
			'upstream_529_count'
		]) {
			expect(chartSrc).toContain(field);
		}
		// 6 个 dataset.data 映射。
		const dataMaps = chartSrc.match(/data:\s*pts\.map/g) ?? [];
		expect(dataMaps.length).toBe(6);
	});

	it('drilldown buttons emit open-request / open-upstream and gate on volume', () => {
		expect(chartSrc).toContain('onOpenRequestErrors?.()');
		expect(chartSrc).toContain('onOpenUpstreamErrors?.()');
		expect(chartSrc).toContain('disabled={!hasRequestErrors}');
		expect(chartSrc).toContain('disabled={!hasUpstreamErrors}');
	});

	it('covers loading / error / empty states', () => {
		expect(chartSrc).toContain('ops-error-trend-loading');
		expect(chartSrc).toContain('ops-error-trend-error');
		expect(chartSrc).toContain('ops-error-trend-empty');
	});

	it('uses lib/ui primitives, not hand-rolled', () => {
		expect(chartSrc).toContain("from '$lib/ui/Card.svelte'");
		expect(chartSrc).toContain("from '$lib/ui/Button.svelte'");
	});

	it('all i18n keys carry a default fallback (no hardcoded-English findings)', () => {
		const calls = chartSrc.match(/\$_\(/g) ?? [];
		const defaults = chartSrc.match(/default:\s*'/g) ?? [];
		expect(calls.length).toBeGreaterThan(0);
		expect(defaults.length).toBeGreaterThanOrEqual(calls.length);
	});
});
