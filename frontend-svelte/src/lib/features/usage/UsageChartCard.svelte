<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { UsageTrendPoint } from '$lib/api/user/usage';
	import TimeseriesChart from '$lib/features/usage/TimeseriesChart.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Props {
		data: UsageTrendPoint[] | null;
		loading: boolean;
		error: string | null;
		onRetry: () => void;
	}

	let { data, loading, error, onRetry }: Props = $props();
</script>

<article
	class="rounded-lg border border-border bg-card p-4 shadow-sm"
	data-testid="usage-chart-card"
>
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-medium text-muted-foreground">
			{$_('user.usage.chartTitle', { default: 'Usage over time' })}
		</h2>
		{#if error && !loading}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={onRetry}
				data-testid="usage-chart-retry"
			>
				{$_('user.usage.retry', { default: 'Retry' })}
			</Button>
		{/if}
	</div>
	<TimeseriesChart {data} {loading} />
</article>
