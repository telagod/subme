import { describe, expect, it } from 'vitest';
import apiSrc from '$lib/api/admin/riskControl.ts?raw';
import pageSrc from '../../../routes/admin/risk-control/+page.svelte?raw';
import rerouteTestSrc from '$lib/routing/reroute.test.ts?raw';
import {
	DEFAULT_CONFIG,
	auditResultSummary,
	cloneConfig,
	isValidHash,
	parseLines,
	resultLabel,
	resultTone,
	runtimeEnabled,
	summarizeRisk
} from './risk-control';
import type {
	ContentModerationLog,
	ContentModerationRuntimeStatus,
	ContentModerationTestAuditResult
} from '$lib/api/admin/riskControl';

describe('risk-control helpers', () => {
	it('clones config and summarizes runtime state', () => {
		const config = cloneConfig({
			...DEFAULT_CONFIG,
			enabled: true,
			mode: 'pre_block',
			api_key_configured: true,
			api_key_count: 2,
			api_key_statuses: [{ index: 0, key_hash: 'h', masked: 'sk-***', status: 'ok', failure_count: 0, success_count: 1, last_error: '', last_latency_ms: 1, last_http_status: 200, last_tested: true, configured: true }]
		});
		const status: ContentModerationRuntimeStatus = {
			enabled: true,
			risk_control_enabled: true,
			mode: 'pre_block',
			worker_count: 4,
			max_workers: 8,
			active_workers: 1,
			idle_workers: 3,
			queue_size: 100,
			queue_length: 10,
			queue_usage_percent: 10,
			enqueued: 5,
			dropped: 0,
			processed: 4,
			errors: 1,
			pre_block_active: 1,
			pre_block_checked: 3,
			pre_block_allowed: 2,
			pre_block_blocked: 1,
			pre_block_errors: 0,
			pre_block_avg_latency_ms: 123,
			pre_block_api_key_active: 1,
			pre_block_api_key_available_count: 2,
			pre_block_api_key_total_calls: 3,
			pre_block_api_key_loads: [],
			api_key_statuses: config.api_key_statuses,
			flagged_hash_count: 7,
			last_cleanup_deleted_hit: 0,
			last_cleanup_deleted_non_hit: 0
		};
		expect(runtimeEnabled(config, status)).toBe(true);
		expect(summarizeRisk(config, status, 42)[0]).toMatchObject({ label: 'Status', value: 'Enabled' });
		expect(summarizeRisk(config, status, 42)[3].meta).toBe('7 flagged hashes');
	});

	it('formats logs and parses line inputs', () => {
		const row: ContentModerationLog = {
			id: 1,
			request_id: 'req',
			user_id: 1,
			user_email: 'u@example.com',
			api_key_id: null,
			api_key_name: '',
			group_id: null,
			group_name: '',
			endpoint: '/v1/messages',
			provider: 'openai',
			model: 'omni',
			mode: 'pre_block',
			action: 'block',
			flagged: true,
			highest_category: 'violence',
			highest_score: 99,
			category_scores: {},
			threshold_snapshot: {},
			input_excerpt: 'bad',
			upstream_latency_ms: 20,
			error: '',
			violation_count: 1,
			auto_banned: true,
			email_sent: false,
			user_status: 'disabled',
			queue_delay_ms: 1,
			created_at: '2026-01-01'
		};
		const audit: ContentModerationTestAuditResult = {
			flagged: true,
			highest_category: 'violence',
			highest_score: 99,
			composite_score: 99,
			category_scores: {},
			thresholds: {}
		};
		expect(parseLines('a\nb, c')).toEqual(['a', 'b', 'c']);
		expect(resultLabel(row)).toBe('Blocked');
		expect(resultTone(row)).toContain('destructive');
		expect(auditResultSummary(audit)).toBe('Flagged · violence 99%');
		expect(isValidHash('a'.repeat(64))).toBe(true);
		expect(isValidHash('not-a-hash')).toBe(false);
	});

	it('keeps risk-control page wired to backend contract', () => {
		expect(apiSrc).toContain("const RISK_BASE = '/api/v1/admin/risk-control'");
		expect(apiSrc).not.toContain("'/api/admin/risk-control'");
		expect(apiSrc).toContain('/config');
		expect(apiSrc).toContain('/status');
		expect(apiSrc).toContain('/api-keys/test');
		expect(apiSrc).toContain('/logs');
		expect(apiSrc).toContain('/users/${userId}/unban');
		expect(apiSrc).toContain('/hashes/all');
		expect(pageSrc).toContain('data-testid="admin-risk-control-page"');
		expect(pageSrc).toContain('data-testid="risk-clear-hashes-dialog"');
		expect(pageSrc).not.toMatch(/window\.confirm/);
		expect(pageSrc).toContain('RiskLogsPanel');
		expect(rerouteTestSrc).toContain("'/admin/risk-control'");
	});
});
