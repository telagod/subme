<script lang="ts">
	/**
	 * TransactionHistoryTable · Transaction list with filters + pagination
	 *
	 * Includes:
	 *   - Type filter (NativeSelect with '__all__' sentinel)
	 *   - Date range filters (start/end)
	 *   - Loading / error / empty states
	 *   - Transaction table with type/status badges
	 *   - Pagination (prev/next)
	 *
	 * Props-down / callbacks-up:
	 *   - All display data + loading/error state passed from page
	 *   - onTypeChange, onStartDateChange, onEndDateChange, onClearDates,
	 *     onPrevPage, onNextPage, onRetry, onTopUp callbacks bubble to page
	 *
	 * RED LINE (reshadcn-migration):
	 *   - type filter Select uses '__all__' sentinel; no empty value.
	 */
	import { _ } from 'svelte-i18n';
	import {
		Wallet,
		ArrowUpRight,
		ArrowDownLeft,
		Undo2,
		Sparkles
	} from '@lucide/svelte';
	import type { BillingTransaction, BillingTxType, BillingTxStatus } from '$lib/api/user/billing';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	const TYPE_ALL = '__all__' as const;

	type Props = {
		txs: BillingTransaction[];
		loading: boolean;
		error: string | null;
		typeFilter: typeof TYPE_ALL | BillingTxType;
		startDate: string;
		endDate: string;
		page: number;
		totalRows: number;
		totalPages: number;
		pageSize: number;
		onTypeChange: (e: Event) => void;
		onStartDateChange: (e: Event) => void;
		onEndDateChange: (e: Event) => void;
		onClearDates: () => void;
		onPrevPage: () => void;
		onNextPage: () => void;
		onRetry: () => void;
		onTopUp: () => void;
	};

	let {
		txs,
		loading,
		error,
		typeFilter,
		startDate,
		endDate,
		page,
		totalRows,
		totalPages,
		pageSize,
		onTypeChange,
		onStartDateChange,
		onEndDateChange,
		onClearDates,
		onPrevPage,
		onNextPage,
		onRetry,
		onTopUp
	}: Props = $props();

	// ── format helpers ─────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		const abs = Math.abs(v).toFixed(2);
		if (currency === 'USD') return `${sign}$${abs}`;
		if (currency === 'EUR') return `${sign}€${abs}`;
		return `${sign}${abs}`;
	}

	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function typeLabel(t: BillingTxType): string {
		return $_(`user.billing.types.${t}`, { default: t });
	}

	function typeBadgeClass(t: BillingTxType): string {
		switch (t) {
			case 'topup':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'charge':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'refund':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'rebate':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
		}
	}

	function statusLabel(s: BillingTxStatus): string {
		return $_(`user.billing.statuses.${s}`, { default: s });
	}

	function statusBadgeClass(s: BillingTxStatus): string {
		switch (s) {
			case 'completed':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'pending':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'failed':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
			case 'cancelled':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'refunded':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
		}
	}

	function typeIcon(t: BillingTxType) {
		switch (t) {
			case 'topup':
				return ArrowUpRight;
			case 'charge':
				return ArrowDownLeft;
			case 'refund':
				return Undo2;
			case 'rebate':
				return Sparkles;
		}
	}
</script>

<!-- Filters -->
<section
	class="flex flex-wrap items-end gap-3"
	data-testid="billing-filters"
>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="billing-type-filter"
		>
			{$_('user.billing.typeFilter', { default: 'Type' })}
		</label>
		<NativeSelect
			id="billing-type-filter"
			data-testid="billing-type-filter"
			bind:value={typeFilter}
			onchange={onTypeChange}
			class="h-9"
		>
			<option value={TYPE_ALL}
				>{$_('user.billing.allTypes', { default: 'All types' })}</option
			>
			<option value="topup">{typeLabel('topup')}</option>
			<option value="charge">{typeLabel('charge')}</option>
			<option value="refund">{typeLabel('refund')}</option>
			<option value="rebate">{typeLabel('rebate')}</option>
		</NativeSelect>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="billing-start-date"
		>
			{$_('user.billing.startDate', { default: 'From' })}
		</label>
		<Input
			id="billing-start-date"
			data-testid="billing-start-date"
			type="date"
			value={startDate}
			onchange={onStartDateChange}
			class="h-9"
		/>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="billing-end-date"
		>
			{$_('user.billing.endDate', { default: 'To' })}
		</label>
		<Input
			id="billing-end-date"
			data-testid="billing-end-date"
			type="date"
			value={endDate}
			onchange={onEndDateChange}
			class="h-9"
		/>
	</div>
	{#if startDate || endDate}
		<Button
			variant="outline"
			size="sm"
			data-testid="billing-clear-dates"
			onclick={onClearDates}
			class="h-9"
		>
			{$_('user.billing.clearDates', { default: 'Clear dates' })}
		</Button>
	{/if}
</section>

<!-- Transactions -->
{#if loading}
	<div class="space-y-2" data-testid="billing-txs-loading">
		{#each Array.from({ length: 4 }) as _placeholder, i (i)}
			<div class="h-12 w-full animate-pulse rounded bg-muted"></div>
		{/each}
	</div>
{:else if error && txs.length === 0}
	<Alert
		variant="destructive"
		class="p-8 text-center"
		data-testid="billing-txs-error"
	>
		<p class="text-sm font-medium text-destructive">
			{$_('user.billing.failedToLoadTxs', { default: 'Failed to load transactions' })}
		</p>
		<p class="mt-1 text-xs text-muted-foreground">{error}</p>
		<Button
			variant="outline"
			size="sm"
			onclick={onRetry}
			data-testid="billing-txs-retry"
			class="mt-4"
		>
			{$_('user.billing.retry', { default: 'Retry' })}
		</Button>
	</Alert>
{:else if txs.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
		data-testid="billing-txs-empty"
	>
		<div
			class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			<Wallet class="h-6 w-6" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.billing.emptyTitle', { default: 'No transactions yet' })}
			</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				{$_('user.billing.emptyDescription', {
					default: 'Top up your balance to start using paid features.'
				})}
			</p>
		</div>
		<Button
			data-testid="billing-empty-topup-btn"
			onclick={onTopUp}
			class="mt-1 h-9 gap-1.5"
		>
			<ArrowUpRight class="h-4 w-4" />
			{$_('user.billing.topUp', { default: 'Top Up' })}
		</Button>
	</div>
{:else}
	<div
		class="overflow-hidden rounded-lg border border-border bg-card"
		data-testid="billing-txs-table-wrap"
	>
		<table class="w-full text-sm" data-testid="billing-txs-table">
			<thead>
				<tr
					class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
				>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.billing.colTimestamp', { default: 'Timestamp' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.billing.colType', { default: 'Type' })}
					</th>
					<th class="px-4 py-2 text-right font-medium">
						{$_('user.billing.colAmount', { default: 'Amount' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.billing.colCurrency', { default: 'Currency' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.billing.colStatus', { default: 'Status' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.billing.colRef', { default: 'Reference' })}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each txs as row (row.id)}
					{@const Icon = typeIcon(row.type)}
					<tr
						data-testid="billing-tx-row"
						data-tx-id={row.id}
						class="border-b border-border last:border-b-0 hover:bg-accent/40"
					>
						<td class="px-4 py-3 text-muted-foreground">
							{fmtDate(row.timestamp)}
						</td>
						<td class="px-4 py-3">
							<Badge
								class="gap-1 {typeBadgeClass(row.type)}"
							>
								<Icon class="h-3 w-3" />
								{typeLabel(row.type)}
							</Badge>
						</td>
						<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
							{fmtMoney(row.amount, row.currency)}
						</td>
						<td class="px-4 py-3 text-muted-foreground">{row.currency}</td>
						<td class="px-4 py-3">
							<Badge
								class={statusBadgeClass(row.status)}
							>
								{statusLabel(row.status)}
							</Badge>
						</td>
						<td class="px-4 py-3 text-xs text-muted-foreground">
							{#if row.ref}
								<code
									class="block max-w-[180px] truncate rounded bg-muted px-1.5 py-0.5 font-mono"
									title={row.ref}
								>
									{row.ref}
								</code>
							{:else}
								—
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalRows > pageSize || totalPages > 1}
		<div
			class="flex items-center justify-between text-sm text-muted-foreground"
			data-testid="billing-pagination"
		>
			<span>
				{$_('user.billing.pageOf', {
					default: 'Page {page} of {pages}',
					values: { page, pages: Math.max(totalPages, 1) }
				})}
			</span>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					data-testid="billing-page-prev"
					disabled={page <= 1}
					onclick={onPrevPage}
				>
					{$_('user.billing.prevPage', { default: 'Previous' })}
				</Button>
				<Button
					variant="outline"
					size="sm"
					data-testid="billing-page-next"
					disabled={totalPages > 0 && page >= totalPages}
					onclick={onNextPage}
				>
					{$_('user.billing.nextPage', { default: 'Next' })}
				</Button>
			</div>
		</div>
	{/if}
{/if}
