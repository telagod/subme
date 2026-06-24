<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';

	type Props = {
		activeCount: number;
		cancelledCount: number;
		totalRevenue: number;
		visibleCount: number;
		totalCount: number;
	};

	let { activeCount, cancelledCount, totalRevenue, visibleCount, totalCount }: Props = $props();
</script>

<Card class="flex items-center gap-5 px-[18px] py-3" data-testid="admin-subs-stats">
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-emerald-500"
			data-testid="admin-subs-stat-active"
		>
			{activeCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.subscriptions.statActive', { default: '活跃' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-amber-500"
			data-testid="admin-subs-stat-cancelled"
		>
			{cancelledCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.subscriptions.statCancelled', { default: '已取消' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-foreground"
			data-testid="admin-subs-stat-revenue"
		>
			${totalRevenue.toFixed(2)}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.subscriptions.statRevenue', { default: '本月收入' })}
		</span>
	</div>
	<div class="ml-auto text-xs text-muted-foreground tabular-nums">
		{visibleCount} / {totalCount}
	</div>
</Card>
