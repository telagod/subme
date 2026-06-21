import { describe, expect, it } from 'vitest';
import opsApiSrc from '$lib/api/admin/ops.ts?raw';
import opsPageSrc from '../../../routes/admin/ops/+page.svelte?raw';
import rerouteTestSrc from '$lib/routing/reroute.test.ts?raw';
import {
	alertTone,
	buildOpsKpis,
	formatDuration,
	platformAvailability,
	platformConcurrency,
	recentErrors,
	recentThroughput,
	sinkHealthText,
	trafficRates
} from './ops';
import type {
	OpsAccountAvailabilityStatsResponse,
	OpsConcurrencyStatsResponse,
	OpsDashboardSnapshotV2Response,
	OpsRealtimeTrafficSummaryResponse,
	OpsSystemLogSinkHealth
} from '$lib/api/admin/ops';

function fakeSnapshot(): OpsDashboardSnapshotV2Response {
	return {
		generated_at: '2026-06-19T00:00:00Z',
		overview: {
			health_score: 99.2,
			sla: 98.5,
			request_count_total: 1000,
			request_count_sla: 980,
			success_count: 970,
			error_count_total: 30,
			error_rate: 3,
			token_consumed: 123456,
			qps: { current: 12.3, peak: 44 },
			tps: { current: 456, peak: 789 },
			duration: { p95_ms: 1234 },
			ttft: { p95_ms: 250 }
		},
		throughput_trend: {
			points: [
				{ bucket_start: 'a', request_count: 1 },
				{ bucket_start: 'b', request_count: 2 }
			]
		},
		error_trend: {
			points: [
				{ bucket_start: 'a', error_count_total: 1 },
				{ bucket_start: 'b', error_count_total: 3 }
			]
		}
	};
}

describe('admin ops helpers', () => {
	it('builds dashboard KPI and trend summaries', () => {
		const kpis = buildOpsKpis(fakeSnapshot());
		expect(kpis).toHaveLength(8);
		expect(kpis[0]).toMatchObject({ label: 'Health', value: '99.2%' });
		expect(kpis[7].value).toBe('1.2s');
		expect(formatDuration(250)).toBe('250ms');
		expect(recentThroughput(fakeSnapshot())).toHaveLength(2);
		expect(recentErrors(fakeSnapshot())[1].error_count_total).toBe(3);
	});

	it('normalizes live platform signals', () => {
		const concurrency: OpsConcurrencyStatsResponse = {
			enabled: true,
			platform: {
				a: { platform: 'a', current_in_use: 1, max_capacity: 10, load_percentage: 10, waiting_in_queue: 0 },
				b: { platform: 'b', current_in_use: 9, max_capacity: 10, load_percentage: 90, waiting_in_queue: 2 }
			}
		};
		const availability: OpsAccountAvailabilityStatsResponse = {
			enabled: true,
			platform: {
				a: { platform: 'a', total_accounts: 10, available_count: 9, rate_limit_count: 0, error_count: 1 },
				b: { platform: 'b', total_accounts: 10, available_count: 5, rate_limit_count: 1, error_count: 4 }
			}
		};
		const traffic: OpsRealtimeTrafficSummaryResponse = {
			enabled: true,
			summary: { window: '1m', qps: { current: 2 }, tps: { current: 100 } }
		};
		const health: OpsSystemLogSinkHealth = {
			queue_depth: 3,
			queue_capacity: 10,
			dropped_count: 0,
			write_failed_count: 0,
			written_count: 100,
			avg_write_delay_ms: 2
		};

		expect(platformConcurrency(concurrency)[0].platform).toBe('b');
		expect(platformAvailability(availability)[0].platform).toBe('b');
		expect(trafficRates(traffic).qps.current).toBe(2);
		expect(sinkHealthText(health)).toBe('3 / 10 queued');
		expect(alertTone({ severity: 'P1', status: 'firing' })).toContain('destructive');
	});

	it('keeps ops dashboard wired to existing admin ops endpoints', () => {
		expect(opsApiSrc).toContain("const OPS_BASE = '/api/v1/admin/ops'");
		expect(opsApiSrc).not.toContain("'/api/admin/ops'");
		expect(opsApiSrc).toContain('/dashboard/snapshot-v2');
		expect(opsApiSrc).toContain('/concurrency');
		expect(opsApiSrc).toContain('/account-availability');
		expect(opsApiSrc).toContain('/realtime-traffic');
		expect(opsApiSrc).toContain('/alert-events');
		expect(opsApiSrc).toContain('/system-logs/health');
		expect(opsPageSrc).toContain('OpsFilterBar');
		expect(opsPageSrc).toContain('OpsHealthCard');
		expect(opsPageSrc).toContain('OpsErrorLogTable');
		expect(opsPageSrc).toContain('OpsSystemLogTable');
		expect(opsPageSrc).toContain('ops_monitoring_enabled');
		expect(opsPageSrc).not.toContain("from 'chart.js'");
		expect(rerouteTestSrc).toContain("'/admin/ops'");
	});
});
