<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Pencil } from '@lucide/svelte';
	import { updateKey, getAvailableGroups, type ApiKey, type AvailableGroup } from '$lib/api/user/apiKeys';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		apiKey: ApiKey | null;
		onUpdated?: (key: ApiKey) => void;
	};

	let { open = $bindable(false), apiKey, onUpdated }: Props = $props();

	let name = $state('');
	let groupId = $state('__none__');
	let quota = $state('');
	let expiresAt = $state('');
	let submitting = $state(false);
	let groups = $state<AvailableGroup[]>([]);

	$effect(() => {
		if (open && apiKey) {
			name = apiKey.name;
			// Pre-select current group from key data
			groupId = apiKey.groupId ? String(apiKey.groupId) : '__none__';
			quota = apiKey.quotaTotal > 0 ? String(apiKey.quotaTotal) : '';
			// Pre-fill expiry as local datetime string for input[type=datetime-local]
			if (apiKey.expiresAt) {
				try {
					const d = new Date(apiKey.expiresAt);
					expiresAt = d.toISOString().slice(0, 16);
				} catch {
					expiresAt = '';
				}
			} else {
				expiresAt = '';
			}
		}
	});

	$effect(() => {
		if (open && groups.length === 0) {
			getAvailableGroups().then(g => (groups = g)).catch(() => {});
		}
	});

	async function handleSubmit() {
		if (submitting || !apiKey) return;
		if (!name.trim()) {
			showError($_('user.keys.errors.NAME_REQUIRED', { default: 'Name is required' }));
			return;
		}
		submitting = true;
		try {
			const payload: Record<string, unknown> = { name: name.trim() };
			if (groupId && groupId !== '__none__') {
				payload.group_id = Number(groupId);
			} else if (groupId === '__none__' && apiKey.groupId) {
				// Clearing group assignment
				payload.group_id = null;
			}
			if (quota !== '' && Number(quota) >= 0) payload.quota = Number(quota);
			// Expiry: send null to clear, ISO string to set
			if (expiresAt) {
				payload.expires_at = new Date(expiresAt).toISOString();
			} else if (apiKey.expiresAt && !expiresAt) {
				payload.expires_at = null;
			}
			const updated = await updateKey(apiKey.id, payload as never);
			showSuccess($_('user.keys.editSuccess', { default: 'API key updated' }));
			onUpdated?.(updated);
			open = false;
		} catch (err) {
			showError((err as Error)?.message ?? $_('user.keys.errors.UNKNOWN', { default: 'Unknown error' }));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog
	bind:open
	title={$_('user.keys.editTitle', { default: 'Edit API key' })}
	description={$_('user.keys.editDescription', { default: 'Update key name, group, or quota.' })}
	data-testid="edit-key-dialog"
>
	<div class="flex items-start gap-3 mb-4">
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
			<Pencil class="h-5 w-5" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.keys.editTitle', { default: 'Edit API key' })}
			</h2>
			<p class="text-sm text-muted-foreground">
				{$_('user.keys.editDescription', { default: 'Update key name, group, or quota.' })}
			</p>
		</div>
	</div>

	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4" data-testid="edit-key-form">
		<div class="space-y-1.5">
			<label for="edit-key-name" class="text-sm font-medium text-foreground">
				{$_('user.keys.nameLabel', { default: 'Name' })}
			</label>
			<Input id="edit-key-name" data-testid="edit-key-name" bind:value={name} />
		</div>

		<div class="space-y-1.5">
			<label for="edit-key-group" class="text-sm font-medium text-foreground">
				{$_('user.keys.groupLabel', { default: 'Group (optional)' })}
			</label>
			<NativeSelect id="edit-key-group" data-testid="edit-key-group" bind:value={groupId}>
				<option value="__none__">{$_('user.keys.groupDefault', { default: 'Default group' })}</option>
				{#each groups as g (g.id)}
					<option value={g.id}>{g.name} ({g.platform})</option>
				{/each}
			</NativeSelect>
		</div>

		<div class="space-y-1.5">
			<label for="edit-key-quota" class="text-sm font-medium text-foreground">
				{$_('user.keys.quotaLabel', { default: 'Quota (USD, optional)' })}
			</label>
			<Input id="edit-key-quota" data-testid="edit-key-quota" type="number" step="0.01" min="0" bind:value={quota} />
		</div>

		<div class="space-y-1.5">
			<label for="edit-key-expires" class="text-sm font-medium text-foreground">
				{$_('user.keys.expiresAtLabel', { default: 'Expires at (optional)' })}
			</label>
			<Input
				id="edit-key-expires"
				data-testid="edit-key-expires"
				type="datetime-local"
				bind:value={expiresAt}
			/>
			<p class="text-xs text-muted-foreground">
				{$_('user.keys.expiresAtHint', { default: 'Leave empty for no expiration. Clear to remove existing expiry.' })}
			</p>
		</div>

		<div class="flex items-center justify-end gap-2 pt-2">
			<Button variant="outline" onclick={() => (open = false)} class="h-9">
				{$_('common.cancel', { default: 'Cancel' })}
			</Button>
			<Button type="submit" disabled={submitting} class="h-9" data-testid="edit-key-submit">
				{submitting ? $_('common.saving', { default: 'Saving...' }) : $_('common.save', { default: 'Save' })}
			</Button>
		</div>
	</form>
</StandardDialog>
