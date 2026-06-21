import { describe, expect, it } from 'vitest';
import opsHealthCardSrc from './OpsHealthCard.svelte?raw';
import type { OpsDashboardOverview, OpsMetricThresholds } from '$lib/api/admin/ops';
import {
	buildDiagnosis,
	buildOpsKpisFromOverview,
	cpuCell,
	dbCell,
	goroutineStatus,
	healthScoreClass,
	healthScoreStroke,
	isSystemIdle,
	jobsStatus,
	jobsWarnCount,
	memCell,
	redisCell,
	requestErrorRateThresholdLevel,
	slaThresholdLevel,
	ttftThresholdLevel
} from './ops';

const thresholds: OpsMetricThresholds = {
	sla_percent_min: 99,
	ttft_p99_ms_max: 500,
	request_error_rate_percent_max: 2,
	upstream_error_rate_percent_max: 5
};

function busyOverview(): OpsDashboardOverview {
	return {
		health_score: 72,
		sla: 0.975, // 97.5%
		request_count_total: 1000,
		request_count_sla: 980,
		success_count: 950,
		error_count_sla: 30,
		business_limited_count: 5,
		error_count_total: 30,
		error_rate: 0.04, // 4%
		upstream_error_rate: 0.06, // 6%
		upstream_error_count_excl_429_529: 12,
		upstream_429_count: 3,
		upstream_529_count: 2,
		token_consumed: 123456,
		qps: { current: 12.3, peak: 44, avg: 10 },
		tps: { current: 456, peak: 789, avg: 400 },
		duration: { p99_ms: 1500, p95_ms: 1200, p50_ms: 400 },
		ttft: { p99_ms: 600, p95_ms: 450, p50_ms: 120 },
		system_metrics: {
			cpu_usage_percent: 82,
			memory_usage_percent: 91,
			memory_used_mb: 1024,
			memory_total_mb: 2048,
			db_ok: true,
			db_conn_active: 5,
			db_conn_idle: 5,
			db_conn_waiting: 0,
			db_max_open_conns: 20,
			redis_ok: false,
			redis_conn_total: 8,
			redis_conn_idle: 6,
			redis_pool_size: 10,
			goroutine_count: 9000,
			concurrency_queue_depth: 3,
			account_switch_count: 7
		} as OpsDashboardOverview['system_metrics'],
		job_heartbeats: [
			{ job_name: 'ok-job', last_success_at: '2026-06-19T10:00:00Z', last_error_at: null },
			{ job_name: 'bad-job', last_success_at: '2026-06-19T09:00:00Z', last_error_at: '2026-06-19T10:00:00Z', last_error: 'boom' }
		]
	};
}

describe('OpsHealthCard helpers', () => {
	it('builds 7 KPI tiles with threshold breach levels', () => {
		const tiles = buildOpsKpisFromOverview(busyOverview(), thresholds);
		expect(tiles).toHaveLength(7);
		const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));

		// 97.5% SLA < 99 min => critical
		expect(byKey.sla.level).toBe('critical');
		expect(byKey.sla.value).toBe('97.500%');
		// ttft p99 600 >= 500 max => critical
		expect(byKey.ttft.level).toBe('critical');
		// request error 4% >= 2 max => critical
		expect(byKey.request_errors.level).toBe('critical');
		// upstream 6% >= 5 max => critical
		expect(byKey.upstream_errors.level).toBe('critical');
		// health/requests/duration carry no threshold accent
		expect(byKey.health.level).toBe('normal');
		expect(byKey.requests.level).toBe('normal');
		expect(byKey.duration.level).toBe('normal');
		// exceptions row = request_count_sla - success_count = 30
		expect(byKey.sla.rows[0].value).toBe('30');
	});

	it('returns normal levels when thresholds are null', () => {
		const tiles = buildOpsKpisFromOverview(busyOverview(), null);
		for (const t of tiles) expect(t.level).toBe('normal');
	});

	it('detects idle state and styles the score accordingly', () => {
		const idle: OpsDashboardOverview = { health_score: 100, qps: { current: 0 }, error_rate: 0 };
		expect(isSystemIdle(idle)).toBe(true);
		expect(healthScoreClass(idle)).toBe('text-muted-foreground');
		expect(healthScoreStroke(idle)).toContain('muted-foreground');
		expect(isSystemIdle(busyOverview())).toBe(false);
	});

	it('grades health-score color bands', () => {
		expect(healthScoreClass({ health_score: 95, qps: { current: 1 } })).toBe('text-emerald-500');
		expect(healthScoreClass({ health_score: 72, qps: { current: 1 } })).toBe('text-amber-500');
		expect(healthScoreClass({ health_score: 40, qps: { current: 1 } })).toBe('text-red-500');
	});

	it('honors SLA higher-is-better threshold buffer', () => {
		expect(slaThresholdLevel(98.5, thresholds)).toBe('critical'); // below 99
		expect(slaThresholdLevel(99.05, thresholds)).toBe('warning'); // within +0.1
		expect(slaThresholdLevel(99.5, thresholds)).toBe('normal');
		expect(slaThresholdLevel(null, thresholds)).toBe('normal');
	});

	it('grades higher-is-worse thresholds at max and 0.8x', () => {
		expect(ttftThresholdLevel(600, thresholds)).toBe('critical');
		expect(ttftThresholdLevel(420, thresholds)).toBe('warning'); // >= 400
		expect(ttftThresholdLevel(100, thresholds)).toBe('normal');
		expect(requestErrorRateThresholdLevel(2, thresholds)).toBe('critical');
		expect(requestErrorRateThresholdLevel(1.7, thresholds)).toBe('warning'); // >= 1.6
		expect(requestErrorRateThresholdLevel(0.1, thresholds)).toBe('normal');
	});

	it('derives system-metrics cells with usage + colors', () => {
		const sm = busyOverview().system_metrics;
		expect(cpuCell(sm).value).toBe('82.0%');
		expect(cpuCell(sm).colorClass).toBe('text-amber-500'); // 82 in [80,95)
		expect(memCell(sm).value).toBe('91.0%');
		expect(memCell(sm).colorClass).toBe('text-amber-500'); // 91 in [85,95)
		// db usage = (active+idle)/max = 10/20 = 50%
		expect(dbCell(sm).value).toBe('50%');
		expect(dbCell(sm).colorClass).toBe('text-emerald-500');
		// redis_ok false => FAIL regardless of usage
		expect(redisCell(sm).value).toBe('FAIL');
		expect(redisCell(sm).colorClass).toBe('text-red-500');
	});

	it('renders FAIL when db health is down', () => {
		expect(dbCell({ db_ok: false } as OpsDashboardOverview['system_metrics']).value).toBe('FAIL');
	});

	it('grades goroutine status by thresholds', () => {
		expect(goroutineStatus({ goroutine_count: 100 } as never)).toBe('ok');
		expect(goroutineStatus({ goroutine_count: 9000 } as never)).toBe('warning');
		expect(goroutineStatus({ goroutine_count: 16000 } as never)).toBe('critical');
		expect(goroutineStatus(null)).toBe('unknown');
	});

	it('flags job heartbeats where error is newer than success', () => {
		const ov = busyOverview();
		expect(jobsStatus(ov)).toBe('warn');
		expect(jobsWarnCount(ov)).toBe(1);
		expect(jobsStatus({ job_heartbeats: [] })).toBe('unknown');
	});

	it('builds prioritized diagnosis with idle and healthy short-circuits', () => {
		const idle = buildDiagnosis({ health_score: 100, qps: { current: 0 }, error_rate: 0 });
		expect(idle).toHaveLength(1);
		expect(idle[0].type).toBe('info');
		expect(idle[0].messageKey).toBe('admin.ops.diagnosis.idle');

		const report = buildDiagnosis(busyOverview());
		const keys = report.map((r) => r.messageKey);
		// redis down (warning) + mem critical + cpu high + ttft high + upstream crit + error high + sla low + health low
		expect(keys).toContain('admin.ops.diagnosis.redisDown');
		expect(keys).toContain('admin.ops.diagnosis.memoryCritical');
		expect(keys).toContain('admin.ops.diagnosis.upstreamCritical');
		expect(keys).toContain('admin.ops.diagnosis.slaLow');
		expect(report.find((r) => r.messageKey === 'admin.ops.diagnosis.cpuHigh')?.params).toEqual({
			usage: '82.0'
		});

		const healthy = buildDiagnosis({
			health_score: 100,
			qps: { current: 5 },
			sla: 1,
			error_rate: 0,
			upstream_error_rate: 0
		});
		expect(healthy).toHaveLength(1);
		expect(healthy[0].messageKey).toBe('admin.ops.diagnosis.healthy');
	});
});

describe('OpsHealthCard component contract', () => {
	it('exposes exactly the wired props', () => {
		expect(opsHealthCardSrc).toContain('overview,');
		expect(opsHealthCardSrc).toContain('thresholds,');
		expect(opsHealthCardSrc).toContain('loading = false');
	});

	it('uses i18n with English {default} fallbacks (no hardcoded-English findings)', () => {
		expect(opsHealthCardSrc).toContain("$_('admin.ops.health'");
		expect(opsHealthCardSrc).toContain('default:');
	});

	it('does NOT top-level import chart.js (TDZ vendor-chunk trap)', () => {
		expect(opsHealthCardSrc).not.toMatch(/import .*from ['"]chart\.js['"]/);
		expect(opsHealthCardSrc).not.toContain("import('chart.js')");
	});
});
