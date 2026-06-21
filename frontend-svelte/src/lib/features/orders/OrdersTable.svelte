<script lang="ts">
	/**
	 * OrdersTable · main data table with virtual/flat modes, bulk toolbar,
	 * loading skeleton, empty state, and pagination.
	 *
	 * Extracted from +page.svelte to keep the page as a thin orchestrator.
	 * All data and callbacks come from the parent; this component owns no API calls.
	 */
	import { _ } from 'svelte-i18n';
	import {
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
	import type { AdminOrder } from '$lib/api/admin/orders';

	const VIRTUAL_THRESHOLD = 50;

	type Props = {
		rows: AdminOrder[];
		loading: boolean;
		page: number;
		totalPages: number;
		selectedIds: Set<string>;
		onRowClick: (order: AdminOrder) => void;
		onRefundClick: (order: AdminOrder) => void;
		onPageChange: (newPage: number) => void;
		onSelectionChange: (ids: Set<string>) => void;
	};

	let {
		rows,
		loading,
		page,
		totalPages,
		selectedIds,
		onRowClick,
		onRefundClick,
		onPageChange,
		onSelectionChange
	}: Props = $props();

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);

	/* ── helpers ── */

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

	function rowKey(r: AdminOrder): string {
		return String(r.id);
	}

	function isSelected(id: string): boolean {
		return selectedIds.has(id);
	}

	function toggleSelected(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onSelectionChange(next);
	}

	function clearSelection() {
		onSelectionChange(new Set());
	}

	function handleRowKey(e: KeyboardEvent, order: AdminOrder) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onRowClick(order);
		}
	}

	const GRID_COLS = 'grid-cols-[36px,1.4fr,1.4fr,1fr,90px,90px,1fr,100px,90px]';
</script>

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
			onclick={clearSelection}
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
						class="grid {GRID_COLS} gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
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
						class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
						onclick={() => onRowClick(order)}
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
									onRefundClick(order);
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
			<!-- Plain table -->
			<div class="flex h-full flex-col" data-testid="admin-orders-table-flat">
				<div
					class="grid {GRID_COLS} gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
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
							class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => onRowClick(order)}
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
										onRefundClick(order);
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
				onclick={() => onPageChange(Math.max(1, page - 1))}
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
				onclick={() => onPageChange(Math.min(totalPages, page + 1))}
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
