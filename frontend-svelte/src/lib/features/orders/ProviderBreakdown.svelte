<script lang="ts">
	/**
	 * ProviderBreakdown · provider/payment-method statistics table
	 *
	 * 与 Vue tree PaymentMethodChart.vue 同语义但表格化展开：
	 *   provider | revenue | order count | success rate | avg ticket
	 *
	 * 设计：
	 *   - 列定宽 grid，数字列右对齐 tabular-nums 字体。
	 *   - 空态 / loading 内联渲染。
	 *   - 按 revenue 降序排序，便于运营侧 quick scan。
	 */
	import { _ } from 'svelte-i18n';
	import { Network } from '@lucide/svelte';
	import type { ProviderBreakdownRow } from '$lib/api/admin/paymentDashboard';

	let {
		rows,
		loading = false
	}: { rows: ProviderBreakdownRow[] | null; loading?: boolean } = $props();

	const sorted = $derived.by<ProviderBreakdownRow[]>(() => {
		if (!rows) return [];
		return [...rows].sort((a, b) => b.revenue - a.revenue);
	});

	function fmtMoney(v: number): string {
		if (!Number.isFinite(v)) return '--';
		return `$${v.toFixed(2)}`;
	}

	function fmtCount(v: number): string {
		if (!Number.isFinite(v)) return '--';
		return String(Math.round(v));
	}

	function fmtRate(v: number): string {
		if (!Number.isFinite(v)) return '--';
		const pct = v <= 1 ? v * 100 : v;
		return `${pct.toFixed(1)}%`;
	}

	function rateClass(v: number): string {
		const pct = v <= 1 ? v * 100 : v;
		if (pct >= 95) return 'text-emerald-500';
		if (pct >= 80) return 'text-amber-500';
		return 'text-destructive';
	}
</script>

<div
	class="overflow-hidden rounded-xl border border-border bg-card"
	data-testid="admin-orderdash-provider-table"
>
	<div
		class="grid grid-cols-[1.4fr,1fr,90px,110px,1fr] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
	>
		<div>{$_('admin.orderDashboard.provider.colName', { default: '供应商' })}</div>
		<div class="text-right">
			{$_('admin.orderDashboard.provider.colRevenue', { default: '收入' })}
		</div>
		<div class="text-right">
			{$_('admin.orderDashboard.provider.colCount', { default: '订单' })}
		</div>
		<div class="text-right">
			{$_('admin.orderDashboard.provider.colSuccess', { default: '成功率' })}
		</div>
		<div class="text-right">
			{$_('admin.orderDashboard.provider.colAvg', { default: '平均单价' })}
		</div>
	</div>

	{#if loading}
		<div class="flex flex-col gap-1.5 px-3 py-3" data-testid="admin-orderdash-provider-loading">
			{#each Array(3) as _, i (i)}
				<div class="h-7 animate-pulse rounded-md bg-muted"></div>
			{/each}
		</div>
	{:else if sorted.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-2 px-6 py-10 text-muted-foreground"
			data-testid="admin-orderdash-provider-empty"
		>
			<Network class="h-8 w-8 opacity-40" />
			<p class="m-0 text-[12.5px]">
				{$_('admin.orderDashboard.provider.empty', { default: '该范围内无供应商活动' })}
			</p>
		</div>
	{:else}
		{#each sorted as row (row.provider)}
			<div
				class="grid grid-cols-[1.4fr,1fr,90px,110px,1fr] gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"
				data-testid="admin-orderdash-provider-row"
				data-provider={row.provider}
			>
				<div class="truncate font-medium text-foreground">{row.provider}</div>
				<div class="text-right font-mono tabular-nums text-foreground">
					{fmtMoney(row.revenue)}
				</div>
				<div class="text-right font-mono tabular-nums text-muted-foreground">
					{fmtCount(row.order_count)}
				</div>
				<div class="text-right font-mono tabular-nums {rateClass(row.success_rate)}">
					{fmtRate(row.success_rate)}
				</div>
				<div class="text-right font-mono tabular-nums text-muted-foreground">
					{fmtMoney(row.avg_ticket)}
				</div>
			</div>
		{/each}
	{/if}
</div>
