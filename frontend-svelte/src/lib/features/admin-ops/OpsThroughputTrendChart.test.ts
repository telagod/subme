/**
 * OpsThroughputTrendChart · co-located unit tests
 *
 * Covers:
 *   1. Empty state — no points → empty placeholder, Details disabled.
 *   2. Group drilldown chips win over platform chips; click → onSelectGroup.
 *   3. Platform chips render when no groups; click → onSelectPlatform.
 *   4. Details button emits preset { time_range, kind:'all' } when data present.
 *
 * chart.js/auto + svelte-chartjs are mocked so jsdom never loads the real lazy
 * chunk (parity with usage.test.ts). The component itself keeps the dynamic
 * import — we only stub the module resolution.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type {
	OpsThroughputTrendPoint,
	OpsThroughputPlatformBreakdownItem,
	OpsThroughputGroupBreakdownItem
} from '$lib/api/admin/ops';

vi.mock('chart.js/auto', () => ({
	default: class {},
	Chart: class {}
}));
vi.mock('svelte-chartjs', () => ({
	Line: (() => null) as unknown as { (): null }
}));

import OpsThroughputTrendChart from './OpsThroughputTrendChart.svelte';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

beforeAll(async () => {
	addMessages('en', {});
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

const points: OpsThroughputTrendPoint[] = [
	{ bucket_start: '2026-06-20T10:00:00Z', request_count: 120, token_consumed: 45000 },
	{ bucket_start: '2026-06-20T10:05:00Z', request_count: 200, token_consumed: 88000 }
];

describe('OpsThroughputTrendChart', () => {
	it('renders empty state and disables Details when there is no data', () => {
		const { getByTestId } = render(OpsThroughputTrendChart, {
			props: { points: [], timeRange: '1h' }
		});
		expect(getByTestId('ops-throughput-empty')).toBeTruthy();
		const btn = getByTestId('ops-throughput-details-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('prefers group chips over platform chips and emits onSelectGroup', async () => {
		const onSelectGroup = vi.fn();
		const topGroups: OpsThroughputGroupBreakdownItem[] = [
			{ group_id: 7, group_name: 'alpha', request_count: 90 }
		];
		const byPlatform: OpsThroughputPlatformBreakdownItem[] = [
			{ platform: 'openai', request_count: 50 }
		];
		const { getByTestId, queryByTestId, getAllByTestId } = render(OpsThroughputTrendChart, {
			props: { points, timeRange: '1h', topGroups, byPlatform, onSelectGroup }
		});
		expect(getByTestId('ops-throughput-group-chips')).toBeTruthy();
		expect(queryByTestId('ops-throughput-platform-chips')).toBeNull();
		await fireEvent.click(getAllByTestId('ops-throughput-group-chip')[0]);
		expect(onSelectGroup).toHaveBeenCalledWith(7);
	});

	it('renders platform chips when no groups and emits onSelectPlatform', async () => {
		const onSelectPlatform = vi.fn();
		const byPlatform: OpsThroughputPlatformBreakdownItem[] = [
			{ platform: 'anthropic', request_count: 33 }
		];
		const { getByTestId, getAllByTestId } = render(OpsThroughputTrendChart, {
			props: { points, timeRange: '6h', byPlatform, onSelectPlatform }
		});
		expect(getByTestId('ops-throughput-platform-chips')).toBeTruthy();
		await fireEvent.click(getAllByTestId('ops-throughput-platform-chip')[0]);
		expect(onSelectPlatform).toHaveBeenCalledWith('anthropic');
	});

	it('emits onOpenDetails with a time-range preset when data is present', async () => {
		const onOpenDetails = vi.fn();
		const { getByTestId } = render(OpsThroughputTrendChart, {
			props: { points, timeRange: '24h', onOpenDetails }
		});
		const btn = getByTestId('ops-throughput-details-btn') as HTMLButtonElement;
		await waitFor(() => expect(btn.disabled).toBe(false));
		await fireEvent.click(btn);
		expect(onOpenDetails).toHaveBeenCalledWith({ time_range: '24h', kind: 'all' });
	});
});
