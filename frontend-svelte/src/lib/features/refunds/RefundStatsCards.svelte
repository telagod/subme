<script lang="ts">
	/**
	 * RefundStatsCards — summary stats bar for the refund queue page.
	 *
	 * Receives pre-computed stats from the page orchestrator; zero data
	 * fetching of its own.
	 */
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';

	interface Props {
		pendingCount: number;
		totalRequested: number;
		visibleCount: number;
		totalCount: number;
	}

	let { pendingCount, totalRequested, visibleCount, totalCount }: Props = $props();
</script>

<Card class="flex items-center gap-5 px-[18px] py-3" data-testid="admin-refunds-stats">
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-amber-500"
			data-testid="admin-refunds-stat-pending"
		>
			{pendingCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.refunds.statPending', { default: '待处理' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-foreground"
			data-testid="admin-refunds-stat-amount"
		>
			${totalRequested.toFixed(2)}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.refunds.statAmount', { default: '已请求' })}
		</span>
	</div>
	<div class="ml-auto text-xs text-muted-foreground tabular-nums">
		{visibleCount} / {totalCount}
	</div>
</Card>
