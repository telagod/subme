<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import ChartIsland from '$lib/ui/ChartIsland.svelte';

	type Props = {
		endpointChartData: { labels: string[]; datasets: Record<string, unknown>[] };
		statsLoading: boolean;
		empty: boolean;
		endpointCount: number;
	};
	let { endpointChartData, statsLoading, empty, endpointCount }: Props = $props();
</script>

<Card class="p-3">
	<div class="flex items-center justify-between gap-3">
		<h2 class="text-sm font-semibold">Top inbound endpoints</h2>
		<span class="text-xs text-muted-foreground">{statsLoading ? 'Loading' : `${endpointCount} shown`}</span>
	</div>
	<div class="mt-3">
		<ChartIsland type="doughnut" data={endpointChartData} loading={statsLoading} {empty}
			options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }} height="h-56" />
	</div>
</Card>

<Card class="p-3">
	<div class="flex items-center justify-between gap-3">
		<h2 class="text-sm font-semibold">Top models</h2>
	</div>
	<div class="mt-3">
		<ChartIsland type="doughnut" data={endpointChartData} loading={statsLoading} {empty}
			options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }} height="h-56" />
	</div>
</Card>
