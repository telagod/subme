<script lang="ts">
	/**
	 * SubscriptionTable — data table for admin subscription list.
	 *
	 * Renders rows in a VirtualTable when count > 50, otherwise plain list.
	 * Includes inline pagination controls and empty/loading states.
	 */
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, PackageSearch } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import type { AdminSubscription } from '$lib/api/admin/subscriptions';

	const VIRTUAL_THRESHOLD = 50;

	type Props = {
		rows: AdminSubscription[];
		loading: boolean;
		page: number;
		totalPages: number;
		onRowClick: (sub: AdminSubscription) => void;
		onPageChange: (newPage: number) => void;
	};

	let { rows, loading, page, totalPages, onRowClick, onPageChange }: Props = $props();

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

	const GRID_COLS = 'grid-cols-[1.4fr,1fr,80px,90px,110px,80px,80px]';
</script>

{#if loading && rows.length === 0}
	<div class="flex flex-col gap-2" data-testid="admin-subs-loading">
		{#each Array(5) as _, i (i)}
			<div
				class="h-12 animate-pulse rounded-md border border-border bg-muted"
			></div>
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
			<VirtualTable
				rows={rows}
				rowHeight={56}
				getRowKey={(r) => rowKey(r)}
			>
				{#snippet header()}
					<div
						class="grid {GRID_COLS} gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
						<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
						<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
						<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
						<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
						<div class="text-right">{$_('admin.subscriptions.colMtd', { default: 'MTD' })}</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
				{/snippet}
				{#snippet row({ row: sub })}
					<InteractiveRow
						class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
						onclick={() => onRowClick(sub)}
						onkeydown={(e) => handleRowKey(e, sub)}
						data-testid="admin-subs-row"
						data-sub-id={sub.id}
					>
						<div class="truncate">
							<div class="truncate font-mono text-foreground">{maskEmail(sub.user_email)}</div>
							<div class="truncate font-mono text-[10.5px] text-muted-foreground">
								#{sub.user_id}
							</div>
						</div>
						<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
						<div>
							<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}">{sub.status}</Badge>
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
					<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
					<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
					<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
					<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
					<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
					<div class="text-right">{$_('admin.subscriptions.colMtd', { default: 'MTD' })}</div>
					<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
				</div>
				<div class="flex-1 overflow-y-auto">
					{#each rows as sub (rowKey(sub))}
						<InteractiveRow
							class="grid w-full cursor-pointer {GRID_COLS} gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => onRowClick(sub)}
							onkeydown={(e) => handleRowKey(e, sub)}
							data-testid="admin-subs-row"
							data-sub-id={sub.id}
						>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">{maskEmail(sub.user_email)}</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{sub.user_id}
								</div>
							</div>
							<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
							<div>
								<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}">{sub.status}</Badge>
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
