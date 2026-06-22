<script lang="ts">
	/**
	 * PaymentDashboardChart · lazy line chart for daily revenue + order count
	 *
	 * 与 features/usage/TimeseriesChart.svelte 同款 lazy island pattern：
	 *   - chart.js + svelte-chartjs 仅在 onMount 内 `await import()` —— 顶层
	 *     绝不 import，否则 rollup 会顺着 eager 入口图把它们吸进 vendor，
	 *     check-chunks 红线（EAGER_CHUNK_CAP 2 + forbidden-deps fingerprint）。
	 *   - manualChunks 已把 chart.js / svelte-chartjs / @kurkle/color 路由到
	 *     'vendor-chart' lazy chunk；此处 dynamic import 是双保险。
	 *   - SSR 兜底：typeof window 拦截，预渲染期不触发加载。
	 *
	 * 数据契约：
	 *   - 接受 `data: DashboardTrendPoint[]`（date / revenue / count）。
	 *   - 两条 dataset：revenue（左轴 $）+ count（右轴 #orders）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { DashboardTrendPoint } from '$lib/api/admin/paymentDashboard';

	let {
		data,
		loading = false
	}: { data: DashboardTrendPoint[] | null; loading?: boolean } = $props();

	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	const chartData = $derived.by(() => {
		const points = data ?? [];
		return {
			labels: points.map((p) => p.date),
			datasets: [
				{
					label: $_('admin.orderDashboard.chart.legendRevenue', { default: '收入 ($)' }),
					data: points.map((p) => p.revenue),
					borderColor: '#10b981',
					backgroundColor: 'rgba(16,185,129,0.15)',
					tension: 0.3,
					fill: false,
					yAxisID: 'y'
				},
				{
					label: $_('admin.orderDashboard.chart.legendCount', { default: '订单' }),
					data: points.map((p) => p.count),
					borderColor: '#3b82f6',
					backgroundColor: 'rgba(59,130,246,0.15)',
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
			y: {
				beginAtZero: true,
				position: 'left' as const,
				ticks: { font: { size: 10 } }
			},
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
				// 两条 await import 都走 dynamic，rollup 切独立 lazy chunk。
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

<div
	class="orderdash-chart relative h-72 w-full rounded-xl border border-border bg-card p-3"
	data-testid="admin-orderdash-chart"
>
	{#if loading}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="admin-orderdash-chart-loading"
		>
			{$_('admin.orderDashboard.chart.loading', { default: '加载图表中…' })}
		</div>
	{:else if chartError}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="admin-orderdash-chart-error"
		>
			{$_('admin.orderDashboard.chart.failed', { default: '加载图表失败' })}
		</div>
	{:else if data === null}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="admin-orderdash-chart-error"
		>
			{$_('admin.orderDashboard.chart.failed', { default: '加载图表失败' })}
		</div>
	{:else if data.length === 0}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="admin-orderdash-chart-empty"
		>
			{$_('admin.orderDashboard.chart.empty', { default: '该范围内无收入' })}
		</div>
	{:else if !chartReady || !LineCmp}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="admin-orderdash-chart-loading"
		>
			{$_('admin.orderDashboard.chart.loading', { default: '加载图表中…' })}
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
	.orderdash-chart :global(canvas) {
		max-height: 100% !important;
	}
</style>
