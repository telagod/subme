<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { replaceGroup } from '$lib/api/admin/users';
	import { listGroups } from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		userId: number;
		currentGroups: Array<{ id: number; name: string }>;
		onClose: () => void;
		onUpdated: () => void;
	};

	let { open = $bindable(false), userId, currentGroups, onClose, onUpdated }: Props = $props();

	let oldGroupId = $state('__none__');
	let newGroupId = $state('__none__');
	let submitting = $state(false);
	let allGroups = $state<Array<{ id: number; name: string }>>([]);

	async function loadGroups() {
		try {
			const res = await listGroups();
			allGroups = res?.items ?? [];
		} catch { /* ok */ }
	}

	$effect(() => {
		if (open) {
			oldGroupId = '__none__';
			newGroupId = '__none__';
			loadGroups();
		}
	});

	async function submit() {
		if (oldGroupId === '__none__' || newGroupId === '__none__') {
			showError($_('admin.users.groupSelectBoth', { default: 'Select both old and new groups' }));
			return;
		}
		submitting = true;
		try {
			const result = await replaceGroup(userId, Number(oldGroupId), Number(newGroupId));
			showSuccess($_('admin.users.groupReplaced', {
				default: 'Group replaced, {count} keys migrated',
				values: { count: result.migrated_keys }
			}));
			onUpdated();
			onClose();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.groupReplaceFailed', { default: 'Failed to replace group' }));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog {open} onOpenChange={(v) => { if (!v) onClose(); }}
	title={$_('admin.users.replaceGroup', { default: 'Replace Group' })}
	data-testid="group-replace-dialog">
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.oldGroup', { default: 'Current Group' })}
			</span>
			<NativeSelect bind:value={oldGroupId} data-testid="group-old">
				<option value="__none__">{$_('admin.users.selectGroup', { default: '— Select —' })}</option>
				{#each currentGroups as g}
					<option value={String(g.id)}>{g.name}</option>
				{/each}
			</NativeSelect>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.newGroup', { default: 'New Group' })}
			</span>
			<NativeSelect bind:value={newGroupId} data-testid="group-new">
				<option value="__none__">{$_('admin.users.selectGroup', { default: '— Select —' })}</option>
				{#each allGroups.filter(g => String(g.id) !== oldGroupId) as g}
					<option value={String(g.id)}>{g.name}</option>
				{/each}
			</NativeSelect>
		</div>
	</div>

	<div class="flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" size="sm" onclick={onClose}>
			{$_('common.cancel', { default: 'Cancel' })}
		</Button>
		<Button size="sm" disabled={submitting || oldGroupId === '__none__' || newGroupId === '__none__'} onclick={submit}
			data-testid="group-replace-confirm">
			{submitting ? $_('common.submitting', { default: 'Submitting...' }) : $_('common.confirm', { default: 'Confirm' })}
		</Button>
	</div>
</StandardDialog>
