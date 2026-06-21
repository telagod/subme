import { describe, expect, it } from 'vitest';
import apiSrc from '$lib/api/admin/riskControl.ts?raw';
import pageSrc from '../../../routes/admin/risk-control/+page.svelte?raw';
import rerouteTestSrc from '$lib/routing/reroute.test.ts?raw';
import {
	DEFAULT_CONFIG,
	RISK_THRESHOLD_DEFAULTS,
	RISK_THRESHOLD_CATEGORIES,
	SETTINGS_TABS,
	AUTO_REFRESH_MS,
	auditResultSummary,
	clampPercent,
	cloneConfig,
	formatThresholdPercent,
	isValidHash,
	modelFilterSummary,
	parseLines,
	resultLabel,
	resultTone,
	runtimeEnabled,
	summarizeRisk,
	thresholdsFromConfig,
	thresholdsToPayload
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

	it('threshold helpers round-trip correctly', () => {
		const raw: Record<string, number> = { harassment: 0.98, hate: 0.65, violence: 0.5 };
		const local = thresholdsFromConfig(raw);
		expect(local.harassment).toBeCloseTo(98, 1);
		expect(local.hate).toBeCloseTo(65, 1);
		expect(local.violence).toBeCloseTo(50, 1);
		expect(local['self-harm']).toBeCloseTo(65, 1); // default

		const payload = thresholdsToPayload(local);
		expect(payload.harassment).toBeCloseTo(0.98, 3);
		expect(payload.violence).toBeCloseTo(0.5, 3);

		expect(clampPercent(-5)).toBe(0);
		expect(clampPercent(200)).toBe(100);
		expect(clampPercent('abc')).toBe(0);

		expect(formatThresholdPercent(65)).toBe('65.0%');
		expect(formatThresholdPercent(0)).toBe('0.0%');
	});

	it('exports correct constants', () => {
		expect(RISK_THRESHOLD_CATEGORIES.length).toBeGreaterThan(10);
		expect(RISK_THRESHOLD_DEFAULTS.harassment).toBe(98);
		expect(SETTINGS_TABS.length).toBe(7);
		expect(SETTINGS_TABS.map((t) => t.id)).toContain('response');
		expect(SETTINGS_TABS.map((t) => t.id)).toContain('riskThresholds');
		expect(SETTINGS_TABS.map((t) => t.id)).toContain('scope');
		expect(AUTO_REFRESH_MS).toBe(15000);
	});

	it('model filter summary formats correctly', () => {
		expect(modelFilterSummary('all', 0)).toBe('All models');
		expect(modelFilterSummary('include', 3)).toBe('Include 3 models');
		expect(modelFilterSummary('exclude', 1)).toBe('Exclude 1 model');
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
		expect(pageSrc).toContain('RuntimePanel');
		expect(pageSrc).toContain('RiskSettingsDialog');
		expect(rerouteTestSrc).toContain("'/admin/risk-control'");
	});
});
