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
			showError($_('admin.users.groupSelectBoth', { default: '请选择旧分组和新分组' }));
			return;
		}
		submitting = true;
		try {
			const result = await replaceGroup(userId, Number(oldGroupId), Number(newGroupId));
			showSuccess($_('admin.users.groupReplaced', {
				default: '分组已替换，{count} 个密钥已迁移',
				values: { count: result.migrated_keys }
			}));
			onUpdated();
			onClose();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.groupReplaceFailed', { default: '替换分组失败' }));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog {open} onOpenChange={(v) => { if (!v) onClose(); }}
	title={$_('admin.users.replaceGroup', { default: '替换分组' })}
	data-testid="group-replace-dialog">
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.oldGroup', { default: '当前分组' })}
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
				{$_('admin.users.newGroup', { default: '新分组' })}
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
			{$_('common.cancel', { default: '取消' })}
		</Button>
		<Button size="sm" disabled={submitting || oldGroupId === '__none__' || newGroupId === '__none__'} onclick={submit}
			data-testid="group-replace-confirm">
			{submitting ? $_('common.submitting', { default: '提交中...' }) : $_('common.confirm', { default: '确认' })}
		</Button>
	</div>
</StandardDialog>
