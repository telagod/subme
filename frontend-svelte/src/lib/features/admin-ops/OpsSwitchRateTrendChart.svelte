<script lang="ts">
	/**
	 * OpsSwitchRateTrendChart · admin Ops dashboard lazy chart island
	 *
	 * Vue origin: frontend/src/views/admin/ops/components/OpsSwitchRateTrendChart.vue
	 * (git show 05c44218:...). Matches its state machine (loading / empty / ready)
	 * and "no data when total requests <= 0" guard.
	 *
	 * Per the build contract this plots the raw `point.switch_count` per bucket
	 * over the parent-supplied window (parent fetches throughput-trend with custom
	 * start/end = now-5h..now and hands the points down). The Vue source derived a
	 * switch/request *rate*; here the spec is `switch_count`, so we surface the
	 * absolute count directly while keeping the same empty/loading semantics.
	 *
	 * Lazy island rules (memory: vendor-chunk-tdz-trap):
	 *   - chart.js / svelte-chartjs are imported ONLY via dynamic import() inside
	 *     onMount. NEVER a top-level `import ... from 'chart.js'` — rollup would
	 *     fold it into the eager vendor chunk and re-trigger the TDZ white-screen.
	 *   - SSR guard: typeof window bail-out so prerender never loads the chart.
	 *
	 * Palette: Zinc-only, no raw hex. Colors are read at mount from the live theme
	 * CSS variables (HSL triplets in app.css) so light/dark both track the design
	 * tokens instead of baking in literal hex.
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';
	import type { OpsThroughputTrendPoint } from '$lib/api/admin/ops';

	let {
		points,
		loading = false,
		timeRange
	}: { points: OpsThroughputTrendPoint[]; loading?: boolean; timeRange: string } = $props();

	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	// Theme-derived colors (resolved at mount; safe fallbacks are Zinc tokens).
	let lineColor = $state('hsl(240 5.9% 10%)');
	let fillColor = $state('hsl(240 5.9% 10% / 0.12)');
	let gridColor = $state('hsl(240 5.9% 90%)');
	let textColor = $state('hsl(240 3.8% 46.1%)');

	const safePoints = $derived(points ?? []);
	const totalRequests = $derived(
		safePoints.reduce((sum, p) => sum + (p.request_count ?? 0), 0)
	);
	// Mirror the Vue guard: nothing meaningful to plot if there were no requests.
	const hasData = $derived(safePoints.length > 0 && totalRequests > 0);

	type ChartState = 'loading' | 'empty' | 'ready';
	const chartState: ChartState = $derived(hasData ? 'ready' : loading ? 'loading' : 'empty');

	const switchLabel = $derived(
		$_('admin.ops.switchCount', { default: 'Account switches' })
	);

	const chartData = $derived.by(() => ({
		labels: safePoints.map((p) => p.bucket_start),
		datasets: [
			{
				label: switchLabel,
				data: safePoints.map((p) => p.switch_count ?? 0),
				borderColor: lineColor,
				backgroundColor: fillColor,
				fill: true,
				tension: 0.35,
				pointRadius: 0,
				pointHitRadius: 10
			}
		]
	}));

	const chartOptions = $derived({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: 'index' as const },
		plugins: {
			legend: {
				position: 'top' as const,
				align: 'end' as const,
				labels: { color: textColor, usePointStyle: true, boxWidth: 6, font: { size: 10 } }
			},
			tooltip: {
				mode: 'index' as const,
				intersect: false,
				borderColor: gridColor,
				borderWidth: 1,
				padding: 10,
				displayColors: true,
				callbacks: {
					label: (ctx: { parsed?: { y?: number } }) => {
						const v = typeof ctx?.parsed?.y === 'number' ? ctx.parsed.y : 0;
						return `${switchLabel}: ${v}`;
					}
				}
			}
		},
		scales: {
			x: {
				type: 'category' as const,
				grid: { display: false },
				ticks: {
					color: textColor,
					font: { size: 10 },
					maxTicksLimit: 8,
					autoSkip: true,
					autoSkipPadding: 10
				}
			},
			y: {
				type: 'linear' as const,
				display: true,
				position: 'left' as const,
				beginAtZero: true,
				grid: { color: gridColor },
				ticks: { color: textColor, font: { size: 10 }, precision: 0 }
			}
		}
	});

	function readThemeColors() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const styles = getComputedStyle(document.documentElement);
		const read = (name: string, fallback: string) => {
			const raw = styles.getPropertyValue(name).trim();
			return raw ? `hsl(${raw})` : fallback;
		};
		const readAlpha = (name: string, alpha: number, fallback: string) => {
			const raw = styles.getPropertyValue(name).trim();
			return raw ? `hsl(${raw} / ${alpha})` : fallback;
		};
		lineColor = read('--primary', lineColor);
		fillColor = readAlpha('--primary', 0.12, fillColor);
		gridColor = read('--border', gridColor);
		textColor = read('--muted-foreground', textColor);
	}

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		readThemeColors();

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

	// timeRange is part of the wired contract; surface it as a stable test hook.
	const rangeAttr = $derived(timeRange ?? '');
</script>

<Card class="flex h-full flex-col">
	<div class="mb-3 flex shrink-0 items-center justify-between">
		<h3 class="text-[13px] font-bold text-foreground">
			{$_('admin.ops.switchRateTrend', { default: 'Account switch trend' })}
		</h3>
	</div>

	<div
		class="ops-switch-chart relative h-72 min-h-0 w-full flex-1"
		data-testid="ops-switch-rate-trend-chart"
		data-time-range={rangeAttr}
	>
		{#if chartError}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
				data-testid="ops-switch-rate-trend-error"
			>
				{$_('admin.ops.charts.failed', { default: 'Failed to load chart' })}
			</div>
		{:else if chartState === 'loading'}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-switch-rate-trend-loading"
			>
				{$_('admin.ops.charts.loading', { default: 'Loading…' })}
			</div>
		{:else if chartState === 'empty'}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center"
				data-testid="ops-switch-rate-trend-empty"
			>
				<span class="text-sm text-foreground">
					{$_('admin.ops.charts.noData', { default: 'No data' })}
				</span>
				<span class="text-xs text-muted-foreground">
					{$_('admin.ops.charts.emptyRequest', { default: 'No requests in this range' })}
				</span>
			</div>
		{:else if !chartReady || !LineCmp}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-switch-rate-trend-loading"
			>
				{$_('admin.ops.charts.loading', { default: 'Loading…' })}
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
	.ops-switch-chart :global(canvas) {
		max-height: 100% !important;
	}
</style>
