<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, RefreshCw, ShoppingCart, X } from '@lucide/svelte';
	import {
		cancelMyOrder,
		getRefundEligibleProviders,
		listMyOrders,
		requestMyOrderRefund,
		type UserOrderStatus,
		type UserPaymentOrder
	} from '$lib/api/user/payment';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		ORDER_STATUSES,
		PAGE_SIZE,
		STATUS_ALL,
		canCancel,
		canRequestRefund,
		formatDate,
		formatMoney,
		orderTypeLabel,
		statusTone
	} from '$lib/features/user-orders/user-orders';

	let rows = $state<UserPaymentOrder[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let actionLoading = $state(false);
	let loadError = $state<string | null>(null);
	let statusFilter = $state<string>(STATUS_ALL);
	let refundEligibleProviders = $state<Set<string>>(new Set());
	let cancelTarget = $state<UserPaymentOrder | null>(null);
	let refundTarget = $state<UserPaymentOrder | null>(null);
	let refundReason = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	async function loadOrders() {
		loading = true;
		loadError = null;
		try {
			const res = await listMyOrders({
				page,
				page_size: PAGE_SIZE,
				status: statusFilter === STATUS_ALL ? undefined : (statusFilter as UserOrderStatus)
			});
			rows = res.items;
			total = res.total;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') {
				loadError = msg || 'Failed to load orders';
				showError(loadError);
			}
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	async function loadRefundEligibility() {
		try {
			refundEligibleProviders = await getRefundEligibleProviders();
		} catch {
			refundEligibleProviders = new Set();
		}
	}

	function applyStatusFilter() {
		page = 1;
		void loadOrders();
	}

	async function confirmCancel() {
		if (!cancelTarget) return;
		actionLoading = true;
		try {
			await cancelMyOrder(cancelTarget.id);
			showSuccess($_('common.success', { default: '成功' }));
			cancelTarget = null;
			await loadOrders();
		} catch (err) {
			showError((err as Error)?.message ?? 'Failed to cancel order');
		} finally {
			actionLoading = false;
		}
	}

	async function confirmRefund() {
		if (!refundTarget || !refundReason.trim()) return;
		actionLoading = true;
		try {
			await requestMyOrderRefund(refundTarget.id, refundReason.trim());
			showSuccess($_('common.success', { default: '成功' }));
			refundTarget = null;
			refundReason = '';
			await loadOrders();
		} catch (err) {
			showError((err as Error)?.message ?? 'Failed to request refund');
		} finally {
			actionLoading = false;
		}
	}

	function gotoPrev() {
		if (page <= 1) return;
		page -= 1;
		void loadOrders();
	}

	function gotoNext() {
		if (page >= totalPages) return;
		page += 1;
		void loadOrders();
	}

	onMount(() => {
		void loadOrders();
		void loadRefundEligibility();
	});
</script>

<svelte:head>
	<title>{$_('payment.orders.title', { default: '订单' })} · sub2api</title>
</svelte:head>

<section class="space-y-5" data-testid="user-orders-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('payment.orders.title', { default: '订单' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('payment.orders.description', { default: '查看支付订单、取消待处理订单、申请符合条件的退款。' })}
			</p>
		</div>
		<Button href="/purchase" class="h-9 px-3">
			{$_('payment.result.backToRecharge', { default: '购买订阅' })}
		</Button>
	</header>

	<div class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
		<NativeSelect
			bind:value={statusFilter}
			onchange={applyStatusFilter}
			data-testid="user-orders-status-filter"
		>
			<option value={STATUS_ALL}>{$_('common.all', { default: '全部' })}</option>
			{#each ORDER_STATUSES as status}
				<option value={status}>{$_(`payment.status.${status.toLowerCase()}`, { default: status })}</option>
			{/each}
		</NativeSelect>
		<Button
			type="button"
			variant="outline"
			class="ml-auto text-muted-foreground hover:text-foreground"
			onclick={loadOrders}
			disabled={loading}
		>
			<RefreshCw class={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
			{$_('common.refresh', { default: '刷新' })}
		</Button>
	</div>

	{#if loadError}
		<Alert variant="destructive">
			{loadError}
		</Alert>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<div class="grid min-w-[980px] grid-cols-[90px_minmax(180px,1fr)_150px_150px_130px_170px_160px] border-b bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
			<div>{$_('payment.orders.orderId', { default: '订单号' })}</div>
			<div>{$_('payment.orders.orderNo', { default: '订单号' })}</div>
			<div>{$_('payment.orders.payAmount', { default: '支付金额' })}</div>
			<div>{$_('payment.orders.paymentMethod', { default: '支付方式' })}</div>
			<div>{$_('payment.orders.status', { default: '状态' })}</div>
			<div>{$_('payment.orders.createdAt', { default: '创建时间' })}</div>
			<div class="text-right">{$_('common.actions', { default: '操作' })}</div>
		</div>
		{#if loading}
			<div class="flex min-h-48 items-center justify-center" data-testid="user-orders-loading">
				<RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{:else if rows.length === 0}
			<div class="flex min-h-56 flex-col items-center justify-center text-center" data-testid="user-orders-empty">
				<ShoppingCart class="mb-3 h-10 w-10 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$_('payment.orders.empty', { default: '暂无订单' })}</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				{#each rows as order}
					<div class="grid min-w-[980px] grid-cols-[90px_minmax(180px,1fr)_150px_150px_130px_170px_160px] items-center border-b border-border px-4 py-3 text-sm last:border-b-0" data-testid="user-order-row">
						<div class="font-mono">#{order.id}</div>
						<div class="min-w-0">
							<p class="truncate font-mono text-xs">{order.out_trade_no}</p>
							<p class="text-xs text-muted-foreground">{orderTypeLabel(order)}</p>
						</div>
						<div>
							<p class="font-medium">{formatMoney(order.pay_amount, order.currency ?? 'USD')}</p>
							{#if order.amount !== order.pay_amount}
								<p class="text-xs text-muted-foreground">
									{$_('payment.orders.creditedAmount', { default: '已到账' })}: {formatMoney(order.amount, order.order_type === 'balance' ? 'USD' : (order.currency ?? 'USD'))}
								</p>
							{/if}
						</div>
						<div class="truncate">{$_(`payment.methods.${order.payment_type}`, { default: order.payment_type })}</div>
						<div>
							<Badge variant="outline" class={statusTone(order.status)}>{order.status}</Badge>
						</div>
						<div class="text-xs text-muted-foreground">{formatDate(order.created_at)}</div>
						<div class="flex justify-end gap-2">
							{#if canCancel(order)}
								<Button size="sm" variant="outline" class="border-amber-500/30 text-amber-700 hover:bg-amber-500/10" onclick={() => (cancelTarget = order)}>
									<X class="h-3 w-3" /> {$_('payment.orders.cancel', { default: '取消' })}
								</Button>
							{/if}
							{#if canRequestRefund(order, refundEligibleProviders)}
								<Button size="sm" variant="outline" class="border-primary/30 text-primary hover:bg-primary/10" onclick={() => { refundTarget = order; refundReason = ''; }}>
									{$_('payment.orders.requestRefund', { default: '申请退款' })}
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<span>{total} orders · page {page} / {totalPages}</span>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={gotoPrev} aria-label="Previous page"><ChevronLeft class="h-4 w-4" /></Button>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={gotoNext} aria-label="Next page"><ChevronRight class="h-4 w-4" /></Button>
		</div>
	</div>

	<StandardDialog
		open={Boolean(cancelTarget)}
		width="sm"
		title={$_('payment.orders.cancel', { default: '取消' })}
		description={$_('payment.confirmCancel', { default: '取消此待处理订单？' })}
		data-testid="user-order-cancel-dialog"
	>
		<div class="mt-6 flex justify-end gap-2 border-t border-border pt-4">
			<Button variant="outline" onclick={() => (cancelTarget = null)}>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button variant="destructive" disabled={actionLoading} onclick={confirmCancel}>
				{actionLoading
					? $_('common.processing', { default: '处理中...' })
					: $_('payment.orders.cancel', { default: '取消' })}
			</Button>
		</div>
	</StandardDialog>

	<StandardDialog
		open={Boolean(refundTarget)}
		width="md"
		title={$_('payment.orders.requestRefund', { default: '申请退款' })}
		data-testid="user-order-refund-dialog"
	>
		{#if refundTarget}
			<div class="mt-4 rounded-md bg-muted p-3 text-sm">
				<div class="flex justify-between">
					<span class="text-muted-foreground">{$_('payment.orders.orderId', { default: '订单号' })}</span>
					<span class="font-mono">#{refundTarget.id}</span>
				</div>
				<div class="mt-2 flex justify-between">
					<span class="text-muted-foreground">{$_('payment.orders.amount', { default: '金额' })}</span>
					<span>{formatMoney(refundTarget.amount, refundTarget.currency ?? 'USD')}</span>
				</div>
			</div>
			<label class="mt-3 block text-sm">
				<span class="font-medium">{$_('payment.refundReason', { default: '退款原因' })}</span>
				<Textarea
					class="mt-1 min-h-24"
					bind:value={refundReason}
					placeholder={$_('payment.refundReasonPlaceholder', {
						default: '描述退款原因'
					})}
				/>
			</label>
			<div class="mt-4 flex justify-end gap-2 border-t border-border pt-4">
				<Button variant="outline" onclick={() => (refundTarget = null)}>
					{$_('common.cancel', { default: '取消' })}
				</Button>
				<Button disabled={actionLoading || !refundReason.trim()} onclick={confirmRefund}>
					{actionLoading
						? $_('common.processing', { default: '处理中...' })
						: $_('payment.orders.requestRefund', { default: '申请退款' })}
				</Button>
			</div>
		{/if}
	</StandardDialog>
</section>
