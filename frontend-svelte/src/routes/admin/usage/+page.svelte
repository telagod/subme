<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		Download,
		RefreshCw,
		Search
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import UsageStatsCards from '$lib/features/admin-usage/UsageStatsCards.svelte';
	import UsageCharts from '$lib/features/admin-usage/UsageCharts.svelte';
	import ErrorsTab from '$lib/features/admin-usage/ErrorsTab.svelte';
	import ColumnVisibility from '$lib/features/admin-usage/ColumnVisibility.svelte';
	import type { ColumnDef } from '$lib/features/admin-usage/ColumnVisibility.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		getDashboardSnapshot,
		getModelStats,
		type DashboardSnapshot,
		type ModelStat
	} from '$lib/api/admin/dashboard';
	import {
		getAdminUsageStats,
		listAdminUsage,
		searchAdminUsageUsers,
		searchAdminUsageApiKeys,
		type AdminUsageLog,
		type AdminUsageQueryParams,
		type AdminUsageStatsResponse,
		type SimpleUsageUser,
		type SimpleUsageApiKey
	} from '$lib/api/admin/usage';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		EXPORT_PAGE_SIZE,
		PAGE_SIZE,
		accountBilled,
		endpointStatLabel,
		endpointStatRequests,
		escapeCsvValue,
		formatDateTime,
		formatDuration,
		formatInteger,
		formatMoney,
		formatTokens,
		requestTypeLabel,
		statusLabel,
		statusTone,
		summarizeUsageStats,
		totalTokens,
		usageAccountLabel,
		usageApiKeyLabel,
		usageEndpointLabel,
		usageGroupLabel,
		usageModelLabel,
		usageUserLabel,
		REQUEST_TYPE_OPTIONS,
		BILLING_MODE_OPTIONS,
		SORT_OPTIONS as USAGE_SORT_OPTIONS
	} from '$lib/features/admin-usage/admin-usage';
	import {
		CHART_COLORS,
		buildModelDoughnutData,
		defaultStartDate,
		defaultEndDate,
		granularityForRange,
		numberValue
	} from '$lib/features/admin-dashboard/dashboard';

	/* ── constants ────────────────────────────────────────────── */
	const HIDDEN_COLUMNS_KEY = 'usage-hidden-columns';
	const DEFAULT_HIDDEN = new Set(['reasoning_effort', 'user_agent', 'ip_address']);
	const ALWAYS_VISIBLE = new Set(['created_at', 'user']);

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
	let statsError = $state<string | null>(null);
	let searchInput = $state('');
	let startDate = $state(defaultStartDate());
	let endDate = $state(defaultEndDate());
	let requestTypeFilter = $state(ALL);
	let billingModeFilter = $state(ALL);
	let sortChoice = $state('created_at:desc');
	let exactTotal = $state(false);
	let granularity = $state<'day' | 'hour'>('hour');

	// Tabs
	let activeTab = $state<'usage' | 'errors'>('usage');
	let errorsTabRef: ErrorsTab | null = $state(null);

	// Charts
	let chartsLoading = $state(false);
	let chartSnapshot = $state<DashboardSnapshot>({});
	let modelStatsList = $state<ModelStat[]>([]);
	let modelMetric = $state<'tokens' | 'actual_cost'>('actual_cost');

	// Column visibility
	let hiddenColumns = $state(new Set<string>(DEFAULT_HIDDEN));

	// Typeahead
	let userSuggestions = $state<SimpleUsageUser[]>([]);
	let apiKeySuggestions = $state<SimpleUsageApiKey[]>([]);
	let showUserSuggestions = $state(false);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
	const requestTypeOptions = REQUEST_TYPE_OPTIONS;
	const billingModeOptions = BILLING_MODE_OPTIONS;
	const sortOptions = USAGE_SORT_OPTIONS;

	function currentParams(forExport = false): AdminUsageQueryParams {
		const userId = numericFilter(searchInput);
		const sort = selectedSort();
		return {
			page,
			page_size: forExport ? EXPORT_PAGE_SIZE : PAGE_SIZE,
			user_id: userId,
			model: userId === undefined ? searchInput.trim() || undefined : undefined,
			start_date: startDate || undefined,
			end_date: endDate || undefined,
			request_type: requestTypeFilter === ALL ? undefined : requestTypeFilter,
			billing_mode: billingModeFilter === ALL ? undefined : billingModeFilter,
			exact_total: forExport ? true : exactTotal || undefined,
			sort_by: sort.sort_by,
			sort_order: sort.sort_order
		};
	}

	function statsParams(): AdminUsageQueryParams {
		const params = currentParams(false);
		delete params.page;
		delete params.page_size;
		delete params.exact_total;
		delete params.sort_by;
		delete params.sort_order;
		return params;
	}

	function selectedSort() {
		const [sort_by, sort_order] = sortChoice.split(':') as [string, 'asc' | 'desc'];
		return { sort_by, sort_order };
	}

	function numericFilter(value: string): number | undefined {
		const trimmed = value.trim();
		if (!/^\d+$/.test(trimmed)) return undefined;
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : undefined;
	}

	/* ── loaders ──────────────────────────────────────────────── */
	async function loadStats() {
		statsLoading = true;
		statsError = null;
		try {
			stats = await getAdminUsageStats(statsParams());
		} catch (err) {
			statsError = err instanceof Error ? err.message : String(err);
			stats = null;
		} finally {
			statsLoading = false;
		}
	}

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listAdminUsage(currentParams(false));
			rows = resp.items;
			total = resp.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	async function loadChartData() {
		chartsLoading = true;
		try {
			const sp = statsParams();
			const [snap, ms] = await Promise.all([
				getDashboardSnapshot({
					start_date: sp.start_date,
					end_date: sp.end_date,
					granularity,
					include_stats: false,
					include_trend: true,
					include_model_stats: false,
					include_group_stats: false,
					include_users_trend: false
				}),
				getModelStats({
					start_date: sp.start_date,
					end_date: sp.end_date,
					model_source: 'requested',
					user_id: sp.user_id,
					model: sp.model,
					request_type: sp.request_type,
					billing_type: sp.billing_type
				})
			]);
			chartSnapshot = snap;
			modelStatsList = ms.models ?? [];
		} catch {
			// chart errors are non-blocking
		} finally {
			chartsLoading = false;
		}
	}

	function refreshAll() {
		void Promise.all([loadStats(), loadRows(), loadChartData()]);
	}

	function resetAndLoad() {
		page = 1;
		refreshAll();
		if (activeTab === 'errors') {
			void errorsTabRef?.load();
		}
	}

	function onDateChange() {
		granularity = granularityForRange(startDate, endDate);
		resetAndLoad();
	}

	function switchToErrors() {
		activeTab = 'errors';
		void errorsTabRef?.load();
	}

	/* ── typeahead ────────────────────────────────────────────── */
	function onSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		const val = searchInput.trim();
		if (val.length < 2) {
			userSuggestions = [];
			apiKeySuggestions = [];
			showUserSuggestions = false;
			return;
		}
		searchDebounceTimer = setTimeout(async () => {
			try {
				const [users, keys] = await Promise.all([
					searchAdminUsageUsers(val),
					searchAdminUsageApiKeys(undefined, val)
				]);
				userSuggestions = users.slice(0, 6);
				apiKeySuggestions = keys.slice(0, 4);
				showUserSuggestions = userSuggestions.length > 0 || apiKeySuggestions.length > 0;
			} catch {
				showUserSuggestions = false;
			}
		}, 300);
	}

	function pickUser(user: SimpleUsageUser) {
		searchInput = String(user.id);
		showUserSuggestions = false;
		resetAndLoad();
	}

	function pickApiKey(key: SimpleUsageApiKey) {
		searchInput = String(key.user_id);
		showUserSuggestions = false;
		resetAndLoad();
	}

	/* ── column visibility ────────────────────────────────────── */
	function toggleColumn(key: string) {
		const next = new Set(hiddenColumns);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		hiddenColumns = next;
		try {
			localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next]));
		} catch { /* ignore */ }
	}

	function loadSavedColumns() {
		try {
			const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY);
			if (saved) {
				hiddenColumns = new Set(JSON.parse(saved) as string[]);
			}
		} catch { /* use defaults */ }
	}

	/* ── export ───────────────────────────────────────────────── */
	async function exportCsv() {
		if (exporting) return;
		exporting = true;
		try {
			const all: AdminUsageLog[] = [];
			let exportPage = 1;
			let exportTotal = total;
			for (let i = 0; i < 50; i += 1) {
				const resp = await listAdminUsage({ ...currentParams(true), page: exportPage, page_size: EXPORT_PAGE_SIZE });
				all.push(...resp.items);
				exportTotal = resp.total;
				if (all.length >= exportTotal || resp.items.length < EXPORT_PAGE_SIZE) break;
				exportPage += 1;
			}
			downloadCsv(all);
			showSuccess($_('admin.usage.exportSuccess', { default: 'Usage CSV exported' }));
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			exporting = false;
		}
	}

	function downloadCsv(items: AdminUsageLog[]) {
		const header = ['time', 'user', 'api_key', 'account', 'group', 'model', 'endpoint', 'type', 'tokens', 'user_billed', 'account_billed', 'duration_ms', 'status', 'request_id', 'ip_address'];
		const lines = [header.join(',')];
		for (const row of items) {
			lines.push(
				[row.created_at, usageUserLabel(row), usageApiKeyLabel(row), usageAccountLabel(row), usageGroupLabel(row), usageModelLabel(row), usageEndpointLabel(row), requestTypeLabel(row), totalTokens(row), row.actual_cost ?? row.total_cost ?? 0, accountBilled(row), row.duration_ms ?? '', statusLabel(row), row.request_id ?? '', row.ip_address ?? ''].map(escapeCsvValue).join(',')
			);
		}
		if (typeof document === 'undefined' || typeof URL === 'undefined') return;
		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `admin-usage-${startDate || 'all'}-${endDate || 'now'}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/* ── model metric change ──────────────────────────────────── */
	function onModelMetricChange(metric: 'tokens' | 'actual_cost') {
		modelMetric = metric;
	}

	/* ── lifecycle ────────────────────────────────────────────── */
	onMount(() => {
		loadSavedColumns();
		refreshAll();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.usage', { default: 'Usage' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<!-- Header -->
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('admin.usage.title', { default: 'Usage records' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('admin.usage.description', { default: 'Audit requests, token spend, routing, and billing outcomes.' })}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<ColumnVisibility columns={allColumns} {hiddenColumns} onToggle={toggleColumn} />
			<Button variant="outline" onclick={refreshAll} disabled={loading || statsLoading}>
				<RefreshCw size={15} class={loading || statsLoading ? 'animate-spin' : ''} />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button onclick={exportCsv} disabled={exporting || loading}>
				<Download size={15} />
				{exporting ? $_('admin.usage.exporting', { default: 'Exporting' }) : $_('admin.usage.exportCsv', { default: 'Export CSV' })}
			</Button>
		</div>
	</header>

	<!-- Stats cards -->
	<UsageStatsCards {summary} />

	<!-- Filters + Charts -->
	<section class="space-y-3">
		<Card class="p-3">
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				<!-- Search with typeahead -->
				<div class="relative md:col-span-2">
					<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						class="pl-9"
						placeholder={$_('admin.usage.searchPlaceholder', { default: 'User ID, email, or model' })}
						bind:value={searchInput}
						oninput={onSearchInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') { showUserSuggestions = false; resetAndLoad(); }
							if (event.key === 'Escape') showUserSuggestions = false;
						}}
						onfocusout={() => setTimeout(() => { showUserSuggestions = false; }, 200)}
					/>
					{#if showUserSuggestions}
						<div class="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-md">
							{#if userSuggestions.length > 0}
								<p class="px-3 py-1 text-[10px] uppercase text-muted-foreground">Users</p>
								{#each userSuggestions as u (u.id)}
									<button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent" onmousedown={() => pickUser(u)}>
										<span class="font-medium">#{u.id}</span>
										<span class="truncate text-muted-foreground">{u.email}</span>
										{#if u.deleted}<Badge variant="outline" class="text-[10px]">deleted</Badge>{/if}
									</button>
								{/each}
							{/if}
							{#if apiKeySuggestions.length > 0}
								<p class="px-3 py-1 text-[10px] uppercase text-muted-foreground">API Keys</p>
								{#each apiKeySuggestions as k (k.id)}
									<button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent" onmousedown={() => pickApiKey(k)}>
										<span class="font-medium">#{k.id}</span>
										<span class="truncate text-muted-foreground">{k.name}</span>
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
				<Input type="date" bind:value={startDate} onchange={onDateChange} aria-label="Start date" />
				<Input type="date" bind:value={endDate} onchange={onDateChange} aria-label="End date" />
				<NativeSelect bind:value={granularity} options={[{ value: 'day', label: 'Day' }, { value: 'hour', label: 'Hour' }]} onchange={resetAndLoad} />
				<NativeSelect bind:value={requestTypeFilter} options={requestTypeOptions} onchange={resetAndLoad} data-testid="admin-usage-request-type-filter" />
				<NativeSelect bind:value={billingModeFilter} options={billingModeOptions} onchange={resetAndLoad} data-testid="admin-usage-billing-mode-filter" />
				<NativeSelect bind:value={sortChoice} options={sortOptions} onchange={resetAndLoad} data-testid="admin-usage-sort" />
				<label class="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
					<Checkbox bind:checked={exactTotal} onchange={resetAndLoad} />
					{$_('admin.usage.exactTotal', { default: 'Exact total' })}
				</label>
				<Button onclick={resetAndLoad}>
					{$_('common.search', { default: 'Search' })}
				</Button>
			</div>
		</Card>

		<!-- Charts -->
		<UsageCharts
			{endpointChartData}
			{modelChartData}
			{trendChartData}
			{statsLoading}
			{chartsLoading}
			endpointEmpty={topEndpoints.length === 0}
			modelEmpty={modelStatsList.length === 0}
			trendEmpty={trendData.length === 0}
			endpointCount={topEndpoints.length}
			{modelMetric}
			{onModelMetricChange}
		/>
	</section>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<!-- Tabs: Usage | Errors -->
	<div class="flex gap-2 border-b border-border">
		<button
			type="button"
			class="-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'usage' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={() => { activeTab = 'usage'; }}
		>
			{$_('admin.usage.tabs.usage', { default: 'Usage' })}
		</button>
		<button
			type="button"
			class="-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'errors' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={switchToErrors}
		>
			{$_('admin.usage.tabs.errors', { default: 'Errors' })}
		</button>
	</div>

	<!-- Usage tab -->
	{#if activeTab === 'usage'}
		<Card padded={false} class="overflow-hidden">
			<VirtualTable {rows} rowHeight={74} getRowKey={(row) => row.id} {loading}>
				{#snippet header()}
					<div class="flex min-w-[1320px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
						{#if visibleColumnKeys.has('created_at')}<div class="w-[170px] shrink-0">Time</div>{/if}
						{#if visibleColumnKeys.has('user')}<div class="min-w-[220px] flex-[1.2]">User / key</div>{/if}
						{#if visibleColumnKeys.has('model')}<div class="min-w-[220px] flex-[1.2]">Model / endpoint</div>{/if}
						{#if visibleColumnKeys.has('account')}<div class="w-[150px] shrink-0">Account</div>{/if}
						{#if visibleColumnKeys.has('group')}<div class="w-[150px] shrink-0">Group</div>{/if}
						{#if visibleColumnKeys.has('tokens')}<div class="w-[110px] shrink-0">Tokens</div>{/if}
						{#if visibleColumnKeys.has('cost')}<div class="w-[120px] shrink-0">User billed</div>{/if}
						{#if visibleColumnKeys.has('duration')}<div class="w-[120px] shrink-0">Duration</div>{/if}
						{#if visibleColumnKeys.has('status')}<div class="w-[100px] shrink-0">Status</div>{/if}
						{#if visibleColumnKeys.has('ip_address')}<div class="w-[130px] shrink-0">IP</div>{/if}
						{#if visibleColumnKeys.has('user_agent')}<div class="w-[180px] shrink-0">User Agent</div>{/if}
					</div>
				{/snippet}
				{#snippet row({ row })}
					<div class="flex min-w-[1320px] items-center border-b px-3 py-3 text-sm" data-testid="admin-usage-row" data-usage-id={row.id}>
						{#if visibleColumnKeys.has('created_at')}<div class="w-[170px] shrink-0 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>{/if}
						{#if visibleColumnKeys.has('user')}
							<div class="min-w-[220px] flex-[1.2] min-w-0">
								<div class="truncate font-medium">{usageUserLabel(row)}</div>
								<div class="truncate text-xs text-muted-foreground">{usageApiKeyLabel(row)} · {row.request_id || `#${row.id}`}</div>
							</div>
						{/if}
						{#if visibleColumnKeys.has('model')}
							<div class="min-w-[220px] flex-[1.2] min-w-0">
								<div class="truncate font-medium" title={usageModelLabel(row)}>{usageModelLabel(row)}</div>
								<div class="truncate text-xs text-muted-foreground" title={usageEndpointLabel(row)}>{usageEndpointLabel(row)}</div>
							</div>
						{/if}
						{#if visibleColumnKeys.has('account')}<div class="w-[150px] shrink-0 truncate text-xs text-muted-foreground" title={usageAccountLabel(row)}>{usageAccountLabel(row)}</div>{/if}
						{#if visibleColumnKeys.has('group')}<div class="w-[150px] shrink-0 truncate text-xs text-muted-foreground" title={usageGroupLabel(row)}>{usageGroupLabel(row)}</div>{/if}
						{#if visibleColumnKeys.has('tokens')}<div class="w-[110px] shrink-0 font-mono text-xs">{formatTokens(totalTokens(row))}</div>{/if}
						{#if visibleColumnKeys.has('cost')}
							<div class="w-[120px] shrink-0">
								<div class="font-mono text-xs">{formatMoney(row.actual_cost ?? row.total_cost, 6)}</div>
								<div class="font-mono text-[11px] text-muted-foreground">{formatMoney(accountBilled(row), 6)}</div>
							</div>
						{/if}
						{#if visibleColumnKeys.has('duration')}
							<div class="w-[120px] shrink-0">
								<div class="font-mono text-xs">{formatDuration(row.duration_ms)}</div>
								<div class="text-[11px] text-muted-foreground">{requestTypeLabel(row)}</div>
							</div>
						{/if}
						{#if visibleColumnKeys.has('status')}<div class="w-[100px] shrink-0"><Badge variant="outline" class={statusTone(row)}>{statusLabel(row)}</Badge></div>{/if}
						{#if visibleColumnKeys.has('ip_address')}<div class="w-[130px] shrink-0 truncate text-xs text-muted-foreground">{row.ip_address ?? '—'}</div>{/if}
						{#if visibleColumnKeys.has('user_agent')}<div class="w-[180px] shrink-0 truncate text-xs text-muted-foreground" title={row.user_agent ?? ''}>{row.user_agent ?? '—'}</div>{/if}
					</div>
				{/snippet}
				{#snippet empty()}
					<div class="p-6 text-center text-sm text-muted-foreground">
						{$_('admin.usage.empty', { default: 'No usage records found' })}
					</div>
				{/snippet}
				{#snippet loadingSlot()}
					<div class="space-y-2 p-3">
						{#each Array(7) as _}
							<div class="h-12 animate-pulse rounded bg-muted"></div>
						{/each}
					</div>
				{/snippet}
			</VirtualTable>
			<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
				<span>{formatInteger(total)} {$_('admin.usage.records', { default: 'records' })} · page {page} / {totalPages}</span>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page">
						<ChevronLeft size={16} />
					</Button>
					<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page">
						<ChevronRight size={16} />
					</Button>
				</div>
			</div>
		</Card>
	{:else}
		<!-- Errors tab -->
		<ErrorsTab
			bind:this={errorsTabRef}
			{startDate}
			{endDate}
			userId={numericFilter(searchInput)}
			model={numericFilter(searchInput) === undefined ? searchInput.trim() || undefined : undefined}
		/>
	{/if}
</div>
