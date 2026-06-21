<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Download, FileSpreadsheet, RefreshCw } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import UsageStatsCards from '$lib/features/admin-usage/UsageStatsCards.svelte';
	import UsageCharts from '$lib/features/admin-usage/UsageCharts.svelte';
	import UsageTable from '$lib/features/admin-usage/UsageTable.svelte';
	import ErrorsTab from '$lib/features/admin-usage/ErrorsTab.svelte';
	import ColumnVisibility from '$lib/features/admin-usage/ColumnVisibility.svelte';
	import UsageFilterBar from '$lib/features/admin-usage/UsageFilterBar.svelte';
	import ExportProgress from '$lib/features/admin-usage/ExportProgress.svelte';
	import BalanceHistoryDialog from '$lib/features/admin-usage/BalanceHistoryDialog.svelte';
	import type { ColumnDef } from '$lib/features/admin-usage/ColumnVisibility.svelte';
	import {
		getDashboardSnapshot,
		getModelStats,
		type DashboardSnapshot,
		type ModelStat
	} from '$lib/api/admin/dashboard';
	import {
		getAdminUsageStats,
		listAdminUsage,
		type AdminUsageLog,
		type AdminUsageQueryParams,
		type AdminUsageStatsResponse
	} from '$lib/api/admin/usage';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		EXPORT_PAGE_SIZE,
		PAGE_SIZE,
		buildCsvContent,
		buildXlsxBlob,
		downloadBlob,
		endpointStatLabel,
		endpointStatRequests,
		summarizeUsageStats,
		usageUserLabel
	} from '$lib/features/admin-usage/admin-usage';
	import {
		CHART_COLORS,
		buildModelDoughnutData,
		defaultStartDate,
		defaultEndDate,
		granularityForRange
	} from '$lib/features/admin-dashboard/dashboard';

	/* ── constants ────────────────────────────────────────────── */
	const HIDDEN_COLUMNS_KEY = 'usage-hidden-columns';
	const DEFAULT_HIDDEN = new Set(['reasoning_effort', 'user_agent', 'ip_address']);
	const allColumns: ColumnDef[] = [
		{ key: 'created_at', label: 'Time', alwaysVisible: true },
		{ key: 'user', label: 'User / key', alwaysVisible: true },
		{ key: 'model', label: 'Model / endpoint' },
		{ key: 'account', label: 'Account' },
		{ key: 'group', label: 'Group' },
		{ key: 'tokens', label: 'Tokens' },
		{ key: 'cost', label: 'User billed' },
		{ key: 'duration', label: 'Duration' },
		{ key: 'status', label: 'Status' },
		{ key: 'ip_address', label: 'IP Address' },
		{ key: 'user_agent', label: 'User Agent' },
		{ key: 'reasoning_effort', label: 'Reasoning Effort' }
	];

	/* ── state ────────────────────────────────────────────────── */
	let rows = $state<AdminUsageLog[]>([]);
	let stats = $state<AdminUsageStatsResponse | null>(null);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let statsLoading = $state(false);
	let exporting = $state(false);
	let loadError = $state<string | null>(null);

	let searchInput = $state('');
	let startDate = $state(defaultStartDate());
	let endDate = $state(defaultEndDate());
	let requestTypeFilter = $state(ALL);
	let billingModeFilter = $state(ALL);
	let sortChoice = $state('created_at:desc');
	let exactTotal = $state(false);
	let granularity = $state<'day' | 'hour'>('hour');
	let accountFilter = $state('');
	let groupFilter = $state('');

	// Export
	let exportProgress = $state(0);
	let exportCurrent = $state(0);
	let exportTotal = $state(0);
	let showExportProgress = $state(false);
	let exportAbort: AbortController | null = null;

	// Tabs + refs
	let activeTab = $state<'usage' | 'errors'>('usage');
	let errorsTabRef: ErrorsTab | null = $state(null);

	// Charts
	let chartsLoading = $state(false);
	let chartSnapshot = $state<DashboardSnapshot>({});
	let modelStatsList = $state<ModelStat[]>([]);
	let modelMetric = $state<'tokens' | 'actual_cost'>('actual_cost');

	// Columns + balance dialog
	let hiddenColumns = $state(new Set<string>(DEFAULT_HIDDEN));
	let balanceDialogOpen = $state(false);
	let balanceUserId = $state<number | null>(null);
	let balanceUserLabel = $state('');

	/* ── derived ──────────────────────────────────────────────── */
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeUsageStats(stats));
	const topEndpoints = $derived((stats?.endpoints ?? []).slice(0, 8));
	const endpointChartData = $derived({
		labels: topEndpoints.map((e) => endpointStatLabel(e)),
		datasets: [{ label: 'Requests', data: topEndpoints.map((e) => endpointStatRequests(e)), backgroundColor: CHART_COLORS.slice(0, topEndpoints.length) }]
	});
	const modelChartData = $derived(buildModelDoughnutData(modelStatsList, modelMetric));
	const trendData = $derived(chartSnapshot.trend ?? []);
	const trendChartData = $derived({
		labels: trendData.map((p) => p.date ?? p.time ?? ''),
		datasets: [
			{ label: 'Requests', data: trendData.map((p) => p.requests), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)', tension: 0.3 },
			{ label: 'Tokens', data: trendData.map((p) => p.tokens ?? Number(p.input_tokens ?? 0) + Number(p.output_tokens ?? 0)), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', tension: 0.3, yAxisID: 'y1' }
		]
	});
	const visibleColumnKeys = $derived(new Set(allColumns.filter((c) => c.alwaysVisible || !hiddenColumns.has(c.key)).map((c) => c.key)));

	/* ── helpers ──────────────────────────────────────────────── */
	function numericFilter(value: string): number | undefined {
		const t = value.trim();
		if (!/^\d+$/.test(t)) return undefined;
		const n = Number(t);
		return Number.isFinite(n) ? n : undefined;
	}

	function currentParams(forExport = false): AdminUsageQueryParams {
		const userId = numericFilter(searchInput);
		const [sort_by, sort_order] = sortChoice.split(':') as [string, 'asc' | 'desc'];
		return {
			page, page_size: forExport ? EXPORT_PAGE_SIZE : PAGE_SIZE,
			user_id: userId,
			model: userId === undefined ? searchInput.trim() || undefined : undefined,
			account_id: numericFilter(accountFilter),
			group_id: numericFilter(groupFilter),
			start_date: startDate || undefined, end_date: endDate || undefined,
			request_type: requestTypeFilter === ALL ? undefined : requestTypeFilter,
			billing_mode: billingModeFilter === ALL ? undefined : billingModeFilter,
			exact_total: forExport ? true : exactTotal || undefined,
			sort_by, sort_order
		};
	}

	function statsParams(): AdminUsageQueryParams {
		const p = currentParams(false);
		delete p.page; delete p.page_size; delete p.exact_total; delete p.sort_by; delete p.sort_order;
		return p;
	}

	/* ── loaders ──────────────────────────────────────────────── */
	async function loadStats() {
		statsLoading = true;
		try { stats = await getAdminUsageStats(statsParams()); }
		catch { stats = null; }
		finally { statsLoading = false; }
	}

	async function loadRows() {
		loading = true; loadError = null;
		try { const r = await listAdminUsage(currentParams(false)); rows = r.items; total = r.total; }
		catch (err) { loadError = err instanceof Error ? err.message : String(err); rows = []; total = 0; }
		finally { loading = false; }
	}

	async function loadChartData() {
		chartsLoading = true;
		try {
			const sp = statsParams();
			const [snap, ms] = await Promise.all([
				getDashboardSnapshot({ start_date: sp.start_date, end_date: sp.end_date, granularity, include_stats: false, include_trend: true, include_model_stats: false, include_group_stats: false, include_users_trend: false }),
				getModelStats({ start_date: sp.start_date, end_date: sp.end_date, model_source: 'requested', user_id: sp.user_id, model: sp.model, request_type: sp.request_type, billing_type: sp.billing_type })
			]);
			chartSnapshot = snap; modelStatsList = ms.models ?? [];
		} catch { /* non-blocking */ }
		finally { chartsLoading = false; }
	}

	function refreshAll() { void Promise.all([loadStats(), loadRows(), loadChartData()]); }
	function resetAndLoad() { page = 1; refreshAll(); if (activeTab === 'errors') void errorsTabRef?.load(); }
	function onDateChange() { granularity = granularityForRange(startDate, endDate); resetAndLoad(); }

	/* ── columns ──────────────────────────────────────────────── */
	function toggleColumn(key: string) {
		const next = new Set(hiddenColumns);
		if (next.has(key)) next.delete(key); else next.add(key);
		hiddenColumns = next;
		try { localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next])); } catch { /* */ }
	}

	/* ── user click → balance history ─────────────────────────── */
	function handleUserClick(row: AdminUsageLog) {
		const uid = row.user_id ?? row.user?.id;
		if (uid == null) return;
		balanceUserId = uid; balanceUserLabel = usageUserLabel(row); balanceDialogOpen = true;
	}

	/* ── export ───────────────────────────────────────────────── */
	async function fetchAllForExport(): Promise<AdminUsageLog[]> {
		const all: AdminUsageLog[] = [];
		let ep = 1; let ft = total;
		const ctrl = new AbortController(); exportAbort = ctrl;
		for (let i = 0; i < 100 && !ctrl.signal.aborted; i++) {
			const r = await listAdminUsage({ ...currentParams(true), page: ep, page_size: EXPORT_PAGE_SIZE });
			all.push(...r.items);
			if (ep === 1) { ft = r.total; exportTotal = ft; }
			exportCurrent = all.length;
			exportProgress = ft > 0 ? Math.min(100, Math.round(all.length / ft * 100)) : 0;
			if (all.length >= ft || r.items.length < EXPORT_PAGE_SIZE) break;
			ep++;
		}
		return all;
	}

	async function doExport(format: 'csv' | 'xlsx') {
		if (exporting) return;
		exporting = true; showExportProgress = true; exportProgress = 0; exportCurrent = 0; exportTotal = total;
		try {
			const all = await fetchAllForExport();
			const name = `admin-usage-${startDate || 'all'}-${endDate || 'now'}`;
			if (format === 'xlsx') {
				downloadBlob(await buildXlsxBlob(all), `${name}.xlsx`);
			} else {
				downloadBlob(new Blob([buildCsvContent(all)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
			}
			showSuccess($_('admin.usage.exportSuccess', { default: `Usage ${format.toUpperCase()} exported` }));
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { exporting = false; showExportProgress = false; exportAbort = null; }
	}

	/* ── lifecycle ────────────────────────────────────────────── */
	onMount(() => {
		try { const s = localStorage.getItem(HIDDEN_COLUMNS_KEY); if (s) hiddenColumns = new Set(JSON.parse(s) as string[]); } catch { /* */ }
		refreshAll();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.usage', { default: 'Usage' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{$_('admin.usage.title', { default: 'Usage records' })}</h1>
			<p class="text-sm text-muted-foreground">{$_('admin.usage.description', { default: 'Audit requests, token spend, routing, and billing outcomes.' })}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<ColumnVisibility columns={allColumns} {hiddenColumns} onToggle={toggleColumn} />
			<Button variant="outline" onclick={refreshAll} disabled={loading || statsLoading}>
				<RefreshCw size={15} class={loading || statsLoading ? 'animate-spin' : ''} />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button variant="outline" onclick={() => doExport('csv')} disabled={exporting || loading}>
				<Download size={15} />
				{$_('admin.usage.exportCsv', { default: 'CSV' })}
			</Button>
			<Button onclick={() => doExport('xlsx')} disabled={exporting || loading} data-testid="export-xlsx-btn">
				<FileSpreadsheet size={15} />
				{exporting ? $_('admin.usage.exporting', { default: 'Exporting...' }) : $_('admin.usage.exportXlsx', { default: 'XLSX' })}
			</Button>
		</div>
	</header>

	<UsageStatsCards {summary} />

	<section class="space-y-3">
		<UsageFilterBar
			bind:searchInput bind:startDate bind:endDate bind:granularity
			bind:requestTypeFilter bind:billingModeFilter bind:sortChoice
			bind:exactTotal bind:accountFilter bind:groupFilter
			onSearch={resetAndLoad} {onDateChange} onFilterChange={resetAndLoad}
		/>
		<UsageCharts
			{endpointChartData} {modelChartData} {trendChartData}
			{statsLoading} {chartsLoading}
			endpointEmpty={topEndpoints.length === 0} modelEmpty={modelStatsList.length === 0}
			trendEmpty={trendData.length === 0} endpointCount={topEndpoints.length}
			{modelMetric} onModelMetricChange={(m) => { modelMetric = m; }}
		/>
	</section>

	{#if loadError}<Alert variant="destructive">{loadError}</Alert>{/if}

	<div class="flex gap-2 border-b border-border">
		<button type="button" class="-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'usage' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}" onclick={() => { activeTab = 'usage'; }}>
			{$_('admin.usage.tabs.usage', { default: 'Usage' })}
		</button>
		<button type="button" class="-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'errors' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}" onclick={() => { activeTab = 'errors'; void errorsTabRef?.load(); }}>
			{$_('admin.usage.tabs.errors', { default: 'Errors' })}
		</button>
	</div>

	{#if activeTab === 'usage'}
		<UsageTable {rows} {loading} {total} {page} {totalPages} {visibleColumnKeys}
			onPageChange={(p) => { page = p; void loadRows(); }}
			onUserClick={handleUserClick}
		/>
	{:else}
		<ErrorsTab bind:this={errorsTabRef} {startDate} {endDate}
			userId={numericFilter(searchInput)}
			model={numericFilter(searchInput) === undefined ? searchInput.trim() || undefined : undefined}
		/>
	{/if}
</div>

<ExportProgress show={showExportProgress} progress={exportProgress} current={exportCurrent} total={exportTotal} onCancel={() => exportAbort?.abort()} />
<BalanceHistoryDialog bind:open={balanceDialogOpen} userId={balanceUserId} userLabel={balanceUserLabel} />
