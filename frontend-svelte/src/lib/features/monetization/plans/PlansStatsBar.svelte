<script lang="ts">
	/**
	 * PlansStatsBar — admin plans catalog stats strip (total / on-sale / archived).
	 * Extracted from +page.svelte for thin-orchestrator pattern.
	 */
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';

	type Props = {
		total: number;
		activeCount: number;
		archivedCount: number;
	};

	let { total, activeCount, archivedCount }: Props = $props();
</script>

<Card class="flex items-center gap-5 px-[18px] py-3" data-testid="plans-stats">
	<div class="flex items-baseline gap-[7px]">
		<span class="font-mono text-[22px] font-bold tabular-nums text-foreground"
			>{total}</span
		>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.plansCatalog.statTotal', { default: '方案总数' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-emerald-500"
			data-testid="plans-stat-on-sale"
		>
			{activeCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.plansCatalog.statOnSale', { default: '在售' })}
		</span>
	</div>
	<div class="h-6 w-px bg-border" aria-hidden="true"></div>
	<div class="flex items-baseline gap-[7px]">
		<span
			class="font-mono text-[22px] font-bold tabular-nums text-muted-foreground"
			data-testid="plans-stat-archived"
		>
			{archivedCount}
		</span>
		<span class="text-[11.5px] text-muted-foreground">
			{$_('admin.plansCatalog.statOffSale', { default: '已归档' })}
		</span>
	</div>
</Card>
