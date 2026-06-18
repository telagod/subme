<script lang="ts">
	/**
	 * UsageChart · 7-day usage line chart (lazy chart island)
	 *
	 * 设计契约：
	 *   - chart.js + svelte-chartjs 必须**通过 onMount 里的 dynamic import** 引入，
	 *     绝不能用顶层 `import ... from 'chart.js'`。否则 rollup 会顺着 eager
	 *     入口图把它们吸进 vendor —— check-chunks 红线、TDZ 回归。
	 *   - manualChunks 规则已在 vite.config.ts 把 chart.js / svelte-chartjs /
	 *     @kurkle/color 路由到 'vendor-chart' lazy chunk；这里再把入口隔成
	 *     dynamic import 是双保险。
	 *   - SSR 兜底：Chart.js 需要 DOM，typeof window 兜底，预渲染期不触发加载。
	 *   - 加载/失败/空态由本组件自己渲染；上层只投喂 data。
	 *
	 * 参考：
	 *   - vendor-chunk-tdz-trap 记忆（commit 9c2db774 / 6ca8d04e）。
	 *   - POC 5 vendor-virtual 同款 lazy island pattern。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { TrendPoint } from '$lib/api/user/dashboard';

	let { data, loading = false }: { data: TrendPoint[] | null; loading?: boolean } = $props();

	// Chart 模块（dynamic import 完成后填充）；类型用 unknown 兜，避免顶层 import 触发 eager。
	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	// chart options/data：轻量构造，重的库才走 lazy chunk。
	const chartData = $derived.by(() => {
		const points = data ?? [];
		return {
			labels: points.map((p) => p.date),
			datasets: [
				{
					label: $_('user.dashboard.chart.legendInput', { default: 'Input tokens' }),
					data: points.map((p) => p.inputTokens),
					borderColor: '#3b82f6',
					backgroundColor: 'rgba(59,130,246,0.15)',
					tension: 0.3,
					fill: false
				},
				{
					label: $_('user.dashboard.chart.legendOutput', { default: 'Output tokens' }),
					data: points.map((p) => p.outputTokens),
					borderColor: '#10b981',
					backgroundColor: 'rgba(16,185,129,0.15)',
					tension: 0.3,
					fill: false
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
			y: { beginAtZero: true, ticks: { font: { size: 10 } } }
		}
	};

	onMount(() => {
		let cancelled = false;
		// SSR 兜底（jsdom 在 vitest 下有 window，不会进这里）。
		if (typeof window === 'undefined') return;

		(async () => {
			try {
				// 关键：两个 await import 都走 dynamic，rollup 切独立 chunk。
				const cjs = await import('chart.js/auto');
				const scjs = await import('svelte-chartjs');
				if (cancelled) return;
				// chart.js/auto 自带 register；无需手动 Chart.register(...)。
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

<div class="usage-chart relative h-64 w-full" data-testid="usage-chart">
	{#if loading}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-chart-loading"
		>
			{$_('user.dashboard.chart.loading', { default: 'Loading chart…' })}
		</div>
	{:else if chartError}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="usage-chart-error"
		>
			{$_('user.dashboard.chart.failed', { default: 'Failed to load chart' })}
		</div>
	{:else if data === null}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
			data-testid="usage-chart-error"
		>
			{$_('user.dashboard.chart.failed', { default: 'Failed to load chart' })}
		</div>
	{:else if data.length === 0}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-chart-empty"
		>
			{$_('user.dashboard.chart.empty', { default: 'No usage in the last 7 days' })}
		</div>
	{:else if !chartReady || !LineCmp}
		<div
			class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
			data-testid="usage-chart-loading"
		>
			{$_('user.dashboard.chart.loading', { default: 'Loading chart…' })}
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
	/* data-density: 紧凑型 line chart 容器，避免与 dashboard 卡片留白冲突 */
	.usage-chart :global(canvas) {
		max-height: 100% !important;
	}
</style>
