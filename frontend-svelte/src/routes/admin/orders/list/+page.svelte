<script lang="ts">
	/**
	 * Admin · Orders · List（M12）
	 *
	 * Thin orchestrator — owns page-level state, data fetching, and filter logic.
	 * Visual sections delegated to feature components:
	 *   - OrdersStatsBar   — revenue / refunds / cancellations summary
	 *   - OrdersFilterBar   — date range, status, provider, plan, keyword
	 *   - OrdersTable       — table (virtual/flat), bulk toolbar, pagination, empty/loading
	 *   - AdminOrderDetail  — drawer
	 *   - OrderRefundDialog  — refund dialog
	 *
	 * Red lines:
	 *   - All Select use '__all__' sentinel; no value="".
	 *   - This page does NOT reference billing core / channel pricing / price query services.
	 *   - Refund goes through OrderRefundDialog -> payment.refundOrder
	 *     (POST /admin/payment/orders/:id/refund).
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw, AlertTriangle } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import AdminOrderDetail from '$lib/features/orders/AdminOrderDetail.svelte';
	import OrdersFilterBar from '$lib/features/orders/OrdersFilterBar.svelte';
	import OrdersStatsBar from '$lib/features/orders/OrdersStatsBar.svelte';
	import OrdersTable from '$lib/features/orders/OrdersTable.svelte';
	import OrderRefundDialog from '$lib/features/orders/OrderRefundDialog.svelte';
	import {
		listAdminOrders,
		type AdminOrder,
		type AdminOrderFilter
	} from '$lib/api/admin/orders';
	import { listPlans, type AdminPlan } from '$lib/api/admin/plans';
	import { listProviders, type ProviderInstance } from '$lib/api/admin/payment';

	const ALL = '__all__';
	const PAGE_SIZE = 20;

	const ORDER_STATUSES = [
		'PENDING',
		'PAID',
		'RECHARGING',
		'COMPLETED',
		'EXPIRED',
		'CANCELLED',
		'FAILED',
		'REFUND_REQUESTED',
		'REFUNDING',
		'PARTIALLY_REFUNDED',
		'REFUNDED',
		'REFUND_FAILED'
	] as const;

	/* ── Data ── */
	let rows = $state<AdminOrder[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let plans = $state<AdminPlan[]>([]);
	let providers = $state<ProviderInstance[]>([]);

	/* ── Filters ── */
	let statusFilter = $state(ALL);
	let providerFilter = $state(ALL);
	let planFilter = $state(ALL);
	let searchInput = $state('');
	let startDate = $state('');
	let endDate = $state('');

	/* ── Pagination ── */
	let page = $state(1);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	/* ── Drawer / refund ── */
	let drawerOpen = $state(false);
	let drawerOrder = $state<AdminOrder | null>(null);
	let refundOpen = $state(false);
	let refundOrderTarget = $state<AdminOrder | null>(null);

	/* ── Bulk select ── */
	let selectedIds = $state<Set<string>>(new Set());

	/* ── Data fetching ── */

	async function loadCatalogs() {
		try {
			plans = await listPlans();
		} catch {
			plans = [];
		}
		try {
			providers = await listProviders();
		} catch {
			providers = [];
		}
	}

	async function loadOrders() {
		loading = true;
		loadError = null;
		try {
			const filter: AdminOrderFilter = {
				page,
				page_size: PAGE_SIZE,
				status: statusFilter === ALL ? undefined : statusFilter,
				provider: providerFilter === ALL ? undefined : providerFilter,
				plan_id: planFilter === ALL ? undefined : Number(planFilter),
				keyword: searchInput.trim() || undefined,
				start_date: startDate || undefined,
				end_date: endDate || undefined,
				sort_by: 'created_at',
				sort_order: 'desc'
			};
			const resp = await listAdminOrders(filter);
			rows = resp.data;
			total = resp.total;
			// Clean selection for ids not in current page
			const present = new Set(rows.map((r) => String(r.id)));
			selectedIds = new Set(
				[...selectedIds].filter((id) => present.has(id))
			);
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadCatalogs();
		void loadOrders();
	});

	function applyFilters() {
		page = 1;
		void loadOrders();
	}

	/* ── Derived stats ── */
	const totalRevenue = $derived(
		rows
			.filter(
				(r) =>
					r.status === 'PAID' ||
					r.status === 'COMPLETED' ||
					r.status === 'PARTIALLY_REFUNDED' ||
					r.status === 'RECHARGING'
			)
			.reduce((sum, r) => sum + (Number(r.pay_amount) || 0), 0)
	);
	const totalRefunds = $derived(
		rows.reduce((sum, r) => sum + (Number(r.actually_refunded) || 0), 0)
	);
	const cancellationCount = $derived(
		rows.filter((r) => r.status === 'CANCELLED' || r.status === 'EXPIRED').length
	);

	/* ── Option lists ── */
	const statusOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		const all = {
			value: ALL,
			label: $_('admin.orders.statusAll', { default: '全部状态' })
		};
		return [
			all,
			...ORDER_STATUSES.map((s) => ({
				value: s,
				label: $_(`admin.orders.status.${s}`, { default: s })
			}))
		];
	});

	const providerOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		return [
			{
				value: ALL,
				label: $_('admin.orders.providerAll', { default: '全部供应商' })
			},
			...providers.map((p) => ({
				value: p.provider_key,
				label: `${p.name} · ${p.provider_key}`
			}))
		];
	});

	const planOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		return [
			{
				value: ALL,
				label: $_('admin.orders.planAll', { default: '全部方案' })
			},
			...plans.map((p) => ({ value: String(p.id), label: p.name }))
		];
	});

	/* ── Callbacks ── */

	function openDrawer(order: AdminOrder) {
		drawerOrder = order;
		drawerOpen = true;
	}

	function openRefund(order: AdminOrder) {
		refundOrderTarget = order;
		refundOpen = true;
	}

	function handlePageChange(newPage: number) {
		page = newPage;
		void loadOrders();
	}

	function handleSelectionChange(ids: Set<string>) {
		selectedIds = ids;
	}
</script>

<svelte:head>
	<title>{$_('admin.orders.title', { default: '订单' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-orders-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.orders.title', { default: '订单' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.orders.desc', {
					default: '订单账本 · 查看支付、退款、重试和取消'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadOrders()}
				data-testid="admin-orders-refresh"
				title={$_('common.refresh', { default: '刷新' })}
				aria-label={$_('common.refresh', { default: '刷新' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: '刷新' })}
			</Button>
		</div>
	</div>

	<!-- Stats bar -->
	<OrdersStatsBar
		{totalRevenue}
		{totalRefunds}
		{cancellationCount}
		pageCount={rows.length}
		totalCount={total}
	/>

	<!-- Load error -->
	{#if loadError}
		<Alert
			variant="destructive"
			class="flex items-center gap-2"
			data-testid="admin-orders-error"
		>
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<Button
				variant="outline"
				size="sm"
				class="ml-auto h-6 px-2 text-xs"
				onclick={() => loadOrders()}
			>
				{$_('common.confirm', { default: '重试' })}
			</Button>
		</Alert>
	{/if}

	<!-- Filter bar -->
	<OrdersFilterBar
		bind:status={statusFilter}
		bind:provider={providerFilter}
		bind:plan={planFilter}
		bind:keyword={searchInput}
		bind:startDate
		bind:endDate
		{statusOptions}
		{providerOptions}
		{planOptions}
		onChange={applyFilters}
		onSubmit={applyFilters}
	/>

	<!-- Table + bulk toolbar + pagination + empty/loading -->
	<OrdersTable
		{rows}
		{loading}
		{page}
		{totalPages}
		{selectedIds}
		onRowClick={openDrawer}
		onRefundClick={openRefund}
		onPageChange={handlePageChange}
		onSelectionChange={handleSelectionChange}
	/>
</section>

<!-- Drawer -->
<AdminOrderDetail
	bind:open={drawerOpen}
	order={drawerOrder}
	onChanged={() => void loadOrders()}
	onRequestRefund={(order) => {
		refundOrderTarget = order;
		refundOpen = true;
	}}
/>

<!-- Refund dialog -->
<OrderRefundDialog
	bind:open={refundOpen}
	order={refundOrderTarget}
	onRefunded={() => void loadOrders()}
/>
