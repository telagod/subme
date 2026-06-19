<script lang="ts">
	/**
	 * Admin · Monetization · Plans Catalog（M22）
	 *
	 * 与 Vue PlansCatalogView.vue 对齐：
	 *   - Header: title + New Plan + Refresh
	 *   - Stats bar: total / on-sale / archived
	 *   - Filter bar: search (name) + platform filter + status filter（'__all__' sentinel
	 *     per memory: reshadcn-migration）
	 *   - Card grid: 3-col responsive；pagination if > 24 cards (3-col × 8 rows)
	 *   - Empty / loading 状态
	 *
	 * 红线：
	 *   - NO QUENCH 皮肤（Zinc 中性 + 平台 accent dot）
	 *   - 全部 Select 用真实 sentinel；platform/status filter 用 '__all__'
	 *   - PlanEditDialog 走 dynamic import（lazy）—— catalog landing route 不背
	 *     180-行表单的 6KB。check-chunks 红线下我们把 lib/features/* 默认归 vendor，
	 *     但 dialog 通过 await import() 触发独立 lazy 解析。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Plus,
		RefreshCw,
		Search,
		PackageOpen,
		AlertTriangle,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';
	import PlanCard from '$lib/features/monetization/plans/PlanCard.svelte';
	import {
		listPlans,
		listGroups,
		archivePlan,
		restorePlan,
		duplicatePlan,
		deletePlan,
		persistSortOrder,
		type AdminPlan,
		type AdminGroupLite
	} from '$lib/api/admin/plans';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	const STATUS_ALL = '__all__';
	const PLATFORM_ALL = '__all__';

	let plans = $state<AdminPlan[]>([]);
	let groups = $state<AdminGroupLite[]>([]);
	let loading = $state(false);
	let sortLoading = $state(false);
	let loadError = $state<string | null>(null);

	let searchInput = $state('');
	let platformFilter = $state(PLATFORM_ALL);
	let statusFilter = $state(STATUS_ALL);

	let page = $state(1);
	const PAGE_SIZE = 24;

	// ── Dialog state（lazy-loaded） ─────────────────────────────────────────
	type DialogComponent = typeof import('$lib/features/monetization/plans/PlanEditDialog.svelte').default;
	let DialogComponent = $state<DialogComponent | null>(null);
	let dialogOpen = $state(false);
	let editingPlan = $state<AdminPlan | null>(null);

	// ── Delete confirm（inline native confirm placeholder; lightweight per page） ─
	let deletingPlan = $state<AdminPlan | null>(null);
	let deleteConfirmOpen = $state(false);
	let deleting = $state(false);

	function findGroup(id: number): AdminGroupLite | undefined {
		return groups.find((g) => g.id === id);
	}

	function isGroupMissing(id: number): boolean {
		return id > 0 && !groups.find((g) => g.id === id);
	}

	async function loadGroups() {
		try {
			groups = await listGroups();
		} catch {
			// Non-fatal — plans still render, group badges fall back to "missing".
			groups = [];
		}
	}

	async function loadPlans() {
		loading = true;
		loadError = null;
		try {
			plans = await listPlans();
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
			plans = [];
		} finally {
			loading = false;
		}
	}

	async function loadAll() {
		await Promise.all([loadGroups(), loadPlans()]);
	}

	onMount(() => {
		void loadAll();
	});

	// ── Filter pipeline ────────────────────────────────────────────────────
	const platformOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		const set = new Set<string>();
		for (const g of groups) {
			if (g.platform) set.add(g.platform);
		}
		return [
			{
				value: PLATFORM_ALL,
				label: $_('admin.plansCatalog.platformAll', { default: 'All platforms' })
			},
			...Array.from(set)
				.sort()
				.map((p) => ({ value: p, label: p }))
		];
	});

	const filteredPlans = $derived.by<AdminPlan[]>(() => {
		const q = searchInput.trim().toLowerCase();
		return plans.filter((p) => {
			if (statusFilter !== STATUS_ALL) {
				if (statusFilter === 'on_sale' && !p.for_sale) return false;
				if (statusFilter === 'archived' && p.for_sale) return false;
			}
			if (platformFilter !== PLATFORM_ALL) {
				const g = findGroup(p.group_id);
				if (!g || g.platform !== platformFilter) return false;
			}
			if (q) {
				if (!p.name.toLowerCase().includes(q)) return false;
			}
			return true;
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE)));

	// Reset page when filters change.
	$effect(() => {
		// Touch deps so effect re-runs.
		void searchInput;
		void platformFilter;
		void statusFilter;
		page = 1;
	});

	const pagedPlans = $derived.by<AdminPlan[]>(() => {
		const start = (page - 1) * PAGE_SIZE;
		return filteredPlans.slice(start, start + PAGE_SIZE);
	});

	const activeCount = $derived(plans.filter((p) => p.for_sale).length);
	const archivedCount = $derived(plans.length - activeCount);

	// ── Dialog open helpers ───────────────────────────────────────────────
	async function ensureDialogLoaded(): Promise<void> {
		if (DialogComponent) return;
		const mod = await import('$lib/features/monetization/plans/PlanEditDialog.svelte');
		DialogComponent = mod.default;
	}

	async function openCreate() {
		await ensureDialogLoaded();
		editingPlan = null;
		dialogOpen = true;
	}

	async function openEdit(plan: AdminPlan) {
		await ensureDialogLoaded();
		editingPlan = plan;
		dialogOpen = true;
	}

	function handleSaved() {
		void loadPlans();
	}

	// ── Per-card actions ───────────────────────────────────────────────────
	async function toggleSale(plan: AdminPlan) {
		try {
			if (plan.for_sale) {
				await archivePlan(plan.id);
				showSuccess($_('admin.plansCatalog.archived', { default: 'Plan archived' }));
			} else {
				await restorePlan(plan.id);
				showSuccess($_('admin.plansCatalog.published', { default: 'Plan published' }));
			}
			await loadPlans();
		} catch (err) {
			const e = err as Error;
			showError(e?.message ?? $_('common.error', { default: 'Error' }));
		}
	}

	async function duplicate(plan: AdminPlan) {
		try {
			await duplicatePlan(plan);
			showSuccess($_('admin.plansCatalog.duplicated', { default: 'Plan duplicated' }));
			await loadPlans();
		} catch (err) {
			const e = err as Error;
			showError(e?.message ?? $_('common.error', { default: 'Error' }));
		}
	}

	function openDeleteConfirm(plan: AdminPlan) {
		deletingPlan = plan;
		deleteConfirmOpen = true;
	}

	function closeDeleteConfirm() {
		if (deleting) return;
		deleteConfirmOpen = false;
		deletingPlan = null;
	}

	async function confirmDelete() {
		if (!deletingPlan || deleting) return;
		deleting = true;
		try {
			await deletePlan(deletingPlan.id);
			showSuccess($_('common.deleted', { default: 'Deleted successfully' }));
			deleteConfirmOpen = false;
			deletingPlan = null;
			await loadPlans();
		} catch (err) {
			const e = err as Error;
			showError(e?.message ?? $_('common.error', { default: 'Error' }));
		} finally {
			deleting = false;
		}
	}

	async function moveUp(globalIdx: number) {
		if (globalIdx === 0 || sortLoading) return;
		sortLoading = true;
		const next = [...plans];
		[next[globalIdx - 1], next[globalIdx]] = [next[globalIdx], next[globalIdx - 1]];
		plans = next;
		try {
			await persistSortOrder(next);
			await loadPlans();
		} finally {
			sortLoading = false;
		}
	}

	async function moveDown(globalIdx: number) {
		if (globalIdx === plans.length - 1 || sortLoading) return;
		sortLoading = true;
		const next = [...plans];
		[next[globalIdx], next[globalIdx + 1]] = [next[globalIdx + 1], next[globalIdx]];
		plans = next;
		try {
			await persistSortOrder(next);
			await loadPlans();
		} finally {
			sortLoading = false;
		}
	}

	function globalIndexOf(plan: AdminPlan): number {
		return plans.findIndex((p) => p.id === plan.id);
	}
</script>

<svelte:head>
	<title>{$_('admin.plansCatalog.title', { default: 'Plan Catalog' })} · sub2api admin</title>
</svelte:head>

<section class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground" data-testid="plans-catalog-page">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.plansCatalog.title', { default: 'Plan Catalog' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.plansCatalog.desc', {
					default: 'Operations mirror · What you see is what you sell'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
				disabled={loading}
				onclick={() => loadAll()}
				data-testid="plans-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</button>
			<button
				type="button"
				class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				onclick={openCreate}
				data-testid="plans-new"
			>
				<Plus class="h-3.5 w-3.5" />
				{$_('payment.admin.createPlan', { default: 'New Plan' })}
			</button>
		</div>
	</div>

	<!-- Stats bar -->
	<div
		class="flex items-center gap-5 rounded-xl border border-border bg-card px-[18px] py-3 shadow-sm"
		data-testid="plans-stats"
	>
		<div class="flex items-baseline gap-[7px]">
			<span class="font-mono text-[22px] font-bold tabular-nums text-foreground"
				>{plans.length}</span
			>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.plansCatalog.statTotal', { default: 'Total Plans' })}
			</span>
		</div>
		<div class="h-6 w-px bg-border" aria-hidden="true"></div>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-emerald-500"
				data-testid="plans-stat-on-sale"
			>
				{activeCount}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.plansCatalog.statOnSale', { default: 'On Sale' })}
			</span>
		</div>
		<div class="h-6 w-px bg-border" aria-hidden="true"></div>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-muted-foreground"
				data-testid="plans-stat-archived"
			>
				{archivedCount}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.plansCatalog.statOffSale', { default: 'Archived' })}
			</span>
		</div>
	</div>

	<!-- Load error -->
	{#if loadError}
		<div
			class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
			data-testid="plans-error"
		>
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<button
				type="button"
				class="ml-auto rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
				onclick={() => loadPlans()}
			>
				{$_('common.confirm', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- Filter bar -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
		data-testid="plans-filters"
	>
		<div class="relative">
			<Search
				class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="search"
				class="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
				placeholder={$_('admin.plansCatalog.searchPlaceholder', {
					default: 'Search plan name…'
				})}
				bind:value={searchInput}
				data-testid="plans-search"
			/>
		</div>

		<label class="ml-1 text-xs text-muted-foreground" for="plans-platform-filter">
			{$_('payment.admin.platform', { default: 'Platform' })}
		</label>
		<select
			id="plans-platform-filter"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={platformFilter}
			data-testid="plans-platform-filter"
		>
			{#each platformOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>

		<label class="ml-1 text-xs text-muted-foreground" for="plans-status-filter">
			{$_('common.status', { default: 'Status' })}
		</label>
		<select
			id="plans-status-filter"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={statusFilter}
			data-testid="plans-status-filter"
		>
			<option value={STATUS_ALL}>
				{$_('admin.plansCatalog.statusAll', { default: 'All statuses' })}
			</option>
			<option value="on_sale">
				{$_('admin.plansCatalog.onSale', { default: 'On Sale' })}
			</option>
			<option value="archived">
				{$_('admin.plansCatalog.offSale', { default: 'Archived' })}
			</option>
		</select>

		<div class="ml-auto text-xs text-muted-foreground tabular-nums">
			{filteredPlans.length} / {plans.length}
		</div>
	</div>

	<!-- Loading skeleton -->
	{#if loading && plans.length === 0}
		<div
			class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]"
			data-testid="plans-loading"
		>
			{#each Array(6) as _, i (i)}
				<div
					class="flex min-h-[220px] animate-pulse flex-col gap-3 rounded-xl border border-border bg-card p-5"
				>
					<div class="h-4 w-[70%] rounded-md bg-muted"></div>
					<div class="mt-1 h-7 w-[40%] rounded-md bg-muted"></div>
					<div class="h-3 w-[55%] rounded-md bg-muted"></div>
					<div class="h-3 w-[35%] rounded-md bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else if pagedPlans.length > 0}
		<!-- Card grid -->
		<div
			class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]"
			data-testid="plans-grid"
		>
			{#each pagedPlans as plan (plan.id)}
				{@const gidx = globalIndexOf(plan)}
				<PlanCard
					{plan}
					group={findGroup(plan.group_id)}
					groupMissing={isGroupMissing(plan.group_id)}
					isFirst={gidx === 0 || sortLoading}
					isLast={gidx === plans.length - 1 || sortLoading}
					onToggleSale={() => toggleSale(plan)}
					onEdit={() => openEdit(plan)}
					onDuplicate={() => duplicate(plan)}
					onDelete={() => openDeleteConfirm(plan)}
					onMoveUp={() => moveUp(gidx)}
					onMoveDown={() => moveDown(gidx)}
				/>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="flex items-center justify-center gap-2 pt-2"
				data-testid="plans-pagination"
			>
				<button
					type="button"
					class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted disabled:opacity-40"
					disabled={page === 1}
					onclick={() => (page = Math.max(1, page - 1))}
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
					disabled={page === totalPages}
					onclick={() => (page = Math.min(totalPages, page + 1))}
					aria-label={$_('common.next', { default: 'Next' })}
				>
					<ChevronRight class="h-3 w-3" />
				</button>
			</div>
		{/if}
	{:else if !loading}
		<!-- Empty state -->
		<div
			class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
			data-testid="plans-empty"
		>
			<PackageOpen class="h-10 w-10 opacity-40" />
			<p class="m-0 text-[13px]">
				{$_('admin.plansCatalog.emptyText', {
					default: 'No plans yet. Click "New Plan" to get started.'
				})}
			</p>
		</div>
	{/if}
</section>

<!-- Delete confirm dialog (lightweight, no extra dynamic import) -->
{#if deleteConfirmOpen && deletingPlan}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		data-testid="plans-delete-confirm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="plans-delete-title"
	>
		<div
			class="w-full max-w-[420px] rounded-lg border border-border bg-card p-5 shadow-lg"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div class="space-y-1.5">
					<h2 id="plans-delete-title" class="text-base font-semibold text-foreground">
						{$_('payment.admin.deletePlan', { default: 'Delete Plan' })}
					</h2>
					<p class="text-sm text-muted-foreground">
						{$_('payment.admin.deletePlanConfirm', {
							default: 'Are you sure you want to delete this plan?'
						})}
					</p>
				</div>
			</div>
			<div class="mt-5 flex items-center justify-end gap-2">
				<button
					type="button"
					class="inline-flex h-9 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
					disabled={deleting}
					onclick={closeDeleteConfirm}
					data-testid="plans-delete-cancel"
				>
					{$_('common.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					class="inline-flex h-9 items-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={deleting}
					onclick={confirmDelete}
					data-testid="plans-delete-confirm-btn"
				>
					{deleting
						? $_('common.submitting', { default: 'Submitting...' })
						: $_('common.delete', { default: 'Delete' })}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- PlanEditDialog (dynamic) -->
{#if DialogComponent}
	{@const Dialog = DialogComponent}
	<Dialog bind:open={dialogOpen} plan={editingPlan} {groups} onSaved={handleSaved} />
{/if}
