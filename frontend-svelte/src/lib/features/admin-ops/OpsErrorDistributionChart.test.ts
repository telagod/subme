/**
 * OpsErrorDistributionChart · vitest 覆盖
 *
 * 覆盖点：
 *   1. Lazy chart 红线：源文件无顶层 import 'chart.js' / 'svelte-chartjs'（rg sentinel）
 *   2. Empty state：data=null 或 sla 全 0 → empty 态，Details 按钮 disabled
 *   3. Ready state：sla>0 → 渲染 legend + total + top reason；归类正确
 *   4. onOpenDetails：ready 态点击 Details → 回调被调一次
 *
 * Mock：chart.js/auto + svelte-chartjs（jsdom 下避免真模块加载 + canvas）
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { init, locale } from 'svelte-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpsErrorDistributionResponse } from '$lib/api/admin/ops';

vi.mock('chart.js/auto', () => ({ default: {} }));
vi.mock('svelte-chartjs', () => ({
	// 轻量 stub component 占位，避免真 canvas
	Doughnut: (() => {}) as unknown
}));

import OpsErrorDistributionChart from './OpsErrorDistributionChart.svelte';

const SRC = resolve(__dirname, 'OpsErrorDistributionChart.svelte');

beforeAll(async () => {
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

afterEach(() => cleanup());

describe('OpsErrorDistributionChart', () => {
	it('never top-level imports chart.js (lazy island red line)', () => {
		const src = readFileSync(SRC, 'utf8');
		// 顶层（非注释/非 await）import 'chart.js' / 'svelte-chartjs' 不允许
		expect(/^\s*import\s+[^\n]*['"]chart\.js/m.test(src)).toBe(false);
		expect(/^\s*import\s+[^\n]*['"]svelte-chartjs/m.test(src)).toBe(false);
		// 必须走 dynamic import
		expect(src.includes("await import('chart.js/auto')")).toBe(true);
		expect(src.includes("await import('svelte-chartjs')")).toBe(true);
	});

	it('renders empty state with disabled details when data is null', async () => {
		const { getByTestId, queryByTestId } = render(OpsErrorDistributionChart, {
			props: { data: null, loading: false }
		});
		expect(getByTestId('ops-error-distribution-empty')).toBeTruthy();
		expect(queryByTestId('ops-error-distribution-ready')).toBeNull();
		const btn = getByTestId('ops-error-distribution-details') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('renders empty state when all sla counts are zero', async () => {
		const data: OpsErrorDistributionResponse = {
			total: 10,
			items: [{ status_code: 502, total: 10, sla: 0, business_limited: 10 }]
		};
		const { getByTestId } = render(OpsErrorDistributionChart, {
			props: { data, loading: false }
		});
		expect(getByTestId('ops-error-distribution-empty')).toBeTruthy();
	});

	it('categorizes by status_code and shows total + top reason', async () => {
		const data: OpsErrorDistributionResponse = {
			total: 12,
			items: [
				{ status_code: 502, total: 5, sla: 5, business_limited: 0 }, // upstream
				{ status_code: 429, total: 3, sla: 3, business_limited: 3 }, // client (4xx)
				{ status_code: 500, total: 2, sla: 2, business_limited: 0 } // system
			]
		};
		const { getByTestId } = render(OpsErrorDistributionChart, {
			props: { data, loading: false }
		});
		await waitFor(() => expect(getByTestId('ops-error-distribution-ready')).toBeTruthy());
		// total = 5 + 3 + 2 = 10
		expect(getByTestId('ops-error-distribution-total').textContent).toContain('10');
	});

	it('invokes onOpenDetails when Details clicked in ready state', async () => {
		const onOpenDetails = vi.fn();
		const data: OpsErrorDistributionResponse = {
			total: 5,
			items: [{ status_code: 503, total: 5, sla: 5, business_limited: 0 }]
		};
		const { getByTestId } = render(OpsErrorDistributionChart, {
			props: { data, loading: false, onOpenDetails }
		});
		const btn = getByTestId('ops-error-distribution-details') as HTMLButtonElement;
		await waitFor(() => expect(btn.disabled).toBe(false));
		await fireEvent.click(btn);
		expect(onOpenDetails).toHaveBeenCalledTimes(1);
	});
});
