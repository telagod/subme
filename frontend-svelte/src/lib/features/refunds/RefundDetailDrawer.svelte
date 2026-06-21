<script lang="ts">
	/**
	 * RefundDetailDrawer — side drawer showing full details of a single
	 * refund request row. Read-only; actions (approve/reject) are handled
	 * elsewhere.
	 */
	import { _ } from 'svelte-i18n';
	import Badge from '$lib/ui/Badge.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import type { AdminRefundRequest } from '$lib/api/admin/refunds';

	interface Props {
		open: boolean;
		row: AdminRefundRequest | null;
	}

	let { open = $bindable(), row }: Props = $props();

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
</script>

<StandardDrawer
	bind:open
	width="sm"
	title={$_('admin.refunds.detailTitle', { default: 'Refund request detail' })}
	data-testid="admin-refunds-detail-drawer"
>
	{#if row}
		<div class="mt-4 grid grid-cols-[120px,1fr] gap-y-2 text-xs">
			<div class="text-muted-foreground">
				{$_('admin.refunds.colOrderNo', { default: 'Order #' })}
			</div>
			<div class="font-mono text-foreground">
				{row.out_trade_no ?? row.order_id}
			</div>
			<div class="text-muted-foreground">
				{$_('admin.refunds.colUser', { default: 'User' })}
			</div>
			<div class="font-mono text-foreground">
				{row.user_email ?? '—'} <span class="text-muted-foreground">#{row.user_id}</span>
			</div>
			<div class="text-muted-foreground">
				{$_('admin.refunds.colAmount', { default: 'Amount' })}
			</div>
			<div class="font-mono tabular-nums text-foreground">
				{fmtMoney(row.amount, row.currency)}
			</div>
			<div class="text-muted-foreground">
				{$_('admin.refunds.colStatus', { default: 'Status' })}
			</div>
			<div>
				<Badge
					variant="outline"
					class="text-[10px] uppercase tracking-wider {statusClass(row.status)}"
				>
					{$_(`admin.refunds.status.${row.status}`, { default: row.status })}
				</Badge>
			</div>
			<div class="text-muted-foreground">
				{$_('admin.refunds.colReason', { default: 'Reason' })}
			</div>
			<div class="text-foreground">{row.reason ?? '—'}</div>
			<div class="text-muted-foreground">
				{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}
			</div>
			<div class="font-mono tabular-nums text-foreground">
				{fmtDate(row.requested_at)}
			</div>
			{#if row.reviewer}
				<div class="text-muted-foreground">
					{$_('admin.refunds.reviewer', { default: 'Reviewer' })}
				</div>
				<div class="text-foreground">{row.reviewer}</div>
			{/if}
			{#if row.reviewer_note}
				<div class="text-muted-foreground">
					{$_('admin.refunds.reviewerNote', { default: 'Reviewer note' })}
				</div>
				<div class="text-foreground">{row.reviewer_note}</div>
			{/if}
		</div>
	{/if}
</StandardDrawer>
