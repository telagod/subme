<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import type { BackupRecord } from '$lib/api/admin/backup';

	type Props = {
		open: boolean;
		target: BackupRecord | null;
		onConfirm: () => void;
		onClose: () => void;
	};

	let { open = $bindable(), target, onConfirm, onClose }: Props = $props();
</script>

<ConfirmDialog
	bind:open
	title={$_('common.delete', { default: 'Delete' })}
	description={$_('admin.backup.actions.deleteConfirm')}
	loading={!target}
	onConfirm={onConfirm}
	onCancel={onClose}
	data-testid="backup-delete-dialog"
	confirmTestId="backup-delete-confirm"
/>
