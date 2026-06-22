<script lang="ts">
	/**
	 * Admin · Monetization · Subscriptions（M22）
	 *
	 * Thin orchestrator — data fetching + page-level state.
	 * UI delegated to feature components:
	 *   - SubscriptionStatsCards
	 *   - SubscriptionFilterBar
	 *   - SubscriptionTable (with bulk selection + bulk actions)
	 *   - SubscriptionDetailDrawer
	 *   - AssignSubscriptionDialog
	 *
	 * 红线（subscription surface only）：
	 *   - subscription management only —— 严禁引用计费核心、渠道定价、价格查询 service。
	 *   - 后端无 /:id/refund、/:id/audit-log、/:id/cancel —— 不渲染退款入口；
	 *     管理动作仅 extend / revoke（见 SubscriptionDetailDrawer）。
	 *   - 所有 Select 用 '__all__' 哨兵；禁 value=""。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw, AlertTriangle, UserPlus } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SubscriptionStatsCards from '$lib/features/monetization/subscriptions-admin/SubscriptionStatsCards.svelte';
	import SubscriptionFilterBar from '$lib/features/monetization/subscriptions-admin/SubscriptionFilterBar.svelte';
	import SubscriptionTable from '$lib/features/monetization/subscriptions-admin/SubscriptionTable.svelte';
	import SubscriptionDetailDrawer from '$lib/features/monetization/subscriptions-admin/SubscriptionDetailDrawer.svelte';
	import AssignSubscriptionDialog from '$lib/features/monetization/subscriptions-admin/AssignSubscriptionDialog.svelte';
	import {
		listAdminSubs,
		type AdminSubscription,
		type AdminSubFilter
	} from '$lib/api/admin/subscriptions';
	import { listPlans, type AdminPlan } from '$lib/api/admin/plans';

	const STATUS_ALL = '__all__';
	const PLAN_ALL = '__all__';

	let rows = $state<AdminSubscription[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let plans = $state<AdminPlan[]>([]);

	// Filters
	let statusFilter = $state(STATUS_ALL);
	let planFilter = $state(PLAN_ALL);
	let searchInput = $state('');
	let expiresAfter = $state('');
	let expiresBefore = $state('');

	// Pagination
	let page = $state(1);
	const PAGE_SIZE = 20;
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	// Drawer
	let drawerOpen = $state(false);
	let drawerSub = $state<AdminSubscription | null>(null);

	// Assign dialog
	let assignOpen = $state(false);

	async function loadPlansOnce() {
		try {
			plans = await listPlans();
		} catch {
			plans = [];
		}
	}

	async function loadSubs() {
		loading = true;
		loadError = null;
		try {
			const filter: AdminSubFilter = {
				page,
				page_size: PAGE_SIZE,
				status: statusFilter === STATUS_ALL ? undefined : statusFilter,
				plan_id: planFilter === PLAN_ALL ? undefined : Number(planFilter),
				search: searchInput.trim() || undefined,
				expires_after: expiresAfter || undefined,
				expires_before: expiresBefore || undefined,
				sort_by: 'started_at',
				sort_order: 'desc'
			};
			const resp = await listAdminSubs(filter);
			rows = resp.data;
			total = resp.total;
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadPlansOnce();
		void loadSubs();
	});

	// 当 filter 变化时回到第一页 + 重拉。
	$effect(() => {
		void statusFilter;
		void planFilter;
		void expiresAfter;
		void expiresBefore;
		page = 1;
	});

	// 汇总指标（基于当前页 rows —— 即 server 已分页结果）
	const activeCount = $derived(rows.filter((r) => r.status === 'active').length);
	const cancelledCount = $derived(
		rows.filter((r) => r.status === 'cancelled' || r.status === 'revoked').length
	);
	const totalRevenue = $derived(
		rows.reduce((sum, r) => sum + (Number(r.mtd_cost) || 0), 0)
	);

	function openDrawer(sub: AdminSubscription) {
		drawerSub = sub;
		drawerOpen = true;
	}

	function handleChanged() {
		void loadSubs();
	}

	function handleStatusChange(v: string) {
		statusFilter = v;
		void loadSubs();
	}

	function handlePlanChange(v: string) {
		planFilter = v;
		void loadSubs();
	}

	function handleSearchChange(v: string) {
		searchInput = v;
	}

	function handleExpiresAfterChange(v: string) {
		expiresAfter = v;
		void loadSubs();
	}

	function handleExpiresBeforeChange(v: string) {
		expiresBefore = v;
		void loadSubs();
	}

	function handleSearch() {
		page = 1;
		void loadSubs();
	}

	function handlePageChange(newPage: number) {
		page = newPage;
		void loadSubs();
	}
</script>

<svelte:head>
	<title>{$_('admin.subscriptions.title', { default: '订阅管理' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-subs-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.subscriptions.title', { default: '订阅管理' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.subscriptions.desc', {
					default: '实时订阅账本 · 管理撤销和延期'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => (assignOpen = true)}
				data-testid="admin-subs-assign-btn"
			>
				<UserPlus class="h-3.5 w-3.5" />
				{$_('admin.subscriptions.assignBtn', { default: '分配' })}
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadSubs()}
				data-testid="admin-subs-refresh"
				title={$_('common.refresh', { default: '刷新' })}
				aria-label={$_('common.refresh', { default: '刷新' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: '刷新' })}
			</Button>
		</div>
	</div>

	<!-- Stats bar -->
	<SubscriptionStatsCards
		{activeCount}
		{cancelledCount}
		{totalRevenue}
		visibleCount={rows.length}
		totalCount={total}
	/>

	<!-- Load error -->
	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2" data-testid="admin-subs-error">
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => loadSubs()}>
				{$_('common.confirm', { default: '重试' })}
			</Button>
		</Alert>
	{/if}

	<!-- Filter bar -->
	<SubscriptionFilterBar
		{statusFilter}
		{planFilter}
		{searchInput}
		{expiresAfter}
		{expiresBefore}
		{plans}
		onStatusChange={handleStatusChange}
		onPlanChange={handlePlanChange}
		onSearchChange={handleSearchChange}
		onExpiresAfterChange={handleExpiresAfterChange}
		onExpiresBeforeChange={handleExpiresBeforeChange}
		onSearch={handleSearch}
	/>

	<!-- Table + pagination + empty state + bulk actions -->
	<SubscriptionTable
		{rows}
		{loading}
		{page}
		{totalPages}
		onRowClick={openDrawer}
		onPageChange={handlePageChange}
		onBulkChanged={handleChanged}
	/>
</section>

<!-- Drawer -->
<SubscriptionDetailDrawer
	bind:open={drawerOpen}
	subscription={drawerSub}
	onChanged={handleChanged}
/>

<!-- Assign dialog -->
<AssignSubscriptionDialog bind:open={assignOpen} onAssigned={handleChanged} />
