<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Fingerprint, Grid3x3, LayoutList, MoreHorizontal, Plus, RefreshCw, ShieldAlert, Upload, X } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import AccountFilterBar from '$lib/features/account/AccountFilterBar.svelte';
	import AccountsTable from '$lib/features/account/AccountsTable.svelte';
	import AccountCardWall from '$lib/features/account/AccountCardWall.svelte';
	import AccountBulkActions from '$lib/features/account/AccountBulkActions.svelte';
	import AccountFormDialog from '$lib/features/account/AccountFormDialog.svelte';
	import AccountToolsDialog from '$lib/features/account/AccountToolsDialog.svelte';
	import AccountReAuthDialog from '$lib/features/account/AccountReAuthDialog.svelte';
	import AccountAdvancedDialog from '$lib/features/account/AccountAdvancedDialog.svelte';
	import AccountDataDialog from '$lib/features/account/AccountDataDialog.svelte';
	import BulkEditDialog from '$lib/features/account/BulkEditDialog.svelte';
	import { listAccounts, refreshAccount, deleteAccount, getBatchAccountTodayStats, type Account, type AccountFilters, type WindowStats } from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, summarizeAccounts } from '$lib/features/supply/supply';

	// ── State ───────────────────────────────────────────────────────
	let rows = $state<Account[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let selectedIds = $state<Set<number>>(new Set());
	let todayStats = $state<Record<string, WindowStats>>({});

	// View mode
	let viewMode = $state<'table' | 'matrix'>('table');

	// Auto-refresh
	let autoRefreshEnabled = $state(false);
	let autoRefreshInterval = $state(30);
	let autoRefreshCountdown = $state(30);
	let autoRefreshTimer: ReturnType<typeof setInterval> | undefined;
	let showAutoRefreshMenu = $state(false);

	// Tools menu
	let showToolsMenu = $state(false);

	// Filters
	let search = $state('');
	let platformF = $state(ALL);
	let typeF = $state(ALL);
	let statusF = $state(ALL);
	let groupF = $state('');
	let privacyF = $state(ALL);
	let schedulableF = $state(ALL);
	let hasProxyF = $state(ALL);
	let showFilters = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// Dialogs
	let formOpen = $state(false);
	let formAccount = $state<Account | null>(null);
	let toolsOpen = $state(false);
	let toolsAccount = $state<Account | null>(null);
	let reauthOpen = $state(false);
	let reauthAccount = $state<Account | null>(null);
	let advancedOpen = $state(false);
	let dataOpen = $state(false);
	let exportJson = $state('');
	let bulkEditOpen = $state(false);
	let bulkEditMode = $state<'selected' | 'filtered'>('selected');
	let bulkEditIds = $state<number[]>([]);
	let bulkActionsRef: AccountBulkActions | undefined = $state();

	// ── Derived ─────────────────────────────────────────────────────
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeAccounts(rows));
	const activeFilterCount = $derived(
		[platformF !== ALL, typeF !== ALL, statusF !== ALL, groupF.trim() !== '',
		 privacyF !== ALL, schedulableF !== ALL, hasProxyF !== ALL].filter(Boolean).length
	);
	const hasActiveFilters = $derived(activeFilterCount > 0 || search.trim() !== '');

	// ── Auto-refresh logic ──────────────────────────────────────────
	function startAutoRefresh() {
		stopAutoRefresh();
		if (!autoRefreshEnabled) return;
		autoRefreshCountdown = autoRefreshInterval;
		autoRefreshTimer = setInterval(() => {
			autoRefreshCountdown--;
			if (autoRefreshCountdown <= 0) {
				void loadRows();
				autoRefreshCountdown = autoRefreshInterval;
			}
		}, 1000);
	}
	function stopAutoRefresh() {
		if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = undefined; }
	}
	function toggleAutoRefresh() {
		autoRefreshEnabled = !autoRefreshEnabled;
		if (autoRefreshEnabled) startAutoRefresh(); else stopAutoRefresh();
	}
	function setAutoRefreshInterval(sec: number) {
		autoRefreshInterval = sec;
		if (autoRefreshEnabled) startAutoRefresh();
		showAutoRefreshMenu = false;
	}

	// ── Data loading ────────────────────────────────────────────────
	function buildFilters(): AccountFilters {
		return {
			platform: platformF === ALL ? undefined : platformF,
			type: typeF === ALL ? undefined : typeF,
			status: statusF === ALL ? undefined : statusF,
			group: groupF.trim() || undefined,
			privacy_mode: privacyF === ALL ? undefined : privacyF,
			schedulable: schedulableF === ALL ? undefined : schedulableF,
			has_proxy: hasProxyF === ALL ? undefined : hasProxyF,
			search: search.trim() || undefined,
			sort_by: 'created_at', sort_order: 'desc' as const, lite: 'true'
		};
	}

	async function loadRows() {
		loading = true; loadError = null;
		try {
			const r = await listAccounts(page, PAGE_SIZE, buildFilters());
			rows = r.items; total = r.total;
			const present = new Set(rows.map(r => r.id));
			selectedIds = new Set([...selectedIds].filter(id => present.has(id)));
			if (rows.length > 0) {
				try {
					const batch = await getBatchAccountTodayStats(rows.map(r => r.id));
					todayStats = batch.stats ?? {};
				} catch { /* non-critical */ }
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = []; total = 0;
		} finally { loading = false; }
	}

	function debouncedSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => { page = 1; void loadRows(); }, 300);
	}
	function apply() { page = 1; void loadRows(); }
	function clearFilters() {
		search = ''; platformF = ALL; typeF = ALL; statusF = ALL;
		groupF = ''; privacyF = ALL; schedulableF = ALL; hasProxyF = ALL;
		apply();
	}

	// ── Selection ───────────────────────────────────────────────────
	function toggleSel(id: number) {
		const n = new Set(selectedIds);
		if (n.has(id)) n.delete(id); else n.add(id);
		selectedIds = n;
	}
	function togglePage() {
		const allSel = rows.length > 0 && rows.every(r => selectedIds.has(r.id));
		if (allSel) { const n = new Set(selectedIds); for (const r of rows) n.delete(r.id); selectedIds = n; }
		else { selectedIds = new Set([...selectedIds, ...rows.map(r => r.id)]); }
	}

	// ── Actions ─────────────────────────────────────────────────────
	function openCreate() { formAccount = null; formOpen = true; }
	function openEdit(a: Account) { formAccount = a; formOpen = true; }
	function openTools(a: Account) { toolsAccount = a; toolsOpen = true; }
	function openReAuth(a: Account) { reauthAccount = a; reauthOpen = true; }
	function handleOpenData(json?: string) { if (json) exportJson = json; dataOpen = true; }
	function handleOpenBulkEdit(mode: 'selected' | 'filtered', ids: number[]) {
		bulkEditMode = mode; bulkEditIds = ids; bulkEditOpen = true;
	}
	async function handleRefreshOne(a: Account) {
		try { await refreshAccount(a.id); showSuccess('Token refreshed'); void loadRows(); }
		catch (e) { showError((e as Error)?.message ?? 'Refresh failed'); }
	}
	async function handleDeleteOne(a: Account) {
		if (!confirm(`Delete ${a.name}?`)) return;
		try { await deleteAccount(a.id); showSuccess('Account deleted'); void loadRows(); }
		catch (e) { showError((e as Error)?.message ?? 'Delete failed'); }
	}
	async function filteredIds(): Promise<number[]> {
		const probe = await listAccounts(1, 1, buildFilters());
		if (probe.total === 0) return [];
		const all = await listAccounts(1, probe.total, buildFilters());
		return all.items.map(r => r.id);
	}

	onMount(() => void loadRows());
	onDestroy(stopAutoRefresh);
</script>

<svelte:head><title>{$_('admin.accounts.title', { default: 'Account Pool' })}</title></svelte:head>

<div class="flex h-full flex-col gap-3 p-4">
	<!-- ── Toolbar ── -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Search -->
		<Input
			class="h-8 min-w-[160px] max-w-[240px] flex-1 text-[13px]"
			placeholder={$_('admin.accounts.searchPlaceholder', { default: 'Search name, email...' })}
			bind:value={search}
			oninput={debouncedSearch}
			data-testid="accounts-toolbar-search"
		/>

		<!-- Refresh split button -->
		<div class="flex items-stretch">
			<Button variant="outline" size="icon" class={'h-8 w-8 rounded-r-none border-r-0 ' + (autoRefreshEnabled ? 'border-primary/50' : '')}
				onclick={() => { void loadRows(); autoRefreshCountdown = autoRefreshInterval; }}
				title={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />
			</Button>
			<div class="relative">
				<Button variant="outline" size="icon" class={'h-8 w-6 rounded-l-none px-0.5 ' + (autoRefreshEnabled ? 'border-primary/50 text-primary' : '')}
					onclick={() => (showAutoRefreshMenu = !showAutoRefreshMenu)}
				>
					{#if autoRefreshEnabled && autoRefreshCountdown > 0}
						<span class="font-mono text-[10px] tabular-nums">{autoRefreshCountdown}</span>
					{:else}
						<ChevronDown size={11} />
					{/if}
				</Button>
				{#if showAutoRefreshMenu}
					<div class="absolute right-0 top-[calc(100%+4px)] z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
						<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-xs font-normal" onclick={toggleAutoRefresh}>
							<span class="inline-flex">{autoRefreshEnabled ? "✓" : "○"}</span>
							{$_('admin.accounts.autoRefresh', { default: 'Auto refresh' })}
						</Button>
						<div class="my-1 h-px bg-border"></div>
						{#each [10, 30, 60] as sec}
							<Button variant="ghost" class={'flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-xs font-normal ' + (autoRefreshInterval === sec ? 'text-primary' : '')}
								onclick={() => setAutoRefreshInterval(sec)}>
								{sec}{$_('common.seconds', { default: 's' })}
							</Button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Tools menu -->
		<div class="relative">
			<Button variant="outline" size="icon" class="h-8 w-8"
				onclick={() => (showToolsMenu = !showToolsMenu)}
				title={$_('admin.accounts.moreTools', { default: 'More tools' })}
			>
				<MoreHorizontal size={15} />
			</Button>
			{#if showToolsMenu}
				<div class="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg">
					<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-[13px] font-normal"
						onclick={() => { showToolsMenu = false; advancedOpen = true; }}>
						<RefreshCw size={13} />
						{$_('admin.accounts.toolsSync', { default: 'Sync models' })}
					</Button>
					<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-[13px] font-normal"
						onclick={() => { showToolsMenu = false; handleOpenData(); }}>
						<Upload size={13} />
						{$_('admin.accounts.toolsImport', { default: 'Import data' })}
					</Button>
					<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-[13px] font-normal"
						onclick={() => { showToolsMenu = false; handleOpenData(); }}>
						<Download size={13} />
						{$_('admin.accounts.toolsExport', { default: 'Export data' })}
					</Button>
					<div class="my-1 h-px bg-border"></div>
					<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-[13px] font-normal"
						onclick={() => { showToolsMenu = false; advancedOpen = true; }}>
						<ShieldAlert size={13} />
						{$_('admin.accounts.toolsErrorPassthrough', { default: 'Error passthrough' })}
					</Button>
					<Button variant="ghost" class="flex w-full items-center gap-2 justify-start h-auto px-2.5 py-1.5 text-[13px] font-normal"
						onclick={() => { showToolsMenu = false; advancedOpen = true; }}>
						<Fingerprint size={13} />
						{$_('admin.accounts.toolsTLS', { default: 'TLS profiles' })}
					</Button>
				</div>
			{/if}
		</div>

		<!-- View mode toggle -->
		<div class="flex overflow-hidden rounded-lg border border-border" role="group">
			<Button variant="ghost" size="icon" class={'h-8 w-8 rounded-none border-r border-border ' + (viewMode === 'matrix' ? 'bg-primary/10 text-primary' : '')}
				onclick={() => (viewMode = 'matrix')} title={$_('admin.accounts.viewMatrix', { default: 'Card view' })}>
				<Grid3x3 size={14} />
			</Button>
			<Button variant="ghost" size="icon" class={'h-8 w-8 rounded-none ' + (viewMode === 'table' ? 'bg-primary/10 text-primary' : '')}
				onclick={() => (viewMode = 'table')} title={$_('admin.accounts.viewTable', { default: 'Table view' })}>
				<LayoutList size={14} />
			</Button>
		</div>

		<div class="h-6 w-px bg-border"></div>

		<!-- Filters toggle -->
		<Button variant="outline" size="sm" class={'h-8 gap-1.5 text-xs ' + (showFilters ? 'border-primary/40 text-primary bg-primary/5' : '')}
			onclick={() => (showFilters = !showFilters)}>
			<Filter size={12} />
			{showFilters ? $_('admin.accounts.hideFilters', { default: 'Hide filters' }) : $_('admin.accounts.showFilters', { default: 'Filters' })}
			{#if activeFilterCount > 0}
				<span class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-1 font-mono text-[10px] text-primary">{activeFilterCount}</span>
			{/if}
		</Button>
		{#if hasActiveFilters}
			<Button variant="ghost" size="sm" class="h-8 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onclick={clearFilters}>
				<X size={12} /> {$_('admin.accounts.clearAll', { default: 'Clear all' })}
			</Button>
		{/if}

		<div class="h-6 w-px bg-border"></div>

		<!-- Summary strip -->
		<div class="inline-flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1 text-xs shadow-sm">
			{#each summary as item}
				<span class="inline-flex items-baseline gap-1 whitespace-nowrap">
					<span class="text-muted-foreground">{item.label}</span>
					<span class="font-mono text-sm font-semibold tabular-nums">{item.value}</span>
				</span>
				{#if item !== summary[summary.length - 1]}
					<span class="text-border">·</span>
				{/if}
			{/each}
		</div>

		<!-- New account (push right) -->
		<Button variant="outline" size="sm" class="ml-auto h-8 gap-1.5 font-semibold" onclick={openCreate} data-testid="accounts-add-btn">
			<Plus size={13} /> {$_('admin.accounts.newAccount', { default: 'New account' })}
		</Button>
	</div>

	<!-- Filters panel (always in DOM for test compat, visually hidden when collapsed) -->
	<div class={showFilters ? '' : 'hidden'}>
		<AccountFilterBar
			bind:search bind:platform={platformF} bind:type={typeF} bind:status={statusF}
			bind:group={groupF} bind:privacy={privacyF} bind:schedulable={schedulableF} bind:hasProxy={hasProxyF}
			onApply={apply}
		/>
	</div>

	<!-- Bulk actions bar -->
	{#if viewMode === 'table'}
		<AccountBulkActions bind:this={bulkActionsRef}
			{selectedIds} {total} {hasActiveFilters} filters={buildFilters}
			onRefresh={loadRows} onOpenData={handleOpenData}
			onOpenAdvanced={() => { advancedOpen = true; }}
			onOpenBulkEdit={handleOpenBulkEdit}
		/>
	{/if}

	{#if loadError}<Alert variant="destructive">{loadError}</Alert>{/if}

	<!-- Main content -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if viewMode === 'matrix'}
			<AccountCardWall accounts={rows} {loading}
				onEdit={openEdit} onRefresh={handleRefreshOne} onDelete={handleDeleteOne} onAdd={openCreate} />
		{:else}
			<AccountsTable {rows} {loading} {selectedIds} {todayStats}
				onToggleSelection={toggleSel} onTogglePage={togglePage}
				onEdit={openEdit} onTools={openTools} onReAuth={openReAuth}
				onTempHold={(a) => bulkActionsRef?.openTempHold(a)} onRefresh={loadRows} />
		{/if}
	</div>

	<!-- Pagination (table mode) -->
	{#if viewMode === 'table' && total > 0}
		<div class="flex shrink-0 items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-sm">
			<span class="text-muted-foreground">
				{$_('admin.accounts.totalCount', { default: '{total} accounts', values: { total } })}
				{#if totalPages > 1} · {$_('admin.accounts.pageInfo', { default: 'Page {page}/{pages}', values: { page, pages: totalPages } })}{/if}
			</span>
			{#if totalPages > 1}
				<div class="flex gap-1.5">
					<Button variant="outline" size="sm" disabled={page <= 1} onclick={() => { page--; void loadRows(); }}><ChevronLeft size={16} /></Button>
					<Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => { page++; void loadRows(); }}><ChevronRight size={16} /></Button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Dialogs / Drawers -->
<AccountFormDialog bind:open={formOpen} account={formAccount}
	defaultPlatform={platformF === ALL ? 'openai' : platformF}
	onSaved={loadRows} onClose={() => {}} />
<AccountToolsDialog bind:open={toolsOpen} account={toolsAccount} onRefresh={loadRows} onClose={() => {}} />
<AccountReAuthDialog bind:open={reauthOpen} account={reauthAccount} onApplied={loadRows} onClose={() => {}} />
<AccountAdvancedDialog bind:open={advancedOpen} onRefresh={loadRows} onClose={() => {}} />
<AccountDataDialog bind:open={dataOpen} {selectedIds} {exportJson} onRefresh={loadRows} onClose={() => {}} />
<BulkEditDialog bind:open={bulkEditOpen} mode={bulkEditMode} selectedIds={bulkEditIds}
	{filteredIds} previewCount={bulkEditIds.length} accounts={rows} onDone={loadRows} />
