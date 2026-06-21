<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { listUsers, deleteUser, toggleUserStatus, type AdminUser, type AdminUserFilters } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import UserFormDrawer from '$lib/features/users/UserFormDrawer.svelte';
	import UserDetailDrawer from '$lib/features/users/UserDetailDrawer.svelte';
	import BalanceAdjustDialog from '$lib/features/users/BalanceAdjustDialog.svelte';
	import { ALL, PAGE_SIZE, formatMoney, formatDate, statusTone, roleTone, userDisplayName, userGroups, userInitial } from '$lib/features/users/users';

	let users = $state<AdminUser[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let page = $state(1);
	let search = $state('');
	let statusFilter = $state(ALL);
	let roleFilter = $state(ALL);
	let sortBy = $state('created_at');
	let sortOrder = $state<'asc' | 'desc'>('desc');

	let selected = $state<Set<number>>(new Set());
	let showForm = $state(false);
	let editUser = $state<AdminUser | null>(null);
	let detailUserId = $state<number | null>(null);
	let showDetail = $state(false);
	let showBalance = $state(false);
	let balanceUser = $state<AdminUser | null>(null);
	let deleteTarget = $state<AdminUser | null>(null);
	let showDeleteConfirm = $state(false);

	async function load() {
		loading = true;
		const filters: AdminUserFilters = {
			search: search.trim() || undefined,
			status: statusFilter !== ALL ? statusFilter as 'active' | 'disabled' : undefined,
			role: roleFilter !== ALL ? roleFilter as 'admin' | 'user' : undefined,
			sort_by: sortBy, sort_order: sortOrder,
			include_subscriptions: true
		};
		try {
			const res = await listUsers(page, PAGE_SIZE, filters);
			users = res.items; total = res.total;
		} catch { showError($_('admin.users.loadFailed', { default: 'Failed to load users' })); }
		finally { loading = false; }
	}

	onMount(load);
	$effect(() => { void page; void statusFilter; void roleFilter; void sortBy; void sortOrder; load(); });

	function commitSearch() { page = 1; load(); }
	function openCreate() { editUser = null; showForm = true; }
	function openEdit(u: AdminUser) { editUser = u; showForm = true; }
	function openDetail(u: AdminUser) { detailUserId = u.id; showDetail = true; }
	function openBalance(u: AdminUser) { balanceUser = u; showBalance = true; }
	function confirmDelete(u: AdminUser) { deleteTarget = u; showDeleteConfirm = true; }

	async function doDelete() {
		if (!deleteTarget) return;
		try {
			await deleteUser(deleteTarget.id);
			showSuccess($_('admin.users.deleted', { default: 'User deleted' }));
			showDeleteConfirm = false; deleteTarget = null; load();
		} catch (e: unknown) { showError((e as Error)?.message || 'Delete failed'); }
	}

	async function bulkToggle(status: 'active' | 'disabled') {
		const ids = [...selected];
		if (!ids.length) return;
		try {
			await Promise.all(ids.map(id => toggleUserStatus(id, status)));
			showSuccess($_('admin.users.bulkDone', { default: '{count} users updated', values: { count: ids.length } }));
			selected = new Set(); load();
		} catch (e: unknown) { showError((e as Error)?.message || 'Bulk action failed'); }
	}

	async function bulkDelete() {
		const ids = [...selected];
		if (!ids.length) return;
		try {
			await Promise.all(ids.map(id => deleteUser(id)));
			showSuccess($_('admin.users.bulkDeleted', { default: '{count} users deleted', values: { count: ids.length } }));
			selected = new Set(); load();
		} catch (e: unknown) { showError((e as Error)?.message || 'Bulk delete failed'); }
	}

	function toggleSelect(id: number) {
		const s = new Set(selected);
		if (s.has(id)) s.delete(id); else s.add(id);
		selected = s;
	}

	function toggleSelectAll() {
		if (selected.size === users.length) selected = new Set();
		else selected = new Set(users.map(u => u.id));
	}

	function onSaved() { showForm = false; load(); }
	function onUpdated() { load(); }
</script>

<svelte:head>
	<title>{$_('admin.users.title', { default: 'User Management' })}</title>
</svelte:head>

<div class="mx-auto max-w-screen-xl space-y-4 p-4 lg:p-6">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground">{$_('admin.users.title', { default: 'User Management' })}</h1>
			<p class="text-xs text-muted-foreground">{$_('admin.users.desc', { default: 'Manage user accounts, roles, and access' })}</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled={loading} onclick={load}>↻ {$_('admin.users.refresh', { default: 'Refresh' })}</Button>
			<Button size="sm" onclick={openCreate} data-testid="users-create-btn">{$_('admin.users.createBtn', { default: 'Create User' })}</Button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<div class="flex-1">
			<Input type="search" placeholder={$_('admin.users.searchPlaceholder', { default: 'Search email, username, ID...' })}
				bind:value={search} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') commitSearch(); }}
				data-testid="users-search" />
		</div>
		<NativeSelect bind:value={statusFilter} data-testid="users-status-filter">
			<option value={ALL}>{$_('admin.users.allStatuses', { default: 'All Statuses' })}</option>
			<option value="active">{$_('admin.users.statusActive', { default: 'Active' })}</option>
			<option value="disabled">{$_('admin.users.statusDisabled', { default: 'Disabled' })}</option>
		</NativeSelect>
		<NativeSelect bind:value={roleFilter} data-testid="users-role-filter">
			<option value={ALL}>{$_('admin.users.allRoles', { default: 'All Roles' })}</option>
			<option value="admin">{$_('admin.users.roleAdmin', { default: 'Admin' })}</option>
			<option value="user">{$_('admin.users.roleUser', { default: 'User' })}</option>
		</NativeSelect>
	</div>

	{#if selected.size > 0}
		<div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
			<span class="font-medium">{selected.size} {$_('admin.users.selected', { default: 'selected' })}</span>
			<Button size="sm" variant="outline" onclick={() => bulkToggle('active')}>{$_('admin.users.bulkEnable', { default: 'Enable' })}</Button>
			<Button size="sm" variant="outline" onclick={() => bulkToggle('disabled')}>{$_('admin.users.bulkDisable', { default: 'Disable' })}</Button>
			<Button size="sm" variant="destructive" onclick={bulkDelete}>{$_('admin.users.bulkDelete', { default: 'Delete' })}</Button>
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())}>{$_('common.cancel', { default: 'Cancel' })}</Button>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<VirtualTable rows={users} rowHeight={52} getRowKey={(r) => (r as AdminUser).id}>
			{#snippet header()}
				<tr class="border-b border-border bg-muted/50 text-xs text-muted-foreground">
					<th class="w-10 px-3 py-2"><input type="checkbox" checked={selected.size === users.length && users.length > 0} onchange={toggleSelectAll} /></th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colUser', { default: 'User' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colRole', { default: 'Role' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colStatus', { default: 'Status' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colBalance', { default: 'Balance' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colGroups', { default: 'Groups' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colCreated', { default: 'Created' })}</th>
					<th class="px-3 py-2 text-right">{$_('admin.users.colActions', { default: 'Actions' })}</th>
				</tr>
			{/snippet}
			{#snippet row({ row, index })}
				{@const user = row as AdminUser}
				<tr class="cursor-pointer border-b border-border hover:bg-muted/30" data-testid="admin-users-row" onclick={() => openDetail(user)}>
					<td class="w-10 px-3 py-2" onclick={(e: MouseEvent) => e.stopPropagation()}>
						<input type="checkbox" checked={selected.has(user.id)} onchange={() => toggleSelect(user.id)} />
					</td>
					<td class="px-3 py-2">
						<div class="flex items-center gap-2.5">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{userInitial(user)}</div>
							<div class="min-w-0">
								<div class="truncate text-sm font-medium text-foreground">{user.email}</div>
								<div class="text-xs text-muted-foreground">{user.username ? `@${user.username}` : ''} · #{String(user.id).padStart(4, '0')}</div>
							</div>
						</div>
					</td>
					<td class="px-3 py-2"><Badge class={roleTone(user.role)}>{user.role}</Badge></td>
					<td class="px-3 py-2"><Badge class={statusTone(user.status)}>{user.status}</Badge></td>
					<td class="px-3 py-2 font-mono text-sm">{formatMoney(user.balance)}</td>
					<td class="max-w-[120px] truncate px-3 py-2 text-xs text-muted-foreground">{userGroups(user)}</td>
					<td class="px-3 py-2 text-xs text-muted-foreground">{formatDate(user.created_at)}</td>
					<td class="px-3 py-2 text-right" onclick={(e: MouseEvent) => e.stopPropagation()}>
						<div class="flex justify-end gap-1">
							<Button size="sm" variant="ghost" onclick={() => openEdit(user)}>{$_('common.edit', { default: 'Edit' })}</Button>
							<Button size="sm" variant="ghost" onclick={() => openBalance(user)}>{$_('admin.users.balance', { default: 'Balance' })}</Button>
							<Button size="sm" variant="ghost" class="text-destructive" onclick={() => confirmDelete(user)}>{$_('common.delete', { default: 'Delete' })}</Button>
						</div>
					</td>
				</tr>
			{/snippet}
			{#snippet empty()}
				<tr><td colspan="8" class="py-10 text-center text-sm text-muted-foreground">{$_('admin.users.empty', { default: 'No users found' })}</td></tr>
			{/snippet}
		</VirtualTable>
	</div>

	{#if total > PAGE_SIZE}
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span>{$_('admin.users.showingPage', { default: 'Page {page} of {pages}', values: { page, pages: Math.ceil(total / PAGE_SIZE) } })}</span>
			<div class="flex gap-2">
				<Button size="sm" variant="outline" disabled={page <= 1} onclick={() => { page--; }}>←</Button>
				<Button size="sm" variant="outline" disabled={page >= Math.ceil(total / PAGE_SIZE)} onclick={() => { page++; }}>→</Button>
			</div>
		</div>
	{/if}
</div>

<UserFormDrawer bind:open={showForm} user={editUser} onClose={() => (showForm = false)} {onSaved} />
<UserDetailDrawer bind:open={showDetail} userId={detailUserId} onClose={() => (showDetail = false)} {onUpdated} />
{#if balanceUser}
	<BalanceAdjustDialog bind:open={showBalance} userId={balanceUser.id} currentBalance={balanceUser.balance ?? 0}
		onClose={() => { showBalance = false; balanceUser = null; }} onUpdated={() => { showBalance = false; balanceUser = null; load(); }} />
{/if}
<StandardDialog bind:open={showDeleteConfirm} onOpenChange={(v) => { if (!v) { showDeleteConfirm = false; deleteTarget = null; }}}
	title={$_('admin.users.confirmDelete', { default: 'Delete User' })} data-testid="user-delete-dialog">
	<p class="text-sm text-muted-foreground">
		{$_('admin.users.deleteWarning', { default: 'Are you sure you want to delete {email}? This cannot be undone.', values: { email: deleteTarget?.email ?? '' } })}
	</p>
	<div class="flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" size="sm" onclick={() => { showDeleteConfirm = false; deleteTarget = null; }}>{$_('common.cancel', { default: 'Cancel' })}</Button>
		<Button variant="destructive" size="sm" onclick={doDelete} data-testid="user-delete-confirm">{$_('common.delete', { default: 'Delete' })}</Button>
	</div>
</StandardDialog>
