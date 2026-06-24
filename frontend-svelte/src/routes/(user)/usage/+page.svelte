<script lang="ts">
	/**
	 * /(user)/usage · M7+ usage analytics page (thin orchestrator)
	 *
	 * Components:
	 *   - UsageFilterBar: date range, models, endpoint, groupBy selects
	 *   - UsageStatsCards: 3 summary cards (requests / tokens / cost) + error retry
	 *   - TimeseriesChart: lazy chart.js island for usage trend
	 *   - UsageModelTable: paginated usage entries table with loading/empty/error states
	 *
	 * RED LINE:
	 *   - 不在此层处理 401（apiClient 已统一）。错误 message='unauthorized' 时静默返回。
	 *   - reshadcn-migration: 所有 Select 必须用 sentinel，严禁 <option value="">。
	 *   - 不静态 import chart.js / svelte-chartjs —— TimeseriesChart 内部 dynamic import。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Download, RotateCw } from '@lucide/svelte';
	import {
		listUsage,
		getUsageSummary,
		getUsageTrend,
		exportCsv,
		listErrorRequests,
		type PaginatedUsage,
		type PaginatedErrors,
		type UsageEntry,
		type UsageFilter,
		type UsageSummary,
		type UsageTrendPoint,
		type UsageGranularity,
		type UserErrorRequest
	} from '$lib/api/user/usage';
	import { authApi } from '$lib/api/auth';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import UsageFilterBar from '$lib/features/usage/UsageFilterBar.svelte';
	import UsageStatsCards from '$lib/features/usage/UsageStatsCards.svelte';
	import TimeseriesChart from '$lib/features/usage/TimeseriesChart.svelte';
	import UsageModelTable from '$lib/features/usage/UsageModelTable.svelte';
	import UserErrorsTable from '$lib/features/usage/UserErrorsTable.svelte';
	import Button from '$lib/ui/Button.svelte';

	const MODELS_ALL = '__all__' as const;
	const ENDPOINT_ALL = '__all__' as const;
	const PAGE_SIZE = 20;

	// ── filter state ────────────────────────────────────────────────────
	function defaultStartDate(): string {
		const d = new Date();
		d.setDate(d.getDate() - 6);
		return d.toISOString().slice(0, 10);
	}
	function defaultEndDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	let startDate = $state(defaultStartDate());
	let endDate = $state(defaultEndDate());
	let modelsFilter = $state<string[] | typeof MODELS_ALL>(MODELS_ALL);
	let endpointFilter = $state<string | typeof ENDPOINT_ALL>(ENDPOINT_ALL);
	let groupBy = $state<UsageGranularity>('day');

	// 已知 model / endpoint 候选 —— 从首次 list 响应收集（POC：客户端去重）。
	let knownModels = $state<string[]>([]);
	let knownEndpoints = $state<string[]>([]);

	// ── data state ─────────────────────────────────────────────────────
	let summary = $state<UsageSummary | null>(null);
	let trend = $state<UsageTrendPoint[] | null>(null);
	let entries = $state<UsageEntry[]>([]);
	let totalRows = $state(0);
	let totalPages = $state(0);
	let page = $state(1);

	let loadingSummary = $state(true);
	let loadingTrend = $state(true);
	let loadingList = $state(true);
	let exporting = $state(false);

	let summaryError = $state<string | null>(null);
	let trendError = $state<string | null>(null);
	let listError = $state<string | null>(null);

	// ── error requests tab ─────────────────────────────────────────────────
	type ActiveTab = 'usage' | 'errors';
	let activeTab = $state<ActiveTab>('usage');
	let errorViewEnabled = $state(false);
	let errorRows = $state<UserErrorRequest[]>([]);
	let errorTotal = $state(0);
	let errorTotalPages = $state(0);
	let errorPage = $state(1);
	let errorLoading = $state(false);
	let errorFilter = $state<{ model: string; category: string }>({ model: '', category: '' });

	// ── helpers ────────────────────────────────────────────────────────

	function currentFilter(): UsageFilter {
		return {
			startDate,
			endDate,
			models: modelsFilter,
			endpoint: endpointFilter,
			groupBy
		};
	}

	function harvestCandidates(rows: UsageEntry[]) {
		const ms = new Set(knownModels);
		const es = new Set(knownEndpoints);
		for (const r of rows) {
			if (r.model) ms.add(r.model);
			if (r.endpoint) es.add(r.endpoint);
		}
		knownModels = [...ms].sort();
		knownEndpoints = [...es].sort();
	}

	// ── loaders ────────────────────────────────────────────────────────

	async function loadSummary() {
		loadingSummary = true;
		summaryError = null;
		try {
			summary = await getUsageSummary(currentFilter());
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			summaryError = msg || 'load failed';
		} finally {
			loadingSummary = false;
		}
	}

	async function loadTrend() {
		loadingTrend = true;
		trendError = null;
		try {
			trend = await getUsageTrend(currentFilter());
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			trendError = msg || 'load failed';
			trend = null;
		} finally {
			loadingTrend = false;
		}
	}

	async function loadList() {
		loadingList = true;
		listError = null;
		try {
			const resp: PaginatedUsage = await listUsage({
				...currentFilter(),
				page,
				pageSize: PAGE_SIZE,
				sortBy: 'created_at',
				sortOrder: 'desc'
			});
			entries = resp.items;
			totalRows = resp.total;
			totalPages = resp.pages;
			harvestCandidates(resp.items);
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			listError = msg || 'load failed';
			entries = [];
			totalRows = 0;
			totalPages = 0;
		} finally {
			loadingList = false;
		}
	}

	async function loadErrors() {
		errorLoading = true;
		try {
			const resp: PaginatedErrors = await listErrorRequests({
				page: errorPage,
				pageSize: PAGE_SIZE,
				startDate,
				endDate,
				model: errorFilter.model || undefined,
				category: errorFilter.category || undefined
			});
			errorRows = resp.items;
			errorTotal = resp.total;
			errorTotalPages = Math.max(1, Math.ceil(resp.total / 20));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') {
				showError($_('user.usage.errors.failedToLoad', { default: 'Failed to load error requests' }));
			}
			errorRows = [];
			errorTotal = 0;
			errorTotalPages = 0;
		} finally {
			errorLoading = false;
		}
	}

	function refreshAll() {
		page = 1;
		void loadSummary();
		void loadTrend();
		void loadList();
		// Reset error pagination on global refresh; lazy-load when tab opens.
		errorPage = 1;
		errorRows = [];
	}

	function switchToErrors() {
		activeTab = 'errors';
		if (errorRows.length === 0) void loadErrors();
	}

	onMount(async () => {
		refreshAll();
		// Check if error view is enabled via public settings.
		try {
			const settings = await authApi.getPublicSettings();
			errorViewEnabled = settings.allow_user_view_error_requests === true;
		} catch {
			errorViewEnabled = false;
		}
	});

	// ── handlers ───────────────────────────────────────────────────────

	function handleStartDateChange(e: Event) {
		startDate = (e.currentTarget as HTMLInputElement).value;
		refreshAll();
	}
	function handleEndDateChange(e: Event) {
		endDate = (e.currentTarget as HTMLInputElement).value;
		refreshAll();
	}
	function handleModelsChange(e: Event) {
		const sel = e.currentTarget as HTMLSelectElement;
		const picked: string[] = [];
		for (const opt of Array.from(sel.options)) {
			if (opt.selected) picked.push(opt.value);
		}
		if (picked.length === 0 || picked.includes(MODELS_ALL)) {
			modelsFilter = MODELS_ALL;
		} else {
			modelsFilter = picked;
		}
		refreshAll();
	}
	function handleEndpointChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		endpointFilter = v as string | typeof ENDPOINT_ALL;
		refreshAll();
	}
	function handleGroupByChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		groupBy = v as UsageGranularity;
		// groupBy 只影响图；保留 list/summary 不重发但简化路径 → 都重发。
		refreshAll();
	}
	function gotoPrev() {
		if (page <= 1) return;
		page -= 1;
		void loadList();
	}
	function gotoNext() {
		if (totalPages > 0 && page >= totalPages) return;
		page += 1;
		void loadList();
	}

	async function handleExport() {
		exporting = true;
		try {
			await exportCsv(currentFilter());
			showSuccess($_('user.usage.exportSuccess', { default: 'CSV export started' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') {
				showError($_('user.usage.exportFailed', { default: 'Export CSV failed' }));
			}
		} finally {
			exporting = false;
		}
	}

	// ── error tab handlers ─────────────────────────────────────────────────
	function handleErrorFilter(f: { model: string; category: string }) {
		errorFilter = f;
		errorPage = 1;
		void loadErrors();
	}
	function errorGotoPrev() {
		if (errorPage <= 1) return;
		errorPage -= 1;
		void loadErrors();
	}
	function errorGotoNext() {
		if (errorTotalPages > 0 && errorPage >= errorTotalPages) return;
		errorPage += 1;
		void loadErrors();
	}
</script>

<svelte:head>
	<title>{$_('nav.usage', { default: 'Usage' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="usage-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.usage.pageTitle', { default: 'Usage' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.usage.pageSubtitle', {
					default: 'View API usage, costs and download CSV reports.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="icon"
				aria-label={$_('user.usage.refresh', { default: 'Refresh' })}
				data-testid="usage-refresh-btn"
				onclick={refreshAll}
				class="h-9 w-9 text-muted-foreground hover:text-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</Button>
			<Button
				type="button"
				data-testid="usage-export-btn"
				onclick={handleExport}
				disabled={exporting}
				class="h-9"
			>
				<Download class="h-4 w-4" />
				{exporting
					? $_('user.usage.exporting', { default: 'Exporting...' })
					: $_('user.usage.exportCsv', { default: 'Export CSV' })}
			</Button>
		</div>
	</header>

	<!-- Tab bar (visible when error view is enabled) -->
	{#if errorViewEnabled}
		<div class="flex gap-1 border-b border-border">
			<button
				type="button"
				class="rounded-t px-4 py-2 text-sm font-medium transition-all duration-150 {activeTab === 'usage'
					? 'bg-secondary text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => { activeTab = 'usage'; }}
				data-testid="tab-usage"
			>
				{$_('user.usage.tabs.usage', { default: 'Usage' })}
			</button>
			<button
				type="button"
				class="rounded-t px-4 py-2 text-sm font-medium transition-all duration-150 {activeTab === 'errors'
					? 'bg-secondary text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={switchToErrors}
				data-testid="tab-errors"
			>
				{$_('user.usage.tabs.errors', { default: 'Errors' })}
			</button>
		</div>
	{/if}

	{#if activeTab === 'usage'}
	<!-- Filters -->
	<UsageFilterBar
		{startDate}
		{endDate}
		{modelsFilter}
		{endpointFilter}
		{groupBy}
		{knownModels}
		{knownEndpoints}
		onStartDateChange={handleStartDateChange}
		onEndDateChange={handleEndDateChange}
		onModelsChange={handleModelsChange}
		onEndpointChange={handleEndpointChange}
		onGroupByChange={handleGroupByChange}
	/>

	<!-- Summary cards -->
	<UsageStatsCards
		{summary}
		loading={loadingSummary}
		error={summaryError}
		onRetry={() => loadSummary()}
	/>

	<!-- Chart -->
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="usage-chart-card"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.usage.chartTitle', { default: 'Usage trend' })}
			</h2>
			{#if trendError && !loadingTrend}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => loadTrend()}
					data-testid="usage-chart-retry"
				>
					{$_('user.usage.retry', { default: 'Retry' })}
				</Button>
			{/if}
		</div>
		<TimeseriesChart data={trend} loading={loadingTrend} />
	</article>

	<!-- Entries table -->
	<UsageModelTable
		{entries}
		loading={loadingList}
		error={listError}
		{page}
		{totalRows}
		{totalPages}
		pageSize={PAGE_SIZE}
		onRetry={() => loadList()}
		onPrev={gotoPrev}
		onNext={gotoNext}
	/>
	{:else}
	<!-- Error requests tab -->
	<UserErrorsTable
		rows={errorRows}
		total={errorTotal}
		totalPages={errorTotalPages}
		loading={errorLoading}
		page={errorPage}
		pageSize={PAGE_SIZE}
		onFilter={handleErrorFilter}
		onPrev={errorGotoPrev}
		onNext={errorGotoNext}
	/>
	{/if}
</section>
