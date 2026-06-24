<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { createUser, updateUser, type AdminUser, type CreateAdminUserRequest, type UpdateAdminUserRequest } from '$lib/api/admin/users';
	import { listGroups, type AdminGroup } from '$lib/api/admin/groups';
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
	let displayName = $state('');
	let balance = $state(0);
	let concurrency = $state(5);
	let rpmLimit = $state(0);
	let role = $state<'admin' | 'user'>('user');
	let status = $state<'active' | 'disabled'>('active');
	let notes = $state('');
	let selectedGroups = $state<number[]>([]);
	let groupRates = $state<Record<number, string>>({});
	let submitting = $state(false);
	let allGroups = $state<AdminGroup[]>([]);
	let showGroupRates = $state(false);

	async function loadGroups() {
		try {
			const res = await listGroups(1, 100);
			allGroups = res?.items ?? [];
		} catch { /* ignore */ }
	}

	function populate(u: AdminUser | null) {
		if (u) {
			email = u.email; username = u.username ?? '';
			displayName = (u as Record<string, unknown>).display_name as string ?? '';
			concurrency = u.concurrency ?? 5;
			rpmLimit = u.rpm_limit ?? 0; role = u.role as 'admin' | 'user'; status = u.status as 'active' | 'disabled';
			notes = u.notes ?? '';
			selectedGroups = u.allowed_groups?.slice() ?? u.groups?.map(g => g.id) ?? [];
			password = ''; balance = 0;
			// Populate group_rates from user data if present
			const existingRates = (u as Record<string, unknown>).group_rates as Record<number, number | null> | undefined;
			groupRates = {};
			if (existingRates) {
				for (const [gid, rate] of Object.entries(existingRates)) {
					if (rate != null) groupRates[Number(gid)] = String(rate);
				}
			}
			showGroupRates = Object.keys(groupRates).length > 0;
		} else {
			email = ''; password = ''; username = ''; displayName = ''; balance = 0; concurrency = 5;
			rpmLimit = 0; role = 'user'; status = 'active'; notes = ''; selectedGroups = [];
			groupRates = {}; showGroupRates = false;
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

	function buildGroupRatesPayload(): Record<number, number | null> | undefined {
		const result: Record<number, number | null> = {};
		let hasAny = false;
		for (const [gid, rateStr] of Object.entries(groupRates)) {
			const trimmed = rateStr.trim();
			if (trimmed === '') {
				result[Number(gid)] = null;
				hasAny = true;
			} else {
				const parsed = parseFloat(trimmed);
				if (Number.isFinite(parsed)) {
					result[Number(gid)] = parsed;
					hasAny = true;
				}
			}
		}
		return hasAny ? result : undefined;
	}

	async function submit() {
		if (!email.trim()) { showError($_('admin.users.emailRequired', { default: '邮箱必填' })); return; }
		if (!isEdit && !password.trim()) { showError($_('admin.users.passwordRequired', { default: '新用户需设置密码' })); return; }
		submitting = true;
		try {
			if (isEdit && user) {
				const payload: UpdateAdminUserRequest = {
					email: email.trim(), username: username.trim() || undefined,
					notes: notes.trim() || undefined, role, status,
					concurrency, allowed_groups: selectedGroups.length ? selectedGroups : null,
					group_rates: buildGroupRatesPayload()
				};
				if (displayName.trim()) (payload as unknown as Record<string, unknown>).display_name = displayName.trim();
				if (password.trim()) payload.password = password.trim();
				if (rpmLimit > 0) (payload as unknown as Record<string, unknown>).rpm_limit = rpmLimit;
				await updateUser(user.id, payload);
				showSuccess($_('admin.users.updated', { default: '用户已更新' }));
			} else {
				const payload: CreateAdminUserRequest = {
					email: email.trim(), password: password.trim(),
					username: username.trim() || undefined, notes: notes.trim() || undefined,
					balance: balance || undefined, concurrency,
					allowed_groups: selectedGroups.length ? selectedGroups : null
				};
				if (displayName.trim()) (payload as unknown as Record<string, unknown>).display_name = displayName.trim();
				if (rpmLimit > 0) (payload as unknown as Record<string, unknown>).rpm_limit = rpmLimit;
				await createUser(payload);
				showSuccess($_('admin.users.created', { default: '用户已创建' }));
			}
			onSaved();
			onClose();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.saveFailed', { default: '保存失败' }));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDrawer bind:open
	title={isEdit ? $_('admin.users.editUser', { default: 'Edit User' }) : $_('admin.users.createUser', { default: '创建用户' })}
	data-testid="user-form-drawer">
	<form class="flex flex-col gap-4 p-1" onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.email', { default: '邮箱' })} <span class="text-destructive">*</span>
			</span>
			<Input type="email" required autocomplete="off" placeholder="user@example.com"
				bind:value={email} data-testid="user-form-email" />
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{isEdit ? $_('admin.users.passwordEdit', { default: 'New Password (optional)' }) : $_('admin.users.password', { default: '密码' })}
			</span>
			<div class="flex gap-2">
				<Input type="text" autocomplete="new-password" class="flex-1"
					placeholder={$_('admin.users.passwordPlaceholder', { default: '输入密码' })}
					required={!isEdit} bind:value={password} data-testid="user-form-password" />
				<Button type="button" variant="outline" size="sm" onclick={generatePassword}
					title={$_('admin.users.generatePassword', { default: '生成' })}>
					↻
				</Button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.username', { default: '用户名' })}
			</span>
			<Input type="text" autocomplete="off" bind:value={username}
				placeholder={$_('admin.users.usernamePlaceholder', { default: '可选的登录名' })}
				data-testid="user-form-username" />
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.displayName', { default: '显示名称' })}
			</span>
			<Input type="text" autocomplete="off" bind:value={displayName}
				placeholder={$_('admin.users.displayNamePlaceholder', { default: '可选的显示名称' })}
				data-testid="user-form-display-name" />
		</div>

		{#if !isEdit}
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.initialBalance', { default: '初始余额' })}
				</span>
				<Input type="number" step="0.01" min="0" placeholder="0.00"
					bind:value={balance} data-testid="user-form-balance" />
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.concurrency', { default: '并发数' })}
				</span>
				<Input type="number" min="1" bind:value={concurrency} data-testid="user-form-concurrency" />
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.rpmLimit', { default: 'RPM 限制 (0 = 不限)' })}
				</span>
				<Input type="number" min="0" bind:value={rpmLimit} data-testid="user-form-rpm" />
			</div>
		</div>

		{#if isEdit}
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{$_('admin.users.role', { default: '角色' })}
					</span>
					<NativeSelect bind:value={role} data-testid="user-form-role">
						<option value="user">{$_('admin.users.roleUser', { default: '用户' })}</option>
						<option value="admin">{$_('admin.users.roleAdmin', { default: '管理员' })}</option>
					</NativeSelect>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{$_('admin.users.status', { default: '状态' })}
					</span>
					<NativeSelect bind:value={status} data-testid="user-form-status">
						<option value="active">{$_('admin.users.statusActive', { default: '活跃' })}</option>
						<option value="disabled">{$_('admin.users.statusDisabled', { default: '已禁用' })}</option>
					</NativeSelect>
				</div>
			</div>
		{/if}

		{#if allGroups.length}
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{$_('admin.users.groups', { default: '分组' })}
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

		{#if isEdit && selectedGroups.length > 0}
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{$_('admin.users.groupRates', { default: '分组费率覆盖' })}
					</span>
					<Button type="button" variant="ghost" size="sm" class="h-6 text-xs"
						onclick={() => { showGroupRates = !showGroupRates; }}>
						{showGroupRates ? $_('common.hide', { default: 'Hide' }) : $_('common.show', { default: '显示' })}
					</Button>
				</div>
				{#if showGroupRates}
					<div class="flex flex-col gap-1.5 rounded-md border border-border p-2">
						<p class="text-[10.5px] text-muted-foreground">
							{$_('admin.users.groupRatesHint', { default: '留空则使用分组默认费率。值为倍率（例如 0.8 = 8 折）。' })}
						</p>
						{#each selectedGroups as gid}
							{@const group = allGroups.find(g => g.id === gid)}
							<div class="flex items-center gap-2">
								<span class="min-w-[80px] truncate text-xs text-muted-foreground">{group?.name ?? `#${gid}`}</span>
								<Input type="number" step="0.01" min="0" class="h-7 text-xs"
									placeholder={group?.rate_multiplier != null ? String(group.rate_multiplier) : '1.0'}
									value={groupRates[gid] ?? ''}
									oninput={(e: Event) => { groupRates[gid] = (e.target as HTMLInputElement).value; groupRates = { ...groupRates }; }}
									data-testid="user-form-group-rate-{gid}" />
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.notes', { default: '备注' })}
			</span>
			<Input type="text" bind:value={notes}
				placeholder={$_('admin.users.notesPlaceholder', { default: '可选备注' })}
				data-testid="user-form-notes" />
		</div>

		<div class="flex justify-end gap-2 border-t border-border pt-4">
			<Button type="button" variant="outline" size="sm" onclick={onClose}>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button type="submit" size="sm" disabled={submitting} data-testid="user-form-submit">
				{submitting ? $_('common.saving', { default: '保存中...' }) : $_('common.save', { default: '保存' })}
			</Button>
		</div>
	</form>
</StandardDrawer>
