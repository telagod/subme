<script lang="ts">
	/**
	 * OrdersStatsBar · summary metrics strip (revenue / refunds / cancellations)
	 *
	 * Pure display component. Receives computed totals from parent page.
	 */
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';

	type Props = {
		totalRevenue: number;
		totalRefunds: number;
		cancellationCount: number;
		pageCount: number;
		totalCount: number;
	};

	let {
		totalRevenue,
		totalRefunds,
		cancellationCount,
		pageCount,
		totalCount
	}: Props = $props();
</script>

<Card
	class="flex items-center gap-5 px-[18px] py-3"
	data-testid="admin-orders-stats"
>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-emerald-500"
			data-testid="admin-orders-stat-revenue"
		>
			${totalRevenue.toFixed(2)}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.orders.statRevenue', { default: '收入' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-amber-500"
			data-testid="admin-orders-stat-refunds"
		>
			${totalRefunds.toFixed(2)}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.orders.statRefunds', { default: '退款' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-foreground"
			data-testid="admin-orders-stat-cancellations"
		>
			{cancellationCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.orders.statCancellations', { default: '已取消' })}
		</span>
	</div>
	<div class="ml-auto text-xs text-muted-foreground tabular-nums">
		{pageCount} / {totalCount}
	</div>
</Card>
