<script lang="ts">
	/**
	 * Admin · Monetization · Plans Catalog（M22）
	 *
	 * Thin orchestrator — holds page-level state + data fetching,
	 * delegates rendering to feature components:
	 *   - PlansStatsBar: total / on-sale / archived counters
	 *   - PlansFilterBar: search + platform + status filters
	 *   - PlansGrid: card grid + loading skeleton + pagination + empty state
	 *   - PlanDeleteConfirmDialog: lightweight delete confirm
	 *   - PlanEditDialog: lazy-loaded create/edit form (dynamic import)
	 *
	 * 红线：
	 *   - NO QUENCH 皮肤（Zinc 中性 + 平台 accent dot）
	 *   - 全部 Select 用真实 sentinel；platform/status filter 用 '__all__'
	 *   - PlanEditDialog 走 dynamic import（lazy）
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Plus, RefreshCw, AlertTriangle } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import PlansStatsBar from '$lib/features/monetization/plans/PlansStatsBar.svelte';
	import PlansFilterBar from '$lib/features/monetization/plans/PlansFilterBar.svelte';
	import PlansGrid from '$lib/features/monetization/plans/PlansGrid.svelte';
	import PlanDeleteConfirmDialog from '$lib/features/monetization/plans/PlanDeleteConfirmDialog.svelte';
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
	const statusOptions = $derived([
		{ value: STATUS_ALL, label: $_('admin.plansCatalog.statusAll', { default: 'All statuses' }) },
		{ value: 'on_sale', label: $_('admin.plansCatalog.onSale', { default: 'On Sale' }) },
		{ value: 'archived', label: $_('admin.plansCatalog.offSale', { default: 'Archived' }) }
	]);

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

	// ── Delete confirm ─────────────────────────────────────────────────────
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
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadAll()}
				data-testid="plans-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button
				size="sm"
				onclick={openCreate}
				data-testid="plans-new"
			>
				<Plus class="h-3.5 w-3.5" />
				{$_('payment.admin.createPlan', { default: 'New Plan' })}
			</Button>
		</div>
	</div>

	<!-- Stats bar -->
	<PlansStatsBar total={plans.length} {activeCount} {archivedCount} />

	<!-- Load error -->
	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2" data-testid="plans-error">
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => loadPlans()}>
				{$_('common.confirm', { default: 'Retry' })}
			</Button>
		</Alert>
	{/if}

	<!-- Filter bar -->
	<PlansFilterBar
		bind:searchInput
		bind:platformFilter
		bind:statusFilter
		{platformOptions}
		{statusOptions}
		filteredCount={filteredPlans.length}
		totalCount={plans.length}
	/>

	<!-- Grid + loading + pagination + empty -->
	<PlansGrid
		{loading}
		{pagedPlans}
		allPlansCount={plans.length}
		{page}
		{totalPages}
		{sortLoading}
		{findGroup}
		{isGroupMissing}
		{globalIndexOf}
		onToggleSale={toggleSale}
		onEdit={openEdit}
		onDuplicate={duplicate}
		onDelete={openDeleteConfirm}
		onMoveUp={moveUp}
		onMoveDown={moveDown}
		onPageChange={(p) => (page = p)}
	/>
</section>

<!-- Delete confirm dialog -->
{#if deletingPlan}
	<PlanDeleteConfirmDialog
		bind:open={deleteConfirmOpen}
		{deleting}
		onConfirm={confirmDelete}
		onClose={closeDeleteConfirm}
	/>
{/if}

<!-- PlanEditDialog (dynamic) -->
{#if DialogComponent}
	{@const Dialog = DialogComponent}
	<Dialog bind:open={dialogOpen} plan={editingPlan} {groups} onSaved={handleSaved} />
{/if}
