<script lang="ts">
	/**
	 * Admin · Orders · Payment Dashboard（M12）
	 *
	 * 与 Vue tree AdminPaymentDashboardView.vue 同语义重写：
	 *   - Top：6 张 KPI 卡（today revenue / today orders / today refunds /
	 *     MTD revenue / active subs / churn rate） —— PaymentDashboardCards。
	 *   - Middle：日收入趋势 lazy line chart（chart.js + svelte-chartjs 动态加载）。
	 *   - Bottom：provider/payment-method breakdown table。
	 *   - Header：日期范围段（7 / 30 / 90 / 180）+ refresh。
	 *
	 * 后端 invariant：
	 *   - `/api/admin/payment/dashboard?days=N` 是唯一聚合端点；本页 3 个 API 调用
	 *     在 paymentDashboard.ts 内做 in-flight memoization 折叠成 1 次 round-trip。
	 *
	 * 红线：
	 *   - 不引用 billing 核心 service / channels 定价端点 / 价格查询函数。
	 *   - chart.js / svelte-chartjs 仅通过 PaymentDashboardChart 内 dynamic import 引入，
	 *     本页**不**直接顶层 import 这两个包（check-chunks gate）。
	 *   - 所有 Select-like 状态用真值，不出现 value=""（无 Select 控件，按钮组替代）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw, AlertTriangle } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import PaymentDashboardCards from '$lib/features/orders/PaymentDashboardCards.svelte';
	import PaymentDashboardChart from '$lib/features/orders/PaymentDashboardChart.svelte';
	import ProviderBreakdown from '$lib/features/orders/ProviderBreakdown.svelte';
	import {
		getDashboardStats,
		getDashboardTrend,
		getProviderBreakdown,
		type DashboardStatsSnapshot,
		type DashboardTrendPoint,
		type ProviderBreakdownRow
	} from '$lib/api/admin/paymentDashboard';

	const DAYS_OPTIONS = [7, 30, 90, 180] as const;

	let days = $state<number>(30);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let stats = $state<DashboardStatsSnapshot | null>(null);
	let trend = $state<DashboardTrendPoint[] | null>(null);
	let providers = $state<ProviderBreakdownRow[] | null>(null);

	async function loadAll() {
		loading = true;
		loadError = null;
		try {
			// 3 个调用同窗口走 paymentDashboard.ts 的 in-flight memoization
			// 折叠成 1 次后端请求 —— 这里 await Promise.all 拿三份投影。
			const [s, t, p] = await Promise.all([
				getDashboardStats({ days }),
				getDashboardTrend({ days }, 'day'),
				getProviderBreakdown({ days })
			]);
			stats = s;
			trend = t;
			providers = p;
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
			stats = null;
			trend = null;
			providers = null;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadAll();
	});

	function chooseDays(d: number) {
		if (d === days || loading) return;
		days = d;
		void loadAll();
	}
</script>

<svelte:head>
	<title>{$_('admin.orderDashboard.title', { default: '支付仪表盘' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-orderdash-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.orderDashboard.title', { default: '支付仪表盘' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.orderDashboard.desc', {
					default: '收入账本 · 实时 KPIs · 供应商分布'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<!-- 日期段切换 -->
			<div
				class="inline-flex overflow-hidden rounded-md border border-border"
				data-testid="admin-orderdash-range"
				>
					{#each DAYS_OPTIONS as d (d)}
						<Button
							variant="ghost"
							size="sm"
							class="rounded-none border-r border-border px-3 last:border-r-0 {days ===
							d
								? 'bg-muted text-foreground'
								: 'bg-transparent text-muted-foreground'}"
							disabled={loading}
							onclick={() => chooseDays(d)}
						data-testid="admin-orderdash-range-{d}"
							aria-pressed={days === d}
						>
							{d}{$_('admin.orderDashboard.daySuffix', { default: 'd' })}
						</Button>
					{/each}
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={loading}
					onclick={() => loadAll()}
					data-testid="admin-orderdash-refresh"
				title={$_('common.refresh', { default: '刷新' })}
				aria-label={$_('common.refresh', { default: '刷新' })}
				>
					<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
					{$_('common.refresh', { default: '刷新' })}
				</Button>
			</div>
		</div>

		<!-- Load error -->
		{#if loadError}
			<Alert
				variant="destructive"
				class="flex items-center gap-2"
				data-testid="admin-orderdash-error"
			>
				<AlertTriangle class="h-4 w-4" />
				<span>{loadError}</span>
				<Button
					variant="outline"
					size="sm"
					class="ml-auto h-6 px-2 text-xs"
					onclick={() => loadAll()}
				>
					{$_('common.confirm', { default: '重试' })}
				</Button>
			</Alert>
		{/if}

	<!-- Top: 6 KPI cards -->
	<PaymentDashboardCards {stats} {loading} />

	<!-- Middle: lazy line chart -->
	<div class="flex flex-col gap-1.5">
		<h2
			class="m-0 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"
		>
			{$_('admin.orderDashboard.chart.title', { default: '收入趋势' })}
		</h2>
		<PaymentDashboardChart data={trend} {loading} />
	</div>

	<!-- Bottom: provider breakdown -->
	<div class="flex flex-col gap-1.5">
		<h2
			class="m-0 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"
		>
			{$_('admin.orderDashboard.provider.title', { default: '供应商分布' })}
		</h2>
		<ProviderBreakdown rows={providers} {loading} />
	</div>
</section>
