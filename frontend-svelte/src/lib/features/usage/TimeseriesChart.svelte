<script lang="ts">
	/**
	 * TimeseriesChart · usage 页 lazy chart island
	 *
	 * 与 dashboard/UsageChart.svelte 同款 lazy 加载策略：
	 *   - chart.js + svelte-chartjs 必须**只通过 onMount 里的 dynamic import** 引入。
	 *     绝不在顶层 `import ... from 'chart.js'` —— rollup 会顺着 eager 入口图把它
	 *     吸进 vendor，check-chunks 红线 + TDZ 回归（memory: vendor-chunk-tdz-trap）。
	 *   - manualChunks 已在 vite.config.ts 把 chart.js / svelte-chartjs / @kurkle/color
	 *     路由到 'vendor-chart' lazy chunk；这里再把入口隔成 dynamic import 是双保险。
	 *   - SSR 兜底：typeof window 拦截，预渲染期不触发加载。
	 *
	 * 与 dashboard 的 UsageChart 差异：
	 *   - 接受 UsageTrendPoint[]（bucket / requests / inputTokens / outputTokens / cost）
	 *   - groupBy='day'|'hour' → 时间序；'model'|'endpoint' → 维度序（bar 风格也可，
	 *     本 POC 仍用 line + bucket label，避免再拖 bar 控制路径）。
	 *   - 三条 dataset：input / output / requests（与 dashboard 两条不同 —— usage 页
	 *     表达更细）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { UsageTrendPoint } from '$lib/api/user/usage';

	let {
		data,
		loading = false
	}: { data: UsageTrendPoint[] | null; loading?: boolean } = $props();

	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	const chartData = $derived.by(() => {
		const points = data ?? [];
		return {
			labels: points.map((p) => p.bucket),
			datasets: [
				{
					label: $_('user.usage.chart.legendInput', { default: 'Input tokens' }),
					data: points.map((p) => p.inputTokens),
					borderColor: '#3b82f6',
					backgroundColor: 'rgba(59,130,246,0.15)',
					tension: 0.3,
					fill: false
				},
				{
					label: $_('user.usage.chart.legendOutput', { default: 'Output tokens' }),
					data: points.map((p) => p.outputTokens),
					borderColor: '#10b981',
					backgroundColor: 'rgba(16,185,129,0.15)',
					tension: 0.3,
					fill: false
				},
				{
					label: $_('user.usage.chart.legendRequests', { default: 'Requests' }),
					data: points.map((p) => p.requests),
					borderColor: '#f59e0b',
					backgroundColor: 'rgba(245,158,11,0.15)',
					tension: 0.3,
					fill: false,
					yAxisID: 'y1'
				}
			]
		};
	});

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
			tooltip: { mode: 'index' as const, intersect: false }
		},
		interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false },
		scales: {
			x: { grid: { display: false }, ticks: { font: { size: 10 } } },
			y: { beginAtZero: true, position: 'left' as const, ticks: { font: { size: 10 } } },
			y1: {
				beginAtZero: true,
				position: 'right' as const,
				grid: { display: false },
				ticks: { font: { size: 10 } }
			}
		}
	};

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		(async () => {
			try {
				// 两个 await import 都走 dynamic，rollup 切独立 chunk。
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

<div class="usage-ts-chart relative h-72 w-full" data-testid="usage-ts-chart">
	{#if loading}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-ts-chart-loading"
		>
			{$_('user.usage.chart.loading', { default: 'Loading chart…' })}
		</div>
	{:else if chartError}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="usage-ts-chart-error"
		>
			{$_('user.usage.chart.failed', { default: 'Failed to load chart' })}
		</div>
	{:else if data === null}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="usage-ts-chart-error"
		>
			{$_('user.usage.chart.failed', { default: 'Failed to load chart' })}
		</div>
	{:else if data.length === 0}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-ts-chart-empty"
		>
			{$_('user.usage.chart.empty', { default: 'No usage in this range' })}
		</div>
	{:else if !chartReady || !LineCmp}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-ts-chart-loading"
		>
			{$_('user.usage.chart.loading', { default: 'Loading chart…' })}
		</div>
	{:else}
		{@const LC = LineCmp as unknown as import('svelte').Component<{
			data: typeof chartData;
			options: typeof chartOptions;
		}>}
		<LC data={chartData} options={chartOptions} />
	{/if}
</div>

<style>
	.usage-ts-chart :global(canvas) {
		max-height: 100% !important;
	}
</style>
