<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import { deleteProxy, batchDeleteProxies, type Proxy } from '$lib/api/admin/proxies';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { batchDeleteCount, batchSkipCount, proxyNoun } from './proxy-helpers';

	interface Props {
		open: boolean;
		mode: 'single' | 'selected';
		target: Proxy | null;
		selectedIds: Set<number>;
		onClose: () => void;
		onDeleted: (message: string) => void;
	}

	let { open = $bindable(), mode, target, selectedIds, onClose, onDeleted }: Props = $props();

	let saving = $state(false);

	async function confirmDelete() {
		saving = true;
		try {
			if (mode === 'single' && target) {
				await deleteProxy(target.id);
				const message = `Deleted proxy "${target.name}"`;
				showSuccess('Proxy deleted');
				open = false;
				onDeleted(message);
			} else {
				const ids = [...selectedIds];
				if (ids.length === 0) return;
				const result = await batchDeleteProxies(ids);
				const deleted = batchDeleteCount(result, ids.length);
				const skipped = batchSkipCount(result);
				const skippedText = skipped > 0 ? ` · skipped ${skipped}` : '';
				const message = `Deleted ${deleted} selected ${proxyNoun(deleted)}${skippedText}`;
				showSuccess(message);
				open = false;
				onDeleted(message);
			}
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}
</script>

<StandardDialog bind:open title={mode === 'single' ? 'Delete proxy' : 'Delete selected proxies'} width="sm" data-testid="proxies-delete-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{#if mode === 'single' && target}
				Delete proxy "{target.name}"? This action cannot be undone.
			{:else}
				Delete {selectedIds.size} selected prox{selectedIds.size === 1 ? 'y' : 'ies'}? This action cannot be undone.
			{/if}
		</p>
		<div class="flex justify-end gap-2 border-t border-border pt-4">
			<Button variant="outline" onclick={() => { open = false; onClose(); }}>{$_('common.cancel', { default: 'Cancel' })}</Button>
			<Button
				variant="outline"
				class="border-destructive/30 text-destructive hover:bg-destructive/10"
				disabled={saving || (mode === 'selected' && selectedIds.size === 0)}
				onclick={confirmDelete}
				data-testid="proxies-delete-confirm"
			>
				{saving ? 'Deleting...' : 'Delete'}
			</Button>
		</div>
	</div>
</StandardDialog>
