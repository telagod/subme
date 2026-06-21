<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import type { BackupRecord } from '$lib/api/admin/backup';

	type Props = {
		open: boolean;
		target: BackupRecord | null;
		onConfirm: () => void;
		onClose: () => void;
	};

	let { open = $bindable(), target, onConfirm, onClose }: Props = $props();
</script>

<StandardDialog bind:open title={$_('common.delete', { default: 'Delete' })} description={$_('admin.backup.actions.deleteConfirm')} width="sm" data-testid="backup-delete-dialog">
	<div class="mt-4 flex justify-end gap-2 border-t pt-4">
		<Button variant="outline" onclick={onClose}>{$_('common.cancel', { default: 'Cancel' })}</Button>
		<Button variant="outline" class="text-destructive" onclick={onConfirm} disabled={!target} data-testid="backup-delete-confirm">
			{$_('common.delete', { default: 'Delete' })}
		</Button>
	</div>
</StandardDialog>
