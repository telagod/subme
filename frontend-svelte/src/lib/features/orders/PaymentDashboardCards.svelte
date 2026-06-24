<script lang="ts">
	/**
	 * PaymentDashboardCards · 6 KPI 卡组合
	 *
	 * 与 Vue tree OrderStatsCards.vue 同款 KPI 摘要面，但密度更高：4 → 6 张卡。
	 * 顺序：today revenue / today orders / today refunds / MTD revenue /
	 *      active subs / churn rate。
	 *
	 * 设计：
	 *   - 接受 `stats: DashboardStatsSnapshot | null`；loading=true 渲染 skeleton。
	 *   - active subs / churn 后端可能未直出（null）—— 显示 `--` 兜底。
	 *   - 货币格式 `$X.XX`，数量纯整数，churn 用 `XX.X%`。
	 *   - 严禁顶层 import chart.js / payment SDK。
	 */
	import { _ } from 'svelte-i18n';
	import { TrendingUp, ShoppingCart, RotateCcw, CalendarRange, Users, TrendingDown } from '@lucide/svelte';
	import type { DashboardStatsSnapshot } from '$lib/api/admin/paymentDashboard';

	let {
		stats,
		loading = false
	}: { stats: DashboardStatsSnapshot | null; loading?: boolean } = $props();

	function fmtMoney(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '--';
		return `$${v.toFixed(2)}`;
	}

	function fmtCount(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '--';
		return String(Math.round(v));
	}

	function fmtRate(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '--';
		const pct = v <= 1 ? v * 100 : v;
		return `${pct.toFixed(1)}%`;
	}

	const cards = $derived.by(() => [
		{
			key: 'todayRevenue',
			testid: 'admin-orderdash-stat-today-revenue',
			labelKey: 'admin.orderDashboard.stat.todayRevenue',
			labelDefault: 'Today revenue',
			value: fmtMoney(stats?.today_revenue),
			icon: TrendingUp,
			accent: 'text-emerald-500'
		},
		{
			key: 'todayOrders',
			testid: 'admin-orderdash-stat-today-orders',
			labelKey: 'admin.orderDashboard.stat.todayOrders',
			labelDefault: 'Today orders',
			value: fmtCount(stats?.today_orders),
			icon: ShoppingCart,
			accent: 'text-sky-500'
		},
		{
			key: 'todayRefunds',
			testid: 'admin-orderdash-stat-today-refunds',
			labelKey: 'admin.orderDashboard.stat.todayRefunds',
			labelDefault: 'Today refunds',
			value: fmtMoney(stats?.today_refunds),
			icon: RotateCcw,
			accent: 'text-amber-500'
		},
		{
			key: 'mtdRevenue',
			testid: 'admin-orderdash-stat-mtd-revenue',
			labelKey: 'admin.orderDashboard.stat.mtdRevenue',
			labelDefault: 'MTD revenue',
			value: fmtMoney(stats?.mtd_revenue),
			icon: CalendarRange,
			accent: 'text-emerald-500'
		},
		{
			key: 'activeSubs',
			testid: 'admin-orderdash-stat-active-subs',
			labelKey: 'admin.orderDashboard.stat.activeSubs',
			labelDefault: 'Active subs',
			value: fmtCount(stats?.active_subscriptions),
			icon: Users,
			accent: 'text-foreground'
		},
		{
			key: 'churnRate',
			testid: 'admin-orderdash-stat-churn',
			labelKey: 'admin.orderDashboard.stat.churn',
			labelDefault: 'Churn rate',
			value: fmtRate(stats?.churn_rate),
			icon: TrendingDown,
			accent: 'text-rose-500'
		}
	]);
</script>

<div
	class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
	data-testid="admin-orderdash-cards"
>
	{#each cards as card (card.key)}
		{@const Icon = card.icon}
		<div
			class="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
			data-testid={card.testid}
		>
			<div class="flex items-center justify-between gap-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
				<span>{$_(card.labelKey, { default: card.labelDefault })}</span>
				<Icon class="h-3.5 w-3.5 opacity-60" />
			</div>
			{#if loading}
				<div class="mt-0.5 h-7 w-2/3 animate-pulse rounded-md bg-muted"></div>
			{:else}
				<span
					class="font-mono text-[20px] font-bold tabular-nums {card.accent}"
					data-testid="{card.testid}-value"
				>
					{card.value}
				</span>
			{/if}
		</div>
	{/each}
</div>
