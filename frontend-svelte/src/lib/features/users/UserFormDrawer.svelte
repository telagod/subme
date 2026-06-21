<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { createUser, updateUser, type AdminUser, type CreateAdminUserRequest, type UpdateAdminUserRequest } from '$lib/api/admin/users';
	import { listGroups } from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';

	type Props = {
		open: boolean;
		user?: AdminUser | null;
		onClose: () => void;
		onSaved: () => void;
	};

	let { open = $bindable(false), user = null, onClose, onSaved }: Props = $props();

	const isEdit = $derived(!!user);

	let email = $state('');
	let password = $state('');
	let username = $state('');
	let balance = $state(0);
	let concurrency = $state(5);
	let rpmLimit = $state(0);
	let role = $state<'admin' | 'user'>('user');
	let status = $state<'active' | 'disabled'>('active');
	let notes = $state('');
	let selectedGroups = $state<number[]>([]);
	let submitting = $state(false);
	let allGroups = $state<Array<{ id: number; name: string }>>([]);

	async function loadGroups() {
		try {
			const res = await listGroups();
			allGroups = res?.items ?? [];
		} catch { /* ignore */ }
	}

	function populate(u: AdminUser | null) {
		if (u) {
			email = u.email; username = u.username ?? ''; concurrency = u.concurrency ?? 5;
			rpmLimit = u.rpm_limit ?? 0; role = u.role as 'admin' | 'user'; status = u.status as 'active' | 'disabled';
			notes = u.notes ?? '';
			selectedGroups = u.allowed_groups?.slice() ?? u.groups?.map(g => g.id) ?? [];
			password = ''; balance = 0;
		} else {
			email = ''; password = ''; username = ''; balance = 0; concurrency = 5;
			rpmLimit = 0; role = 'user'; status = 'active'; notes = ''; selectedGroups = [];
		}
	}

	function generatePassword() {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
		password = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	}

	$effect(() => { if (open) { populate(user ?? null); loadGroups(); } });

	function toggleGroup(id: number) {
		if (selectedGroups.includes(id)) selectedGroups = selectedGroups.filter(g => g !== id);
		else selectedGroups = [...selectedGroups, id];
	}

	async function submit() {
		if (!email.trim()) { showError($_('admin.users.emailRequired', { default: 'Email is required' })); return; }
		if (!isEdit && !password.trim()) { showError($_('admin.users.passwordRequired', { default: 'Password is required for new users' })); return; }
		submitting = true;
		try {
			if (isEdit && user) {
				const payload: UpdateAdminUserRequest = {
					email: email.trim(), username: username.trim() || undefined,
					notes: notes.trim() || undefined, role, status,
					concurrency, allowed_groups: selectedGroups.length ? selectedGroups : null
				};
				if (password.trim()) payload.password = password.trim();
				if (rpmLimit > 0) (payload as unknown as Record<string, unknown>).rpm_limit = rpmLimit;
				await updateUser(user.id, payload);
				showSuccess($_('admin.users.updated', { default: 'User updated' }));
			} else {
				const payload: CreateAdminUserRequest = {
					email: email.trim(), password: password.trim(),
					username: username.trim() || undefined, notes: notes.trim() || undefined,
					balance: balance || undefined, concurrency,
					allowed_groups: selectedGroups.length ? selectedGroups : null
				};
				if (rpmLimit > 0) (payload as unknown as Record<string, unknown>).rpm_limit = rpmLimit;
				await createUser(payload);
				showSuccess($_('admin.users.created', { default: 'User created' }));
			}
			onSaved();
			onClose();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.saveFailed', { default: 'Save failed' }));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDrawer bind:open
	title={isEdit ? $_('admin.users.editUser', { default: 'Edit User' }) : $_('admin.users.createUser', { default: 'Create User' })}
	data-testid="user-form-drawer">
	<form class="flex flex-col gap-4 p-1" onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.email', { default: 'Email' })} <span class="text-destructive">*</span>
			</span>
			<Input type="email" required autocomplete="off" placeholder="user@example.com"
				bind:value={email} data-testid="user-form-email" />
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{isEdit ? $_('admin.users.passwordEdit', { default: 'New Password (optional)' }) : $_('admin.users.password', { default: 'Password' })}
			</span>
			<div class="flex gap-2">
				<Input type="text" autocomplete="new-password" class="flex-1"
					placeholder={$_('admin.users.passwordPlaceholder', { default: 'Enter password' })}
					required={!isEdit} bind:value={password} data-testid="user-form-password" />
				<Button type="button" variant="outline" size="sm" onclick={generatePassword}
					title={$_('admin.users.generatePassword', { default: 'Generate' })}>
					↻
				</Button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.username', { default: 'Username' })}
			</span>
			<Input type="text" autocomplete="off" bind:value={username}
				placeholder={$_('admin.users.usernamePlaceholder', { default: 'Optional display name' })}
				data-testid="user-form-username" />
		</div>

		{#if !isEdit}
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.initialBalance', { default: 'Initial Balance' })}
				</span>
				<Input type="number" step="0.01" min="0" placeholder="0.00"
					bind:value={balance} data-testid="user-form-balance" />
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.concurrency', { default: 'Concurrency' })}
				</span>
				<Input type="number" min="1" bind:value={concurrency} data-testid="user-form-concurrency" />
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.rpmLimit', { default: 'RPM Limit (0 = unlimited)' })}
				</span>
				<Input type="number" min="0" bind:value={rpmLimit} data-testid="user-form-rpm" />
			</div>
		</div>

		{#if isEdit}
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{$_('admin.users.role', { default: 'Role' })}
					</span>
					<NativeSelect bind:value={role} data-testid="user-form-role">
						<option value="user">{$_('admin.users.roleUser', { default: 'User' })}</option>
						<option value="admin">{$_('admin.users.roleAdmin', { default: 'Admin' })}</option>
					</NativeSelect>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{$_('admin.users.status', { default: 'Status' })}
					</span>
					<NativeSelect bind:value={status} data-testid="user-form-status">
						<option value="active">{$_('admin.users.statusActive', { default: 'Active' })}</option>
						<option value="disabled">{$_('admin.users.statusDisabled', { default: 'Disabled' })}</option>
					</NativeSelect>
				</div>
			</div>
		{/if}

		{#if allGroups.length}
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.groups', { default: 'Groups' })}
				</span>
				<div class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
					{#each allGroups as g}
						<label class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
							<Checkbox checked={selectedGroups.includes(g.id)}
								onchange={() => toggleGroup(g.id)} />
							{g.name}
						</label>
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.notes', { default: 'Notes' })}
			</span>
			<Input type="text" bind:value={notes}
				placeholder={$_('admin.users.notesPlaceholder', { default: 'Optional notes' })}
				data-testid="user-form-notes" />
		</div>

		<div class="flex justify-end gap-2 border-t border-border pt-4">
			<Button type="button" variant="outline" size="sm" onclick={onClose}>
				{$_('common.cancel', { default: 'Cancel' })}
			</Button>
			<Button type="submit" size="sm" disabled={submitting} data-testid="user-form-submit">
				{submitting ? $_('common.saving', { default: 'Saving...' }) : $_('common.save', { default: 'Save' })}
			</Button>
		</div>
	</form>
</StandardDrawer>
