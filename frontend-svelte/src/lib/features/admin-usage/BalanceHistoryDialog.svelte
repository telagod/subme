<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		getBalanceHistory,
		type BalanceHistoryRecord,
	} from '$lib/api/admin/users';
	import { showError } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		userId: number | null;
		userLabel: string;
	};

	let { open = $bindable(false), userId, userLabel }: Props = $props();

	let items = $state<BalanceHistoryRecord[]>([]);
	let total = $state(0);
	let page = $state(1);
	let pageSize = $state(20);
	let totalRecharged = $state(0);
	let loading = $state(false);
	let typeFilter = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	const typeOptions = [
		{ value: '', label: 'All types' },
		{ value: 'topup', label: 'Top-up' },
		{ value: 'usage', label: 'Usage' },
		{ value: 'refund', label: 'Refund' },
		{ value: 'admin', label: 'Admin adjust' },
		{ value: 'subscription', label: 'Subscription' }
	];

	function typeTone(type: string): string {
		if (type === 'topup' || type === 'refund') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		if (type === 'usage') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		if (type === 'admin') return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
		return 'border-border bg-background text-muted-foreground';
	}

	function formatTime(value?: string | null): string {
		if (!value) return '--';
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
	}

	function formatAmount(amount: number): string {
		const sign = amount >= 0 ? '+' : '';
		return `${sign}$${amount.toFixed(6)}`;
	}

	async function load() {
		if (userId == null) return;
		loading = true;
		try {
			const resp = await getBalanceHistory(userId, page, pageSize, typeFilter || undefined);
			items = resp.items ?? [];
			total = resp.total ?? 0;
			totalRecharged = resp.total_recharged ?? 0;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
			items = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function onTypeChange() {
		page = 1;
		void load();
	}

	function prevPage() { if (page > 1) { page -= 1; void load(); } }
	function nextPage() { if (page < totalPages) { page += 1; void load(); } }

	$effect(() => {
		if (open && userId != null) {
			page = 1;
			void load();
		}
	});
</script>

<StandardDialog bind:open title={$_('admin.usage.balanceHistory', { default: 'Balance History' })} width="lg">
	<div class="mt-3 space-y-3">
		<!-- Header with user label and filter -->
		<div class="flex items-center justify-between gap-3">
			<div class="text-sm">
				<span class="text-muted-foreground">{$_('admin.usage.userLabel', { default: 'User' })}:</span>
				<span class="ml-1 font-medium">{userLabel}</span>
				{#if totalRecharged > 0}
					<span class="ml-2 text-xs text-muted-foreground">
						({$_('admin.usage.totalRecharged', { default: 'Total recharged' })}: ${totalRecharged.toFixed(2)})
					</span>
				{/if}
			</div>
			<NativeSelect bind:value={typeFilter} options={typeOptions} onchange={onTypeChange} class="w-36" />
		</div>

		<!-- Table -->
		{#if loading}
			<div class="space-y-2">
				{#each Array(5) as _}
					<div class="h-10 animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{:else if items.length === 0}
			<div class="py-8 text-center text-sm text-muted-foreground">
				{$_('admin.users.noBalanceHistory', { default: 'No records found for this user' })}
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-border text-xs text-muted-foreground">
							<th class="whitespace-nowrap px-2 py-2">{$_('admin.usage.balanceTime', { default: 'Time' })}</th>
							<th class="whitespace-nowrap px-2 py-2">{$_('admin.usage.balanceType', { default: 'Type' })}</th>
							<th class="whitespace-nowrap px-2 py-2 text-right">{$_('admin.usage.balanceAmount', { default: 'Amount' })}</th>
							<th class="whitespace-nowrap px-2 py-2 text-right">{$_('admin.usage.balanceAfter', { default: 'After' })}</th>
							<th class="whitespace-nowrap px-2 py-2">{$_('admin.usage.balanceNotes', { default: 'Notes' })}</th>
						</tr>
					</thead>
					<tbody>
						{#each items as rec (rec.id)}
							<tr class="border-b border-border">
								<td class="px-2 py-2 text-xs text-muted-foreground">{formatTime(rec.created_at)}</td>
								<td class="px-2 py-2">
									<Badge variant="outline" class={typeTone(rec.type)}>{rec.type}</Badge>
								</td>
								<td class="px-2 py-2 text-right font-mono text-xs {rec.amount >= 0 ? 'text-emerald-600' : 'text-destructive'}">
									{formatAmount(rec.amount)}
								</td>
								<td class="px-2 py-2 text-right font-mono text-xs text-muted-foreground">
									{rec.balance_after != null ? `$${rec.balance_after.toFixed(4)}` : '--'}
								</td>
								<td class="max-w-[200px] truncate px-2 py-2 text-xs text-muted-foreground" title={rec.notes ?? ''}>
									{rec.notes ?? '--'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			<div class="flex items-center justify-between text-sm text-muted-foreground">
				<span>{total} records &middot; page {page} / {totalPages}</span>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={prevPage} aria-label="Previous page">
						<ChevronLeft size={16} />
					</Button>
					<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={nextPage} aria-label="Next page">
						<ChevronRight size={16} />
					</Button>
				</div>
			</div>
		{/if}
	</div>
</StandardDialog>
