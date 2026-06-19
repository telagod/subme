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
	 *   - 订阅退款走 /admin/subscriptions/:id/refund（订阅 surface），不触 orders surface 的退款。
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
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import SubscriptionDetailDrawer from '$lib/features/monetization/subscriptions-admin/SubscriptionDetailDrawer.svelte';
	import RefundDialog from '$lib/features/monetization/subscriptions-admin/RefundDialog.svelte';
	import {
		listAdminSubs,
		type AdminSubscription,
		type AdminSubFilter
	} from '$lib/api/admin/subscriptions';
	import { listPlans, type AdminPlan } from '$lib/api/admin/plans';

	const STATUS_ALL = '__all__';
	const PLAN_ALL = '__all__';
	const VIRTUAL_THRESHOLD = 50;

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

	// Drawer + refund dialog
	let drawerOpen = $state(false);
	let drawerSub = $state<AdminSubscription | null>(null);
	let refundOpen = $state(false);
	let refundSubState = $state<AdminSubscription | null>(null);

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

	function openRefund(sub: AdminSubscription) {
		refundSubState = sub;
		refundOpen = true;
	}

	function handleChanged() {
		void loadSubs();
	}

	function handleRefunded() {
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
					default: 'Live subscription ledger · manage cancellations, refunds and extensions'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
				disabled={loading}
				onclick={() => loadSubs()}
				data-testid="admin-subs-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</button>
		</div>
	</div>

	<!-- Stats bar -->
	<div
		class="flex items-center gap-5 rounded-xl border border-border bg-card px-[18px] py-3 shadow-sm"
		data-testid="admin-subs-stats"
	>
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
	</div>

	<!-- Load error -->
	{#if loadError}
		<div
			class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
			data-testid="admin-subs-error"
		>
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<button
				type="button"
				class="ml-auto rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
				onclick={() => loadSubs()}
			>
				{$_('common.confirm', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- Filter bar -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
		data-testid="admin-subs-filters"
	>
		<div class="relative">
			<Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
			<input
				type="search"
				class="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
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
		<select
			id="admin-subs-status-filter"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={statusFilter}
			onchange={() => loadSubs()}
			data-testid="admin-subs-status-filter"
		>
			<option value={STATUS_ALL}>
				{$_('admin.subscriptions.statusAll', { default: 'All statuses' })}
			</option>
			<option value="active">
				{$_('admin.subscriptions.statusActive', { default: 'Active' })}
			</option>
			<option value="cancelled">
				{$_('admin.subscriptions.statusCancelled', { default: 'Cancelled' })}
			</option>
			<option value="expired">
				{$_('admin.subscriptions.statusExpired', { default: 'Expired' })}
			</option>
		</select>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-plan-filter">
			{$_('admin.subscriptions.planLabel', { default: 'Plan' })}
		</label>
		<select
			id="admin-subs-plan-filter"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={planFilter}
			onchange={() => loadSubs()}
			data-testid="admin-subs-plan-filter"
		>
			{#each planOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-after">
			{$_('admin.subscriptions.expiresAfter', { default: 'Expires after' })}
		</label>
		<input
			id="admin-subs-expires-after"
			type="date"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={expiresAfter}
			onchange={() => loadSubs()}
			data-testid="admin-subs-expires-after"
		/>
		<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-before">
			{$_('admin.subscriptions.expiresBefore', { default: 'Expires before' })}
		</label>
		<input
			id="admin-subs-expires-before"
			type="date"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={expiresBefore}
			onchange={() => loadSubs()}
			data-testid="admin-subs-expires-before"
		/>
	</div>

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
		<div
			class="overflow-hidden rounded-md border border-border bg-card"
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
						<div
							role="button"
							tabindex="0"
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
								<span
									class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(sub.status)}"
								>
									{sub.status}
								</span>
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
							<div class="flex justify-end gap-1">
								<button
									type="button"
									class="rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] hover:bg-muted"
									onclick={(e) => {
										e.stopPropagation();
										openRefund(sub);
									}}
									data-testid="admin-subs-refund-quick"
								>
									{$_('admin.subscriptions.refundQuick', { default: 'Refund' })}
								</button>
							</div>
						</div>
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
							<div
								role="button"
								tabindex="0"
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
									<span
										class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(sub.status)}"
									>
										{sub.status}
									</span>
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
								<div class="flex justify-end gap-1">
									<button
										type="button"
										class="rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] hover:bg-muted"
										onclick={(e) => {
											e.stopPropagation();
											openRefund(sub);
										}}
										data-testid="admin-subs-refund-quick"
									>
										{$_('admin.subscriptions.refundQuick', { default: 'Refund' })}
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="flex items-center justify-center gap-2 pt-1"
				data-testid="admin-subs-pagination"
			>
				<button
					type="button"
					class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted disabled:opacity-40"
					disabled={page === 1 || loading}
					onclick={() => {
						page = Math.max(1, page - 1);
						void loadSubs();
					}}
					aria-label={$_('common.back', { default: 'Previous' })}
				>
					<ChevronLeft class="h-3 w-3" />
				</button>
				<span class="text-xs tabular-nums text-muted-foreground">
					{page} / {totalPages}
				</span>
				<button
					type="button"
					class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted disabled:opacity-40"
					disabled={page === totalPages || loading}
					onclick={() => {
						page = Math.min(totalPages, page + 1);
						void loadSubs();
					}}
					aria-label={$_('common.next', { default: 'Next' })}
				>
					<ChevronRight class="h-3 w-3" />
				</button>
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
	onRequestRefund={(sub) => {
		refundSubState = sub;
		refundOpen = true;
	}}
/>

<!-- Refund -->
<RefundDialog
	bind:open={refundOpen}
	subscription={refundSubState}
	onRefunded={handleRefunded}
/>
