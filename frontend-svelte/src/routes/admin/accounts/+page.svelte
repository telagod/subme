<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Plus, RefreshCw } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import AccountFilterBar from '$lib/features/account/AccountFilterBar.svelte';
	import AccountsTable from '$lib/features/account/AccountsTable.svelte';
	import AccountBulkActions from '$lib/features/account/AccountBulkActions.svelte';
	import AccountFormDialog from '$lib/features/account/AccountFormDialog.svelte';
	import AccountToolsDialog from '$lib/features/account/AccountToolsDialog.svelte';
	import AccountReAuthDialog from '$lib/features/account/AccountReAuthDialog.svelte';
	import AccountAdvancedDialog from '$lib/features/account/AccountAdvancedDialog.svelte';
	import AccountDataDialog from '$lib/features/account/AccountDataDialog.svelte';
	import BulkEditDialog from '$lib/features/account/BulkEditDialog.svelte';
	import { listAccounts, getBatchAccountTodayStats, type Account, type AccountFilters, type WindowStats } from '$lib/api/admin/accounts';
	import { showError } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, summarizeAccounts } from '$lib/features/supply/supply';

	let rows = $state<Account[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let selectedIds = $state<Set<number>>(new Set());
	let todayStats = $state<Record<string, WindowStats>>({});

	// Filter state (bound to AccountFilterBar)
	let search = $state('');
	let platformF = $state(ALL);
	let typeF = $state(ALL);
	let statusF = $state(ALL);
	let groupF = $state('');
	let privacyF = $state(ALL);
	let schedulableF = $state(ALL);
	let hasProxyF = $state(ALL);

	// Dialog state
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

	// Bulk actions component reference
	let bulkActionsRef: AccountBulkActions | undefined = $state();

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeAccounts(rows));
	const hasActiveFilters = $derived(
		search.trim() !== '' || platformF !== ALL || typeF !== ALL ||
		statusF !== ALL || groupF.trim() !== '' || privacyF !== ALL ||
		schedulableF !== ALL || hasProxyF !== ALL
	);

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
			sort_by: 'created_at',
			sort_order: 'desc' as const,
			lite: 'true'
		};
	}

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const r = await listAccounts(page, PAGE_SIZE, buildFilters());
			rows = r.items;
			total = r.total;
			const present = new Set(rows.map(r => r.id));
			selectedIds = new Set([...selectedIds].filter(id => present.has(id)));
			// Fetch today stats for visible rows
			if (rows.length > 0) {
				try {
					const ids = rows.map(r => r.id);
					const batch = await getBatchAccountTodayStats(ids);
					todayStats = batch.stats ?? {};
				} catch { /* stats are non-critical */ }
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function apply() { page = 1; void loadRows(); }

	function toggleSel(id: number) {
		const n = new Set(selectedIds);
		if (n.has(id)) n.delete(id); else n.add(id);
		selectedIds = n;
	}

	function togglePage() {
		const allSel = rows.length > 0 && rows.every(r => selectedIds.has(r.id));
		if (allSel) {
			const n = new Set(selectedIds);
			for (const r of rows) n.delete(r.id);
			selectedIds = n;
		} else {
			selectedIds = new Set([...selectedIds, ...rows.map(r => r.id)]);
		}
	}

	function openCreate() { formAccount = null; formOpen = true; }
	function openEdit(a: Account) { formAccount = a; formOpen = true; }
	function openTools(a: Account) { toolsAccount = a; toolsOpen = true; }
	function openReAuth(a: Account) { reauthAccount = a; reauthOpen = true; }

	function handleOpenData(json?: string) {
		if (json) exportJson = json;
		dataOpen = true;
	}

	function handleOpenBulkEdit(mode: 'selected' | 'filtered', ids: number[]) {
		bulkEditMode = mode;
		bulkEditIds = ids;
		bulkEditOpen = true;
	}

	async function filteredIds(): Promise<number[]> {
		const probe = await listAccounts(1, 1, buildFilters());
		if (probe.total === 0) return [];
		const all = await listAccounts(1, probe.total, buildFilters());
		return all.items.map(r => r.id);
	}

	onMount(() => void loadRows());
</script>

<svelte:head><title>{$_('admin.accountsQuench.title', { default: '账户池' })}</title></svelte:head>

<section class="space-y-5">
	<!-- Header -->
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">
				{$_('admin.accountsQuench.title', { default: '账户池' })}
			</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.accountsQuench.description', { default: '管理上游账户、分组绑定、代理回退状态和池模式路由。' })}
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={16} class={loading ? 'animate-spin' : ''} />
				{$_('common.refresh', { default: '刷新' })}
			</Button>
			<Button onclick={openCreate}>
				<Plus size={16} />{$_('admin.accounts.newAccount', { default: '新建账户' })}
			</Button>
		</div>
	</header>

	<!-- Stats row -->
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-2 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</div>

	<!-- Filters -->
	<AccountFilterBar
		bind:search
		bind:platform={platformF}
		bind:type={typeF}
		bind:status={statusF}
		bind:group={groupF}
		bind:privacy={privacyF}
		bind:schedulable={schedulableF}
		bind:hasProxy={hasProxyF}
		onApply={apply}
	/>

	<!-- Bulk actions toolbar -->
	<AccountBulkActions
		bind:this={bulkActionsRef}
		{selectedIds}
		{total}
		{hasActiveFilters}
		filters={buildFilters}
		onRefresh={loadRows}
		onOpenData={handleOpenData}
		onOpenAdvanced={() => { advancedOpen = true; }}
		onOpenBulkEdit={handleOpenBulkEdit}
	/>

	{#if loadError}<Alert variant="destructive">{loadError}</Alert>{/if}

	<!-- Accounts table -->
	<AccountsTable
		{rows}
		{loading}
		{selectedIds}
		{todayStats}
		onToggleSelection={toggleSel}
		onTogglePage={togglePage}
		onEdit={openEdit}
		onTools={openTools}
		onReAuth={openReAuth}
		onTempHold={(a) => bulkActionsRef?.openTempHold(a)}
		onRefresh={loadRows}
	/>

	<!-- Pagination -->
	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<p>{$_('admin.accounts.totalCount', { default: '共 {total} 个账户', values: { total } })}
			{#if totalPages > 1} · {$_('admin.accounts.pageInfo', { default: '第 {page}/{pages} 页', values: { page, pages: totalPages } })}{/if}
		</p>
		{#if totalPages > 1}
			<div class="flex gap-1.5">
				<Button variant="outline" size="sm" disabled={page <= 1} onclick={() => { page--; void loadRows(); }}>←</Button>
				<Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => { page++; void loadRows(); }}>→</Button>
			</div>
		{/if}
	</div>
</section>

<!-- Dialogs -->
<AccountFormDialog
	bind:open={formOpen}
	account={formAccount}
	defaultPlatform={platformF === ALL ? 'openai' : platformF}
	onSaved={loadRows}
	onClose={() => {}}
/>
<AccountToolsDialog bind:open={toolsOpen} account={toolsAccount} onRefresh={loadRows} onClose={() => {}} />
<AccountReAuthDialog bind:open={reauthOpen} account={reauthAccount} onApplied={loadRows} onClose={() => {}} />
<AccountAdvancedDialog bind:open={advancedOpen} onRefresh={loadRows} onClose={() => {}} />
<AccountDataDialog bind:open={dataOpen} {selectedIds} {exportJson} onRefresh={loadRows} onClose={() => {}} />
<BulkEditDialog
	bind:open={bulkEditOpen}
	mode={bulkEditMode}
	selectedIds={bulkEditIds}
	{filteredIds}
	previewCount={bulkEditIds.length}
	accounts={rows}
	onDone={loadRows}
/>
