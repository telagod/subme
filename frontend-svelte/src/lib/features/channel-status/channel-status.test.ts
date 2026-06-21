import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import apiSrc from '$lib/api/user/channelMonitor.ts?raw';
import pageSrc from '../../../routes/(user)/monitor/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	availabilityForWindow,
	filterMonitors,
	formatAvailability,
	formatLatency,
	overallStatus,
	statusTone
} from './channel-status';
import type { UserMonitorDetail, UserMonitorView } from '$lib/api/user/channelMonitor';

vi.mock('$lib/api/user/channelMonitor', () => ({
	listUserChannelMonitors: vi.fn(),
	getUserChannelMonitorStatus: vi.fn(),
	userChannelMonitorApi: {}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

const row: UserMonitorView = {
	id: 1,
	name: 'Primary',
	provider: 'openai',
	group_name: 'default',
	primary_model: 'gpt-4o',
	primary_status: 'operational',
	primary_latency_ms: 123.4,
	primary_ping_latency_ms: 40,
	availability_7d: 99.5,
	extra_models: [{ model: 'gpt-4o-mini', status: 'degraded', latency_ms: 300 }],
	timeline: []
};

const detail: UserMonitorDetail = {
	id: 1,
	name: 'Primary',
	provider: 'openai',
	group_name: 'default',
	models: [
		{
			model: 'gpt-4o',
			latest_status: 'operational',
			latest_latency_ms: 120,
			availability_7d: 99,
			availability_15d: 98,
			availability_30d: 97,
			avg_latency_7d_ms: 150
		}
	]
};

beforeAll(async () => {
	addMessages('en', {
		common: { refresh: 'Refresh' },
		channelStatus: {
			title: 'Channel Status',
			description: 'desc',
			searchPlaceholder: 'Search channels',
			loadError: 'Load failed',
			detailLoadError: 'Detail failed',
			detailTitle: 'Channel Detail',
			closeDetail: 'Close',
			windowTab: { '7d': '7 days', '15d': '15 days', '30d': '30 days' },
			overall: { operational: 'OPERATIONAL', degraded: 'DEGRADED', unavailable: 'UNAVAILABLE' },
			columns: {
				primaryModel: 'Primary Model',
				availability7d: '7d Availability',
				latency: 'Latency'
			},
			empty: {
				title: 'No channels available',
				description: 'No monitored channels have been configured yet.'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('user channel status helpers', () => {
	it('summarizes, filters, and formats monitor rows', () => {
		expect(overallStatus([row])).toBe('operational');
		expect(overallStatus([{ ...row, primary_status: 'failed' }])).toBe('degraded');
		expect(filterMonitors([row], 'mini')).toHaveLength(1);
		expect(filterMonitors([row], 'missing')).toHaveLength(0);
		expect(formatAvailability(99.5)).toBe('99.50%');
		expect(formatLatency(123.4)).toBe('123 ms');
		expect(statusTone('failed')).toContain('red');
		expect(availabilityForWindow(detail.models[0], '30d')).toBe(97);
	});

	it('keeps user monitor page wired to read-only backend contract', () => {
		expect(apiSrc).toContain('/api/v1/channel-monitors');
		expect(apiSrc).toContain('/status');
		expect(apiSrc).not.toContain('POST');
		expect(apiSrc).not.toContain('DELETE');
		expect(pageSrc).toContain('data-testid="channel-status-page"');
		expect(pageSrc).toContain('data-testid="channel-status-card"');
		expect(rerouteSrc).not.toContain("'/monitor'");
	});
});

describe('user channel status page', () => {
	let api: typeof import('$lib/api/user/channelMonitor');
	let pageMod: typeof import('../../../routes/(user)/monitor/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/channelMonitor');
		(api.listUserChannelMonitors as ReturnType<typeof vi.fn>).mockReset();
		(api.getUserChannelMonitorStatus as ReturnType<typeof vi.fn>).mockReset();
		(api.listUserChannelMonitors as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [row] });
		(api.getUserChannelMonitorStatus as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
		pageMod = await import('../../../routes/(user)/monitor/+page.svelte');
	});

	it('renders monitor cards and opens model detail', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listUserChannelMonitors).toHaveBeenCalled());
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="channel-status-card"]').length).toBe(1);
		});
		expect(container.textContent).toContain('gpt-4o');
		const card = container.querySelector('[data-testid="channel-status-card"]') as HTMLButtonElement;
		await fireEvent.click(card);
		await waitFor(() => expect(api.getUserChannelMonitorStatus).toHaveBeenCalledWith(1));
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="channel-status-detail-row"]').length).toBe(1);
		});
	});
});
