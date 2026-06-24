<script lang="ts">
	/**
	 * OpsErrorTrendChart · admin Ops dashboard 的 lazy stacked 错误趋势图 island
	 *
	 * Vue ref: frontend/src/views/admin/ops/components/OpsErrorTrendChart.vue (05c44218)
	 *
	 * LAZY 铁律（memory: vendor-chunk-tdz-trap）：
	 *   - chart.js / svelte-chartjs 只能在 onMount 的 dynamic import 里引入，
	 *     绝不顶层 `import ... from 'chart.js'` —— rollup 顺 eager 入口图把它吸进
	 *     vendor，触 check-chunks 红线 + TDZ 白屏回归。
	 *   - 与 usage/TimeseriesChart.svelte 同款双 await import 策略。
	 *   - SSR 兜底：typeof window 拦截，预渲染期不触发加载。
	 *
	 * 数据集（6 条，按 spec）：
	 *   error_count_total / business_limited_count / error_count_sla /
	 *   upstream_error_count_excl_429_529 / upstream_429_count / upstream_529_count
	 *
	 * 调色板：chart.js canvas 无法消费 Tailwind class，dataset 颜色按既有 chart
	 * island 惯例用具体 hex（Zinc 中性灰阶 + 语义红/橙），与 TimeseriesChart 一致。
	 * 组件 markup/class 仍走 Zinc-only token，无 raw hex。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { OpsErrorTrendPoint } from '$lib/api/admin/ops';

	let {
		points,
		loading = false,
		timeRange,
		onOpenRequestErrors,
		onOpenUpstreamErrors
	}: {
		points: OpsErrorTrendPoint[];
		loading?: boolean;
		timeRange: string;
		onOpenRequestErrors?: () => void;
		onOpenUpstreamErrors?: () => void;
	} = $props();

	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	/** time_range → 分钟（端口自 opsFormatters.parseTimeRangeMinutes，避免跨 Vue util 依赖）。 */
	function parseTimeRangeMinutes(range: string): number {
		const trimmed = (range || '').trim();
		if (!trimmed) return 60;
		if (trimmed.endsWith('m')) {
			const v = Number.parseInt(trimmed.slice(0, -1), 10);
			return Number.isFinite(v) && v > 0 ? v : 60;
		}
		if (trimmed.endsWith('h')) {
			const v = Number.parseInt(trimmed.slice(0, -1), 10);
			return Number.isFinite(v) && v > 0 ? v * 60 : 60;
		}
		return 60;
	}

	function formatHistoryLabel(date: string | undefined, range: string): string {
		if (!date) return '';
		const d = new Date(date);
		if (Number.isNaN(d.getTime())) return '';
		const minutes = parseTimeRangeMinutes(range);
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		if (minutes >= 24 * 60) {
			const mo = String(d.getMonth() + 1).padStart(2, '0');
			const day = String(d.getDate()).padStart(2, '0');
			return `${mo}-${day} ${hh}:${mm}`;
		}
		return `${hh}:${mm}`;
	}

	function n(v: number | null | undefined): number {
		return typeof v === 'number' && Number.isFinite(v) ? v : 0;
	}

	function sum(values: Array<number | null | undefined>): number {
		return values.reduce<number>((acc, v) => acc + n(v), 0);
	}

	const pts = $derived(points ?? []);

	// 抽屉可点性：请求侧错误 / 上游错误是否有量。
	const totalRequestErrors = $derived(sum(pts.map((p) => p.error_count_sla)));
	const totalUpstreamErrors = $derived(
		sum(
			pts.map(
				(p) =>
					n(p.upstream_error_count_excl_429_529) + n(p.upstream_429_count) + n(p.upstream_529_count)
			)
		)
	);
	const hasRequestErrors = $derived(totalRequestErrors > 0);
	const hasUpstreamErrors = $derived(totalUpstreamErrors > 0);

	// 全 0 视作空态（与 Vue ref 的 totalDisplayed<=0 等义，但 6 条全量求和）。
	const totalDisplayed = $derived(
		sum(
			pts.map(
				(p) =>
					n(p.error_count_total) +
					n(p.business_limited_count) +
					n(p.error_count_sla) +
					n(p.upstream_error_count_excl_429_529) +
					n(p.upstream_429_count) +
					n(p.upstream_529_count)
			)
		)
	);

	const isEmpty = $derived(pts.length === 0 || totalDisplayed <= 0);

	const chartData = $derived.by(() => ({
		labels: pts.map((p) => formatHistoryLabel(p.bucket_start, timeRange)),
		datasets: [
			{
				label: $_('admin.ops.errorTotal', { default: '总错误数' }),
				data: pts.map((p) => n(p.error_count_total)),
				borderColor: '#71717a', // zinc-500
				backgroundColor: 'rgba(113,113,122,0.12)',
				fill: true,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			},
			{
				label: $_('admin.ops.errorsSla', { default: 'SLA 错误' }),
				data: pts.map((p) => n(p.error_count_sla)),
				borderColor: '#ef4444', // red-500
				backgroundColor: 'rgba(239,68,68,0.15)',
				fill: true,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			},
			{
				label: $_('admin.ops.businessLimited', { default: '业务受限' }),
				data: pts.map((p) => n(p.business_limited_count)),
				borderColor: '#a1a1aa', // zinc-400
				backgroundColor: 'transparent',
				borderDash: [6, 6],
				fill: false,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			},
			{
				label: $_('admin.ops.upstreamExcl429529', { default: '上游（不含 429/529）' }),
				data: pts.map((p) => n(p.upstream_error_count_excl_429_529)),
				borderColor: '#f97316', // orange-500
				backgroundColor: 'rgba(249,115,22,0.12)',
				fill: true,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			},
			{
				label: $_('admin.ops.upstream429', { default: '上游 429' }),
				data: pts.map((p) => n(p.upstream_429_count)),
				borderColor: '#eab308', // yellow-500
				backgroundColor: 'transparent',
				fill: false,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			},
			{
				label: $_('admin.ops.upstream529', { default: '上游 529' }),
				data: pts.map((p) => n(p.upstream_529_count)),
				borderColor: '#52525b', // zinc-600
				backgroundColor: 'transparent',
				borderDash: [3, 3],
				fill: false,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			}
		]
	}));

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: 'index' as const },
		plugins: {
			legend: {
				position: 'top' as const,
				align: 'end' as const,
				labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 } }
			},
			tooltip: { displayColors: true, padding: 10 }
		},
		scales: {
			x: {
				type: 'category' as const,
				grid: { display: false },
				ticks: { font: { size: 10 }, maxTicksLimit: 8, autoSkip: true, autoSkipPadding: 10 }
			},
			y: {
				type: 'linear' as const,
				display: true,
				position: 'left' as const,
				grid: { display: true },
				ticks: { font: { size: 10 }, precision: 0 }
			}
		}
	};

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		(async () => {
			try {
				const cjs = await import('chart.js/auto');
				const scjs = await import('svelte-chartjs');
				if (cancelled) return;
				void cjs;
				LineCmp = scjs.Line;
				chartReady = true;
			} catch (err) {
				if (cancelled) return;
				chartError = (err as Error)?.message ?? 'chart load failed';
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<Card class="flex h-full flex-col" data-testid="ops-error-trend-chart">
	<div class="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
		<h3 class="text-sm font-semibold text-foreground">
			{$_('admin.ops.errorTrend', { default: '错误趋势' })}
		</h3>
		<div class="flex items-center gap-1.5">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={!hasRequestErrors}
				data-testid="ops-error-trend-open-request"
				onclick={() => onOpenRequestErrors?.()}
			>
				{$_('admin.ops.errorDetails.requestErrors', { default: '请求错误' })}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={!hasUpstreamErrors}
				data-testid="ops-error-trend-open-upstream"
				onclick={() => onOpenUpstreamErrors?.()}
			>
				{$_('admin.ops.errorDetails.upstreamErrors', { default: '上游错误' })}
			</Button>
		</div>
	</div>

	<div class="ops-error-trend-canvas relative min-h-0 flex-1" style="min-height: 16rem;">
		{#if loading}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-error-trend-loading"
			>
				{$_('common.loading', { default: '加载中…' })}
			</div>
		{:else if chartError}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
				data-testid="ops-error-trend-error"
			>
				{$_('admin.ops.charts.emptyError', { default: '加载图表失败' })}
			</div>
		{:else if isEmpty}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center"
				data-testid="ops-error-trend-empty"
			>
				<span class="text-sm font-medium text-foreground">
					{$_('common.noData', { default: '暂无数据' })}
				</span>
				<span class="text-xs text-muted-foreground">
					{$_('admin.ops.charts.emptyError', { default: '该范围内无错误' })}
				</span>
			</div>
		{:else if !chartReady || !LineCmp}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-error-trend-loading"
			>
				{$_('common.loading', { default: '加载中…' })}
			</div>
		{:else}
			{@const LC = LineCmp as unknown as import('svelte').Component<{
				data: typeof chartData;
				options: typeof chartOptions;
			}>}
			<LC data={chartData} options={chartOptions} />
		{/if}
	</div>
</Card>

<style>
	.ops-error-trend-canvas :global(canvas) {
		max-height: 100% !important;
	}
</style>
