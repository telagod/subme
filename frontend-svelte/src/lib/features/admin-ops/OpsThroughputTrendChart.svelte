<script lang="ts" module>
	import type { OpsRequestDetailsParams } from '$lib/api/admin/ops';

	/**
	 * Preset payload handed to the route's request-details drawer when the user
	 * clicks "Details" on the throughput chart. The Svelte route owns the drawer;
	 * this component only emits a (partial) filter preset. We intentionally do NOT
	 * add this type to `$lib/api/admin/ops` (single-source-of-truth, not ours to
	 * edit) — it is a UI-layer convenience alias over the existing list params.
	 */
	export type OpsRequestDetailsPreset = Partial<OpsRequestDetailsParams>;
</script>

<script lang="ts">
	/**
	 * OpsThroughputTrendChart · admin Ops dashboard lazy chart island
	 *
	 * LAZY island contract (memory: vendor-chunk-tdz-trap):
	 *   - chart.js + svelte-chartjs are pulled in ONLY via `await import()` inside
	 *     onMount. Never a top-level import — rollup would otherwise follow the
	 *     eager entry graph and suck them into the vendor chunk (check-chunks red
	 *     line + TDZ white-screen regression).
	 *   - SSR guard: `typeof window === 'undefined'` short-circuits prerender.
	 *
	 * Follows src/lib/features/usage/TimeseriesChart.svelte exactly for the load
	 * lifecycle. Two datasets: request_count (left axis) + token_consumed (right
	 * axis). Breakdown chips (top groups, else platforms) emit select callbacks.
	 *
	 * Palette: Zinc-only — chart colors are resolved from theme CSS custom
	 * properties at mount (no raw hex), so light/dark both stay on-brand.
	 *
	 * Vue ref: frontend/src/views/admin/ops/components/OpsThroughputTrendChart.vue
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type {
		OpsThroughputTrendPoint,
		OpsThroughputPlatformBreakdownItem,
		OpsThroughputGroupBreakdownItem
	} from '$lib/api/admin/ops';
	import { numberValue, formatCompact } from '$lib/features/admin-ops/ops';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Badge from '$lib/ui/Badge.svelte';

	let {
		points,
		byPlatform,
		topGroups,
		loading = false,
		timeRange,
		onSelectPlatform,
		onSelectGroup,
		onOpenDetails
	}: {
		points: OpsThroughputTrendPoint[];
		byPlatform?: OpsThroughputPlatformBreakdownItem[];
		topGroups?: OpsThroughputGroupBreakdownItem[];
		loading?: boolean;
		timeRange: string;
		onSelectPlatform?: (platform: string) => void;
		onSelectGroup?: (groupId: number) => void;
		onOpenDetails?: (preset?: OpsRequestDetailsPreset) => void;
	} = $props();

	let LineCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	// Resolved-at-mount Zinc theme colors (hsl strings, never raw hex).
	let themeColors = $state({
		requests: 'hsl(240 5.9% 10%)',
		requestsAlpha: 'hsl(240 5.9% 10% / 0.12)',
		tokens: 'hsl(240 3.8% 46.1%)',
		tokensAlpha: 'hsl(240 3.8% 46.1% / 0.12)',
		grid: 'hsl(240 5.9% 90%)',
		text: 'hsl(240 3.8% 46.1%)'
	});

	function resolveVar(name: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return raw || fallback;
	}

	function hsl(triplet: string, alpha?: number): string {
		return alpha === undefined ? `hsl(${triplet})` : `hsl(${triplet} / ${alpha})`;
	}

	// formatHistoryLabel parity with Vue: trim ISO bucket to a compact tick label.
	function bucketLabel(bucketStart: string, range: string): string {
		if (!bucketStart) return '';
		const date = new Date(bucketStart);
		if (Number.isNaN(date.getTime())) return bucketStart;
		// Sub-hour ranges → HH:mm; longer ranges → MM-DD HH:mm.
		const hhmm = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
		if (range === '5m' || range === '30m' || range === '1h') return hhmm;
		const md = date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
		return `${md} ${hhmm}`;
	}

	const totalRequests = $derived(
		(points ?? []).reduce((acc, p) => acc + numberValue(p.request_count), 0)
	);

	const hasData = $derived((points?.length ?? 0) > 0 && totalRequests > 0);

	const chartData = $derived.by(() => {
		const pts = points ?? [];
		return {
			labels: pts.map((p) => bucketLabel(p.bucket_start, timeRange)),
			datasets: [
				{
					label: $_('admin.ops.throughputChart.requests', { default: 'Requests' }),
					data: pts.map((p) => numberValue(p.request_count)),
					borderColor: themeColors.requests,
					backgroundColor: themeColors.requestsAlpha,
					fill: true,
					tension: 0.4,
					pointRadius: 0,
					pointHitRadius: 10,
					yAxisID: 'y'
				},
				{
					label: $_('admin.ops.throughputChart.tokens', { default: 'Tokens' }),
					data: pts.map((p) => numberValue(p.token_consumed)),
					borderColor: themeColors.tokens,
					backgroundColor: themeColors.tokensAlpha,
					fill: true,
					tension: 0.4,
					pointRadius: 0,
					pointHitRadius: 10,
					yAxisID: 'y1'
				}
			]
		};
	});

	const chartOptions = $derived.by(() => ({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: 'index' as const },
		plugins: {
			legend: {
				position: 'top' as const,
				align: 'end' as const,
				labels: {
					color: themeColors.text,
					usePointStyle: true,
					boxWidth: 6,
					font: { size: 10 }
				}
			},
			tooltip: {
				mode: 'index' as const,
				intersect: false,
				callbacks: {
					label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
						const base = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
						const y = ctx.parsed?.y;
						return base + (y === null || y === undefined ? '—' : formatCompact(y));
					}
				}
			}
		},
		scales: {
			x: {
				type: 'category' as const,
				grid: { display: false },
				ticks: {
					color: themeColors.text,
					font: { size: 10 },
					maxTicksLimit: 8,
					autoSkip: true,
					autoSkipPadding: 10
				}
			},
			y: {
				type: 'linear' as const,
				beginAtZero: true,
				position: 'left' as const,
				grid: { color: themeColors.grid },
				ticks: {
					color: themeColors.text,
					font: { size: 10 },
					callback: (v: number | string) => formatCompact(v)
				}
			},
			y1: {
				type: 'linear' as const,
				beginAtZero: true,
				position: 'right' as const,
				grid: { display: false },
				ticks: {
					color: themeColors.text,
					font: { size: 10 },
					callback: (v: number | string) => formatCompact(v)
				}
			}
		}
	}));

	function handleOpenDetails() {
		onOpenDetails?.({ time_range: timeRange, kind: 'all' });
	}

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		// Resolve Zinc theme tokens once mounted (CSS vars are HSL triplets).
		const reqVar = resolveVar('--primary', '240 5.9% 10%');
		const tokVar = resolveVar('--muted-foreground', '240 3.8% 46.1%');
		const gridVar = resolveVar('--border', '240 5.9% 90%');
		themeColors = {
			requests: hsl(reqVar),
			requestsAlpha: hsl(reqVar, 0.12),
			tokens: hsl(tokVar),
			tokensAlpha: hsl(tokVar, 0.12),
			grid: hsl(gridVar),
			text: hsl(tokVar)
		};

		(async () => {
			try {
				// Both awaits go through dynamic import → rollup carves a lazy chunk.
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

<Card class="flex h-full flex-col" data-testid="ops-throughput-trend">
	<div class="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
		<h3 class="text-[13px] font-bold text-foreground">
			{$_('admin.ops.throughputTrend', { default: 'Throughput trend' })}
		</h3>
		<div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
			<span class="inline-flex items-center gap-1">
				<span class="inline-block h-[7px] w-[7px] rounded-full bg-primary"></span>
				{$_('admin.ops.throughputChart.requests', { default: 'Requests' })}
			</span>
			<span class="inline-flex items-center gap-1">
				<span class="inline-block h-[7px] w-[7px] rounded-full bg-muted-foreground"></span>
				{$_('admin.ops.throughputChart.tokens', { default: 'Tokens' })}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!hasData}
				data-testid="ops-throughput-details-btn"
				title={$_('admin.ops.requestDetails.title', { default: 'Request details' })}
				onclick={handleOpenDetails}
			>
				{$_('admin.ops.requestDetails.details', { default: 'Details' })}
			</Button>
		</div>
	</div>

	<!-- Drilldown chips: groups take precedence, else platforms -->
	{#if (topGroups?.length ?? 0) > 0}
		<div class="mb-2.5 flex flex-wrap gap-1.5" data-testid="ops-throughput-group-chips">
			{#each topGroups ?? [] as g (g.group_id)}
				<button
					type="button"
					class="cursor-pointer"
					data-testid="ops-throughput-group-chip"
					onclick={() => onSelectGroup?.(g.group_id)}
				>
					<Badge
						variant="secondary"
						class="inline-flex items-center gap-1 hover:bg-secondary/80"
					>
						<span class="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
							{g.group_name || `#${g.group_id}`}
						</span>
						<span class="text-muted-foreground">{formatCompact(g.request_count)}</span>
					</Badge>
				</button>
			{/each}
		</div>
	{:else if (byPlatform?.length ?? 0) > 0}
		<div class="mb-2.5 flex flex-wrap gap-1.5" data-testid="ops-throughput-platform-chips">
			{#each byPlatform ?? [] as p (p.platform)}
				<button
					type="button"
					class="cursor-pointer"
					data-testid="ops-throughput-platform-chip"
					onclick={() => onSelectPlatform?.(p.platform)}
				>
					<Badge
						variant="secondary"
						class="inline-flex items-center gap-1 hover:bg-secondary/80"
					>
						<span class="uppercase">{p.platform}</span>
						<span class="text-muted-foreground">{formatCompact(p.request_count)}</span>
					</Badge>
				</button>
			{/each}
		</div>
	{/if}

	<div class="relative min-h-0 flex-1" style="min-height: 16rem;">
		{#if loading}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-throughput-loading"
			>
				{$_('common.loading', { default: 'Loading…' })}
			</div>
		{:else if chartError}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
				data-testid="ops-throughput-error"
			>
				{$_('admin.ops.charts.loadFailed', { default: 'Failed to load chart' })}
			</div>
		{:else if !hasData}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-throughput-empty"
			>
				{$_('admin.ops.charts.emptyRequest', { default: 'No throughput in this range' })}
			</div>
		{:else if !chartReady || !LineCmp}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
				data-testid="ops-throughput-loading"
			>
				{$_('common.loading', { default: 'Loading…' })}
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
	:global([data-testid='ops-throughput-trend'] canvas) {
		max-height: 100% !important;
	}
</style>
