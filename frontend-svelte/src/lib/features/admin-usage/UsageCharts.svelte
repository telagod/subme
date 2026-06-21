<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';
	import ChartIsland from '$lib/ui/ChartIsland.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	type ChartData = { labels: string[]; datasets: Record<string, unknown>[] };

	type Props = {
		endpointChartData: ChartData;
		modelChartData: ChartData;
		trendChartData: ChartData;
		statsLoading: boolean;
		chartsLoading: boolean;
		endpointEmpty: boolean;
		modelEmpty: boolean;
		trendEmpty: boolean;
		endpointCount: number;
		modelMetric: 'tokens' | 'actual_cost';
		onModelMetricChange?: (metric: 'tokens' | 'actual_cost') => void;
	};

	let {
		endpointChartData,
		modelChartData,
		trendChartData,
		statsLoading,
		chartsLoading,
		endpointEmpty,
		modelEmpty,
		trendEmpty,
		endpointCount,
		modelMetric = 'actual_cost',
		onModelMetricChange
	}: Props = $props();

	const metricOptions = [
		{ value: 'actual_cost', label: 'By cost' },
		{ value: 'tokens', label: 'By tokens' }
	];

	const doughnutOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: { legend: { position: 'right' as const, labels: { boxWidth: 10, font: { size: 10 } } } }
	};

	const trendLineOptions = {
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
			y1: { beginAtZero: true, position: 'right' as const, grid: { display: false }, ticks: { font: { size: 10 } } }
		}
	};

	function handleMetricChange() {
		onModelMetricChange?.(modelMetric as 'tokens' | 'actual_cost');
	}
</script>

<div class="space-y-3">
	<!-- Top row: model distribution + endpoint distribution -->
	<div class="grid gap-3 lg:grid-cols-2">
		<Card class="p-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">
					{$_('admin.usage.modelDistribution', { default: 'Model distribution' })}
				</h2>
				<NativeSelect
					bind:value={modelMetric}
					options={metricOptions}
					onchange={handleMetricChange}
					class="w-28"
				/>
			</div>
			<div class="mt-3">
				<ChartIsland type="doughnut" data={modelChartData} loading={statsLoading} empty={modelEmpty} options={doughnutOptions} height="h-56" />
			</div>
		</Card>

		<Card class="p-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">
					{$_('admin.usage.endpointDistribution', { default: 'Top endpoints' })}
				</h2>
				<span class="text-xs text-muted-foreground">{statsLoading ? 'Loading' : `${endpointCount} shown`}</span>
			</div>
			<div class="mt-3">
				<ChartIsland type="doughnut" data={endpointChartData} loading={statsLoading} empty={endpointEmpty} options={doughnutOptions} height="h-56" />
			</div>
		</Card>
	</div>

	<!-- Trend chart (full width) -->
	<Card class="p-3">
		<h2 class="text-sm font-semibold">
			{$_('admin.usage.usageTrend', { default: 'Usage trend' })}
		</h2>
		<div class="mt-3">
			<ChartIsland type="line" data={trendChartData} loading={chartsLoading} empty={trendEmpty} options={trendLineOptions} />
		</div>
	</Card>
</div>
