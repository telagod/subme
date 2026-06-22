<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { listUsers, deleteUser, toggleUserStatus, type AdminUser, type AdminUserFilters } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import UserFormDrawer from '$lib/features/users/UserFormDrawer.svelte';
	import UserDetailDrawer from '$lib/features/users/UserDetailDrawer.svelte';
	import BalanceAdjustDialog from '$lib/features/users/BalanceAdjustDialog.svelte';
	import UserFilterBar from '$lib/features/users/UserFilterBar.svelte';
	import BulkActionDialog from '$lib/features/users/BulkActionDialog.svelte';
	import { ALL, PAGE_SIZE, formatMoney, formatDate, statusTone, roleTone, userGroups, userInitial } from '$lib/features/users/users';

	let users = $state<AdminUser[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let page = $state(1);
	let sortBy = $state('created_at');
	let sortOrder = $state<'asc' | 'desc'>('desc');

	// Filter state (bound to UserFilterBar)
	let search = $state('');
	let statusFilter = $state(ALL);
	let roleFilter = $state(ALL);
	let groupFilter = $state(ALL);
	let balanceMin = $state('');
	let balanceMax = $state('');
	let createdAfter = $state('');
	let createdBefore = $state('');
	let lastActiveAfter = $state('');
	let lastActiveBefore = $state('');
	let subscriptionStatus = $state(ALL);

	// Selection + dialogs
	let selected = $state<Set<number>>(new Set());
	let showForm = $state(false);
	let editUser = $state<AdminUser | null>(null);
	let detailUserId = $state<number | null>(null);
	let showDetail = $state(false);
	let showBalance = $state(false);
	let balanceUser = $state<AdminUser | null>(null);
	let deleteTarget = $state<AdminUser | null>(null);
	let showDeleteConfirm = $state(false);

	// Bulk action dialog
	let showBulkDialog = $state(false);
	let bulkAction = $state<'enable' | 'disable' | 'delete'>('enable');

	async function load() {
		loading = true;
		const filters: AdminUserFilters = {
			search: search.trim() || undefined,
			status: statusFilter !== ALL ? statusFilter as 'active' | 'disabled' : undefined,
			role: roleFilter !== ALL ? roleFilter as 'admin' | 'user' : undefined,
			group_name: groupFilter !== ALL ? groupFilter : undefined,
			balance_min: balanceMin ? parseFloat(balanceMin) : undefined,
			balance_max: balanceMax ? parseFloat(balanceMax) : undefined,
			created_after: createdAfter || undefined,
			created_before: createdBefore || undefined,
			last_active_after: lastActiveAfter || undefined,
			last_active_before: lastActiveBefore || undefined,
			subscription_status: subscriptionStatus !== ALL ? subscriptionStatus as 'active' | 'expired' | 'none' : undefined,
			sort_by: sortBy, sort_order: sortOrder,
			include_subscriptions: true
		};
		try {
			const res = await listUsers(page, PAGE_SIZE, filters);
			users = res.items; total = res.total;
		} catch { showError($_('admin.users.loadFailed', { default: '加载用户失败' })); }
		finally { loading = false; }
	}

	onMount(load);
	$effect(() => { void page; void sortBy; void sortOrder; load(); });

	function commitSearch() { page = 1; load(); }
	function onFiltersChanged() { page = 1; load(); }
	function openCreate() { editUser = null; showForm = true; }
	function openEdit(u: AdminUser) { editUser = u; showForm = true; }
	function openDetail(u: AdminUser) { detailUserId = u.id; showDetail = true; }
	function openBalance(u: AdminUser) { balanceUser = u; showBalance = true; }
	function confirmDelete(u: AdminUser) { deleteTarget = u; showDeleteConfirm = true; }

	async function doDelete() {
		if (!deleteTarget) return;
		try {
			await deleteUser(deleteTarget.id);
			showSuccess($_('admin.users.deleted', { default: '用户已删除' }));
			showDeleteConfirm = false; deleteTarget = null; load();
		} catch (e: unknown) { showError((e as Error)?.message || 'Delete failed'); }
	}

	function openBulkDialog(action: 'enable' | 'disable' | 'delete') {
		if (!selected.size) return;
		bulkAction = action;
		showBulkDialog = true;
	}

	async function executeBulkAction() {
		const ids = [...selected];
		if (!ids.length) return;
		showBulkDialog = false;
		try {
			if (bulkAction === 'delete') {
				await Promise.all(ids.map(id => deleteUser(id)));
				showSuccess($_('admin.users.bulkDeleted', { default: '{count} users deleted', values: { count: ids.length } }));
			} else {
				const status = bulkAction === 'enable' ? 'active' : 'disabled';
				await Promise.all(ids.map(id => toggleUserStatus(id, status)));
				showSuccess($_('admin.users.bulkDone', { default: '{count} users updated', values: { count: ids.length } }));
			}
			selected = new Set(); load();
		} catch (e: unknown) { showError((e as Error)?.message || 'Bulk action failed'); }
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
	<title>{$_('admin.users.title', { default: '用户管理' })}</title>
</svelte:head>

<div class="space-y-4 p-4 lg:p-6">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground">{$_('admin.users.title', { default: '用户管理' })}</h1>
			<p class="text-xs text-muted-foreground">{$_('admin.users.desc', { default: '管理用户账户、角色和权限' })}</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled={loading} onclick={load}>↻ {$_('admin.users.refresh', { default: '刷新' })}</Button>
			<Button size="sm" onclick={openCreate} data-testid="users-create-btn">{$_('admin.users.createBtn', { default: '创建用户' })}</Button>
		</div>
	</div>

	<UserFilterBar
		bind:search bind:statusFilter bind:roleFilter bind:groupFilter
		bind:balanceMin bind:balanceMax bind:createdAfter bind:createdBefore
		bind:lastActiveAfter bind:lastActiveBefore bind:subscriptionStatus
		onCommitSearch={commitSearch} {onFiltersChanged}
	/>

	{#if selected.size > 0}
		<div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
			<span class="font-medium">{selected.size} {$_('admin.users.selected', { default: '已选中' })}</span>
			<Button size="sm" variant="outline" onclick={() => openBulkDialog('enable')}>{$_('admin.users.bulkEnable', { default: '启用' })}</Button>
			<Button size="sm" variant="outline" onclick={() => openBulkDialog('disable')}>{$_('admin.users.bulkDisable', { default: '禁用' })}</Button>
			<Button size="sm" variant="destructive" onclick={() => openBulkDialog('delete')}>{$_('admin.users.bulkDelete', { default: '删除' })}</Button>
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())}>{$_('common.cancel', { default: '取消' })}</Button>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<VirtualTable rows={users} rowHeight={52} getRowKey={(r) => (r as AdminUser).id}>
			{#snippet header()}
				<tr class="border-b border-border bg-muted/50 text-xs text-muted-foreground">
					<th class="w-10 px-3 py-2"><input type="checkbox" checked={selected.size === users.length && users.length > 0} onchange={toggleSelectAll} /></th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colUser', { default: '用户' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colRole', { default: '角色' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colStatus', { default: '状态' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colBalance', { default: '余额' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colGroups', { default: '分组' })}</th>
					<th class="px-3 py-2 text-left">{$_('admin.users.colCreated', { default: '创建时间' })}</th>
					<th class="px-3 py-2 text-right">{$_('admin.users.colActions', { default: '操作' })}</th>
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
							<Button size="sm" variant="ghost" onclick={() => openEdit(user)}>{$_('common.edit', { default: '编辑' })}</Button>
							<Button size="sm" variant="ghost" onclick={() => openBalance(user)}>{$_('admin.users.balance', { default: '余额' })}</Button>
							<Button size="sm" variant="ghost" class="text-destructive" onclick={() => confirmDelete(user)}>{$_('common.delete', { default: '删除' })}</Button>
						</div>
					</td>
				</tr>
			{/snippet}
			{#snippet empty()}
				<tr><td colspan="8" class="py-10 text-center text-sm text-muted-foreground">{$_('admin.users.empty', { default: '暂无用户' })}</td></tr>
			{/snippet}
		</VirtualTable>
	</div>

	{#if total > PAGE_SIZE}
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span>{$_('admin.users.showingPage', { default: '第 {page} / {pages} 页', values: { page, pages: Math.ceil(total / PAGE_SIZE) } })}</span>
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
<BulkActionDialog bind:open={showBulkDialog} action={bulkAction} count={selected.size}
	onClose={() => { showBulkDialog = false; }} onConfirm={executeBulkAction} />
<StandardDialog bind:open={showDeleteConfirm} onOpenChange={(v) => { if (!v) { showDeleteConfirm = false; deleteTarget = null; }}}
	title={$_('admin.users.confirmDelete', { default: '删除用户' })} data-testid="user-delete-dialog">
	<p class="text-sm text-muted-foreground">
		{$_('admin.users.deleteWarning', { default: '确定要删除 {email} 吗？此操作不可撤销。', values: { email: deleteTarget?.email ?? '' } })}
	</p>
	<div class="flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" size="sm" onclick={() => { showDeleteConfirm = false; deleteTarget = null; }}>{$_('common.cancel', { default: '取消' })}</Button>
		<Button variant="destructive" size="sm" onclick={doDelete} data-testid="user-delete-confirm">{$_('common.delete', { default: '删除' })}</Button>
	</div>
</StandardDialog>
