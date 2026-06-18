<script lang="ts">
	/**
	 * /(user)/usage · M7+ usage analytics page
	 *
	 * 设计：
	 *   - 顶部 filter bar：日期范围（startDate / endDate）+ models 多选（'__all__' sentinel）
	 *     + endpoint Select（'__all__' sentinel）+ groupBy Select（day / hour / model / endpoint）。
	 *   - 中部 3 张 summary cards：total requests / total tokens / total cost。
	 *   - 图表：TimeseriesChart（lazy chart.js island，与 dashboard UsageChart 同款策略）。
	 *   - 底部分页流水 table：timestamp / model / endpoint / input / output / cost / status / latency。
	 *   - Export CSV 按钮 → exportCsv(filter)（客户端 loop + Blob 下载）。
	 *
	 * RED LINE：
	 *   - 不在此层处理 401（apiClient 已统一）。错误 message='unauthorized' 时静默返回。
	 *   - reshadcn-migration: 所有 Select 必须用 sentinel，严禁 <option value="">。
	 *   - 不静态 import chart.js / svelte-chartjs —— TimeseriesChart 内部 dynamic import。
	 *
	 * Vue UsageView parity：
	 *   - 默认 last-7-days 日期范围（与 dashboard / billing 体感一致）。
	 *   - sortBy=created_at, sortOrder=desc 默认；本 POC 不暴露 column-sort（M8 增量）。
	 *   - 表格分页 PAGE_SIZE=20 与 billing 一致；> PAGE_SIZE 触发分页控件。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Download, RotateCw } from '@lucide/svelte';
	import {
		listUsage,
		getUsageSummary,
		getUsageTrend,
		exportCsv,
		type PaginatedUsage,
		type UsageEntry,
		type UsageFilter,
		type UsageSummary,
		type UsageTrendPoint,
		type UsageGranularity
	} from '$lib/api/user/usage';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import TimeseriesChart from '$lib/features/usage/TimeseriesChart.svelte';

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

	function refreshAll() {
		page = 1;
		void loadSummary();
		void loadTrend();
		void loadList();
	}

	onMount(() => {
		refreshAll();
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
				showError($_('user.usage.exportFailed', { default: 'Failed to export CSV' }));
			}
		} finally {
			exporting = false;
		}
	}

	// ── format helpers ─────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return `$${v.toFixed(4)}`;
	}
	function fmtInt(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return Math.round(v).toLocaleString();
	}
	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}
	function fmtLatency(v: number): string {
		if (!Number.isFinite(v)) return '—';
		if (v < 1000) return `${Math.round(v)} ms`;
		return `${(v / 1000).toFixed(2)} s`;
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
					default: 'Review API usage, costs, and download CSV reports.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				aria-label={$_('user.usage.refresh', { default: 'Refresh' })}
				data-testid="usage-refresh-btn"
				onclick={refreshAll}
				class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</button>
			<button
				type="button"
				data-testid="usage-export-btn"
				onclick={handleExport}
				disabled={exporting}
				class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
			>
				<Download class="h-4 w-4" />
				{exporting
					? $_('user.usage.exporting', { default: 'Exporting…' })
					: $_('user.usage.exportCsv', { default: 'Export CSV' })}
			</button>
		</div>
	</header>

	<!-- Filters -->
	<section class="flex flex-wrap items-end gap-3" data-testid="usage-filters">
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="usage-start-date"
			>
				{$_('user.usage.startDate', { default: 'From' })}
			</label>
			<input
				id="usage-start-date"
				data-testid="usage-start-date"
				type="date"
				value={startDate}
				onchange={handleStartDateChange}
				class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="usage-end-date"
			>
				{$_('user.usage.endDate', { default: 'To' })}
			</label>
			<input
				id="usage-end-date"
				data-testid="usage-end-date"
				type="date"
				value={endDate}
				onchange={handleEndDateChange}
				class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="usage-models-filter"
			>
				{$_('user.usage.modelsFilter', { default: 'Models' })}
			</label>
			<select
				id="usage-models-filter"
				data-testid="usage-models-filter"
				multiple
				size="3"
				onchange={handleModelsChange}
				class="min-w-[180px] rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<option
					value={MODELS_ALL}
					selected={modelsFilter === MODELS_ALL}
				>
					{$_('user.usage.allModels', { default: 'All models' })}
				</option>
				{#each knownModels as m (m)}
					<option
						value={m}
						selected={modelsFilter !== MODELS_ALL && modelsFilter.includes(m)}
					>
						{m}
					</option>
				{/each}
			</select>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="usage-endpoint-filter"
			>
				{$_('user.usage.endpointFilter', { default: 'Endpoint' })}
			</label>
			<select
				id="usage-endpoint-filter"
				data-testid="usage-endpoint-filter"
				value={endpointFilter}
				onchange={handleEndpointChange}
				class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<option value={ENDPOINT_ALL}>
					{$_('user.usage.allEndpoints', { default: 'All endpoints' })}
				</option>
				{#each knownEndpoints as ep (ep)}
					<option value={ep}>{ep}</option>
				{/each}
			</select>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="usage-groupby"
			>
				{$_('user.usage.groupBy', { default: 'Group by' })}
			</label>
			<select
				id="usage-groupby"
				data-testid="usage-groupby"
				value={groupBy}
				onchange={handleGroupByChange}
				class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<option value="day">{$_('user.usage.groupDay', { default: 'Day' })}</option>
				<option value="hour">{$_('user.usage.groupHour', { default: 'Hour' })}</option>
				<option value="model">{$_('user.usage.groupModel', { default: 'Model' })}</option>
				<option value="endpoint">
					{$_('user.usage.groupEndpoint', { default: 'Endpoint' })}
				</option>
			</select>
		</div>
	</section>

	<!-- Summary cards -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="usage-summary-row">
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="usage-card-requests"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.usage.totalRequests', { default: 'Total requests' })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
			{:else if summary}
				<p
					class="mt-2 text-3xl font-semibold text-foreground"
					data-testid="usage-requests-value"
				>
					{fmtInt(summary.totalRequests)}
				</p>
			{:else}
				<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
			{/if}
		</article>
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="usage-card-tokens"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.usage.totalTokens', { default: 'Total tokens' })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
			{:else if summary}
				<p
					class="mt-2 text-3xl font-semibold text-foreground"
					data-testid="usage-tokens-value"
				>
					{fmtInt(summary.totalTokens)}
				</p>
			{:else}
				<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
			{/if}
		</article>
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="usage-card-cost"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.usage.totalCost', { default: 'Total cost' })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
			{:else if summary}
				<p
					class="mt-2 text-3xl font-semibold text-foreground"
					data-testid="usage-cost-value"
				>
					{fmtMoney(summary.totalCost)}
				</p>
			{:else}
				<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
			{/if}
		</article>
	</div>

	{#if summaryError}
		<div
			class="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			data-testid="usage-summary-error"
		>
			<span>
				{$_('user.usage.errors.summaryFailed', { default: 'Failed to load summary' })}
			</span>
			<button
				type="button"
				class="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
				onclick={() => loadSummary()}
				data-testid="usage-summary-retry"
			>
				{$_('user.usage.retry', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- Chart -->
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="usage-chart-card"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.usage.chartTitle', { default: 'Usage over time' })}
			</h2>
			{#if trendError && !loadingTrend}
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
					onclick={() => loadTrend()}
					data-testid="usage-chart-retry"
				>
					{$_('user.usage.retry', { default: 'Retry' })}
				</button>
			{/if}
		</div>
		<TimeseriesChart data={trend} loading={loadingTrend} />
	</article>

	<!-- Entries table -->
	{#if loadingList}
		<div class="space-y-2" data-testid="usage-list-loading">
			{#each Array.from({ length: 5 }) as _placeholder, i (i)}
				<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
			{/each}
		</div>
	{:else if listError && entries.length === 0}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
			data-testid="usage-list-error"
		>
			<p class="text-sm font-medium text-destructive">
				{$_('user.usage.errors.listFailed', { default: 'Failed to load usage entries' })}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">{listError}</p>
			<button
				type="button"
				onclick={() => loadList()}
				data-testid="usage-list-retry"
				class="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs text-foreground hover:bg-accent"
			>
				{$_('user.usage.retry', { default: 'Retry' })}
			</button>
		</div>
	{:else if entries.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
			data-testid="usage-list-empty"
		>
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.usage.emptyTitle', { default: 'No usage in this range' })}
			</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				{$_('user.usage.emptyDescription', {
					default: 'Try widening the date range or clearing filters.'
				})}
			</p>
		</div>
	{:else}
		<div
			class="overflow-hidden rounded-lg border border-border bg-card"
			data-testid="usage-list-wrap"
		>
			<table class="w-full text-sm" data-testid="usage-list-table">
				<thead>
					<tr
						class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
					>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.usage.colTimestamp', { default: 'Time' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.usage.colModel', { default: 'Model' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.usage.colEndpoint', { default: 'Endpoint' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.usage.colInputTokens', { default: 'Input' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.usage.colOutputTokens', { default: 'Output' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.usage.colCost', { default: 'Cost' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.usage.colStatus', { default: 'Status' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.usage.colLatency', { default: 'Latency' })}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as row (row.id)}
						<tr
							data-testid="usage-list-row"
							data-row-id={row.id}
							class="border-b border-border last:border-b-0 hover:bg-accent/40"
						>
							<td class="px-4 py-3 text-muted-foreground">{fmtDate(row.timestamp)}</td>
							<td class="px-4 py-3 font-mono text-xs">{row.model || '—'}</td>
							<td class="px-4 py-3 font-mono text-xs">{row.endpoint || '—'}</td>
							<td class="px-4 py-3 text-right tabular-nums">{fmtInt(row.inputTokens)}</td>
							<td class="px-4 py-3 text-right tabular-nums">{fmtInt(row.outputTokens)}</td>
							<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
								{fmtMoney(row.cost)}
							</td>
							<td class="px-4 py-3 text-xs text-muted-foreground">{row.status}</td>
							<td class="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
								{fmtLatency(row.latencyMs)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination —— total > pageSize 时显示 -->
		{#if totalRows > PAGE_SIZE || totalPages > 1}
			<div
				class="flex items-center justify-between text-sm text-muted-foreground"
				data-testid="usage-pagination"
			>
				<span>
					{$_('user.usage.pageOf', {
						default: 'Page {page} of {pages}',
						values: { page, pages: Math.max(totalPages, 1) }
					})}
				</span>
				<div class="flex items-center gap-2">
					<button
						type="button"
						data-testid="usage-page-prev"
						disabled={page <= 1}
						onclick={gotoPrev}
						class="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
					>
						{$_('user.usage.prevPage', { default: 'Previous' })}
					</button>
					<button
						type="button"
						data-testid="usage-page-next"
						disabled={totalPages > 0 && page >= totalPages}
						onclick={gotoNext}
						class="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
					>
						{$_('user.usage.nextPage', { default: 'Next' })}
					</button>
				</div>
			</div>
		{/if}
	{/if}
</section>
