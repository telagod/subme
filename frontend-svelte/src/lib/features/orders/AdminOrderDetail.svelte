<script lang="ts">
	/**
	 * AdminOrderDetail · 管理员订单详情抽屉（M12）
	 *
	 * 设计：
	 *   - StandardDrawer 右侧贴边面板，对齐 M22
	 *     SubscriptionDetailDrawer 视觉契约。
	 *   - $effect 监听 open + order.id 变化 → 拉 detail + audit log。
	 *   - 12 个 OrderStatus 全状态色带 + 行动按钮按状态门控：
	 *       Retry  → status ∈ {FAILED, REFUND_FAILED}
	 *       Cancel → status ∈ {PENDING}
	 *       Refund → canRefund 判定（PAID / COMPLETED / RECHARGING /
	 *                PARTIALLY_REFUNDED + 未全额退款）
	 *   - Refund 不在抽屉内实现表单，仅 emit onRequestRefund(order)，
	 *     由父页路由到订单原生 OrderRefundDialog（features/orders/OrderRefundDialog.svelte，
	 *     POST /admin/payment/orders/:id/refund）。
	 *
	 * 红线（CLAUDE.md billing）：
	 *   - 不引用计费核心服务、渠道定价、价格查询；
	 *   - 不在模块顶层 import 任何 lazy island（chart.js / stripe / airwallex）。
	 */
	import { _ } from 'svelte-i18n';
	import {
		X,
		AlertTriangle,
		RefreshCw,
		Banknote,
		Trash2,
		RotateCcw
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import {
		getAdminOrder,
		listOrderAuditLog,
		retryOrder,
		cancelOrder,
		type AdminOrder,
		type AdminOrderAuditEntry
	} from '$lib/api/admin/orders';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		order: AdminOrder | null;
		onChanged?: () => void;
		onRequestRefund?: (order: AdminOrder) => void;
	};

	let {
		open = $bindable(false),
		order = null,
		onChanged,
		onRequestRefund
	}: Props = $props();

	let detail = $state<AdminOrder | null>(null);
	let auditLog = $state<AdminOrderAuditEntry[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let retrying = $state(false);
	let cancelling = $state(false);

	let lastLoadedId = $state<string | number | null>(null);

	$effect(() => {
		if (open && order && order.id !== lastLoadedId) {
			lastLoadedId = order.id;
			void loadDetail(order.id);
		}
		if (!open) {
			lastLoadedId = null;
			detail = null;
			auditLog = [];
			loadError = null;
		}
	});

	async function loadDetail(id: number | string) {
		loading = true;
		loadError = null;
		try {
			const [d, log] = await Promise.all([
				getAdminOrder(id),
				listOrderAuditLog(id).catch(() => [])
			]);
			detail = d;
			auditLog = log;
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
		} finally {
			loading = false;
		}
	}

	function close() {
		open = false;
	}

	async function handleRetry() {
		if (!detail || retrying) return;
		retrying = true;
		try {
			await retryOrder(detail.id);
			showSuccess(
				$_('admin.orders.retrySuccess', { default: 'Order retry queued' })
			);
			onChanged?.();
			await loadDetail(detail.id);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.orders.retryError', {
					default: 'Retry failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			retrying = false;
		}
	}

	async function handleCancel() {
		if (!detail || cancelling) return;
		cancelling = true;
		try {
			await cancelOrder(detail.id);
			showSuccess(
				$_('admin.orders.cancelSuccess', { default: 'Order cancelled' })
			);
			onChanged?.();
			await loadDetail(detail.id);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.orders.cancelError', {
					default: 'Cancel failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			cancelling = false;
		}
	}

	function handleRefund() {
		if (!detail) return;
		onRequestRefund?.(detail);
	}

	function fmtDate(s?: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function fmtMoney(v?: number | null, currency = 'USD'): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return `${currency === 'USD' ? '$' : ''}${v.toFixed(2)}`;
	}

	function maskEmail(email?: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const masked = local.length <= 2 ? local : local[0] + '***' + local[local.length - 1];
		return masked + email.slice(at);
	}

	const statusBadgeClass = $derived.by<string>(() => {
		const s = detail?.status ?? order?.status ?? '';
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
	});

	const canRetry = $derived.by<boolean>(() => {
		const s = detail?.status ?? '';
		return s === 'FAILED' || s === 'REFUND_FAILED';
	});

	const canCancel = $derived.by<boolean>(() => {
		const s = detail?.status ?? '';
		return s === 'PENDING';
	});

	const canRefund = $derived.by<boolean>(() => {
		if (!detail) return false;
		const s = detail.status;
		const refundable =
			s === 'PAID' ||
			s === 'COMPLETED' ||
			s === 'RECHARGING' ||
			s === 'PARTIALLY_REFUNDED';
		if (!refundable) return false;
		const paid = detail.pay_amount ?? 0;
		const refunded = detail.actually_refunded ?? 0;
		return paid - refunded > 0;
	});
</script>

<StandardDrawer
	bind:open
	width="md"
	showHeader={false}
	title={$_('admin.orders.detailTitle', { default: 'Order detail' })}
	data-testid="order-detail-drawer"
	class="gap-0 p-0"
>
			<!-- Head -->
			<div class="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
				<div class="min-w-0">
					<h2 class="truncate text-sm font-semibold tracking-tight text-foreground">
						{$_('admin.orders.detailTitle', { default: 'Order detail' })}
					</h2>
					<div
						class="truncate font-mono text-[11px] text-muted-foreground"
						title={String(order?.id ?? '')}
					>
						#{order?.out_trade_no ?? order?.id ?? '—'}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8 text-muted-foreground hover:bg-card hover:text-foreground"
					aria-label={$_('common.close', { default: 'Close' })}
					data-testid="order-detail-close"
					onclick={close}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-4 py-4">
				{#if loading}
					<div class="space-y-3" data-testid="order-detail-loading">
						<div class="h-5 w-1/3 animate-pulse rounded bg-muted"></div>
						<div class="h-24 w-full animate-pulse rounded bg-muted"></div>
						<div class="h-32 w-full animate-pulse rounded bg-muted"></div>
					</div>
				{:else if loadError}
					<Alert
						variant="destructive"
						data-testid="order-detail-error"
					>
						<div class="mb-2 flex items-center gap-2 font-medium">
							<AlertTriangle class="h-4 w-4" />
							<span>{loadError}</span>
						</div>
						{#if order}
							<Button
								variant="outline"
								size="sm"
								class="border-destructive/40 text-destructive hover:bg-destructive/20"
								onclick={() => loadDetail(order!.id)}
							>
								{$_('common.confirm', { default: 'Retry' })}
							</Button>
						{/if}
					</Alert>
				{:else if detail}
					<!-- Status pill -->
					<div class="mb-4 flex items-center gap-2">
						<Badge
							variant="outline"
							class="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider {statusBadgeClass}"
							data-testid="order-detail-status"
						>
							{detail.status}
						</Badge>
						{#if detail.order_type}
							<Badge
								variant="outline"
								class="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
							>
								{detail.order_type}
							</Badge>
						{/if}
					</div>

					<!-- User -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.orders.userBlock', { default: 'Customer' })}
						</h3>
						<dl class="grid grid-cols-[100px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.orders.userId', { default: 'User ID' })}
							</dt>
							<dd class="font-mono text-foreground" data-testid="order-detail-user-id">
								{detail.user_id}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.userEmail', { default: 'Email' })}
							</dt>
							<dd class="font-mono text-foreground" data-testid="order-detail-user-email">
								{maskEmail(detail.user_email)}
							</dd>
						</dl>
					</section>

					<!-- Plan / order type -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.orders.planBlock', { default: 'Plan / Type' })}
						</h3>
						<dl class="grid grid-cols-[100px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.orders.planName', { default: 'Plan' })}
							</dt>
							<dd class="text-foreground" data-testid="order-detail-plan-name">
								{detail.plan_name ?? '—'}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.orderType', { default: 'Order type' })}
							</dt>
							<dd class="text-foreground">{detail.order_type ?? '—'}</dd>
						</dl>
					</section>

					<!-- Payment -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.orders.paymentBlock', { default: 'Payment' })}
						</h3>
						<dl class="grid grid-cols-[100px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.orders.providerLabel', { default: 'Provider' })}
							</dt>
							<dd class="text-foreground">
								{detail.provider_name ?? detail.payment_provider ?? detail.payment_type ?? '—'}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.baseAmount', { default: 'Base amount' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.base_amount, detail.currency)}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.fee', { default: 'Fee' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.fee, detail.currency)}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.payAmount', { default: 'Pay amount' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.pay_amount, detail.currency)}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.creditedAmount', { default: 'Credited' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.credited_amount, detail.currency)}
							</dd>
							{#if (detail.actually_refunded ?? 0) > 0}
								<dt class="text-muted-foreground">
									{$_('admin.orders.refunded', { default: 'Refunded' })}
								</dt>
								<dd class="font-mono tabular-nums text-amber-600 dark:text-amber-400">
									{fmtMoney(detail.actually_refunded, detail.currency)}
								</dd>
							{/if}
						</dl>
					</section>

					<!-- Timeline -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.orders.timelineBlock', { default: 'Timeline' })}
						</h3>
						<dl class="grid grid-cols-[100px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.orders.createdAt', { default: 'Created' })}
							</dt>
							<dd class="font-mono text-foreground">{fmtDate(detail.created_at)}</dd>
							<dt class="text-muted-foreground">
								{$_('admin.orders.expiresAt', { default: 'Expires' })}
							</dt>
							<dd class="font-mono text-foreground">{fmtDate(detail.expires_at)}</dd>
							{#if detail.paid_at}
								<dt class="text-muted-foreground">
									{$_('admin.orders.paidAt', { default: 'Paid' })}
								</dt>
								<dd class="font-mono text-foreground">{fmtDate(detail.paid_at)}</dd>
							{/if}
							{#if detail.completed_at}
								<dt class="text-muted-foreground">
									{$_('admin.orders.completedAt', { default: 'Completed' })}
								</dt>
								<dd class="font-mono text-foreground">{fmtDate(detail.completed_at)}</dd>
							{/if}
							{#if detail.refund_at}
								<dt class="text-muted-foreground">
									{$_('admin.orders.refundAt', { default: 'Refunded at' })}
								</dt>
								<dd class="font-mono text-foreground">{fmtDate(detail.refund_at)}</dd>
							{/if}
						</dl>
					</section>

					<!-- Audit log -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.orders.auditLog', { default: 'Audit log' })}
						</h3>
						{#if auditLog.length === 0}
							<p
								class="m-0 text-xs text-muted-foreground"
								data-testid="order-detail-audit-empty"
							>
								{$_('admin.orders.auditEmpty', { default: 'No audit entries yet.' })}
							</p>
						{:else}
							<ol class="m-0 flex flex-col gap-2 p-0 list-none" data-testid="order-detail-audit-log">
								{#each auditLog as entry (entry.id)}
									<li
										class="rounded border border-border bg-card p-2 text-xs"
										data-testid="order-detail-audit-entry"
									>
										<div class="flex items-center justify-between gap-2">
											<span class="font-mono font-semibold text-foreground">
												{entry.action}
											</span>
											<span class="font-mono text-[10.5px] text-muted-foreground">
												{fmtDate(entry.created_at)}
											</span>
										</div>
										{#if entry.actor}
											<div class="mt-0.5 text-[11px] text-muted-foreground">
												{$_('admin.orders.auditActor', { default: 'By' })}: {entry.actor}
											</div>
										{/if}
										{#if entry.reason}
											<div class="mt-1 text-[11px] text-foreground">{entry.reason}</div>
										{/if}
									</li>
								{/each}
							</ol>
						{/if}
					</section>
				{/if}
			</div>

			<!-- Footer actions -->
			{#if detail}
				<div class="flex flex-col gap-2 border-t border-border bg-card px-4 py-3">
					<div class="flex flex-wrap items-center justify-end gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={() => loadDetail(detail!.id)}
							data-testid="order-detail-refresh"
						>
							<RefreshCw class="h-3.5 w-3.5" />
							{$_('common.refresh', { default: 'Refresh' })}
						</Button>
						{#if canRetry}
							<Button
								variant="outline"
								size="sm"
								onclick={handleRetry}
								disabled={retrying}
								data-testid="order-detail-retry-btn"
							>
								<RotateCcw class="h-3.5 w-3.5" />
								{retrying
									? $_('common.submitting', { default: 'Submitting…' })
									: $_('admin.orders.retryBtn', { default: 'Retry' })}
							</Button>
						{/if}
						{#if canRefund}
							<Button
								variant="outline"
								size="sm"
								onclick={handleRefund}
								data-testid="order-detail-refund-btn"
							>
								<Banknote class="h-3.5 w-3.5" />
								{$_('admin.orders.refundBtn', { default: 'Refund' })}
							</Button>
						{/if}
						{#if canCancel}
							<Button
								variant="destructive"
								size="sm"
								onclick={handleCancel}
								disabled={cancelling}
								data-testid="order-detail-cancel-btn"
							>
								<Trash2 class="h-3.5 w-3.5" />
								{cancelling
									? $_('common.submitting', { default: 'Submitting…' })
									: $_('admin.orders.cancelBtn', { default: 'Cancel order' })}
							</Button>
						{/if}
					</div>
				</div>
			{/if}
		</StandardDrawer>
