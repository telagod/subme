import { describe, expect, it } from 'vitest';
import usageApiSrc from '$lib/api/admin/usage.ts?raw';
import usagePageSrc from '../../../routes/admin/usage/+page.svelte?raw';
import {
	ALL,
	accountBilled,
	escapeCsvValue,
	formatDuration,
	formatMoney,
	formatTokens,
	requestTypeLabel,
	statusTone,
	summarizeUsageStats,
	totalTokens,
	usageEndpointLabel,
	usageModelLabel,
	usageUserLabel
} from './admin-usage';
import type { AdminUsageLog, AdminUsageStatsResponse } from '$lib/api/admin/usage';

describe('admin usage helpers', () => {
	const stats: AdminUsageStatsResponse = {
		total_requests: 12,
		total_input_tokens: 1000,
		total_output_tokens: 2000,
		total_cache_tokens: 300,
		total_tokens: 3300,
		total_cost: 1.2,
		total_actual_cost: 0.9,
		total_account_cost: 0.4,
		average_duration_ms: 1532
	};

	const row: AdminUsageLog = {
		id: 1,
		user_id: 7,
		api_key_id: 2,
		model: 'claude',
		upstream_model: 'claude-sonnet',
		inbound_endpoint: '/v1/messages',
		upstream_endpoint: '/v1/chat/completions',
		request_type: 'stream',
		input_tokens: 100,
		output_tokens: 50,
		cache_read_tokens: 25,
		cache_creation_tokens: 5,
		total_cost: 0.01,
		account_rate_multiplier: 2,
		status: 200,
		user: { id: 7, email: 'root@example.com' }
	};

	it('formats stats and row display values', () => {
		expect(summarizeUsageStats(stats).map((item) => item.label)).toEqual([
			'Requests',
			'Tokens',
			'User billed',
			'Avg duration'
		]);
		expect(formatTokens(1500)).toBe('1.5K');
		expect(formatMoney(0.123456, 6)).toBe('$0.123456');
		expect(formatDuration(1532)).toBe('1.5s');
		expect(usageUserLabel(row)).toBe('root@example.com');
		expect(usageModelLabel(row)).toBe('claude -> claude-sonnet');
		expect(usageEndpointLabel(row)).toBe('/v1/messages -> /v1/chat/completions');
		expect(totalTokens(row)).toBe(180);
		expect(accountBilled(row)).toBe(0.02);
		expect(requestTypeLabel(row)).toBe('Stream');
		expect(statusTone(row)).toContain('emerald');
	});

	it('escapes CSV injection and keeps sentinel contract explicit', () => {
		expect(ALL).toBe('__all__');
		expect(escapeCsvValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
		expect(escapeCsvValue('a,b')).toBe('"a,b"');
	});

	it('keeps the admin usage surface on the Vue-compatible admin usage contract', () => {
		expect(usageApiSrc).toContain("const USAGE_BASE = '/api/v1/admin/usage'");
		expect(usageApiSrc).toContain('/search-users');
		expect(usageApiSrc).toContain('/search-api-keys');
		expect(usageApiSrc).toContain('/cleanup-tasks');
		expect(usageApiSrc).not.toContain("const USAGE_BASE = '/admin/usage'");
		expect(usageApiSrc).not.toContain("'/api/admin/usage'");
		expect(usageApiSrc).not.toContain('"/api/admin/usage"');
		expect(usagePageSrc).toContain('data-testid="admin-usage-row"');
		expect(usagePageSrc).toContain('VirtualTable');
		expect(usagePageSrc).toContain("request_type: requestTypeFilter === ALL ? undefined");
		expect(usagePageSrc).not.toContain('chart.js');
		expect(usagePageSrc).not.toContain('updateChannelPricing');
	});
});
