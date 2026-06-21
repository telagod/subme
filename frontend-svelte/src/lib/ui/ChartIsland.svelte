<script lang="ts" module>
	/**
	 * ChartIsland · 通用 lazy Chart.js island（B5）
	 *
	 * 单入口隔离 chart.js/svelte-chartjs 的 dynamic import —— 绝不在顶层 import，
	 * manualChunks 已路由到 vendor-chart lazy chunk，这里双保险（vendor-chunk-tdz-trap）。
	 *
	 * 用法：
	 *   <ChartIsland type="line" {data} {options} {loading} {empty} />
	 *   <ChartIsland type="doughnut" {data} {options} {loading} {empty} />
	 */
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	type Props = {
		type: 'line' | 'doughnut' | 'bar';
		data: { labels: string[]; datasets: Record<string, unknown>[] };
		options?: Record<string, unknown>;
		loading?: boolean;
		empty?: boolean;
		height?: string;
	};

	let { type, data, options, loading = false, empty = false, height = 'h-72' }: Props = $props();

	let Cmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;
		(async () => {
			try {
				const cjs = await import('chart.js/auto');
				const scjs = await import('svelte-chartjs');
				if (cancelled) return;
				void cjs;
				Cmp = (scjs as Record<string, unknown>)[type.charAt(0).toUpperCase() + type.slice(1)];
				chartReady = true;
			} catch (err) {
				if (cancelled) return;
				chartError = (err as Error)?.message ?? 'chart load failed';
			}
		})();
		return () => { cancelled = true; };
	});
</script>

<div class="chart-island relative {height} w-full" data-testid="chart-island">
	{#if loading}
		<div class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
			{$_('common.loading', { default: 'Loading…' })}
		</div>
	{:else if chartError}
		<div class="absolute inset-0 flex items-center justify-center text-sm text-destructive">
			{$_('common.chartFailed', { default: 'Failed to load chart' })}
		</div>
	{:else if empty}
		<div class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
			{$_('common.noData', { default: 'No data' })}
		</div>
	{:else if !chartReady || !Cmp}
		<div class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
			{$_('common.loading', { default: 'Loading…' })}
		</div>
	{:else}
		{@const C = Cmp as unknown as import('svelte').Component<{ data: typeof data; options?: typeof options }>}
		<C {data} {options} />
	{/if}
</div>

<style>
	.chart-island :global(canvas) {
		max-height: 100% !important;
	}
</style>
