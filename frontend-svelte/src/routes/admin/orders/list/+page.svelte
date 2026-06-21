<script lang="ts">
	/**
	 * Admin · Orders · List（M12）
	 *
	 * 设计：
	 *   - Header：title + 三个汇总指标（total revenue / refunds / cancellations，
	 *     基于当前 server-paged rows 的 rollup —— 与 M22 subscriptions stats 同语义）。
	 *   - Filters：date range（from/to）+ status Select（'__all__' 哨兵）+ provider Select
	 *     + user search + plan filter。filter 变化回到 page=1 + reload。
	 *   - Table：rows ≥ 50 启用 VirtualTable lazy island；否则平铺。
	 *     列：Order # | User (masked) | Plan/Type | Amount | Status | Provider | Created | Actions
	 *   - 行点击 → AdminOrderDetail drawer。
	 *   - Bulk select：M12 仅落地选择状态 + emit；批量退款 dialog UI 延后 Phase D。
	 *   - 分页。
	 *
	 * 红线：
	 *   - 所有 Select 用 '__all__' 哨兵；禁 value=""。
	 *   - 本页**不**引用计费核心、渠道定价、价格查询 service。
	 *   - 退款走 feature-native OrderRefundDialog → payment.refundOrder
	 *     （POST /admin/payment/orders/:id/refund，ProcessRefund）。不再经由 subscriptions
	 *     RefundDialog + id-aliasing adapter（那条路命中不存在的
	 *     /admin/subscriptions/:id/refund，对 balance/topup 订单更会打到错记录）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		RefreshCw,
		AlertTriangle,
		ChevronLeft,
		ChevronRight,
		PackageSearch
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import AdminOrderDetail from '$lib/features/orders/AdminOrderDetail.svelte';
	import OrdersFilterBar from '$lib/features/orders/OrdersFilterBar.svelte';
	import OrderRefundDialog from '$lib/features/orders/OrderRefundDialog.svelte';
	import {
		listAdminOrders,
		type AdminOrder,
		type AdminOrderFilter
	} from '$lib/api/admin/orders';
	import { listPlans, type AdminPlan } from '$lib/api/admin/plans';
	import { listProviders, type ProviderInstance } from '$lib/api/admin/payment';

	const ALL = '__all__';
	const VIRTUAL_THRESHOLD = 50;
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

	let rows = $state<AdminOrder[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let plans = $state<AdminPlan[]>([]);
	let providers = $state<ProviderInstance[]>([]);

	// Filters
	let statusFilter = $state(ALL);
	let providerFilter = $state(ALL);
	let planFilter = $state(ALL);
	let searchInput = $state('');
	let startDate = $state('');
	let endDate = $state('');

	// Pagination
	let page = $state(1);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	// Drawer / refund
	let drawerOpen = $state(false);
	let drawerOrder = $state<AdminOrder | null>(null);
	let refundOpen = $state(false);
	let refundOrderTarget = $state<AdminOrder | null>(null);

	// Bulk select state (Phase D polish — selection only, no batch refund UI yet)
	let selectedIds = $state<Set<string>>(new Set());

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
			// 清理 selection 中不属于当前页的 id
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

	// 汇总（基于当前页 rows —— server 已分页结果）
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

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);

	// Option lists
	const statusOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		const all = {
			value: ALL,
			label: $_('admin.orders.statusAll', { default: 'All statuses' })
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
				label: $_('admin.orders.providerAll', { default: 'All providers' })
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
				label: $_('admin.orders.planAll', { default: 'All plans' })
			},
			...plans.map((p) => ({ value: String(p.id), label: p.name }))
		];
	});

	function openDrawer(order: AdminOrder) {
		drawerOrder = order;
		drawerOpen = true;
	}

	function openRefund(order: AdminOrder) {
		refundOrderTarget = order;
		refundOpen = true;
	}

	function handleChanged() {
		void loadOrders();
	}

	function handleRefunded() {
		void loadOrders();
	}

	function maskEmail(email?: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const masked = local.length <= 2 ? local : local[0] + '***' + local[local.length - 1];
		return masked + email.slice(at);
	}

	function fmtDate(s?: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function fmtMoney(v?: number | null, currency = 'USD'): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return `${currency === 'USD' ? '$' : ''}${v.toFixed(2)}`;
	}

	function statusClass(s: string): string {
		switch (s) {
			case 'COMPLETED':
			case 'PAID':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'RECHARGING':
				return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
			case 'PENDING':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'EXPIRED':
			case 'CANCELLED':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'FAILED':
			case 'REFUND_FAILED':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			case 'REFUND_REQUESTED':
			case 'REFUNDING':
				return 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400';
			case 'PARTIALLY_REFUNDED':
			case 'REFUNDED':
				return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function handleRowKey(e: KeyboardEvent, order: AdminOrder) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openDrawer(order);
		}
	}

	function rowKey(r: AdminOrder): string {
		return String(r.id);
	}

	function toggleSelected(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function isSelected(id: string): boolean {
		return selectedIds.has(id);
	}
</script>

<svelte:head>
	<title>{$_('admin.orders.title', { default: 'Orders' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-orders-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.orders.title', { default: 'Orders' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.orders.desc', {
					default: 'Order ledger · review payments, refunds, retries and cancellations'
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
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
				>
					<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
					{$_('common.refresh', { default: 'Refresh' })}
				</Button>
			</div>
		</div>

	<!-- Stats bar -->
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
				{$_('admin.orders.statRevenue', { default: 'Revenue' })}
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
				{$_('admin.orders.statRefunds', { default: 'Refunds' })}
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
				{$_('admin.orders.statCancellations', { default: 'Cancelled' })}
			</span>
		</div>
			<div class="ml-auto text-xs text-muted-foreground tabular-nums">
				{rows.length} / {total}
			</div>
		</Card>

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
					{$_('common.confirm', { default: 'Retry' })}
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

		<!-- Selection toolbar -->
		{#if selectedIds.size > 0}
			<Alert
				class="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs"
				data-testid="admin-orders-bulk-toolbar"
			>
			<span class="font-mono tabular-nums text-foreground">
				{$_('admin.orders.selectedCount', {
					default: '{n} selected',
					values: { n: selectedIds.size }
				})}
			</span>
				<Button
					variant="outline"
					size="sm"
					class="ml-auto h-6 px-2 text-xs"
					onclick={() => (selectedIds = new Set())}
					data-testid="admin-orders-bulk-clear"
				>
					{$_('common.clear', { default: 'Clear' })}
				</Button>
			</Alert>
		{/if}

	<!-- Table -->
	{#if loading && rows.length === 0}
		<div class="flex flex-col gap-2" data-testid="admin-orders-loading">
			{#each Array(5) as _, i (i)}
				<div class="h-12 animate-pulse rounded-md border border-border bg-muted"></div>
			{/each}
		</div>
	{:else if rows.length > 0}
		<Card
			padded={false}
			class="overflow-hidden"
			data-testid="admin-orders-table-wrapper"
			style="height: 560px;"
		>
			{#if useVirtual}
				<VirtualTable {rows} rowHeight={56} getRowKey={(r) => rowKey(r)}>
					{#snippet header()}
						<div
							class="grid grid-cols-[36px,1.4fr,1.4fr,1fr,90px,90px,1fr,100px,90px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							<div></div>
							<div>{$_('admin.orders.colOrderNo', { default: 'Order #' })}</div>
							<div>{$_('admin.orders.colUser', { default: 'User' })}</div>
							<div>{$_('admin.orders.colPlanType', { default: 'Plan / Type' })}</div>
							<div class="text-right">{$_('admin.orders.colAmount', { default: 'Amount' })}</div>
							<div>{$_('admin.orders.colStatus', { default: 'Status' })}</div>
							<div>{$_('admin.orders.colProvider', { default: 'Provider' })}</div>
							<div>{$_('admin.orders.colCreated', { default: 'Created' })}</div>
							<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
						</div>
					{/snippet}
					{#snippet row({ row: order })}
						<InteractiveRow
							class="grid w-full cursor-pointer grid-cols-[36px,1.4fr,1.4fr,1fr,90px,90px,1fr,100px,90px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => openDrawer(order)}
							onkeydown={(e) => handleRowKey(e, order)}
							data-testid="admin-orders-row"
							data-order-id={order.id}
						>
							<div
								class="flex items-center"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								role="presentation"
							>
								<Checkbox
									class="h-3.5 w-3.5"
									checked={isSelected(String(order.id))}
									onchange={() => toggleSelected(String(order.id))}
									data-testid="admin-orders-row-select"
									aria-label={$_('admin.orders.selectRow', { default: 'Select row' })}
								/>
							</div>
							<div class="truncate font-mono text-foreground">
								{order.out_trade_no ?? order.id}
							</div>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">{maskEmail(order.user_email)}</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{order.user_id}
								</div>
							</div>
							<div class="truncate text-foreground">
								<div class="truncate">{order.plan_name ?? '—'}</div>
								<div class="truncate text-[10.5px] text-muted-foreground">{order.order_type}</div>
							</div>
							<div class="text-right font-mono tabular-nums text-foreground">
								{fmtMoney(order.pay_amount, order.currency)}
							</div>
							<div>
								<Badge
									variant="outline"
									class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(order.status)}"
								>
									{order.status}
								</Badge>
							</div>
							<div class="truncate text-muted-foreground">
								{order.provider_name ?? order.payment_provider ?? order.payment_type ?? '—'}
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(order.created_at)}
							</div>
							<div class="flex justify-end gap-1">
								<Button
									variant="outline"
									size="sm"
									class="h-6 px-2 text-[10.5px]"
									onclick={(e) => {
										e.stopPropagation();
										openRefund(order);
									}}
									data-testid="admin-orders-refund-quick"
								>
									{$_('admin.orders.refundQuick', { default: 'Refund' })}
								</Button>
							</div>
						</InteractiveRow>
					{/snippet}
				</VirtualTable>
			{:else}
				<!-- Plain table（≤ 50 行） -->
				<div class="flex h-full flex-col" data-testid="admin-orders-table-flat">
					<div
						class="grid grid-cols-[36px,1.4fr,1.4fr,1fr,90px,90px,1fr,100px,90px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div></div>
						<div>{$_('admin.orders.colOrderNo', { default: 'Order #' })}</div>
						<div>{$_('admin.orders.colUser', { default: 'User' })}</div>
						<div>{$_('admin.orders.colPlanType', { default: 'Plan / Type' })}</div>
						<div class="text-right">{$_('admin.orders.colAmount', { default: 'Amount' })}</div>
						<div>{$_('admin.orders.colStatus', { default: 'Status' })}</div>
						<div>{$_('admin.orders.colProvider', { default: 'Provider' })}</div>
						<div>{$_('admin.orders.colCreated', { default: 'Created' })}</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
					<div class="flex-1 overflow-y-auto">
						{#each rows as order (rowKey(order))}
							<InteractiveRow
								class="grid w-full cursor-pointer grid-cols-[36px,1.4fr,1.4fr,1fr,90px,90px,1fr,100px,90px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
								onclick={() => openDrawer(order)}
								onkeydown={(e) => handleRowKey(e, order)}
								data-testid="admin-orders-row"
								data-order-id={order.id}
							>
								<div
									class="flex items-center"
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => e.stopPropagation()}
									role="presentation"
								>
									<Checkbox
										class="h-3.5 w-3.5"
										checked={isSelected(String(order.id))}
										onchange={() => toggleSelected(String(order.id))}
										data-testid="admin-orders-row-select"
										aria-label={$_('admin.orders.selectRow', { default: 'Select row' })}
									/>
								</div>
								<div class="truncate font-mono text-foreground">
									{order.out_trade_no ?? order.id}
								</div>
								<div class="truncate">
									<div class="truncate font-mono text-foreground">{maskEmail(order.user_email)}</div>
									<div class="truncate font-mono text-[10.5px] text-muted-foreground">
										#{order.user_id}
									</div>
								</div>
								<div class="truncate text-foreground">
									<div class="truncate">{order.plan_name ?? '—'}</div>
									<div class="truncate text-[10.5px] text-muted-foreground">
										{order.order_type}
									</div>
								</div>
								<div class="text-right font-mono tabular-nums text-foreground">
									{fmtMoney(order.pay_amount, order.currency)}
								</div>
								<div>
									<Badge
										variant="outline"
										class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(order.status)}"
									>
										{order.status}
									</Badge>
								</div>
								<div class="truncate text-muted-foreground">
									{order.provider_name ?? order.payment_provider ?? order.payment_type ?? '—'}
								</div>
								<div class="font-mono tabular-nums text-muted-foreground">
									{fmtDate(order.created_at)}
								</div>
								<div class="flex justify-end gap-1">
									<Button
										variant="outline"
										size="sm"
										class="h-6 px-2 text-[10.5px]"
										onclick={(e) => {
											e.stopPropagation();
											openRefund(order);
										}}
										data-testid="admin-orders-refund-quick"
									>
										{$_('admin.orders.refundQuick', { default: 'Refund' })}
									</Button>
								</div>
							</InteractiveRow>
						{/each}
					</div>
				</div>
			{/if}
		</Card>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="flex items-center justify-center gap-2 pt-1"
				data-testid="admin-orders-pagination"
			>
				<Button
					variant="outline"
					size="icon"
					disabled={page === 1 || loading}
					onclick={() => {
						page = Math.max(1, page - 1);
						void loadOrders();
					}}
					aria-label={$_('common.back', { default: 'Previous' })}
				>
					<ChevronLeft class="h-3 w-3" />
				</Button>
				<span class="text-xs tabular-nums text-muted-foreground">
					{page} / {totalPages}
				</span>
				<Button
					variant="outline"
					size="icon"
					disabled={page === totalPages || loading}
					onclick={() => {
						page = Math.min(totalPages, page + 1);
						void loadOrders();
					}}
					aria-label={$_('common.next', { default: 'Next' })}
				>
					<ChevronRight class="h-3 w-3" />
				</Button>
			</div>
		{/if}
	{:else if !loading}
		<div
			class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
			data-testid="admin-orders-empty"
		>
			<PackageSearch class="h-10 w-10 opacity-40" />
			<p class="m-0 text-[13px]">
				{$_('admin.orders.emptyText', {
					default: 'No orders match the current filters.'
				})}
			</p>
		</div>
	{/if}
</section>

<!-- Drawer -->
<AdminOrderDetail
	bind:open={drawerOpen}
	order={drawerOrder}
	onChanged={handleChanged}
	onRequestRefund={(order) => {
		refundOrderTarget = order;
		refundOpen = true;
	}}
/>

<!-- Refund — feature-native dialog → POST /admin/payment/orders/:id/refund -->
<OrderRefundDialog
	bind:open={refundOpen}
	order={refundOrderTarget}
	onRefunded={handleRefunded}
/>
