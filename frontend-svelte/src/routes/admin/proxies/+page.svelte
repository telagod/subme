<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Wifi } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import {
		listProxies,
		listAllProxies,
		testProxy,
		checkProxyQuality,
		listProxyAccounts,
		exportProxyData,
		type Proxy,
		type ProxyAccountSummary,
		type ProxyQualityCheckResult
	} from '$lib/api/admin/proxies';
	import { showError, showSuccess, showInfo } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, summarizeProxies } from '$lib/features/supply/supply';
	import { testResultText, type ProxyBatchScope } from '$lib/features/proxies/proxy-helpers';
	import ProxiesTable from '$lib/features/proxies/ProxiesTable.svelte';
	import ProxyEditDialog from '$lib/features/proxies/ProxyEditDialog.svelte';
	import ProxyDeleteDialog from '$lib/features/proxies/ProxyDeleteDialog.svelte';
	import ProxyQualityDialog from '$lib/features/proxies/ProxyQualityDialog.svelte';
	import ProxyAccountsDialog from '$lib/features/proxies/ProxyAccountsDialog.svelte';
	import ProxyDataToolsDialog from '$lib/features/proxies/ProxyDataToolsDialog.svelte';

	const protocolOptions = $derived([
		{ value: ALL, label: 'All protocols' },
		...['http', 'https', 'socks5', 'socks5h'].map((value) => ({ value, label: value }))
	]);
	const statusOptions = [
		{ value: ALL, label: 'All statuses' },
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' },
		{ value: 'expired', label: 'expired' }
	];

	let rows = $state<Proxy[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let protocolFilter = $state(ALL);
	let statusFilter = $state(ALL);
	let selectedIds = $state<Set<number>>(new Set());

	// Dialog state
	let editDialogOpen = $state(false);
	let editing = $state<Proxy | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteMode = $state<'single' | 'selected'>('selected');
	let deleteTarget = $state<Proxy | null>(null);
	let dataToolsOpen = $state(false);
	let dataToolsInitialJson = $state('');
	let qualityDialogOpen = $state(false);
	let qualitySubject = $state<Proxy | null>(null);
	let qualityReport = $state<ProxyQualityCheckResult | null>(null);
	let accountsOpen = $state(false);
	let accountsLoading = $state(false);
	let accountsSubject = $state<Proxy | null>(null);
	let accounts = $state<ProxyAccountSummary[]>([]);

	// Result feedback
	let lastQualityResult = $state<string | null>(null);
	let batchActionResult = $state<string | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeProxies(rows));
	const allPageSelected = $derived(rows.length > 0 && rows.every((row) => selectedIds.has(row.id)));

	function currentFilters() {
		return {
			protocol: protocolFilter === ALL ? undefined : protocolFilter,
			status: statusFilter === ALL ? undefined : statusFilter,
			search: searchInput.trim() || undefined,
			sort_by: 'created_at',
			sort_order: 'desc' as const
		};
	}

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listProxies(page, PAGE_SIZE, { ...currentFilters() });
			rows = resp.items;
			total = resp.total;
			const present = new Set(rows.map((row) => row.id));
			selectedIds = new Set([...selectedIds].filter((id) => present.has(id)));
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => { void loadRows(); });

	function applyFilters() { page = 1; void loadRows(); }

	function toggleOne(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function togglePageSelection() {
		if (allPageSelected) {
			const next = new Set(selectedIds);
			for (const row of rows) next.delete(row.id);
			selectedIds = next;
			return;
		}
		selectedIds = new Set([...selectedIds, ...rows.map((row) => row.id)]);
	}

	// ── Export selected → API call then open dialog ──────────────────────
	async function exportSelectedAndOpen() {
		try {
			const payload = await exportProxyData({ ids: [...selectedIds] });
			dataToolsInitialJson = JSON.stringify(payload, null, 2);
			showSuccess('Proxy data exported');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
			dataToolsInitialJson = '';
		}
		dataToolsOpen = true;
	}

	// ── Dialog openers ─────────────────────────────────────────────────────
	function openCreate() { editing = null; editDialogOpen = true; }
	function openEdit(proxy: Proxy) { editing = proxy; editDialogOpen = true; }
	function openDeleteSingle(proxy: Proxy) { deleteMode = 'single'; deleteTarget = proxy; deleteDialogOpen = true; }
	function openDeleteSelected() { if (selectedIds.size === 0) return; deleteMode = 'selected'; deleteTarget = null; deleteDialogOpen = true; }

	// ── Single proxy actions ───────────────────────────────────────────────
	async function runTest(proxy: Proxy) {
		saving = true;
		try {
			const result = await testProxy(proxy.id);
			batchActionResult = testResultText(proxy, result);
			if (result.success) showSuccess(result.latency_ms ? `Proxy OK · ${result.latency_ms}ms` : 'Proxy OK');
			else showError(result.message || 'Proxy test failed');
			await loadRows();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { saving = false; }
	}

	async function runQualityCheck(proxy: Proxy) {
		saving = true;
		try {
			const result = await checkProxyQuality(proxy.id);
			const score = typeof result.score === 'number' ? ` · score ${result.score}` : '';
			lastQualityResult = `${proxy.name}: ${result.success ? 'OK' : 'failed'}${score}${result.message ? ` · ${result.message}` : ''}`;
			qualitySubject = proxy;
			qualityReport = result;
			qualityDialogOpen = true;
			if (result.success) showSuccess(`Proxy quality OK${score}`);
			else showError(result.message || 'Proxy quality check failed');
			await loadRows();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { saving = false; }
	}

	// ── Batch actions ──────────────────────────────────────────────────────
	async function batchTargetRows(scope: ProxyBatchScope): Promise<Proxy[]> {
		if (scope === 'all') return listAllProxies();
		return rows.filter((row) => selectedIds.has(row.id));
	}

	async function runBatchTest(scope: ProxyBatchScope = 'selected') {
		saving = true;
		try {
			const targets = await batchTargetRows(scope);
			if (targets.length === 0) {
				batchActionResult = scope === 'all' ? 'No proxies available to test' : 'No selected proxies to test';
				showInfo(batchActionResult);
				return;
			}
			const results = await Promise.all(targets.map(async (proxy) => ({ proxy, result: await testProxy(proxy.id) })));
			const passed = results.filter(({ result }) => result.success).length;
			batchActionResult = `Proxy tests: ${passed}/${results.length} passed`;
			lastQualityResult = null;
			if (passed === results.length) showSuccess(batchActionResult);
			else showError(batchActionResult);
			await loadRows();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { saving = false; }
	}

	async function runBatchQualityCheck(scope: ProxyBatchScope = 'selected') {
		saving = true;
		try {
			const targets = await batchTargetRows(scope);
			if (targets.length === 0) {
				batchActionResult = scope === 'all' ? 'No proxies available to check' : 'No selected proxies to check';
				showInfo(batchActionResult);
				return;
			}
			const results = await Promise.all(targets.map(async (proxy) => ({ proxy, result: await checkProxyQuality(proxy.id) })));
			const passed = results.filter(({ result }) => result.success).length;
			const scored = results.map(({ result }) => (typeof result.score === 'number' ? result.score : null)).filter((s): s is number => s !== null);
			const averageScore = scored.length ? ` · avg score ${Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)}` : '';
			batchActionResult = `Proxy quality: ${passed}/${results.length} passed${averageScore}`;
			const last = results[results.length - 1];
			qualitySubject = last.proxy;
			qualityReport = last.result;
			qualityDialogOpen = true;
			lastQualityResult = `${last.proxy.name}: ${last.result.success ? 'OK' : 'failed'}${typeof last.result.score === 'number' ? ` · score ${last.result.score}` : ''}`;
			if (passed === results.length) showSuccess(batchActionResult);
			else showError(batchActionResult);
			await loadRows();
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { saving = false; }
	}

	// ── Accounts dialog ────────────────────────────────────────────────────
	async function openAccounts(proxy: Proxy) {
		accountsSubject = proxy;
		accountsOpen = true;
		accountsLoading = true;
		accounts = [];
		try {
			accounts = await listProxyAccounts(proxy.id);
			if (accounts.length === 0) showInfo('No accounts use this proxy');
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { accountsLoading = false; }
	}

	// ── Delete callback ────────────────────────────────────────────────────
	function handleDeleted(message: string) {
		batchActionResult = message;
		lastQualityResult = null;
		if (deleteMode === 'selected') selectedIds = new Set();
		deleteTarget = null;
		void loadRows();
	}
</script>

<svelte:head>
	<title>{$_('admin.proxies.title', { default: '代理' })}</title>
</svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M13 · Supply</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.proxies.title', { default: '代理' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.proxies.description', { default: '管理出站代理、过期回退和账户使用。' })}
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> {$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button variant="outline" onclick={() => (dataToolsOpen = true)}>{$_('admin.proxies.dataTools', { default: 'Data tools' })}</Button>
			<Button onclick={openCreate}><Plus size={16} /> {$_('admin.proxies.newProxy', { default: 'New proxy' })}</Button>
		</div>
	</header>

	<!-- Summary cards -->
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-2 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</div>

	<!-- Filters -->
	<Card class="p-3">
		<div class="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
			<label class="relative">
				<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
				<Input class="pl-9" placeholder={$_('admin.proxies.searchPlaceholder', { default: '搜索代理' })} bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && applyFilters()} />
			</label>
			<NativeSelect bind:value={protocolFilter} options={protocolOptions} onchange={applyFilters} data-testid="proxies-protocol-filter" />
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={applyFilters} data-testid="proxies-status-filter" />
			<Button onclick={applyFilters}>{$_('common.apply', { default: 'Apply' })}</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2"><AlertTriangle size={16} /> {loadError}</Alert>
	{/if}
	{#if lastQualityResult}
		<Alert class="flex items-center gap-2"><Wifi size={16} /> {lastQualityResult}</Alert>
	{/if}
	{#if batchActionResult}
		<Alert class="flex items-center gap-2" data-testid="proxy-batch-action-result"><Wifi size={16} /> {batchActionResult}</Alert>
	{/if}

	<!-- Batch actions bar -->
	<Card class="p-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-muted-foreground">{selectedIds.size} {$_('common.selected', { default: '已选中' })}</p>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" disabled={selectedIds.size === 0 || saving} onclick={() => runBatchTest('selected')}>{$_('admin.proxies.testSelected', { default: 'Test selected' })}</Button>
				<Button variant="outline" disabled={selectedIds.size === 0 || saving} onclick={() => runBatchQualityCheck('selected')}>{$_('admin.proxies.qualitySelected', { default: 'Quality selected' })}</Button>
				<Button variant="outline" disabled={total === 0 || saving} onclick={() => runBatchTest('all')}>{$_('admin.proxies.testAll', { default: 'Test all' })}</Button>
				<Button variant="outline" disabled={total === 0 || saving} onclick={() => runBatchQualityCheck('all')}>{$_('admin.proxies.qualityAll', { default: 'Quality all' })}</Button>
				<Button variant="outline" disabled={selectedIds.size === 0} onclick={exportSelectedAndOpen}>{$_('common.exportSelected', { default: 'Export selected' })}</Button>
				<Button variant="outline" class="text-destructive" disabled={selectedIds.size === 0 || saving} onclick={openDeleteSelected}>{$_('common.deleteSelected', { default: 'Delete selected' })}</Button>
			</div>
		</div>
	</Card>

	<!-- Table -->
	<ProxiesTable
		{rows} {loading} {saving} {selectedIds} {allPageSelected}
		onToggleOne={toggleOne}
		onTogglePageSelection={togglePageSelection}
		onTest={runTest}
		onQualityCheck={runQualityCheck}
		onEdit={openEdit}
		onDelete={openDeleteSingle}
		onOpenAccounts={openAccounts}
		onReload={loadRows}
	/>

	<!-- Pagination -->
	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">{total} total</p>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
			<span class="text-sm">{page} / {totalPages}</span>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
		</div>
	</div>
</section>

<!-- Dialogs -->
<ProxyEditDialog
	bind:open={editDialogOpen}
	{editing}
	{protocolFilter}
	onClose={() => (editDialogOpen = false)}
	onSaved={loadRows}
/>

<ProxyDeleteDialog
	bind:open={deleteDialogOpen}
	mode={deleteMode}
	target={deleteTarget}
	{selectedIds}
	onClose={() => (deleteDialogOpen = false)}
	onDeleted={handleDeleted}
/>

<ProxyAccountsDialog
	bind:open={accountsOpen}
	subject={accountsSubject}
	{accounts}
	loading={accountsLoading}
	onClose={() => (accountsOpen = false)}
/>

<ProxyDataToolsDialog
	bind:open={dataToolsOpen}
	{selectedIds}
	{currentFilters}
	initialJson={dataToolsInitialJson}
	onClose={() => { dataToolsOpen = false; dataToolsInitialJson = ''; }}
	onDataChanged={loadRows}
/>

<ProxyQualityDialog
	bind:open={qualityDialogOpen}
	subject={qualitySubject}
	report={qualityReport}
	onClose={() => (qualityDialogOpen = false)}
/>
