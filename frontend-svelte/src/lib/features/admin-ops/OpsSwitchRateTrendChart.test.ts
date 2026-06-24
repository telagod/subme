import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { init, locale } from 'svelte-i18n';
import OpsSwitchRateTrendChart from './OpsSwitchRateTrendChart.svelte';
import type { OpsThroughputTrendPoint } from '$lib/api/admin/ops';

beforeAll(async () => {
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

afterEach(() => cleanup());

function pts(): OpsThroughputTrendPoint[] {
	return [
		{ bucket_start: '00:00', request_count: 10, switch_count: 2 },
		{ bucket_start: '01:00', request_count: 20, switch_count: 5 }
	];
}

describe('OpsSwitchRateTrendChart', () => {
	it('renders the loading branch while loading and no data yet', () => {
		const { getByTestId } = render(OpsSwitchRateTrendChart, {
			props: { points: [], loading: true, timeRange: '5h' }
		});
		expect(getByTestId('ops-switch-rate-trend-loading')).toBeTruthy();
	});

	it('renders the empty branch when there are no requests', () => {
		const { getByTestId } = render(OpsSwitchRateTrendChart, {
			props: { points: [], loading: false, timeRange: '5h' }
		});
		expect(getByTestId('ops-switch-rate-trend-empty')).toBeTruthy();
	});

	it('treats points with zero total requests as empty (mirrors Vue guard)', () => {
		const { getByTestId } = render(OpsSwitchRateTrendChart, {
			props: {
				points: [{ bucket_start: '00:00', request_count: 0, switch_count: 3 }],
				loading: false,
				timeRange: '5h'
			}
		});
		expect(getByTestId('ops-switch-rate-trend-empty')).toBeTruthy();
	});

	it('exposes the time range and chart host when data is present', () => {
		const { getByTestId } = render(OpsSwitchRateTrendChart, {
			props: { points: pts(), loading: false, timeRange: '5h' }
		});
		const host = getByTestId('ops-switch-rate-trend-chart');
		expect(host).toBeTruthy();
		expect(host.getAttribute('data-time-range')).toBe('5h');
		// With real data the empty/loading placeholders must NOT be the active branch.
		expect(host.querySelector('[data-testid="ops-switch-rate-trend-empty"]')).toBeNull();
	});
});
