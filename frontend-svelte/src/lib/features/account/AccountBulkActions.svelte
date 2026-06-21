<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { RotateCw, ShieldCheck, Download, Trash2, Pencil } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		batchClearAccountErrors, batchDeleteAccounts, batchRefreshAccounts,
		clearTempUnschedulable, exportAccountData, getTempUnschedulable,
		listAccounts, type Account, type AccountFilters
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		selectedIds: Set<number>;
		total: number;
		hasActiveFilters: boolean;
		filters: () => AccountFilters;
		onRefresh: () => void;
		onOpenData: (json?: string) => void;
		onOpenAdvanced: () => void;
		onOpenBulkEdit: (mode: 'selected' | 'filtered', ids: number[]) => void;
	};
	let { selectedIds, total, hasActiveFilters, filters, onRefresh, onOpenData, onOpenAdvanced, onOpenBulkEdit }: Props = $props();

	const activeFilterCount = $derived.by(() => {
		const f = filters();
		return [f.platform, f.type, f.status, f.group, f.privacy_mode, f.schedulable, f.has_proxy, f.search].filter(v => v !== undefined).length;
	});
	let busy = $state(false);

	// Delete confirm dialog
	let deleteOpen = $state(false);
	// Temp unschedulable dialog
	let tempOpen = $state(false);
	let tempAccount = $state<Account | null>(null);
	let tempLoading = $state(false);
	let tempStatus = $state<Record<string, unknown> | null>(null);
	// Filtered bulk dialog
	let filteredBulkOpen = $state(false);
	let filteredBulkAction = $state<'refresh' | 'delete'>('refresh');
	let filteredBulkCount = $state(0);

	function selArr(): number[] { return [...selectedIds]; }

	async function act(label: string, fn: () => Promise<unknown>) {
		busy = true;
		try { await fn(); showSuccess(label); onRefresh(); }
		catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	async function confirmDelete() {
		const ids = selArr();
		if (!ids.length) return;
		busy = true;
		try {
			await batchDeleteAccounts(ids);
			deleteOpen = false;
			showSuccess($_('admin.accounts.deleted', { default: 'Deleted' }));
			onRefresh();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	export function openTempHold(a: Account) {
		tempAccount = a; tempStatus = null; tempOpen = true; tempLoading = true;
		getTempUnschedulable(a.id)
			.then(s => { tempStatus = s; })
			.catch(err => showError(err instanceof Error ? err.message : String(err)))
			.finally(() => { tempLoading = false; });
	}

	async function clearTemp() {
		if (!tempAccount) return;
		busy = true;
		try {
			await clearTempUnschedulable(tempAccount.id);
			tempOpen = false;
			showSuccess($_('admin.accounts.holdCleared', { default: 'Hold cleared' }));
			onRefresh();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	async function openFilteredBulk(action: 'refresh' | 'delete') {
		filteredBulkAction = action;
		busy = true;
		try { const r = await listAccounts(1, 1, filters()); filteredBulkCount = r.total; }
		catch { filteredBulkCount = 0; }
		busy = false;
		filteredBulkOpen = true;
	}

	async function confirmFilteredBulk() {
		busy = true;
		try {
			const all = await listAccounts(1, 500, filters());
			const ids = all.items.map(r => r.id);
			if (filteredBulkAction === 'refresh') await batchRefreshAccounts(ids);
			else await batchDeleteAccounts(ids);
			showSuccess(`${filteredBulkAction === 'refresh' ? $_('admin.accounts.refreshed', { default: 'Refreshed' }) : $_('admin.accounts.deleted', { default: 'Deleted' })} ${ids.length} ${$_('admin.accounts.accounts', { default: 'accounts' })}`);
			filteredBulkOpen = false;
			onRefresh();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	async function exportSelected() {
		busy = true;
		try {
			const payload = await exportAccountData({ ids: selArr(), includeProxies: true });
			onOpenData(JSON.stringify(payload, null, 2));
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	async function openBulkEditFiltered() {
		busy = true;
		try {
			const probe = await listAccounts(1, 1, filters());
			if (probe.total === 0) { busy = false; return; }
			const all = await listAccounts(1, probe.total, filters());
			onOpenBulkEdit('filtered', all.items.map(r => r.id));
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if hasActiveFilters}
		<span class="text-xs text-muted-foreground">{activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}</span>
	{/if}
	<Button variant="outline" onclick={() => onOpenData()}>
		{$_('admin.accounts.dataTools', { default: 'Data tools' })}
	</Button>
	<Button variant="outline" onclick={onOpenAdvanced}>
		{$_('admin.accounts.advancedTools', { default: 'Advanced tools' })}
	</Button>
	<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={exportSelected}>
		<Download size={14} class="mr-1" />{$_('admin.accounts.exportSelected', { default: 'Export selected' })}
	</Button>
	<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={() => act($_('admin.accounts.refreshed', { default: 'Refreshed' }), () => batchRefreshAccounts(selArr()))}>
		<RotateCw size={14} class="mr-1" />{$_('admin.accounts.refreshSelected', { default: 'Refresh selected' })}
	</Button>
	<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={() => act($_('admin.accounts.errorsCleared', { default: 'Errors cleared' }), () => batchClearAccountErrors(selArr()))}>
		<ShieldCheck size={14} class="mr-1" />{$_('admin.accounts.clearErrors', { default: 'Clear errors' })}
	</Button>
	<Button variant="outline" disabled={selectedIds.size === 0} onclick={() => onOpenBulkEdit('selected', selArr())}>
		<Pencil size={14} class="mr-1" />{$_('admin.accounts.editSelected', { default: 'Edit selected' })}
	</Button>
	<Button variant="outline" disabled={selectedIds.size === 0} class="border-destructive/30 text-destructive" onclick={() => { deleteOpen = true; }}>
		<Trash2 size={14} class="mr-1" />{$_('admin.accounts.deleteSelected', { default: 'Delete selected' })}
	</Button>
	{#if total > 0 && hasActiveFilters}
		<Button variant="outline" onclick={openBulkEditFiltered}>
			{$_('admin.accounts.editFiltered', { default: 'Edit filtered' })} ({total})
		</Button>
		<Button variant="outline" onclick={() => openFilteredBulk('refresh')}>
			{$_('admin.accounts.refreshFiltered', { default: 'Refresh filtered' })}
		</Button>
	{/if}
</div>

<!-- Delete confirmation -->
<StandardDialog bind:open={deleteOpen} title={$_('admin.accounts.deleteTitle', { default: 'Delete selected accounts' })} width="sm" data-testid="accounts-delete-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{$_('admin.accounts.deleteConfirm', { default: 'Delete {count} accounts? This cannot be undone.', values: { count: selectedIds.size } })}
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (deleteOpen = false)}>{$_('common.cancel', { default: 'Cancel' })}</Button>
			<Button variant="outline" class="border-destructive/30 text-destructive" disabled={busy} onclick={confirmDelete} data-testid="accounts-delete-confirm">
				{busy ? $_('common.deleting', { default: 'Deleting...' }) : $_('common.delete', { default: 'Delete' })}
			</Button>
		</div>
	</div>
</StandardDialog>

<!-- Temp unschedulable -->
<StandardDialog bind:open={tempOpen} title={$_('admin.accounts.tempUnschedulable', { default: 'Temporary unschedulable' })} width="md" data-testid="account-temp-unsched-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">{tempAccount?.name ?? tempAccount?.email ?? 'Account'}</p>
		{#if tempLoading}
			<p class="text-sm text-muted-foreground">{$_('common.loading', { default: 'Loading...' })}</p>
		{:else if tempStatus}
			<pre class="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs" data-testid="account-temp-unsched-json">{JSON.stringify(tempStatus, null, 2)}</pre>
		{:else}
			<p class="text-sm text-muted-foreground">{$_('admin.accounts.noStatusReturned', { default: 'No status returned.' })}</p>
		{/if}
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (tempOpen = false)}>{$_('common.close', { default: 'Close' })}</Button>
			<Button variant="outline" disabled={busy || !tempAccount} onclick={clearTemp} data-testid="account-temp-unsched-clear">
				{$_('admin.accounts.clearHold', { default: 'Clear hold' })}
			</Button>
		</div>
	</div>
</StandardDialog>

<!-- Filtered bulk confirm -->
<StandardDialog bind:open={filteredBulkOpen} title="{filteredBulkAction === 'refresh' ? $_('admin.accounts.refreshFiltered', { default: 'Refresh' }) : $_('admin.accounts.deleteFiltered', { default: 'Delete' })} {$_('admin.accounts.filteredAccounts', { default: 'filtered accounts' })}" width="sm" data-testid="accounts-filtered-bulk-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
			{filteredBulkCount} {$_('admin.accounts.willBe', { default: 'accounts will be' })} {filteredBulkAction === 'refresh' ? $_('admin.accounts.refreshedVerb', { default: 'refreshed' }) : $_('admin.accounts.deletedVerb', { default: 'deleted' })}.
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (filteredBulkOpen = false)}>{$_('common.cancel', { default: 'Cancel' })}</Button>
			<Button disabled={busy} onclick={confirmFilteredBulk} data-testid="accounts-filtered-confirm">
				{busy ? $_('common.processing', { default: 'Processing...' }) : $_('common.confirm', { default: 'Confirm' })}
			</Button>
		</div>
	</div>
</StandardDialog>
