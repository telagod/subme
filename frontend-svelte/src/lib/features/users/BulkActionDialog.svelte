<script lang="ts">
	/**
	 * BulkActionDialog -- confirmation dialog for bulk user operations.
	 *
	 * Supports enable, disable, and delete with a count-based confirmation message.
	 * Delete requires typing the count for extra safety.
	 */
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type BulkAction = 'enable' | 'disable' | 'delete';

	type Props = {
		open: boolean;
		action: BulkAction;
		count: number;
		onClose: () => void;
		onConfirm: () => void;
	};

	let { open = $bindable(false), action, count, onClose, onConfirm }: Props = $props();

	let deleteConfirmInput = $state('');
	let processing = $state(false);

	const isDelete = $derived(action === 'delete');
	const canConfirm = $derived(
		isDelete ? deleteConfirmInput.trim() === String(count) : true
	);

	const title = $derived(
		action === 'enable' ? $_('admin.users.bulkEnableTitle', { default: 'Enable Users' }) :
		action === 'disable' ? $_('admin.users.bulkDisableTitle', { default: 'Disable Users' }) :
		$_('admin.users.bulkDeleteTitle', { default: 'Delete Users' })
	);

	const message = $derived(
		action === 'enable'
			? $_('admin.users.bulkEnableMsg', { default: 'Enable {count} selected users? They will regain access to the platform.', values: { count } })
			: action === 'disable'
				? $_('admin.users.bulkDisableMsg', { default: 'Disable {count} selected users? They will lose access until re-enabled.', values: { count } })
				: $_('admin.users.bulkDeleteMsg', { default: 'Permanently delete {count} selected users? This action cannot be undone.', values: { count } })
	);

	$effect(() => {
		if (open) { deleteConfirmInput = ''; processing = false; }
	});

	async function handleConfirm() {
		if (!canConfirm || processing) return;
		processing = true;
		try {
			onConfirm();
		} finally {
			processing = false;
		}
	}
</script>

<StandardDialog bind:open onOpenChange={(v) => { if (!v) onClose(); }}
	title={title} data-testid="bulk-action-dialog">
	<div class="flex flex-col gap-4">
		<p class="text-sm text-muted-foreground">{message}</p>

		{#if isDelete}
			<div class="flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
				<span class="text-xs font-medium text-destructive">
					{$_('admin.users.bulkDeleteConfirmLabel', {
						default: 'Type "{count}" to confirm deletion',
						values: { count }
					})}
				</span>
				<Input type="text" autocomplete="off" class="text-sm"
					placeholder={String(count)}
					bind:value={deleteConfirmInput}
					data-testid="bulk-delete-confirm-input" />
			</div>
		{/if}
	</div>

	<div class="flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" size="sm" onclick={onClose}>
			{$_('common.cancel', { default: 'Cancel' })}
		</Button>
		<Button size="sm"
			variant={isDelete ? 'destructive' : 'default'}
			disabled={!canConfirm || processing}
			onclick={handleConfirm}
			data-testid="bulk-action-confirm">
			{processing
				? $_('common.processing', { default: 'Processing...' })
				: isDelete
					? $_('admin.users.bulkDeleteConfirm', { default: 'Delete {count} users', values: { count } })
					: action === 'enable'
						? $_('admin.users.bulkEnableConfirm', { default: 'Enable {count} users', values: { count } })
						: $_('admin.users.bulkDisableConfirm', { default: 'Disable {count} users', values: { count } })
			}
		</Button>
	</div>
</StandardDialog>
