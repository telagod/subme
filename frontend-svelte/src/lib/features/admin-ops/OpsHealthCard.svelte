<script lang="ts">
	/**
	 * OpsHealthCard · admin Ops dashboard — KPI grid + health score + diagnosis +
	 * system-metrics / job-heartbeats sub-grid.
	 *
	 * Vue 原型：frontend/src/views/admin/ops/components/OpsDashboardHeader.vue
	 *   — the KPI cards block + health-score ring + diagnosis popover + the
	 *     6-cell system-health sub-grid (CPU / MEM / DB / Redis / Goroutines / Jobs).
	 *   The toolbar, filters, realtime-traffic panel and fullscreen controls of the
	 *   Vue header are NOT this component's concern — the route owns those.
	 *
	 * Pure & presentational：all derivation lives in `./ops.ts` (unit-tested);
	 * this file only renders. Props are exactly { overview, thresholds, loading }
	 * so the route can wire it directly. NO chart here (the score ring is hand-drawn
	 * SVG, not chart.js) — so there is intentionally no dynamic import.
	 *
	 * Gating note: the page-level `opsMonitoringEnabled` gate is the route's job
	 * (it reads settingsApi.getSettings() and conditionally renders this card).
	 * This component stays gate-agnostic and renders whatever overview it's given.
	 *
	 * Palette 红线：Zinc-only, no raw hex. Threshold/health accents reuse Tailwind
	 * semantic tokens (emerald/amber/red-500) routed through ./ops.ts helper classes;
	 * the SVG ring stroke uses HSL tokens (no #hex literals).
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, Brain, Info, Lightbulb, XCircle } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import type { OpsDashboardOverview, OpsMetricThresholds } from '$lib/api/admin/ops';
	import {
		buildDiagnosis,
		buildOpsKpisFromOverview,
		cpuCell,
		dbCell,
		formatDateTime,
		goroutineStatus,
		goroutineStatusClass,
		GOROUTINE_CRITICAL_THRESHOLD,
		GOROUTINE_WARN_THRESHOLD,
		healthScoreClass,
		healthScoreStroke,
		healthScoreValue,
		isSystemIdle,
		jobHeartbeats,
		jobHeartbeatWarning,
		jobsStatus,
		jobsStatusClass,
		jobsWarnCount,
		memCell,
		numberValue,
		redisCell,
		thresholdColorClass
	} from './ops';

	let {
		overview,
		thresholds,
		loading = false
	}: {
		overview: OpsDashboardOverview | null;
		thresholds: OpsMetricThresholds | null;
		loading: boolean;
	} = $props();

	// ── Derived view-models (all pure helpers) ─────────────────────────────────
	const kpis = $derived(buildOpsKpisFromOverview(overview, thresholds));
	const diagnosis = $derived(buildDiagnosis(overview));
	const idle = $derived(isSystemIdle(overview));
	const score = $derived(healthScoreValue(overview));
	const scoreClass = $derived(healthScoreClass(overview));
	const ringStroke = $derived(healthScoreStroke(overview));

	const sm = $derived(overview?.system_metrics ?? null);
	const cpu = $derived(cpuCell(sm));
	const mem = $derived(memCell(sm));
	const db = $derived(dbCell(sm));
	const redis = $derived(redisCell(sm));
	const goStatus = $derived(goroutineStatus(sm));
	const goCount = $derived(numberValue(sm?.goroutine_count));
	const queueDepth = $derived(sm?.concurrency_queue_depth ?? null);
	const switchCount = $derived(sm?.account_switch_count ?? null);

	const jobs = $derived(jobHeartbeats(overview));
	const jStatus = $derived(jobsStatus(overview));
	const jWarn = $derived(jobsWarnCount(overview));

	// ── Health-score ring geometry ─────────────────────────────────────────────
	const CIRCLE_SIZE = 100;
	const STROKE_WIDTH = 8;
	const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const dashOffset = $derived.by(() => {
		if (idle || score == null) return 0;
		const clamped = Math.max(0, Math.min(100, score));
		return CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
	});

	const goStatusLabel = $derived(
		goStatus === 'ok'
			? $_('admin.ops.ok', { default: '确定' })
			: goStatus === 'warning'
				? $_('common.warning', { default: '警告' })
				: goStatus === 'critical'
					? $_('common.critical', { default: '严重' })
					: $_('admin.ops.noData', { default: '暂无数据' })
	);

	const jobsStatusLabel = $derived(
		jStatus === 'ok'
			? $_('admin.ops.ok', { default: '确定' })
			: jStatus === 'warn'
				? $_('common.warning', { default: '警告' })
				: $_('admin.ops.noData', { default: '暂无数据' })
	);

	let showDiagnosis = $state(false);
	let showJobs = $state(false);
</script>

<Card class="space-y-4" data-testid="ops-health-card">
	{#if !overview}
		<div
			class="flex min-h-[140px] items-center justify-center text-sm text-muted-foreground"
			data-testid="ops-health-empty"
		>
			{#if loading}
				{$_('admin.ops.loadingText', { default: '加载中…' })}
			{:else}
				{$_('admin.ops.noData', { default: '暂无数据' })}
			{/if}
		</div>
	{:else}
		<!-- Header: score ring + diagnosis trigger -->
		<div class="flex flex-wrap items-center gap-6 border-b border-border pb-4">
			<div class="relative flex flex-col items-center justify-center">
				<svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style="transform:rotate(-90deg)" aria-hidden="true">
					<circle
						cx={CIRCLE_SIZE / 2}
						cy={CIRCLE_SIZE / 2}
						r={RADIUS}
						stroke-width={STROKE_WIDTH}
						fill="transparent"
						stroke="hsl(var(--border))"
					/>
					<circle
						cx={CIRCLE_SIZE / 2}
						cy={CIRCLE_SIZE / 2}
						r={RADIUS}
						stroke-width={STROKE_WIDTH}
						fill="transparent"
						stroke={ringStroke}
						stroke-linecap="round"
						stroke-dasharray={CIRCUMFERENCE}
						stroke-dashoffset={dashOffset}
						style="transition: stroke-dashoffset 1s ease-out, stroke 1s ease-out;"
					/>
				</svg>
				<div class="absolute flex flex-col items-center">
					<span class={`text-[26px] font-black leading-none ${scoreClass}`} data-testid="ops-health-score">
						{idle ? $_('admin.ops.idleStatus', { default: '空闲' }) : (score ?? '--')}
					</span>
					<span class="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
						{$_('admin.ops.health', { default: '健康' })}
					</span>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2">
					<span class={`text-sm font-bold ${scoreClass}`}>
						{#if idle}
							{$_('admin.ops.idleStatus', { default: '空闲' })}
						{:else if typeof score === 'number' && score >= 90}
							{$_('admin.ops.healthyStatus', { default: '健康' })}
						{:else}
							{$_('admin.ops.riskyStatus', { default: '风险中' })}
						{/if}
					</span>
				</div>
				<Button
					variant="outline"
					class="h-8 gap-1.5 text-xs"
					onclick={() => (showDiagnosis = true)}
					data-testid="ops-diagnosis-open"
				>
					<Brain size={14} />
					{$_('admin.ops.diagnosis.title', { default: '诊断' })}
					{#if diagnosis.some((d) => d.type === 'critical' || d.type === 'warning')}
						<span class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
							{diagnosis.filter((d) => d.type !== 'info').length}
						</span>
					{/if}
				</Button>
				{#if loading}
					<span class="text-[11px] text-muted-foreground">
						{$_('admin.ops.loadingText', { default: '加载中…' })}
					</span>
				{/if}
			</div>
		</div>

		<!-- KPI grid -->
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ops-kpi-grid">
			{#each kpis as kpi (kpi.key)}
				<div class="rounded-[10px] border border-border bg-card p-[14px]" data-testid={`ops-kpi-${kpi.key}`}>
					<div class="flex items-center gap-2">
						<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
							{$_(kpi.labelKey, { default: kpi.labelDefault })}
						</span>
						{#if kpi.level !== 'normal'}
							<span
								class={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${kpi.level === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`}
								aria-hidden="true"
							></span>
						{/if}
					</div>
					<div class={`mt-1.5 text-[26px] font-black leading-none ${thresholdColorClass(kpi.level)}`}>
						{kpi.value}
					</div>
					{#if kpi.rows.length}
						<div class="mt-2 flex flex-col gap-[3px] text-[11.5px]">
							{#each kpi.rows as r (r.labelKey)}
								<div class="flex justify-between">
									<span class="text-muted-foreground">{$_(r.labelKey, { default: r.labelDefault })}</span>
									<span class="font-bold text-foreground">{r.value}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- System-health sub-grid -->
		<div class="border-t border-border pt-4">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="ops-system-grid">
				<!-- CPU -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">CPU</span>
					<div class={`mt-[3px] text-base font-black ${cpu.colorClass}`}>{cpu.value}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">{cpu.detail}</div>
				</div>
				<!-- MEM -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
						{$_('admin.ops.memory', { default: '内存' })}
					</span>
					<div class={`mt-[3px] text-base font-black ${mem.colorClass}`}>{mem.value}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">{mem.detail}</div>
				</div>
				<!-- DB -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
						{$_('admin.ops.db', { default: '数据库' })}
					</span>
					<div class={`mt-[3px] text-base font-black ${db.colorClass}`}>{db.value}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">{db.detail}</div>
				</div>
				<!-- Redis -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Redis</span>
					<div class={`mt-[3px] text-base font-black ${redis.colorClass}`}>{redis.value}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">{redis.detail}</div>
				</div>
				<!-- Goroutines -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
						{$_('admin.ops.goroutines', { default: '协程数' })}
					</span>
					<div class={`mt-[3px] text-base font-black ${goroutineStatusClass(goStatus)}`}>{goStatusLabel}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">
						{$_('admin.ops.current', { default: '当前' })}
						<span class="font-mono tabular-nums">{sm?.goroutine_count ?? '-'}</span>
						· {$_('common.warning', { default: '警告' })}
						<span class="font-mono tabular-nums">{GOROUTINE_WARN_THRESHOLD}</span>
						· {$_('common.critical', { default: '严重' })}
						<span class="font-mono tabular-nums">{GOROUTINE_CRITICAL_THRESHOLD}</span>
						{#if queueDepth != null}
							· {$_('admin.ops.queue', { default: '队列' })}
							<span class="font-mono tabular-nums">{queueDepth}</span>
						{/if}
						{#if switchCount != null}
							· {$_('admin.ops.switch', { default: '切换' })}
							<span class="font-mono tabular-nums">{switchCount}</span>
						{/if}
					</div>
				</div>
				<!-- Jobs -->
				<div class="rounded-[10px] border border-border bg-card p-3">
					<div class="flex items-center justify-between gap-1">
						<span class="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
							{$_('admin.ops.jobs', { default: '任务' })}
						</span>
						<Button
							variant="ghost"
							class="h-auto bg-transparent p-0 text-[10px] font-bold text-primary hover:bg-transparent hover:text-primary/80"
							onclick={() => (showJobs = true)}
							data-testid="ops-jobs-open"
						>
							{$_('admin.ops.requestDetails.details', { default: '详情' })}
						</Button>
					</div>
					<div class={`mt-[3px] text-base font-black ${jobsStatusClass(jStatus)}`}>{jobsStatusLabel}</div>
					<div class="mt-1 text-[10px] leading-normal text-muted-foreground">
						{$_('common.total', { default: '总计' })}
						<span class="font-mono tabular-nums">{jobs.length}</span>
						· {$_('common.warning', { default: '警告' })}
						<span class="font-mono tabular-nums">{jWarn}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Card>

<!-- Diagnosis dialog -->
<StandardDialog
	bind:open={showDiagnosis}
	width="md"
	title={$_('admin.ops.diagnosis.title', { default: '诊断' })}
	data-testid="ops-diagnosis-dialog"
>
	<div class="mt-3 space-y-2.5">
		{#each diagnosis as item, idx (idx)}
			<div class="flex gap-2.5">
				<div class="mt-0.5 shrink-0">
					{#if item.type === 'critical'}
						<XCircle size={14} class="text-red-500" />
					{:else if item.type === 'warning'}
						<AlertTriangle size={14} class="text-amber-500" />
					{:else}
						<Info size={14} class="text-primary" />
					{/if}
				</div>
				<div class="flex-1">
					<div class="text-[11.5px] font-semibold text-foreground">
						{$_(item.messageKey, { default: item.messageDefault, values: item.params })}
					</div>
					<div class="mt-0.5 text-[10.5px] text-muted-foreground">
						{$_(item.impactKey, { default: item.impactDefault })}
					</div>
					{#if item.actionKey}
						<div class="mt-1 flex items-center gap-1 text-[10.5px] text-primary">
							<Lightbulb size={12} />
							{$_(item.actionKey, { default: item.actionDefault ?? '' })}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<div class="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
		{$_('admin.ops.diagnosis.footer', { default: '基于当前快照的启发式诊断。' })}
	</div>
</StandardDialog>

<!-- Job heartbeats dialog -->
<StandardDialog
	bind:open={showJobs}
	width="lg"
	title={$_('admin.ops.jobs', { default: '任务' })}
	data-testid="ops-jobs-dialog"
>
	{#if !jobs.length}
		<div class="mt-3 text-sm text-muted-foreground">
			{$_('admin.ops.noData', { default: '暂无数据' })}
		</div>
	{:else}
		<div class="mt-3 flex flex-col gap-2.5">
			{#each jobs as hb (hb.job_name)}
				<div class="rounded-xl border border-border bg-card p-3.5">
					<div class="flex items-center justify-between gap-2.5">
						<div class="truncate text-[13px] font-semibold text-foreground">{hb.job_name}</div>
						<div class="flex shrink-0 items-center gap-2.5 text-[11.5px] text-muted-foreground">
							{#if hb.last_duration_ms != null}
								<span class="font-mono tabular-nums">{hb.last_duration_ms}ms</span>
							{/if}
							{#if jobHeartbeatWarning(hb)}
								<AlertTriangle size={13} class="text-amber-500" />
							{/if}
						</div>
					</div>
					<div class="mt-2 grid grid-cols-1 gap-1.5 text-[11.5px] text-muted-foreground sm:grid-cols-2">
						<div>
							{$_('admin.ops.lastSuccess', { default: '最后成功' })}
							<span class="font-mono tabular-nums">{formatDateTime(hb.last_success_at)}</span>
						</div>
						<div>
							{$_('admin.ops.lastError', { default: '最后错误' })}
							<span class="font-mono tabular-nums">{formatDateTime(hb.last_error_at)}</span>
						</div>
						<div>
							{$_('admin.ops.result', { default: '结果' })}
							<span class="font-mono tabular-nums">{hb.last_result || '-'}</span>
						</div>
					</div>
					{#if hb.last_error}
						<div class="mt-2.5 rounded-lg bg-destructive/10 p-2 text-[11.5px] text-destructive">
							{hb.last_error}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</StandardDialog>
