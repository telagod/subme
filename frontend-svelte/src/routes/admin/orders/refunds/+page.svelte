<script lang="ts">
	/**
	 * Admin · Orders · Refunds queue（admin/orders/refunds）
	 *
	 * Thin orchestrator — data fetching + page-level state live here;
	 * all UI sections are extracted into feature components under
	 * $lib/features/refunds/.
	 *
	 * 红线（沿用）：
	 *   - 所有 Select 用 '__all__' 哨兵；禁 value=""。
	 *   - 本页**不**引用计费核心、渠道定价、价格查询 service。
	 *   - 退款执行端点 = orders surface 的 ProcessRefund；queue 维度（approve/reject
	 *     标记）走 refunds.ts facade。两者解耦。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw, AlertTriangle } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import RefundStatsCards from '$lib/features/refunds/RefundStatsCards.svelte';
	import RefundFilterBar from '$lib/features/refunds/RefundFilterBar.svelte';
	import RefundQueueTable from '$lib/features/refunds/RefundQueueTable.svelte';
	import RefundDetailDrawer from '$lib/features/refunds/RefundDetailDrawer.svelte';
	import RefundRejectDialog from '$lib/features/refunds/RefundRejectDialog.svelte';
	import OrderRefundDialog from '$lib/features/orders/OrderRefundDialog.svelte';
	import {
		listRefundQueue,
		approveRefund,
		type AdminRefundRequest,
		type AdminRefundFilter
	} from '$lib/api/admin/refunds';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import type { AdminOrder } from '$lib/api/admin/orders';

	const ALL = '__all__';
	const PAGE_SIZE = 20;

	// ── Page-level data state ────────────────────────────────────────────────
	let rows = $state<AdminRefundRequest[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	// ── Filter state (two-way bound to RefundFilterBar) ──────────────────────
	let statusFilter = $state<string>('pending');
	let searchInput = $state('');
	let startDate = $state('');
	let endDate = $state('');

	// ── Pagination ───────────────────────────────────────────────────────────
	let page = $state(1);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	// ── Approve dialog state ─────────────────────────────────────────────────
	let refundOpen = $state(false);
	let refundOrderTarget = $state<AdminOrder | null>(null);
	let pendingApproveId = $state<number | string | null>(null);

	// ── Reject dialog state ──────────────────────────────────────────────────
	let rejectOpen = $state(false);
	let rejectTarget = $state<AdminRefundRequest | null>(null);

	// ── Detail drawer state ──────────────────────────────────────────────────
	let detailOpen = $state(false);
	let detailRow = $state<AdminRefundRequest | null>(null);

	// ── Derived stats ────────────────────────────────────────────────────────
	const pendingCount = $derived(rows.filter((r) => r.status === 'pending').length);
	const totalRequested = $derived(
		rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
	);

	// ── Data fetching ────────────────────────────────────────────────────────
	async function loadQueue() {
		loading = true;
		loadError = null;
		try {
			const filter: AdminRefundFilter = {
				page,
				page_size: PAGE_SIZE,
				status: statusFilter === ALL ? undefined : statusFilter,
				keyword: searchInput.trim() || undefined,
				start_date: startDate || undefined,
				end_date: endDate || undefined,
				sort_by: 'requested_at',
				sort_order: 'desc'
			};
			const resp = await listRefundQueue(filter);
			rows = resp.data;
			total = resp.total;
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
		void loadQueue();
	});

	function applyFilters() {
		page = 1;
		void loadQueue();
	}

	// ── Approve flow ─────────────────────────────────────────────────────────
	function adaptRequestForRefundOrder(r: AdminRefundRequest): AdminOrder {
		return {
			id: r.order_id,
			out_trade_no: r.out_trade_no ?? String(r.order_id),
			user_id: r.user_id,
			user_email: r.user_email,
			plan_id: r.plan_id,
			plan_name: r.plan_name,
			order_type: 'subscription',
			status: 'REFUND_REQUESTED',
			pay_amount: r.amount,
			actually_refunded: 0,
			currency: r.currency,
			created_at: r.requested_at
		};
	}

	function openApprove(r: AdminRefundRequest) {
		pendingApproveId = r.id;
		refundOrderTarget = adaptRequestForRefundOrder(r);
		refundOpen = true;
	}

	async function handleRefunded() {
		if (pendingApproveId == null) {
			void loadQueue();
			return;
		}
		const id = pendingApproveId;
		pendingApproveId = null;
		try {
			await approveRefund(id);
			showSuccess(
				$_('admin.refunds.approveSuccess', { default: 'Refund approved' })
			);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refunds.approveError', {
					default: 'Approve failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			void loadQueue();
		}
	}

	// ── Reject flow ──────────────────────────────────────────────────────────
	function openReject(r: AdminRefundRequest) {
		rejectTarget = r;
		rejectOpen = true;
	}

	function handleRejected() {
		rejectTarget = null;
		void loadQueue();
	}

	// ── Detail view ──────────────────────────────────────────────────────────
	function openDetail(r: AdminRefundRequest) {
		detailRow = r;
		detailOpen = true;
	}

	// ── Pagination ───────────────────────────────────────────────────────────
	function handlePageChange(newPage: number) {
		page = newPage;
		void loadQueue();
	}
</script>

<svelte:head>
	<title>{$_('admin.refunds.title', { default: 'Refund queue' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-refunds-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.refunds.title', { default: 'Refund queue' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.refunds.desc', {
					default: 'Review pending refund requests · approve / reject with reason'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadQueue()}
				data-testid="admin-refunds-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
		</div>
	</div>

	<!-- Stats bar -->
	<RefundStatsCards
		{pendingCount}
		{totalRequested}
		visibleCount={rows.length}
		totalCount={total}
	/>

	<!-- Load error -->
	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2" data-testid="admin-refunds-error">
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => loadQueue()}>
				{$_('common.confirm', { default: 'Retry' })}
			</Button>
		</Alert>
	{/if}

	<!-- Filter bar -->
	<RefundFilterBar
		bind:searchInput
		bind:statusFilter
		bind:startDate
		bind:endDate
		onApply={applyFilters}
	/>

	<!-- Table + pagination + empty state -->
	<RefundQueueTable
		{rows}
		{loading}
		{page}
		{totalPages}
		onView={openDetail}
		onApprove={openApprove}
		onReject={openReject}
		onPageChange={handlePageChange}
	/>
</section>

<!-- Approve refund — feature-native dialog → POST /admin/payment/orders/:id/refund -->
<OrderRefundDialog
	bind:open={refundOpen}
	order={refundOrderTarget}
	onRefunded={handleRefunded}
/>

<!-- Reject confirm dialog -->
<RefundRejectDialog
	bind:open={rejectOpen}
	target={rejectTarget}
	onRejected={handleRejected}
/>

<!-- Detail drawer -->
<RefundDetailDrawer
	bind:open={detailOpen}
	row={detailRow}
/>
