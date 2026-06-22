<script lang="ts">
	/**
	 * OpsLatencyChart · admin Ops 页 lazy bar chart island（延迟直方图）
	 *
	 * Vue 原型：frontend/src/views/admin/ops/components/OpsLatencyChart.vue
	 *   - x 轴：buckets[].range（latency bucket 区间标签）
	 *   - y 轴：buckets[].count（落在该区间的请求数）
	 *   - caption：total_requests（总请求数）
	 *
	 * Lazy island 红线（memory: vendor-chunk-tdz-trap）：
	 *   - chart.js + svelte-chartjs 仅在 onMount 内 `await import()` —— 顶层绝不
	 *     import，否则 rollup 顺着 eager 入口图把它们吸进 vendor，触 check-chunks
	 *     红线 + TDZ 白屏回归。
	 *   - manualChunks 已把 chart.js / svelte-chartjs / @kurkle/color 路由到
	 *     'vendor-chart' lazy chunk；此处 dynamic import 是双保险。
	 *   - SSR 兜底：typeof window 拦截，预渲染期不触发加载。
	 *
	 * 配色红线（Zinc-only，禁 raw hex）：
	 *   - 柱体 / 网格 / 刻度颜色全部从 app.css 的 CSS 变量（HSL 三元组）运行时解析，
	 *     拼成 `hsl(var(...))`；不在组件里写死任何 #hex。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { OpsLatencyHistogramResponse } from '$lib/api/admin/ops';

	let {
		latencyData,
		loading = false
	}: { latencyData: OpsLatencyHistogramResponse | null; loading?: boolean } = $props();

	let BarCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	// Zinc 调色：运行时从 app.css 的 HSL 三元组变量解析，避免硬编码 hex。
	let palette = $state<{ bar: string; grid: string; text: string }>({
		bar: 'hsl(240 5.9% 10%)',
		grid: 'hsl(240 5.9% 90%)',
		text: 'hsl(240 3.8% 46.1%)'
	});

	function resolvePalette(): void {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const root = document.documentElement;
		const cs = getComputedStyle(root);
		const v = (name: string, fallback: string): string => {
			const raw = cs.getPropertyValue(name).trim();
			return raw ? `hsl(${raw})` : fallback;
		};
		palette = {
			bar: v('--primary', palette.bar),
			grid: v('--border', palette.grid),
			text: v('--muted-foreground', palette.text)
		};
	}

	const buckets = $derived(latencyData?.buckets ?? []);
	const totalRequests = $derived(latencyData?.total_requests ?? 0);

	const chartData = $derived.by(() => ({
		labels: buckets.map((b) => b.range),
		datasets: [
			{
				label: $_('admin.ops.latencyChart.legend', { default: '请求数' }),
				data: buckets.map((b) => b.count),
				backgroundColor: palette.bar,
				borderRadius: 4,
				barPercentage: 0.6,
				categoryPercentage: 0.7
			}
		]
	}));

	const chartOptions = $derived({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false as const },
			tooltip: { mode: 'index' as const, intersect: false }
		},
		scales: {
			x: {
				grid: { display: false },
				ticks: { color: palette.text, font: { size: 10 } }
			},
			y: {
				beginAtZero: true,
				grid: { color: palette.grid },
				ticks: { color: palette.text, font: { size: 10 }, precision: 0 }
			}
		}
	});

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		resolvePalette();

		(async () => {
			try {
				// 两个 await import 都走 dynamic，rollup 切独立 lazy chunk。
				const cjs = await import('chart.js/auto');
				const scjs = await import('svelte-chartjs');
				if (cancelled) return;
				void cjs;
				BarCmp = scjs.Bar;
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
	class="opslatency-chart flex h-72 w-full flex-col rounded-xl border border-border bg-card p-3"
	data-testid="ops-latency-chart"
>
	<div class="relative min-h-0 flex-1">
		{#if loading}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-latency-chart-loading"
			>
				{$_('admin.ops.latencyChart.loading', { default: '加载图表中…' })}
			</div>
		{:else if chartError}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
				data-testid="ops-latency-chart-error"
			>
				{$_('admin.ops.latencyChart.failed', { default: '加载图表失败' })}
			</div>
		{:else if latencyData === null}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
				data-testid="ops-latency-chart-error"
			>
				{$_('admin.ops.latencyChart.failed', { default: '加载图表失败' })}
			</div>
		{:else if buckets.length === 0 || totalRequests === 0}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-latency-chart-empty"
			>
				{$_('admin.ops.latencyChart.empty', { default: '该范围内无请求' })}
			</div>
		{:else if !chartReady || !BarCmp}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-latency-chart-loading"
			>
				{$_('admin.ops.latencyChart.loading', { default: '加载图表中…' })}
			</div>
		{:else}
			{@const BC = BarCmp as unknown as import('svelte').Component<{
				data: typeof chartData;
				options: typeof chartOptions;
			}>}
			<BC data={chartData} options={chartOptions} />
		{/if}
	</div>

	{#if !loading && !chartError && latencyData !== null && buckets.length > 0 && totalRequests > 0}
		<div
			class="mt-2 flex-shrink-0 text-center text-xs text-muted-foreground"
			data-testid="ops-latency-chart-total"
		>
			{$_('admin.ops.latencyChart.totalRequests', {
				default: '总请求数：{count}',
				values: { count: totalRequests.toLocaleString() }
			})}
		</div>
	{/if}
</div>

<style>
	.opslatency-chart :global(canvas) {
		max-height: 100% !important;
	}
</style>
