import type {
	AlertEvent,
	OpsAccountAvailabilityStatsResponse,
	OpsConcurrencyStatsResponse,
	OpsDashboardOverview,
	OpsDashboardSnapshotV2Response,
	OpsErrorTrendPoint,
	OpsJobHeartbeat,
	OpsMetricThresholds,
	OpsRealtimeTrafficSummaryResponse,
	OpsSystemLog,
	OpsSystemLogSinkHealth,
	OpsSystemMetricsSnapshot,
	OpsThroughputTrendPoint,
	PlatformAvailability,
	PlatformConcurrencyInfo
} from '$lib/api/admin/ops';

export const TIME_RANGES = ['5m', '30m', '1h', '6h', '24h'] as const;

export function numberValue(value: unknown): number {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export function formatCompact(value: unknown): string {
	return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
		numberValue(value)
	);
}

export function formatPercent(value: unknown): string {
	const n = numberValue(value);
	return `${Math.round(n * 100) / 100}%`;
}

export function formatRate(value: unknown): string {
	const n = numberValue(value);
	return n >= 100 ? formatCompact(n) : String(Math.round(n * 100) / 100);
}

export function formatDuration(ms: unknown): string {
	const n = numberValue(ms);
	if (n <= 0) return '—';
	if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}s`;
	return `${Math.round(n)}ms`;
}

export function formatDateTime(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function overview(snapshot: OpsDashboardSnapshotV2Response): OpsDashboardOverview {
	return snapshot.overview ?? {};
}

export function buildOpsKpis(snapshot: OpsDashboardSnapshotV2Response) {
	const o = overview(snapshot);
	return [
		{ label: 'Health', value: formatPercent(o.health_score), sub: 'score' },
		{ label: 'SLA', value: formatPercent(o.sla), sub: `${formatCompact(o.request_count_sla)} requests` },
		{ label: 'Requests', value: formatCompact(o.request_count_total), sub: `${formatCompact(o.success_count)} ok` },
		{ label: 'Errors', value: formatCompact(o.error_count_total), sub: `${formatPercent(o.error_rate)} rate` },
		{ label: 'Tokens', value: formatCompact(o.token_consumed), sub: 'consumed' },
		{ label: 'QPS', value: formatRate(o.qps?.current), sub: `peak ${formatRate(o.qps?.peak)}` },
		{ label: 'TPS', value: formatRate(o.tps?.current), sub: `peak ${formatRate(o.tps?.peak)}` },
		{ label: 'Latency P95', value: formatDuration(o.duration?.p95_ms), sub: `TTFT ${formatDuration(o.ttft?.p95_ms)}` }
	];
}

export function recentThroughput(snapshot: OpsDashboardSnapshotV2Response, limit = 8): OpsThroughputTrendPoint[] {
	return [...(snapshot.throughput_trend?.points ?? [])].slice(-limit);
}

export function recentErrors(snapshot: OpsDashboardSnapshotV2Response, limit = 8): OpsErrorTrendPoint[] {
	return [...(snapshot.error_trend?.points ?? [])].slice(-limit);
}

export function platformConcurrency(resp: OpsConcurrencyStatsResponse | null): PlatformConcurrencyInfo[] {
	return Object.values(resp?.platform ?? {}).sort((a, b) => numberValue(b.load_percentage) - numberValue(a.load_percentage));
}

export function platformAvailability(resp: OpsAccountAvailabilityStatsResponse | null): PlatformAvailability[] {
	return Object.values(resp?.platform ?? {}).sort((a, b) => numberValue(b.error_count) - numberValue(a.error_count));
}

export function trafficRates(resp: OpsRealtimeTrafficSummaryResponse | null) {
	return {
		qps: resp?.summary?.qps ?? {},
		tps: resp?.summary?.tps ?? {},
		window: resp?.summary?.window ?? '1m'
	};
}

export function alertTone(event: Pick<AlertEvent, 'severity' | 'status'>): string {
	if (event.status === 'resolved' || event.status === 'manual_resolved') {
		return 'border-zinc-400/30 bg-zinc-400/10 text-muted-foreground';
	}
	switch (event.severity) {
		case 'P0':
		case 'P1':
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		case 'P2':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}

export function logTone(log: Pick<OpsSystemLog, 'level'>): string {
	switch (log.level) {
		case 'error':
		case 'fatal':
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		case 'warn':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		case 'debug':
			return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}

export function sinkHealthText(health: OpsSystemLogSinkHealth | null): string {
	if (!health) return '—';
	if (health.last_error) return health.last_error;
	if (numberValue(health.queue_capacity) <= 0) return 'disabled';
	return `${formatCompact(health.queue_depth)} / ${formatCompact(health.queue_capacity)} queued`;
}

// ── Overview-driven KPI + threshold model (OpsHealthCard) ─────────────────────
//
// GROUND TRUTH: frontend/src/views/admin/ops/components/OpsDashboardHeader.vue
// (KPI cards + threshold helpers + system-health sub-grid). Kept as pure fns so
// the Svelte card stays presentational and the logic stays unit-testable.

export type ThresholdLevel = 'normal' | 'warning' | 'critical';

/** Tailwind text-color token for a threshold level (Zinc-palette safe accents). */
export function thresholdColorClass(level: ThresholdLevel): string {
	switch (level) {
		case 'critical':
			return 'text-red-500';
		case 'warning':
			return 'text-amber-500';
		default:
			return 'text-emerald-500';
	}
}

/** Optional numeric reader: returns a finite number or null (mirrors Vue guards). */
export function finiteOrNull(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/** overview.sla is a 0..1 fraction; KPI/thresholds compare in percent units. */
export function slaPercent(overview: OpsDashboardOverview | null): number | null {
	const v = overview?.sla;
	return typeof v === 'number' && Number.isFinite(v) ? v * 100 : null;
}

export function errorRatePercent(overview: OpsDashboardOverview | null): number | null {
	const v = overview?.error_rate;
	return typeof v === 'number' && Number.isFinite(v) ? v * 100 : null;
}

export function upstreamErrorRatePercent(overview: OpsDashboardOverview | null): number | null {
	const v = overview?.upstream_error_rate;
	return typeof v === 'number' && Number.isFinite(v) ? v * 100 : null;
}

/** SLA is "higher is better": below min => critical, within +0.1% buffer => warning. */
export function slaThresholdLevel(
	pct: number | null,
	thresholds: OpsMetricThresholds | null
): ThresholdLevel {
	if (pct == null) return 'normal';
	const min = thresholds?.sla_percent_min;
	if (min == null) return 'normal';
	const warningBuffer = 0.1;
	if (pct < min) return 'critical';
	if (pct < min + warningBuffer) return 'warning';
	return 'normal';
}

/** Generic "higher is worse" check at max (critical) and 0.8×max (warning). */
function maxThresholdLevel(value: number | null, max: number | null | undefined): ThresholdLevel {
	if (value == null || max == null) return 'normal';
	if (value >= max) return 'critical';
	if (value >= max * 0.8) return 'warning';
	return 'normal';
}

export function ttftThresholdLevel(
	ttftMs: number | null,
	thresholds: OpsMetricThresholds | null
): ThresholdLevel {
	return maxThresholdLevel(ttftMs, thresholds?.ttft_p99_ms_max);
}

export function requestErrorRateThresholdLevel(
	pct: number | null,
	thresholds: OpsMetricThresholds | null
): ThresholdLevel {
	return maxThresholdLevel(pct, thresholds?.request_error_rate_percent_max);
}

export function upstreamErrorRateThresholdLevel(
	pct: number | null,
	thresholds: OpsMetricThresholds | null
): ThresholdLevel {
	return maxThresholdLevel(pct, thresholds?.upstream_error_rate_percent_max);
}

export interface OpsKpiTile {
	/** Stable key for {#each} / testids. */
	key: 'health' | 'requests' | 'sla' | 'duration' | 'ttft' | 'request_errors' | 'upstream_errors';
	/** i18n key suffix under `admin.ops.*`. */
	labelKey: string;
	/** English fallback for the {default} i18n guard. */
	labelDefault: string;
	/** Primary headline value (already formatted). */
	value: string;
	/** Threshold breach level driving the tile accent color. */
	level: ThresholdLevel;
	/** Secondary key/value rows rendered beneath the headline. */
	rows: Array<{ labelKey: string; labelDefault: string; value: string }>;
}

function row(labelKey: string, labelDefault: string, value: string) {
	return { labelKey, labelDefault, value };
}

function pctOrDash(value: number | null, digits: number): string {
	return value == null ? '-' : `${value.toFixed(digits)}%`;
}

function msOrDash(value: number | null | undefined): string {
	return value == null ? '-' : `${value} ms`;
}

function rateLabel(value: unknown): string {
	const v = finiteOrNull(value);
	return v == null ? '-' : v.toFixed(1);
}

/**
 * Build the OpsHealthCard KPI tiles directly from an overview snapshot.
 *
 * Distinct from buildOpsKpis(snapshot) (8 compact summary tiles used by the
 * legacy page header) — this returns the richer 7-card grid that mirrors
 * OpsDashboardHeader.vue, including threshold breach levels.
 */
export function buildOpsKpisFromOverview(
	overview: OpsDashboardOverview | null,
	thresholds: OpsMetricThresholds | null
): OpsKpiTile[] {
	const o = overview;
	const sla = slaPercent(o);
	const errPct = errorRatePercent(o);
	const upPct = upstreamErrorRatePercent(o);
	const ttftP99 = finiteOrNull(o?.ttft?.p99_ms);

	const exceptions = numberValue(o?.request_count_sla) - numberValue(o?.success_count);

	return [
		{
			key: 'health',
			labelKey: 'admin.ops.health',
			labelDefault: 'Health',
			value: typeof o?.health_score === 'number' ? String(o.health_score) : '-',
			level: 'normal',
			rows: []
		},
		{
			key: 'requests',
			labelKey: 'admin.ops.requestsTitle',
			labelDefault: 'Throughput',
			value: formatCompact(o?.request_count_total),
			level: 'normal',
			rows: [
				row('admin.ops.tokens', 'Tokens', formatCompact(o?.token_consumed)),
				row('admin.ops.avgQps', 'Avg QPS', rateLabel(o?.qps?.avg)),
				row('admin.ops.avgTps', 'Avg TPS', rateLabel(o?.tps?.avg))
			]
		},
		{
			key: 'sla',
			labelKey: 'admin.ops.sla',
			labelDefault: 'SLA',
			value: sla == null ? '-' : `${sla.toFixed(3)}%`,
			level: slaThresholdLevel(sla, thresholds),
			rows: [row('admin.ops.exceptions', 'Exceptions', formatCompact(exceptions))]
		},
		{
			key: 'duration',
			labelKey: 'admin.ops.latencyDuration',
			labelDefault: 'Latency',
			value: msOrDash(finiteOrNull(o?.duration?.p99_ms)),
			level: 'normal',
			rows: [
				row('admin.ops.p95', 'P95', msOrDash(finiteOrNull(o?.duration?.p95_ms))),
				row('admin.ops.p50', 'P50', msOrDash(finiteOrNull(o?.duration?.p50_ms)))
			]
		},
		{
			key: 'ttft',
			labelKey: 'admin.ops.ttftLabel',
			labelDefault: 'TTFT',
			value: msOrDash(ttftP99),
			level: ttftThresholdLevel(ttftP99, thresholds),
			rows: [
				row('admin.ops.p95', 'P95', msOrDash(finiteOrNull(o?.ttft?.p95_ms))),
				row('admin.ops.p50', 'P50', msOrDash(finiteOrNull(o?.ttft?.p50_ms)))
			]
		},
		{
			key: 'request_errors',
			labelKey: 'admin.ops.requestErrors',
			labelDefault: 'Request errors',
			value: pctOrDash(errPct, 2),
			level: requestErrorRateThresholdLevel(errPct, thresholds),
			rows: [
				row('admin.ops.errorCount', 'Errors', formatCompact(o?.error_count_sla)),
				row('admin.ops.businessLimited', 'Business-limited', formatCompact(o?.business_limited_count))
			]
		},
		{
			key: 'upstream_errors',
			labelKey: 'admin.ops.upstreamErrors',
			labelDefault: 'Upstream errors',
			value: pctOrDash(upPct, 2),
			level: upstreamErrorRateThresholdLevel(upPct, thresholds),
			rows: [
				row(
					'admin.ops.errorCountExcl429529',
					'Errors (excl 429/529)',
					formatCompact(o?.upstream_error_count_excl_429_529)
				),
				row(
					'admin.ops.upstream429529',
					'429/529',
					formatCompact(numberValue(o?.upstream_429_count) + numberValue(o?.upstream_529_count))
				)
			]
		}
	];
}

// ── Health score ─────────────────────────────────────────────────────────────

export function isSystemIdle(overview: OpsDashboardOverview | null): boolean {
	if (!overview) return true;
	const qps = numberValue(overview.qps?.current);
	const errorRate = numberValue(overview.error_rate);
	return qps === 0 && errorRate === 0;
}

export function healthScoreValue(overview: OpsDashboardOverview | null): number | null {
	return finiteOrNull(overview?.health_score);
}

/** Tailwind text class for the health-score ring/number. */
export function healthScoreClass(overview: OpsDashboardOverview | null): string {
	if (isSystemIdle(overview)) return 'text-muted-foreground';
	const score = healthScoreValue(overview);
	if (score == null) return 'text-muted-foreground';
	if (score >= 90) return 'text-emerald-500';
	if (score >= 60) return 'text-amber-500';
	return 'text-red-500';
}

/** Stroke color for the SVG ring — uses theme tokens, no raw brand hex. */
export function healthScoreStroke(overview: OpsDashboardOverview | null): string {
	if (isSystemIdle(overview)) return 'hsl(var(--muted-foreground))';
	const score = healthScoreValue(overview);
	if (score == null) return 'hsl(var(--muted-foreground))';
	if (score >= 90) return 'hsl(142 71% 45%)'; // emerald-500
	if (score >= 60) return 'hsl(38 92% 50%)'; // amber-500
	return 'hsl(0 84% 60%)'; // red-500
}

// ── Diagnosis ────────────────────────────────────────────────────────────────

export interface DiagnosisItem {
	type: 'critical' | 'warning' | 'info';
	/** i18n key + fallback for message. */
	messageKey: string;
	messageDefault: string;
	/** Interpolation params (e.g. usage/rate/score). */
	params?: Record<string, string | number>;
	impactKey: string;
	impactDefault: string;
	actionKey?: string;
	actionDefault?: string;
}

/**
 * Compute the prioritized diagnosis report from an overview snapshot.
 * Priority order mirrors OpsDashboardHeader.vue: resources → latency →
 * error rates → SLA → health score, with an idle short-circuit and a healthy
 * fallback. Returns i18n keys (not resolved strings) so the card owns rendering.
 */
export function buildDiagnosis(overview: OpsDashboardOverview | null): DiagnosisItem[] {
	if (!overview) return [];
	const report: DiagnosisItem[] = [];

	if (isSystemIdle(overview)) {
		report.push({
			type: 'info',
			messageKey: 'admin.ops.diagnosis.idle',
			messageDefault: 'System is idle — no traffic in the selected window.',
			impactKey: 'admin.ops.diagnosis.idleImpact',
			impactDefault: 'Metrics are quiescent; nothing to act on.'
		});
		return report;
	}

	const sm = overview.system_metrics;
	if (sm) {
		if (sm.db_ok === false) {
			report.push({
				type: 'critical',
				messageKey: 'admin.ops.diagnosis.dbDown',
				messageDefault: 'Database health check failing.',
				impactKey: 'admin.ops.diagnosis.dbDownImpact',
				impactDefault: 'Requests depending on the database may fail.',
				actionKey: 'admin.ops.diagnosis.dbDownAction',
				actionDefault: 'Check database connectivity and pool saturation.'
			});
		}
		if (sm.redis_ok === false) {
			report.push({
				type: 'warning',
				messageKey: 'admin.ops.diagnosis.redisDown',
				messageDefault: 'Redis health check failing.',
				impactKey: 'admin.ops.diagnosis.redisDownImpact',
				impactDefault: 'Caching and rate-limiting may degrade.',
				actionKey: 'admin.ops.diagnosis.redisDownAction',
				actionDefault: 'Verify Redis availability and network path.'
			});
		}

		const cpuPct = numberValue(sm.cpu_usage_percent);
		if (cpuPct > 90) {
			report.push({
				type: 'critical',
				messageKey: 'admin.ops.diagnosis.cpuCritical',
				messageDefault: 'CPU usage critical ({usage}%).',
				params: { usage: cpuPct.toFixed(1) },
				impactKey: 'admin.ops.diagnosis.cpuCriticalImpact',
				impactDefault: 'Throughput and latency will suffer.',
				actionKey: 'admin.ops.diagnosis.cpuCriticalAction',
				actionDefault: 'Scale out or shed load.'
			});
		} else if (cpuPct > 80) {
			report.push({
				type: 'warning',
				messageKey: 'admin.ops.diagnosis.cpuHigh',
				messageDefault: 'CPU usage high ({usage}%).',
				params: { usage: cpuPct.toFixed(1) },
				impactKey: 'admin.ops.diagnosis.cpuHighImpact',
				impactDefault: 'Headroom is shrinking.',
				actionKey: 'admin.ops.diagnosis.cpuHighAction',
				actionDefault: 'Monitor and prepare to scale.'
			});
		}

		const memPct = numberValue(sm.memory_usage_percent);
		if (memPct > 90) {
			report.push({
				type: 'critical',
				messageKey: 'admin.ops.diagnosis.memoryCritical',
				messageDefault: 'Memory usage critical ({usage}%).',
				params: { usage: memPct.toFixed(1) },
				impactKey: 'admin.ops.diagnosis.memoryCriticalImpact',
				impactDefault: 'Risk of OOM and restarts.',
				actionKey: 'admin.ops.diagnosis.memoryCriticalAction',
				actionDefault: 'Investigate leaks or scale memory.'
			});
		} else if (memPct > 85) {
			report.push({
				type: 'warning',
				messageKey: 'admin.ops.diagnosis.memoryHigh',
				messageDefault: 'Memory usage high ({usage}%).',
				params: { usage: memPct.toFixed(1) },
				impactKey: 'admin.ops.diagnosis.memoryHighImpact',
				impactDefault: 'Headroom is shrinking.',
				actionKey: 'admin.ops.diagnosis.memoryHighAction',
				actionDefault: 'Monitor allocation trends.'
			});
		}
	}

	const ttftP99 = numberValue(overview.ttft?.p99_ms);
	if (ttftP99 > 500) {
		report.push({
			type: 'warning',
			messageKey: 'admin.ops.diagnosis.ttftHigh',
			messageDefault: 'TTFT p99 elevated ({ttft} ms).',
			params: { ttft: ttftP99.toFixed(0) },
			impactKey: 'admin.ops.diagnosis.ttftHighImpact',
			impactDefault: 'Users feel slower first-token latency.',
			actionKey: 'admin.ops.diagnosis.ttftHighAction',
			actionDefault: 'Check upstream warmup and queueing.'
		});
	}

	const upstreamRatePct = numberValue(overview.upstream_error_rate) * 100;
	if (upstreamRatePct > 5) {
		report.push({
			type: 'critical',
			messageKey: 'admin.ops.diagnosis.upstreamCritical',
			messageDefault: 'Upstream error rate critical ({rate}%).',
			params: { rate: upstreamRatePct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.upstreamCriticalImpact',
			impactDefault: 'Many requests are failing upstream.',
			actionKey: 'admin.ops.diagnosis.upstreamCriticalAction',
			actionDefault: 'Inspect provider health and failover.'
		});
	} else if (upstreamRatePct > 2) {
		report.push({
			type: 'warning',
			messageKey: 'admin.ops.diagnosis.upstreamHigh',
			messageDefault: 'Upstream error rate elevated ({rate}%).',
			params: { rate: upstreamRatePct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.upstreamHighImpact',
			impactDefault: 'Some requests are failing upstream.',
			actionKey: 'admin.ops.diagnosis.upstreamHighAction',
			actionDefault: 'Watch provider status.'
		});
	}

	const errorPct = numberValue(overview.error_rate) * 100;
	if (errorPct > 3) {
		report.push({
			type: 'critical',
			messageKey: 'admin.ops.diagnosis.errorHigh',
			messageDefault: 'Request error rate high ({rate}%).',
			params: { rate: errorPct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.errorHighImpact',
			impactDefault: 'A material share of requests fail.',
			actionKey: 'admin.ops.diagnosis.errorHighAction',
			actionDefault: 'Drill into request errors.'
		});
	} else if (errorPct > 0.5) {
		report.push({
			type: 'warning',
			messageKey: 'admin.ops.diagnosis.errorElevated',
			messageDefault: 'Request error rate elevated ({rate}%).',
			params: { rate: errorPct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.errorElevatedImpact',
			impactDefault: 'Error rate above baseline.',
			actionKey: 'admin.ops.diagnosis.errorElevatedAction',
			actionDefault: 'Keep an eye on error trend.'
		});
	}

	const slaPct = numberValue(overview.sla) * 100;
	if (slaPct < 90) {
		report.push({
			type: 'critical',
			messageKey: 'admin.ops.diagnosis.slaCritical',
			messageDefault: 'SLA critically low ({sla}%).',
			params: { sla: slaPct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.slaCriticalImpact',
			impactDefault: 'SLA budget is breached.',
			actionKey: 'admin.ops.diagnosis.slaCriticalAction',
			actionDefault: 'Mitigate the dominant failure source.'
		});
	} else if (slaPct < 98) {
		report.push({
			type: 'warning',
			messageKey: 'admin.ops.diagnosis.slaLow',
			messageDefault: 'SLA below target ({sla}%).',
			params: { sla: slaPct.toFixed(2) },
			impactKey: 'admin.ops.diagnosis.slaLowImpact',
			impactDefault: 'SLA budget is eroding.',
			actionKey: 'admin.ops.diagnosis.slaLowAction',
			actionDefault: 'Reduce error and latency contributors.'
		});
	}

	const hs = healthScoreValue(overview);
	if (hs != null) {
		if (hs < 60) {
			report.push({
				type: 'critical',
				messageKey: 'admin.ops.diagnosis.healthCritical',
				messageDefault: 'Health score critical ({score}).',
				params: { score: hs },
				impactKey: 'admin.ops.diagnosis.healthCriticalImpact',
				impactDefault: 'Overall system health is poor.',
				actionKey: 'admin.ops.diagnosis.healthCriticalAction',
				actionDefault: 'Address the critical findings above.'
			});
		} else if (hs < 90) {
			report.push({
				type: 'warning',
				messageKey: 'admin.ops.diagnosis.healthLow',
				messageDefault: 'Health score degraded ({score}).',
				params: { score: hs },
				impactKey: 'admin.ops.diagnosis.healthLowImpact',
				impactDefault: 'System health is below ideal.',
				actionKey: 'admin.ops.diagnosis.healthLowAction',
				actionDefault: 'Review the warnings above.'
			});
		}
	}

	if (report.length === 0) {
		report.push({
			type: 'info',
			messageKey: 'admin.ops.diagnosis.healthy',
			messageDefault: 'All systems healthy.',
			impactKey: 'admin.ops.diagnosis.healthyImpact',
			impactDefault: 'No action required.'
		});
	}

	return report;
}

// ── System-metrics sub-grid derivations ──────────────────────────────────────

function smNum(sm: OpsSystemMetricsSnapshot | null | undefined, key: string): number | null {
	if (!sm) return null;
	return finiteOrNull(sm[key]);
}

export interface SystemMetricCell {
	/** Resolved primary value text. */
	value: string;
	/** Tailwind text color class. */
	colorClass: string;
	/** Resolved detail text (already composed). */
	detail: string;
}

export function cpuCell(sm: OpsSystemMetricsSnapshot | null | undefined): SystemMetricCell {
	const v = smNum(sm, 'cpu_usage_percent');
	let colorClass = 'text-muted-foreground';
	if (v != null) colorClass = v >= 95 ? 'text-red-500' : v >= 80 ? 'text-amber-500' : 'text-emerald-500';
	return { value: v == null ? '-' : `${v.toFixed(1)}%`, colorClass, detail: 'warn 80% · crit 95%' };
}

export function memCell(sm: OpsSystemMetricsSnapshot | null | undefined): SystemMetricCell {
	const v = smNum(sm, 'memory_usage_percent');
	let colorClass = 'text-muted-foreground';
	if (v != null) colorClass = v >= 95 ? 'text-red-500' : v >= 85 ? 'text-amber-500' : 'text-emerald-500';
	const used = smNum(sm, 'memory_used_mb');
	const total = smNum(sm, 'memory_total_mb');
	const detail =
		used == null || total == null ? '-' : `${formatCompact(used)} / ${formatCompact(total)} MB`;
	return { value: v == null ? '-' : `${v.toFixed(1)}%`, colorClass, detail };
}

export function dbCell(sm: OpsSystemMetricsSnapshot | null | undefined): SystemMetricCell {
	const ok = sm?.db_ok;
	const active = smNum(sm, 'db_conn_active');
	const idle = smNum(sm, 'db_conn_idle');
	const waiting = smNum(sm, 'db_conn_waiting');
	const maxOpen = smNum(sm, 'db_max_open_conns');
	const open = active == null || idle == null ? null : active + idle;
	const usage =
		open == null || maxOpen == null || maxOpen <= 0
			? null
			: Math.min(100, Math.max(0, (open / maxOpen) * 100));

	let value: string;
	let colorClass: string;
	if (ok === false) {
		value = 'FAIL';
		colorClass = 'text-red-500';
	} else if (usage != null) {
		value = `${usage.toFixed(0)}%`;
		colorClass = usage >= 90 ? 'text-red-500' : usage >= 70 ? 'text-amber-500' : 'text-emerald-500';
	} else if (ok === true) {
		value = 'OK';
		colorClass = 'text-emerald-500';
	} else {
		value = '-';
		colorClass = 'text-muted-foreground';
	}

	const parts = [
		`conns ${open ?? '-'} / ${maxOpen ?? '-'}`,
		`active ${active ?? '-'}`,
		`idle ${idle ?? '-'}`
	];
	if (waiting != null) parts.push(`waiting ${waiting}`);
	return { value, colorClass, detail: parts.join(' · ') };
}

export function redisCell(sm: OpsSystemMetricsSnapshot | null | undefined): SystemMetricCell {
	const ok = sm?.redis_ok;
	const total = smNum(sm, 'redis_conn_total');
	const idle = smNum(sm, 'redis_conn_idle');
	const poolSize = smNum(sm, 'redis_pool_size');
	const active = total == null || idle == null ? null : Math.max(total - idle, 0);
	const usage =
		total == null || poolSize == null || poolSize <= 0
			? null
			: Math.min(100, Math.max(0, (total / poolSize) * 100));

	let value: string;
	let colorClass: string;
	if (ok === false) {
		value = 'FAIL';
		colorClass = 'text-red-500';
	} else if (usage != null) {
		value = `${usage.toFixed(0)}%`;
		colorClass = usage >= 90 ? 'text-red-500' : usage >= 70 ? 'text-amber-500' : 'text-emerald-500';
	} else if (ok === true) {
		value = 'OK';
		colorClass = 'text-emerald-500';
	} else {
		value = '-';
		colorClass = 'text-muted-foreground';
	}

	const parts = [`conns ${total ?? '-'} / ${poolSize ?? '-'}`];
	if (active != null) parts.push(`active ${active}`);
	if (idle != null) parts.push(`idle ${idle}`);
	return { value, colorClass, detail: parts.join(' · ') };
}

export const GOROUTINE_WARN_THRESHOLD = 8_000;
export const GOROUTINE_CRITICAL_THRESHOLD = 15_000;

export type GoroutineStatus = 'ok' | 'warning' | 'critical' | 'unknown';

export function goroutineStatus(sm: OpsSystemMetricsSnapshot | null | undefined): GoroutineStatus {
	const n = smNum(sm, 'goroutine_count');
	if (n == null) return 'unknown';
	if (n >= GOROUTINE_CRITICAL_THRESHOLD) return 'critical';
	if (n >= GOROUTINE_WARN_THRESHOLD) return 'warning';
	return 'ok';
}

export function goroutineStatusClass(status: GoroutineStatus): string {
	switch (status) {
		case 'ok':
			return 'text-emerald-500';
		case 'warning':
			return 'text-amber-500';
		case 'critical':
			return 'text-red-500';
		default:
			return 'text-muted-foreground';
	}
}

export function jobHeartbeats(overview: OpsDashboardOverview | null): OpsJobHeartbeat[] {
	return overview?.job_heartbeats ?? [];
}

/** A heartbeat is "warning" when its last error is newer than its last success. */
export function jobHeartbeatWarning(hb: OpsJobHeartbeat | null | undefined): boolean {
	if (!hb) return false;
	return Boolean(hb.last_error_at && (!hb.last_success_at || hb.last_error_at > hb.last_success_at));
}

export type JobsStatus = 'ok' | 'warn' | 'unknown';

export function jobsStatus(overview: OpsDashboardOverview | null): JobsStatus {
	const list = jobHeartbeats(overview);
	if (!list.length) return 'unknown';
	for (const hb of list) {
		if (jobHeartbeatWarning(hb)) return 'warn';
	}
	return 'ok';
}

export function jobsWarnCount(overview: OpsDashboardOverview | null): number {
	let warn = 0;
	for (const hb of jobHeartbeats(overview)) {
		if (jobHeartbeatWarning(hb)) warn++;
	}
	return warn;
}

export function jobsStatusClass(status: JobsStatus): string {
	switch (status) {
		case 'ok':
			return 'text-emerald-500';
		case 'warn':
			return 'text-amber-500';
		default:
			return 'text-muted-foreground';
	}
}
