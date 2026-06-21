<script lang="ts">
	/**
	 * Admin · Monetization · Subscriptions（M22）
	 *
	 * 设计：
	 *   - Header: title + 三个汇总指标（active count / cancelled count / total revenue MTD rollup）。
	 *   - Filters: status Select（'__all__' 哨兵）+ plan Select + user search + 日期范围。
	 *   - Table: > 50 行启 VirtualTable；否则平铺。列：
	 *       User (email masked) | Plan | Status | Started | Renews/Expires | MTD Cost | Actions
	 *   - 行点击 → SubscriptionDetailDrawer（懒拉详情 + audit log）。
	 *   - 分页。
	 *
	 * 红线（subscription surface only）：
	 *   - subscription management only —— 严禁引用计费核心、渠道定价、价格查询 service。
	 *   - 后端无 /:id/refund、/:id/audit-log、/:id/cancel —— 不渲染退款入口；
	 *     管理动作仅 extend / revoke（见 SubscriptionDetailDrawer）。
	 *   - 所有 Select 用 '__all__' 哨兵；禁 value=""。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Search,
		RefreshCw,
		AlertTriangle,
		ChevronLeft,
		ChevronRight,
		PackageSearch
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import SubscriptionDetailDrawer from '$lib/features/monetization/subscriptions-admin/SubscriptionDetailDrawer.svelte';
	import {
		listAdminSubs,
		type AdminSubscription,
		type AdminSubFilter
	} from '$lib/api/admin/subscriptions';
	import { listPlans, type AdminPlan } from '$lib/api/admin/plans';

	const STATUS_ALL = '__all__';
	const PLAN_ALL = '__all__';
	const VIRTUAL_THRESHOLD = 50;
	const statusOptions = $derived([
		{ value: STATUS_ALL, label: $_('admin.subscriptions.statusAll', { default: 'All statuses' }) },
		{ value: 'active', label: $_('admin.subscriptions.statusActive', { default: 'Active' }) },
		{ value: 'cancelled', label: $_('admin.subscriptions.statusCancelled', { default: 'Cancelled' }) },
		{ value: 'expired', label: $_('admin.subscriptions.statusExpired', { default: 'Expired' }) }
	]);

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

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);

	const planOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		return [
			{ value: PLAN_ALL, label: $_('admin.subscriptions.planAll', { default: 'All plans' }) },
			...plans.map((p) => ({ value: String(p.id), label: p.name }))
		];
	});

	function openDrawer(sub: AdminSubscription) {
		drawerSub = sub;
		drawerOpen = true;
	}

	function handleChanged() {
		void loadSubs();
	}

	function maskEmail(email?: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const masked = local.length <= 2 ? local : local[0] + '***' + local[local.length - 1];
		return masked + email.slice(at);
	}

	function fmtDate(s?: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function fmtMoney(v?: number | null, currency = 'USD'): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return `${currency === 'USD' ? '$' : ''}${v.toFixed(2)}`;
	}

	function statusClass(s: string): string {
		switch (s) {
			case 'active':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'cancelled':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'expired':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'revoked':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function handleRowKey(e: KeyboardEvent, sub: AdminSubscription) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openDrawer(sub);
		}
	}

	function rowKey(r: AdminSubscription): string {
		return String(r.id);
	}
</script>

<svelte:head>
	<title>{$_('admin.subscriptions.title', { default: 'Subscriptions' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-subs-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.subscriptions.title', { default: 'Subscriptions' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.subscriptions.desc', {
					default: 'Live subscription ledger · manage revocations and extensions'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadSubs()}
				data-testid="admin-subs-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
		</div>
	</div>

	<!-- Stats bar -->
	<Card class="flex items-center gap-5 px-[18px] py-3" data-testid="admin-subs-stats">
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-emerald-500"
				data-testid="admin-subs-stat-active"
			>
				{activeCount}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.subscriptions.statActive', { default: 'Active' })}
			</span>
		</div>
		<div class="h-6 w-px bg-border" aria-hidden="true"></div>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-amber-500"
				data-testid="admin-subs-stat-cancelled"
			>
				{cancelledCount}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.subscriptions.statCancelled', { default: 'Cancelled' })}
			</span>
		</div>
		<div class="h-6 w-px bg-border" aria-hidden="true"></div>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-foreground"
				data-testid="admin-subs-stat-revenue"
			>
				${totalRevenue.toFixed(2)}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.subscriptions.statRevenue', { default: 'MTD revenue' })}
			</span>
		</div>
		<div class="ml-auto text-xs text-muted-foreground tabular-nums">
			{rows.length} / {total}
		</div>
	</Card>

	<!-- Load error -->
	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2" data-testid="admin-subs-error">
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => loadSubs()}>
				{$_('common.confirm', { default: 'Retry' })}
			</Button>
		</Alert>
	{/if}

	<!-- Filter bar -->
	<Card class="flex flex-wrap items-center gap-2 p-2" data-testid="admin-subs-filters">
		<div class="relative">
			<Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="search"
				class="h-8 w-56 pl-7 pr-2"
				placeholder={$_('admin.subscriptions.searchPlaceholder', {
					default: 'Search user email or ID…'
				})}
				bind:value={searchInput}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						page = 1;
						void loadSubs();
					}
				}}
				data-testid="admin-subs-search"
			/>
		</div>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-status-filter">
			{$_('common.status', { default: 'Status' })}
		</label>
		<NativeSelect
			id="admin-subs-status-filter"
			class="h-8 px-2"
			bind:value={statusFilter}
			options={statusOptions}
			onchange={() => loadSubs()}
			data-testid="admin-subs-status-filter"
		/>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-plan-filter">
			{$_('admin.subscriptions.planLabel', { default: 'Plan' })}
		</label>
		<NativeSelect
			id="admin-subs-plan-filter"
			class="h-8 px-2"
			bind:value={planFilter}
			options={planOptions}
			onchange={() => loadSubs()}
			data-testid="admin-subs-plan-filter"
		/>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-after">
			{$_('admin.subscriptions.expiresAfter', { default: 'Expires after' })}
		</label>
		<Input
			id="admin-subs-expires-after"
			type="date"
			class="h-8 px-2"
			bind:value={expiresAfter}
			onchange={() => loadSubs()}
			data-testid="admin-subs-expires-after"
		/>
		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-before">
			{$_('admin.subscriptions.expiresBefore', { default: 'Expires before' })}
		</label>
		<Input
			id="admin-subs-expires-before"
			type="date"
			class="h-8 px-2"
			bind:value={expiresBefore}
			onchange={() => loadSubs()}
			data-testid="admin-subs-expires-before"
		/>
	</Card>

	<!-- Table -->
	{#if loading && rows.length === 0}
		<div class="flex flex-col gap-2" data-testid="admin-subs-loading">
			{#each Array(5) as _, i (i)}
				<div
					class="h-12 animate-pulse rounded-md border border-border bg-muted"
				></div>
			{/each}
		</div>
	{:else if rows.length > 0}
		<Card
			padded={false}
			class="overflow-hidden"
			data-testid="admin-subs-table-wrapper"
			style="height: 560px;"
		>
			{#if useVirtual}
				<VirtualTable
					rows={rows}
					rowHeight={56}
					getRowKey={(r) => rowKey(r)}
				>
					{#snippet header()}
						<div
							class="grid grid-cols-[1.4fr,1fr,80px,90px,110px,80px,80px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
							<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
							<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
							<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
							<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
							<div class="text-right">{$_('admin.subscriptions.colMtd', { default: 'MTD' })}</div>
							<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
						</div>
					{/snippet}
					{#snippet row({ row: sub })}
						<InteractiveRow
							class="grid w-full cursor-pointer grid-cols-[1.4fr,1fr,80px,90px,110px,80px,80px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => openDrawer(sub)}
							onkeydown={(e) => handleRowKey(e, sub)}
							data-testid="admin-subs-row"
							data-sub-id={sub.id}
						>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">{maskEmail(sub.user_email)}</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{sub.user_id}
								</div>
							</div>
							<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
							<div>
								<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}">{sub.status}</Badge>
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(sub.started_at)}
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(sub.expires_at)}
							</div>
							<div class="text-right font-mono tabular-nums text-foreground">
								{fmtMoney(sub.mtd_cost, sub.currency)}
							</div>
							<div class="flex justify-end gap-1 text-[10.5px] text-muted-foreground">
								{$_('common.view', { default: 'View' })}
							</div>
						</InteractiveRow>
					{/snippet}
				</VirtualTable>
			{:else}
				<!-- Plain table（≤ 50 行） -->
				<div class="flex h-full flex-col" data-testid="admin-subs-table-flat">
					<div
						class="grid grid-cols-[1.4fr,1fr,80px,90px,110px,80px,80px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div>{$_('admin.subscriptions.colUser', { default: 'User' })}</div>
						<div>{$_('admin.subscriptions.colPlan', { default: 'Plan' })}</div>
						<div>{$_('admin.subscriptions.colStatus', { default: 'Status' })}</div>
						<div>{$_('admin.subscriptions.colStarted', { default: 'Started' })}</div>
						<div>{$_('admin.subscriptions.colExpires', { default: 'Expires' })}</div>
						<div class="text-right">{$_('admin.subscriptions.colMtd', { default: 'MTD' })}</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
					<div class="flex-1 overflow-y-auto">
						{#each rows as sub (rowKey(sub))}
							<InteractiveRow
								class="grid w-full cursor-pointer grid-cols-[1.4fr,1fr,80px,90px,110px,80px,80px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
								onclick={() => openDrawer(sub)}
								onkeydown={(e) => handleRowKey(e, sub)}
								data-testid="admin-subs-row"
								data-sub-id={sub.id}
							>
								<div class="truncate">
									<div class="truncate font-mono text-foreground">{maskEmail(sub.user_email)}</div>
									<div class="truncate font-mono text-[10.5px] text-muted-foreground">
										#{sub.user_id}
									</div>
								</div>
								<div class="truncate text-foreground">{sub.plan_name ?? '—'}</div>
								<div>
									<Badge variant="outline" class="text-[10px] uppercase tracking-wider {statusClass(sub.status)}">{sub.status}</Badge>
								</div>
								<div class="font-mono tabular-nums text-muted-foreground">
									{fmtDate(sub.started_at)}
								</div>
								<div class="font-mono tabular-nums text-muted-foreground">
									{fmtDate(sub.expires_at)}
								</div>
								<div class="text-right font-mono tabular-nums text-foreground">
									{fmtMoney(sub.mtd_cost, sub.currency)}
								</div>
								<div class="flex justify-end gap-1 text-[10.5px] text-muted-foreground">
									{$_('common.view', { default: 'View' })}
								</div>
							</InteractiveRow>
						{/each}
					</div>
				</div>
			{/if}
		</Card>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="flex items-center justify-center gap-2 pt-1"
				data-testid="admin-subs-pagination"
			>
				<Button
					variant="outline"
					size="icon"
					disabled={page === 1 || loading}
					onclick={() => {
						page = Math.max(1, page - 1);
						void loadSubs();
					}}
					aria-label={$_('common.back', { default: 'Previous' })}
				>
					<ChevronLeft class="h-3 w-3" />
				</Button>
				<span class="text-xs tabular-nums text-muted-foreground">
					{page} / {totalPages}
				</span>
				<Button
					variant="outline"
					size="icon"
					disabled={page === totalPages || loading}
					onclick={() => {
						page = Math.min(totalPages, page + 1);
						void loadSubs();
					}}
					aria-label={$_('common.next', { default: 'Next' })}
				>
					<ChevronRight class="h-3 w-3" />
				</Button>
			</div>
		{/if}
	{:else if !loading}
		<div
			class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
			data-testid="admin-subs-empty"
		>
			<PackageSearch class="h-10 w-10 opacity-40" />
			<p class="m-0 text-[13px]">
				{$_('admin.subscriptions.emptyText', {
					default: 'No subscriptions match the current filters.'
				})}
			</p>
		</div>
	{/if}
</section>

<!-- Drawer -->
<SubscriptionDetailDrawer
	bind:open={drawerOpen}
	subscription={drawerSub}
	onChanged={handleChanged}
/>
