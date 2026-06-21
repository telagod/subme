<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import type { BackupRecord } from '$lib/api/admin/backup';

	type Props = {
		open: boolean;
		target: BackupRecord | null;
		restoringId: string;
		onConfirm: (id: string, password: string) => void;
		onClose: () => void;
	};

	let { open = $bindable(), target, restoringId, onConfirm, onClose }: Props = $props();

	let restorePassword = $state('');

	$effect(() => {
		if (open) restorePassword = '';
	});

	function handleConfirm() {
		if (!target || !restorePassword.trim()) return;
		onConfirm(target.id, restorePassword);
	}
</script>

<StandardDialog bind:open title={$_('admin.backup.actions.restore')} description={$_('admin.backup.actions.restoreConfirm')} width="sm" data-testid="backup-restore-dialog">
	<div class="mt-4 space-y-4">
		<label class="space-y-1 text-sm font-medium">
			<span>{$_('admin.backup.actions.restorePasswordPrompt')}</span>
			<Input bind:value={restorePassword} type="password" data-testid="backup-restore-password" />
		</label>
		<div class="flex justify-end gap-2 border-t pt-4">
			<Button variant="outline" onclick={onClose}>{$_('common.cancel', { default: 'Cancel' })}</Button>
			<Button onclick={handleConfirm} disabled={!restorePassword.trim() || !target || restoringId === target.id} data-testid="backup-restore-confirm">
				{$_('admin.backup.actions.restore')}
			</Button>
		</div>
	</div>
</StandardDialog>
