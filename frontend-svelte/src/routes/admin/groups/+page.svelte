<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, Plus, RefreshCw } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import GroupFilterBar from '$lib/features/groups/GroupFilterBar.svelte';
	import GroupsTable from '$lib/features/groups/GroupsTable.svelte';
	import GroupEditDialog from '$lib/features/groups/GroupEditDialog.svelte';
	import GroupControlsDrawer from '$lib/features/groups/GroupControlsDrawer.svelte';
	import {
		deleteGroup,
		getGroupCapacitySummary,
		getGroupUsageSummary,
		listGroups,
		updateGroupSortOrder,
		type AdminGroup,
		type GroupCapacitySummary,
		type GroupUsageSummary
	} from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, summarizeGroups } from '$lib/features/supply/supply';

	// ── Page state ───────────────────────────────────────────────────────────
	let rows = $state<AdminGroup[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let platformFilter = $state(ALL);
	let statusFilter = $state(ALL);
	let sortDrafts = $state<Record<number, string>>({});
	let usageSummary = $state<GroupUsageSummary[]>([]);
	let capacitySummary = $state<GroupCapacitySummary[]>([]);

	// ── Dialog state ─────────────────────────────────────────────────────────
	let dialogOpen = $state(false);
	let editing = $state<AdminGroup | null>(null);
	let controlsOpen = $state(false);
	let controlsGroup = $state<AdminGroup | null>(null);
	let controlsLoading = $state(false);
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<(() => Promise<void>) | null>(null);

	// ── Component refs ───────────────────────────────────────────────────────
	let editDialogRef = $state<ReturnType<typeof GroupEditDialog> | undefined>();
	let controlsDrawerRef = $state<ReturnType<typeof GroupControlsDrawer> | undefined>();

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeGroups(rows));

	// ── Data fetching ────────────────────────────────────────────────────────
	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const filters = {
				platform: platformFilter === ALL ? undefined : platformFilter,
				status: statusFilter === ALL ? undefined : statusFilter,
				search: searchInput.trim() || undefined,
				sort_by: 'sort_order',
				sort_order: 'asc' as const
			};
			const [resp, usage, capacity] = await Promise.all([
				listGroups(page, PAGE_SIZE, filters),
				getGroupUsageSummary(),
				getGroupCapacitySummary()
			]);
			rows = resp.items;
			total = resp.total;
			usageSummary = usage;
			capacitySummary = capacity;
			sortDrafts = Object.fromEntries(rows.map((row, index) => [row.id, String(row.sort_order ?? index + 1)]));
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
			usageSummary = [];
			capacitySummary = [];
			sortDrafts = {};
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadRows();
	});

	function applyFilters() {
		page = 1;
		void loadRows();
	}

	// ── Sort order ───────────────────────────────────────────────────────────
	function setSortDraft(id: number, value: string) {
		sortDrafts = { ...sortDrafts, [id]: value };
	}

	async function saveSortOrder() {
		const updates = rows
			.map((row, index) => ({
				id: row.id,
				sort_order: Number(sortDrafts[row.id] ?? row.sort_order ?? index + 1)
			}))
			.filter((entry) => Number.isFinite(entry.sort_order));
		if (updates.length === 0) return;
		saving = true;
		try {
			await updateGroupSortOrder(updates);
			showSuccess('Group sort order saved');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	// ── Dialog handlers ──────────────────────────────────────────────────────
	function openCreate() {
		editing = null;
		editDialogRef?.openCreate(platformFilter);
	}

	function openEdit(group: AdminGroup) {
		editing = group;
		editDialogRef?.openEdit(group);
	}

	function openControls(group: AdminGroup) {
		controlsGroup = group;
		controlsDrawerRef?.openControls(group);
	}

	// ── Confirm dialog ───────────────────────────────────────────────────────
	function openConfirm(title: string, message: string, action: () => Promise<void>) {
		confirmTitle = title;
		confirmMessage = message;
		confirmAction = action;
		confirmOpen = true;
	}

	async function runConfirmedAction() {
		if (!confirmAction) return;
		await confirmAction();
	}

	function removeGroup(group: AdminGroup) {
		openConfirm('Delete group', `Delete group "${group.name}"? This action cannot be undone.`, async () => {
			saving = true;
			try {
				await deleteGroup(group.id);
				confirmOpen = false;
				confirmAction = null;
				showSuccess('Group deleted');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				saving = false;
			}
		});
	}

	function handlePageChange(newPage: number) {
		page = newPage;
		void loadRows();
	}

	function handleControlsConfirm(title: string, message: string, action: () => Promise<void>) {
		openConfirm(title, message, async () => {
			await action();
			confirmOpen = false;
			confirmAction = null;
		});
	}
</script>

<svelte:head>
	<title>{$_('admin.groups.title', { default: 'Groups & Routing' })}</title>
</svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M13 · Supply</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.groups.title', { default: 'Groups & Routing' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.groups.description', { default: 'Manage group routing, platform isolation, account capacity, and subscription visibility.' })}
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
			</Button>
			<Button variant="outline" onclick={saveSortOrder} disabled={saving || loading || rows.length === 0}>
				Save sort
			</Button>
			<Button onclick={openCreate}>
				<Plus size={16} /> New group
			</Button>
		</div>
	</header>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-2 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</div>

	<GroupFilterBar bind:searchInput bind:platformFilter bind:statusFilter onApply={applyFilters} />

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

	<GroupsTable
		{rows}
		{total}
		{loading}
		{saving}
		{page}
		{totalPages}
		{sortDrafts}
		{usageSummary}
		{capacitySummary}
		{controlsLoading}
		onPageChange={handlePageChange}
		onSortDraftChange={setSortDraft}
		onOpenControls={openControls}
		onOpenEdit={openEdit}
		onRemove={removeGroup}
		onReload={loadRows}
	/>
</section>

<!-- ── Dialogs ─────────────────────────────────────────────────────────── -->

<GroupEditDialog
	bind:this={editDialogRef}
	bind:open={dialogOpen}
	{editing}
	{rows}
	onClose={() => (dialogOpen = false)}
	onSaved={loadRows}
/>

<GroupControlsDrawer
	bind:this={controlsDrawerRef}
	bind:open={controlsOpen}
	group={controlsGroup}
	onClose={() => (controlsOpen = false)}
	onReload={loadRows}
	onConfirm={handleControlsConfirm}
/>

<StandardDialog bind:open={confirmOpen} title={confirmTitle} width="sm" data-testid="groups-confirm-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{confirmMessage}
		</p>
		<div class="flex justify-end gap-2 border-t border-border pt-4">
			<Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
			<Button
				variant="outline"
				class="border-destructive/30 text-destructive hover:bg-destructive/10"
				disabled={saving || !confirmAction}
				onclick={runConfirmedAction}
				data-testid="groups-confirm-action"
			>
				{saving ? 'Working...' : 'Confirm'}
			</Button>
		</div>
	</div>
</StandardDialog>
