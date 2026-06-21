<script lang="ts">
	/**
	 * RefundQueueTable — refund queue data table with virtual/flat rendering
	 * and inline action buttons.
	 *
	 * Renders both VirtualTable (>50 rows) and flat table modes. Row actions
	 * (view, approve, reject) fire callbacks to the page orchestrator.
	 */
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		Inbox,
		CheckCircle2,
		XCircle,
		Eye
	} from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import type { AdminRefundRequest } from '$lib/api/admin/refunds';

	const VIRTUAL_THRESHOLD = 50;

	interface Props {
		rows: AdminRefundRequest[];
		loading: boolean;
		page: number;
		totalPages: number;
		onView: (r: AdminRefundRequest) => void;
		onApprove: (r: AdminRefundRequest) => void;
		onReject: (r: AdminRefundRequest) => void;
		onPageChange: (newPage: number) => void;
	}

	let { rows, loading, page, totalPages, onView, onApprove, onReject, onPageChange }: Props =
		$props();

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);

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
			return new Date(s).toLocaleString();
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
			case 'pending':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'approved':
				return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
			case 'completed':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'rejected':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'failed':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function handleRowKey(e: KeyboardEvent, r: AdminRefundRequest) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onView(r);
		}
	}

	function rowKey(r: AdminRefundRequest): string {
		return String(r.id);
	}

	function canActOn(s: string): boolean {
		return s === 'pending';
	}
</script>

{#if loading && rows.length === 0}
	<div class="flex flex-col gap-2" data-testid="admin-refunds-loading">
		{#each Array(5) as _, i (i)}
			<div class="h-12 animate-pulse rounded-md border border-border bg-muted"></div>
		{/each}
	</div>
{:else if rows.length > 0}
	<Card
		padded={false}
		class="overflow-hidden"
		data-testid="admin-refunds-table-wrapper"
		style="height: 560px;"
	>
		{#if useVirtual}
			<VirtualTable {rows} rowHeight={56} getRowKey={(r) => rowKey(r)}>
				{#snippet header()}
					<div
						class="grid grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div>{$_('admin.refunds.colOrderNo', { default: 'Order #' })}</div>
						<div>{$_('admin.refunds.colUser', { default: 'User' })}</div>
						<div class="text-right">{$_('admin.refunds.colAmount', { default: 'Amount' })}</div>
						<div>{$_('admin.refunds.colReason', { default: 'Reason' })}</div>
						<div>{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}</div>
						<div>{$_('admin.refunds.colStatus', { default: 'Status' })}</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
				{/snippet}
				{#snippet row({ row: r })}
					<InteractiveRow
						class="grid w-full cursor-pointer grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
						onclick={() => onView(r)}
						onkeydown={(e) => handleRowKey(e, r)}
						data-testid="admin-refunds-row"
						data-refund-id={r.id}
						data-refund-status={r.status}
					>
						<div class="truncate font-mono text-foreground">
							{r.out_trade_no ?? r.order_id}
						</div>
						<div class="truncate">
							<div class="truncate font-mono text-foreground">{maskEmail(r.user_email)}</div>
							<div class="truncate font-mono text-[10.5px] text-muted-foreground">
								#{r.user_id}
							</div>
						</div>
						<div class="text-right font-mono tabular-nums text-foreground">
							{fmtMoney(r.amount, r.currency)}
						</div>
						<div class="truncate text-muted-foreground" title={r.reason}>
							{r.reason ?? '—'}
						</div>
						<div class="font-mono tabular-nums text-muted-foreground">
							{fmtDate(r.requested_at)}
						</div>
						<div>
							<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(r.status)}">
								{$_(`admin.refunds.status.${r.status}`, { default: r.status })}
							</Badge>
						</div>
						<div class="flex justify-end gap-1">
							<Button
								variant="outline"
								size="sm"
								class="h-6 px-1.5 text-[10.5px]"
								onclick={(e) => {
									e.stopPropagation();
									onView(r);
								}}
								data-testid="admin-refunds-view"
								title={$_('admin.refunds.view', { default: 'View' })}
								aria-label={$_('admin.refunds.view', { default: 'View' })}
							>
								<Eye class="h-3 w-3" />
							</Button>
							{#if canActOn(r.status)}
								<Button
									variant="outline"
									size="sm"
									class="h-6 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10.5px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
									onclick={(e) => {
										e.stopPropagation();
										onApprove(r);
									}}
									data-testid="admin-refunds-approve"
								>
									<CheckCircle2 class="h-3 w-3" />
									{$_('admin.refunds.approve', { default: 'Approve' })}
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="h-6 border-destructive/40 bg-destructive/10 px-1.5 text-[10.5px] text-destructive hover:bg-destructive/20"
									onclick={(e) => {
										e.stopPropagation();
										onReject(r);
									}}
									data-testid="admin-refunds-reject"
								>
									<XCircle class="h-3 w-3" />
									{$_('admin.refunds.reject', { default: 'Reject' })}
								</Button>
							{/if}
						</div>
					</InteractiveRow>
				{/snippet}
			</VirtualTable>
		{:else}
			<div class="flex h-full flex-col" data-testid="admin-refunds-table-flat">
				<div
					class="grid grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					<div>{$_('admin.refunds.colOrderNo', { default: 'Order #' })}</div>
					<div>{$_('admin.refunds.colUser', { default: 'User' })}</div>
					<div class="text-right">{$_('admin.refunds.colAmount', { default: 'Amount' })}</div>
					<div>{$_('admin.refunds.colReason', { default: 'Reason' })}</div>
					<div>{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}</div>
					<div>{$_('admin.refunds.colStatus', { default: 'Status' })}</div>
					<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
				</div>
				<div class="flex-1 overflow-y-auto">
					{#each rows as r (rowKey(r))}
						<InteractiveRow
							class="grid w-full cursor-pointer grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => onView(r)}
							onkeydown={(e) => handleRowKey(e, r)}
							data-testid="admin-refunds-row"
							data-refund-id={r.id}
							data-refund-status={r.status}
						>
							<div class="truncate font-mono text-foreground">
								{r.out_trade_no ?? r.order_id}
							</div>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">{maskEmail(r.user_email)}</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{r.user_id}
								</div>
							</div>
							<div class="text-right font-mono tabular-nums text-foreground">
								{fmtMoney(r.amount, r.currency)}
							</div>
							<div class="truncate text-muted-foreground" title={r.reason}>
								{r.reason ?? '—'}
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(r.requested_at)}
							</div>
							<div>
								<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(r.status)}">
									{$_(`admin.refunds.status.${r.status}`, { default: r.status })}
								</Badge>
							</div>
							<div class="flex justify-end gap-1">
								<Button
									variant="outline"
									size="sm"
									class="h-6 px-1.5 text-[10.5px]"
									onclick={(e) => {
										e.stopPropagation();
										onView(r);
									}}
									data-testid="admin-refunds-view"
									title={$_('admin.refunds.view', { default: 'View' })}
									aria-label={$_('admin.refunds.view', { default: 'View' })}
								>
									<Eye class="h-3 w-3" />
								</Button>
								{#if canActOn(r.status)}
									<Button
										variant="outline"
										size="sm"
										class="h-6 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10.5px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
										onclick={(e) => {
											e.stopPropagation();
											onApprove(r);
										}}
										data-testid="admin-refunds-approve"
									>
										<CheckCircle2 class="h-3 w-3" />
										{$_('admin.refunds.approve', { default: 'Approve' })}
									</Button>
									<Button
										variant="outline"
										size="sm"
										class="h-6 border-destructive/40 bg-destructive/10 px-1.5 text-[10.5px] text-destructive hover:bg-destructive/20"
										onclick={(e) => {
											e.stopPropagation();
											onReject(r);
										}}
										data-testid="admin-refunds-reject"
									>
										<XCircle class="h-3 w-3" />
										{$_('admin.refunds.reject', { default: 'Reject' })}
									</Button>
								{/if}
							</div>
						</InteractiveRow>
					{/each}
				</div>
			</div>
		{/if}
	</Card>

	{#if totalPages > 1}
		<div
			class="flex items-center justify-center gap-2 pt-1"
			data-testid="admin-refunds-pagination"
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
		data-testid="admin-refunds-empty"
	>
		<Inbox class="h-10 w-10 opacity-40" />
		<p class="m-0 text-[13px]">
			{$_('admin.refunds.emptyText', {
				default: 'No refund requests match the current filters.'
			})}
		</p>
	</div>
{/if}
