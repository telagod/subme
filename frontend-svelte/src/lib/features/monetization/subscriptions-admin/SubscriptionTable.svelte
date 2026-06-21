<script lang="ts">
	/**
	 * SubscriptionTable — data table for admin subscription list.
	 *
	 * Features:
	 *   - Row selection via checkboxes (select-all / individual)
	 *   - Bulk actions bar when selections > 0 (extend / revoke)
	 *   - VirtualTable when count > 50, otherwise plain list
	 *   - Inline pagination + empty/loading states
	 */
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		PackageSearch,
		Calendar,
		Trash2,
		X
	} from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { extendSub, revokeSub, type AdminSubscription } from '$lib/api/admin/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	const VIRTUAL_THRESHOLD = 50;

	type Props = {
		rows: AdminSubscription[];
		loading: boolean;
		page: number;
		totalPages: number;
		onRowClick: (sub: AdminSubscription) => void;
		onPageChange: (newPage: number) => void;
		onBulkChanged?: () => void;
	};

	let { rows, loading, page, totalPages, onRowClick, onPageChange, onBulkChanged }: Props =
		$props();

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);

	// ── Selection state ──────────────────────────────────────────────

	let selectedIds = $state<Set<string | number>>(new Set());

	const selectedCount = $derived(selectedIds.size);
	const allSelected = $derived(rows.length > 0 && rows.every((r) => selectedIds.has(r.id)));

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(rows.map((r) => r.id));
		}
	}

	function toggleRow(id: string | number) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	// Clear selection when rows change (page change / filter)
	$effect(() => {
		void rows;
		selectedIds = new Set();
	});

	// ── Bulk actions state ───────────────────────────────────────────

	let bulkExtendOpen = $state(false);
	let bulkExtendDays = $state('30');
	let bulkExtending = $state(false);

	let bulkRevokeOpen = $state(false);
	let bulkRevoking = $state(false);

	function getSelectedSubs(): AdminSubscription[] {
		return rows.filter((r) => selectedIds.has(r.id));
	}

	async function handleBulkExtend() {
		const days = parseInt(bulkExtendDays.trim(), 10);
		if (!Number.isFinite(days) || days < 1 || days > 36500) {
			showError(
				$_('admin.subscriptions.bulkExtendErrorDays', {
					default: 'Please enter a valid number of days (1-36500)'
				})
			);
			return;
		}
		const selected = getSelectedSubs();
		if (selected.length === 0) return;

		bulkExtending = true;
		let successCount = 0;
		let failCount = 0;

		const results = await Promise.allSettled(
			selected.map((sub) => extendSub(sub.id, days))
		);

		for (const r of results) {
			if (r.status === 'fulfilled') successCount++;
			else failCount++;
		}

		if (successCount > 0) {
			showSuccess(
				$_('admin.subscriptions.bulkExtendSuccess', {
					default: '{count} subscription(s) extended by {days} days',
					values: { count: String(successCount), days: String(days) }
				})
			);
		}
		if (failCount > 0) {
			showError(
				$_('admin.subscriptions.bulkExtendPartialFail', {
					default: '{count} subscription(s) failed to extend',
					values: { count: String(failCount) }
				})
			);
		}

		bulkExtending = false;
		bulkExtendOpen = false;
		bulkExtendDays = '30';
		clearSelection();
		onBulkChanged?.();
	}

	async function handleBulkRevoke() {
		const selected = getSelectedSubs();
		if (selected.length === 0) return;

		bulkRevoking = true;
		let successCount = 0;
		let failCount = 0;

		const results = await Promise.allSettled(
			selected.map((sub) => revokeSub(sub.id))
		);

		for (const r of results) {
			if (r.status === 'fulfilled') successCount++;
			else failCount++;
		}

		if (successCount > 0) {
			showSuccess(
				$_('admin.subscriptions.bulkRevokeSuccess', {
					default: '{count} subscription(s) revoked',
					values: { count: String(successCount) }
				})
			);
		}
		if (failCount > 0) {
			showError(
				$_('admin.subscriptions.bulkRevokePartialFail', {
					default: '{count} subscription(s) failed to revoke',
					values: { count: String(failCount) }
				})
			);
		}

		bulkRevoking = false;
		bulkRevokeOpen = false;
		clearSelection();
		onBulkChanged?.();
	}

	// ── Helpers ──────────────────────────────────────────────────────

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
			case 'active':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'cancelled':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'expired':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'revoked':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function handleRowKey(e: KeyboardEvent, sub: AdminSubscription) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onRowClick(sub);
		}
	}

	function rowKey(r: AdminSubscription): string {
		return String(r.id);
	}

	const GRID_COLS = 'grid-cols-[32px,1.4fr,1fr,80px,90px,110px,80px,80px]';
</script>

<!-- Bulk actions bar -->
{#if selectedCount > 0}
	<Card
		class="flex flex-wrap items-center gap-2 border-primary/30 bg-primary/5 p-2"
		data-testid="admin-subs-bulk-bar"
	>
		<span class="text-xs font-medium text-primary">
			{$_('admin.subscriptions.bulkSelected', {
				default: '{count} selected',
				values: { count: String(selectedCount) }
			})}
		</span>

		<div class="ml-auto flex items-center gap-2">
			{#if bulkExtendOpen}
				<div
					class="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1"
					data-testid="admin-subs-bulk-extend-panel"
				>
					<label for="bulk-extend-days" class="text-xs text-muted-foreground">
						{$_('admin.subscriptions.bulkExtendDaysLabel', { default: 'Days:' })}
					</label>
					<Input
						id="bulk-extend-days"
						type="number"
						inputmode="numeric"
						min="1"
						max="36500"
						step="1"
						class="h-7 w-20 px-2 text-xs"
						bind:value={bulkExtendDays}
						disabled={bulkExtending}
						data-testid="admin-subs-bulk-extend-days"
					/>
					<Button
						size="sm"
						class="h-7 px-2 text-xs"
						onclick={() => void handleBulkExtend()}
						disabled={bulkExtending}
						data-testid="admin-subs-bulk-extend-confirm"
					>
						{bulkExtending
							? $_('common.submitting', { default: 'Submitting...' })
							: $_('admin.subscriptions.bulkExtendConfirm', { default: 'Extend' })}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						onclick={() => (bulkExtendOpen = false)}
						disabled={bulkExtending}
					>
						<X class="h-3 w-3" />
					</Button>
				</div>
			{:else}
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={() => {
						bulkExtendOpen = true;
						bulkRevokeOpen = false;
					}}
					data-testid="admin-subs-bulk-extend-btn"
				>
					<Calendar class="mr-1 h-3 w-3" />
					{$_('admin.subscriptions.bulkExtend', { default: 'Extend' })}
				</Button>
			{/if}

			{#if bulkRevokeOpen}
				<div
					class="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1"
					data-testid="admin-subs-bulk-revoke-panel"
				>
					<span class="text-xs text-destructive">
						{$_('admin.subscriptions.bulkRevokeWarn', {
							default: 'Revoke {count} subscription(s)?',
							values: { count: String(selectedCount) }
						})}
					</span>
					<Button
						variant="destructive"
						size="sm"
						class="h-7 px-2 text-xs"
						onclick={() => void handleBulkRevoke()}
						disabled={bulkRevoking}
						data-testid="admin-subs-bulk-revoke-confirm"
					>
						{bulkRevoking
							? $_('common.submitting', { default: 'Submitting...' })
							: $_('admin.subscriptions.bulkRevokeConfirm', { default: 'Revoke' })}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						onclick={() => (bulkRevokeOpen = false)}
						disabled={bulkRevoking}
					>
						<X class="h-3 w-3" />
					</Button>
				</div>
			{:else}
				<Button
					variant="outline"
					size="sm"
					class="h-7 border-destructive/30 px-2 text-xs text-destructive hover:bg-destructive/10"
					onclick={() => {
						bulkRevokeOpen = true;
						bulkExtendOpen = false;
					}}
					data-testid="admin-subs-bulk-revoke-btn"
				>
					<Trash2 class="mr-1 h-3 w-3" />
					{$_('admin.subscriptions.bulkRevoke', { default: 'Revoke' })}
				</Button>
			{/if}

			<Button
				variant="ghost"
				size="sm"
				class="h-7 px-2 text-xs text-muted-foreground"
				onclick={clearSelection}
				data-testid="admin-subs-bulk-clear"
			>
				{$_('admin.subscriptions.bulkClear', { default: 'Clear' })}
			</Button>
		</div>
	</Card>
{/if}

{#if loading && rows.length === 0}
	<div class="flex flex-col gap-2" data-testid="admin-subs-loading">
		{#each Array(5) as _, i (i)}
			<div class="h-12 animate-pulse rounded-md border border-border bg-muted"></div>
		{/each}
	</div>
{:else if rows.length > 0}
	<Card
		padded={false}
		class="overflow-hidden"
		data-testid="admin-subs-table-wrapper"
		style="height: 560px;"
	>
		{#if useVirtual}
			<VirtualTable {rows} rowHeight={56} getRowKey={(r) => rowKey(r)}>
				{#snippet header()}
					<div
						class="grid {GRID_COLS} gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div class="flex items-center justify-center">
							<Checkbox
								checked={allSelected}
								onchange={toggleSelectAll}
								data-testid="admin-subs-select-all"
								aria-label={$_('admin.subscriptions.selectAll', {
									default: 'Select all'
								})}
							/>
						</div>
						<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
						<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
						<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
						<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
						<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
						<div class="text-right">
							{$_('admin.subscriptions.colMtd', { default: 'MTD' })}
						</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
				{/snippet}
				{#snippet row({ row: sub })}
					<InteractiveRow
						class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted {selectedIds.has(sub.id) ? 'bg-primary/5' : ''}"
						onclick={() => onRowClick(sub)}
						onkeydown={(e) => handleRowKey(e, sub)}
						data-testid="admin-subs-row"
						data-sub-id={sub.id}
					>
						<div
							class="flex items-center justify-center"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.stopPropagation()}
							role="presentation"
						>
							<Checkbox
								checked={selectedIds.has(sub.id)}
								onchange={() => toggleRow(sub.id)}
								data-testid="admin-subs-row-checkbox"
								aria-label={$_('admin.subscriptions.selectRow', {
									default: 'Select row'
								})}
							/>
						</div>
						<div class="truncate">
							<div class="truncate font-mono text-foreground">
								{maskEmail(sub.user_email)}
							</div>
							<div class="truncate font-mono text-[10.5px] text-muted-foreground">
								#{sub.user_id}
							</div>
						</div>
						<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
						<div>
							<Badge
								variant="outline"
								class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}"
								>{sub.status}</Badge
							>
						</div>
						<div class="font-mono tabular-nums text-muted-foreground">
							{fmtDate(sub.started_at)}
						</div>
						<div class="font-mono tabular-nums text-muted-foreground">
							{fmtDate(sub.expires_at)}
						</div>
						<div class="text-right font-mono tabular-nums text-foreground">
							{fmtMoney(sub.mtd_cost, sub.currency)}
						</div>
						<div class="flex justify-end gap-1 text-[10.5px] text-muted-foreground">
							{$_('common.view', { default: 'View' })}
						</div>
					</InteractiveRow>
				{/snippet}
			</VirtualTable>
		{:else}
			<!-- Plain table -->
			<div class="flex h-full flex-col" data-testid="admin-subs-table-flat">
				<div
					class="grid {GRID_COLS} gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					<div class="flex items-center justify-center">
						<Checkbox
							checked={allSelected}
							onchange={toggleSelectAll}
							data-testid="admin-subs-select-all"
							aria-label={$_('admin.subscriptions.selectAll', { default: 'Select all' })}
						/>
					</div>
					<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
					<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
					<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
					<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
					<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
					<div class="text-right">
						{$_('admin.subscriptions.colMtd', { default: 'MTD' })}
					</div>
					<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
				</div>
				<div class="flex-1 overflow-y-auto">
					{#each rows as sub (rowKey(sub))}
						<InteractiveRow
							class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted {selectedIds.has(sub.id) ? 'bg-primary/5' : ''}"
							onclick={() => onRowClick(sub)}
							onkeydown={(e) => handleRowKey(e, sub)}
							data-testid="admin-subs-row"
							data-sub-id={sub.id}
						>
							<div
								class="flex items-center justify-center"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								role="presentation"
							>
								<Checkbox
									checked={selectedIds.has(sub.id)}
									onchange={() => toggleRow(sub.id)}
									data-testid="admin-subs-row-checkbox"
									aria-label={$_('admin.subscriptions.selectRow', {
										default: 'Select row'
									})}
								/>
							</div>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">
									{maskEmail(sub.user_email)}
								</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{sub.user_id}
								</div>
							</div>
							<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
							<div>
								<Badge
									variant="outline"
									class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}"
									>{sub.status}</Badge
								>
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(sub.started_at)}
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(sub.expires_at)}
							</div>
							<div class="text-right font-mono tabular-nums text-foreground">
								{fmtMoney(sub.mtd_cost, sub.currency)}
							</div>
							<div class="flex justify-end gap-1 text-[10.5px] text-muted-foreground">
								{$_('common.view', { default: 'View' })}
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
			data-testid="admin-subs-pagination"
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
			<span class="text-xs tabular-nums text-muted-foreground"> {page} / {totalPages} </span>
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
		data-testid="admin-subs-empty"
	>
		<PackageSearch class="h-10 w-10 opacity-40" />
		<p class="m-0 text-[13px]">
			{$_('admin.subscriptions.emptyText', {
				default: 'No subscriptions match the current filters.'
			})}
		</p>
	</div>
{/if}
