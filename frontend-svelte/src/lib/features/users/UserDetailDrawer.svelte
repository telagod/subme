<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getUser, getUserUsage, toggleUserStatus, type AdminUser, type UserUsageStats } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import UserOverviewTab from './UserOverviewTab.svelte';
	import UserSubscriptionsTab from './UserSubscriptionsTab.svelte';
	import UserKeysTab from './UserKeysTab.svelte';
	import UserOrdersTab from './UserOrdersTab.svelte';
	import UserUsageTab from './UserUsageTab.svelte';
	import UserRiskTab from './UserRiskTab.svelte';
	import BalanceAdjustDialog from './BalanceAdjustDialog.svelte';

	type TabKey = 'overview' | 'subscriptions' | 'keys' | 'orders' | 'usage' | 'risk';
	const TABS: { key: TabKey; label: string }[] = [
		{ key: 'overview', label: 'Overview' },
		{ key: 'subscriptions', label: 'Subscriptions' },
		{ key: 'keys', label: 'API Keys' },
		{ key: 'orders', label: 'Orders' },
		{ key: 'usage', label: 'Usage' },
		{ key: 'risk', label: 'Risk' }
	];

	type Props = {
		open: boolean;
		userId: number | null;
		onClose: () => void;
		onUpdated: () => void;
	};

	let { open = $bindable(false), userId, onClose, onUpdated }: Props = $props();

	let user = $state<AdminUser | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let activeTab = $state<TabKey>('overview');
	let showBalanceAdj = $state(false);
	let monthCost = $state<number | null>(null);
	let monthCostLoading = $state(false);

	function fmtBal(v: number | null | undefined): string {
		if (v == null) return '0.00';
		const s = v.toFixed(8).replace(/\.?0+$/, '');
		const parts = s.split('.');
		if (parts.length === 1) return s + '.00';
		if (parts[1].length < 2) return s + '0';
		return s;
	}

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString();
	}

	async function loadUser() {
		if (!userId) return;
		loading = true; loadError = null;
		try {
			user = await getUser(userId);
			loadMonthCost();
		}
		catch { loadError = $_('admin.users.loadFailed', { default: '加载用户失败' }); }
		finally { loading = false; }
	}

	async function loadMonthCost() {
		if (!userId) return;
		monthCostLoading = true;
		try {
			const stats = await getUserUsage(userId, 'month');
			monthCost = stats?.total_cost ?? 0;
		} catch { monthCost = null; }
		finally { monthCostLoading = false; }
	}

	$effect(() => {
		if (open && userId) { activeTab = 'overview'; loadUser(); }
		else { user = null; monthCost = null; }
	});

	async function handleToggleStatus() {
		if (!user) return;
		const newStatus = user.status === 'active' ? 'disabled' : 'active';
		try {
			await toggleUserStatus(user.id, newStatus);
			user = { ...user, status: newStatus };
			showSuccess($_('admin.users.statusToggled', { default: '状态已更新' }));
			onUpdated();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.statusToggleFailed', { default: '更新状态失败' }));
		}
	}

	function handleBalanceUpdated() {
		showBalanceAdj = false;
		loadUser();
		onUpdated();
	}
</script>

<StandardDrawer bind:open width="lg"
	title={user?.email ?? $_('admin.users.userDetail', { default: '用户详情' })}
	showHeader={false}
	data-testid="user-detail-drawer">

	{#if loading}
		<div class="flex flex-1 items-center justify-center py-20">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground"></div>
		</div>
	{:else if loadError}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
			<p>{loadError}</p>
			<Button variant="outline" size="sm" onclick={loadUser}>{$_('common.retry', { default: '重试' })}</Button>
		</div>
	{:else if user}
		<!-- Header: avatar + name + badges -->
		<div class="flex items-center gap-3 border-b border-border px-5 py-4">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-lg font-bold text-primary">
				{user.email.charAt(0).toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold text-foreground">{user.email}</div>
				<div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
					{#if user.username}<span>@{user.username}</span><span>·</span>{/if}
					<span>{$_('admin.users.registered', { default: '已注册' })} {fmt(user.created_at)}</span>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				<Badge class={user.role === 'admin' ? '' : 'bg-muted text-muted-foreground'}>
					{user.role === 'admin' ? $_('admin.users.roleAdmin', { default: '管理员' }) : $_('admin.users.roleUser', { default: '用户' })}
				</Badge>
				<Badge class={user.status === 'active'
					? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
					: 'border-destructive/30 bg-destructive/10 text-destructive'}>
					{user.status === 'active' ? $_('admin.users.active', { default: '活跃' }) : $_('admin.users.disabled', { default: '已禁用' })}
				</Badge>
			</div>
		</div>

		<!-- KPI bar -->
		<div class="flex items-stretch border-b border-border bg-muted/40 px-5 py-3">
			<div class="flex flex-1 flex-col gap-0.5 px-3.5">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.kpiBalance', { default: '余额' })}</span>
				<span class="text-base font-bold text-foreground">${fmtBal(user.balance)}</span>
			</div>
			<div class="my-0.5 w-px bg-border"></div>
			<div class="flex flex-1 flex-col gap-0.5 px-3.5">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.kpiMonthCost', { default: '月费用' })}</span>
				<span class="text-base font-bold text-foreground">
					{monthCostLoading ? '...' : monthCost != null ? `$${fmtBal(monthCost)}` : '—'}
				</span>
			</div>
			<div class="my-0.5 w-px bg-border"></div>
			<div class="flex flex-1 flex-col gap-0.5 px-3.5">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.kpiSubscription', { default: '订阅' })}</span>
				{#if user.subscriptions?.some(s => s.status === 'active')}
					<Badge class="w-fit border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs">
						{$_('admin.users.subActive', { default: '活跃' })}
					</Badge>
				{:else}
					<span class="text-sm font-bold text-muted-foreground">{$_('admin.users.subNone', { default: '无' })}</span>
				{/if}
			</div>
		</div>

		<!-- Tabs bar -->
		<div class="flex gap-0 overflow-x-auto border-b border-border px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
			{#each TABS as tab}
				<button type="button" role="tab" aria-selected={activeTab === tab.key}
					class="whitespace-nowrap px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors -mb-px border-b-2 border-transparent hover:text-foreground"
					class:text-primary={activeTab === tab.key}
					class:border-b-primary={activeTab === tab.key}
					onclick={() => { activeTab = tab.key; }}>
					{$_(`admin.users.tab${tab.key.charAt(0).toUpperCase() + tab.key.slice(1)}`, { default: tab.label })}
				</button>
			{/each}
		</div>

		<!-- Tab content -->
		<div class="flex-1 overflow-y-auto px-5 py-4" role="tabpanel">
			{#if activeTab === 'overview'}
				<UserOverviewTab {user} />
			{:else if activeTab === 'subscriptions'}
				<UserSubscriptionsTab {user} active={activeTab === 'subscriptions'} />
			{:else if activeTab === 'keys'}
				<UserKeysTab {user} active={activeTab === 'keys'} />
			{:else if activeTab === 'orders'}
				<UserOrdersTab {user} active={activeTab === 'orders'} />
			{:else if activeTab === 'usage'}
				<UserUsageTab {user} active={activeTab === 'usage'} />
			{:else if activeTab === 'risk'}
				<UserRiskTab {user} active={activeTab === 'risk'} />
			{/if}
		</div>

		<!-- Footer actions -->
		<div class="flex items-center gap-2.5 border-t border-border px-5 py-3.5">
			<Button variant="outline" size="sm" onclick={() => (showBalanceAdj = true)}>
				{$_('admin.users.adjustBalance', { default: '调整余额' })}
			</Button>
			<Button size="sm"
				variant={user.status === 'active' ? 'destructive' : 'default'}
				class={user.status !== 'active' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' : ''}
				onclick={handleToggleStatus}>
				{user.status === 'active' ? $_('admin.users.disable', { default: '禁用' }) : $_('admin.users.enable', { default: '启用' })}
			</Button>
		</div>

		{#if user}
			<BalanceAdjustDialog open={showBalanceAdj} userId={user.id} currentBalance={user.balance ?? 0}
				onClose={() => (showBalanceAdj = false)} onUpdated={handleBalanceUpdated} />
		{/if}
	{/if}
</StandardDrawer>
