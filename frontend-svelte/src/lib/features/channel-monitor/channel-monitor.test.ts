import { describe, expect, it } from 'vitest';
import apiSrc from '$lib/api/admin/channelMonitor.ts?raw';
import pageSrc from '../../../routes/admin/channels/monitor/+page.svelte?raw';
import {
	formatAvailability,
	formatLatency,
	parseExtraModels,
	providerLabel,
	providerTone,
	statusTone,
	summarizeMonitors
} from './channel-monitor';
import type { ChannelMonitor } from '$lib/api/admin/channelMonitor';

describe('admin channel monitor helpers', () => {
	const base: ChannelMonitor = {
		id: 1,
		name: 'OpenAI primary',
		provider: 'openai',
		api_mode: 'chat_completions',
		endpoint: 'https://api.openai.com/v1/chat/completions',
		api_key_masked: 'sk-***',
		primary_model: 'gpt-4o',
		extra_models: [],
		group_name: 'default',
		enabled: true,
		interval_seconds: 300,
		jitter_seconds: 0,
		last_checked_at: '2026-01-01T00:00:00Z',
		created_by: 1,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		primary_status: 'operational',
		primary_latency_ms: 120.5,
		availability_7d: 99.5,
		extra_models_status: [],
		template_id: null,
		extra_headers: {},
		body_override_mode: 'off',
		body_override: null
	};

	it('summarizes monitor state and formats health values', () => {
		const rows = [base, { ...base, id: 2, enabled: false, primary_status: 'failed' as const, availability_7d: 80 }];
		expect(summarizeMonitors(rows)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Enabled', value: 1 },
			{ label: 'Operational', value: 1 },
			{ label: 'Avg availability', value: 89.75 }
		]);
		expect(formatAvailability(base)).toBe('99.50%');
		expect(formatLatency(base.primary_latency_ms)).toBe('121 ms');
		expect(providerLabel('openai')).toBe('OpenAI');
		expect(providerTone('gemini')).toContain('sky');
		expect(statusTone('failed')).toContain('red');
		expect(parseExtraModels('a,b\nc')).toEqual(['a', 'b', 'c']);
	});

	it('keeps channel monitor isolated from channel pricing mutation APIs', () => {
		expect(apiSrc).toContain("const MONITORS_BASE = '/api/v1/admin/channel-monitors'");
		expect(apiSrc).toContain('function unwrap');
		expect(apiSrc).toContain('.then(unwrap)');
		expect(pageSrc).toContain('data-testid="admin-channel-monitor-row"');
		expect(pageSrc).toContain('VirtualTable');
		expect(pageSrc).not.toContain('/admin/channels/model-pricing');
		expect(pageSrc).not.toContain('updateChannelPricing');
	});
});
