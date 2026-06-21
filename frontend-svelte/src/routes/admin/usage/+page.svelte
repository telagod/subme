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
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		getAdminUsageStats,
		listAdminUsage,
		type AdminUsageLog,
		type AdminUsageQueryParams,
		type AdminUsageStatsResponse,
		type UsageRequestType
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

	const REQUEST_TYPES: UsageRequestType[] = ['sync', 'stream', 'ws_v2'];
	const requestTypeOptions = REQUEST_TYPE_OPTIONS;
	const billingModeOptions = BILLING_MODE_OPTIONS;
	const sortOptions = USAGE_SORT_OPTIONS;

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

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeUsageStats(stats));
	const topEndpoints = $derived((stats?.endpoints ?? []).slice(0, 8));
	const endpointChartData = $derived({
		labels: topEndpoints.map((e) => endpointStatLabel(e)),
		datasets: [{ label: 'Requests', data: topEndpoints.map((e) => endpointStatRequests(e)), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'] }]
	});

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

	function refreshAll() {
		void Promise.all([loadStats(), loadRows()]);
	}

	function resetAndLoad() {
		page = 1;
		refreshAll();
	}

	async function exportCsv() {
		if (exporting) return;
		exporting = true;
		try {
			const all: AdminUsageLog[] = [];
			let exportPage = 1;
			let exportTotal = total;
			for (let i = 0; i < 50; i += 1) {
				const resp = await listAdminUsage({
					...currentParams(true),
					page: exportPage,
					page_size: EXPORT_PAGE_SIZE
				});
				all.push(...resp.items);
				exportTotal = resp.total;
				if (all.length >= exportTotal || resp.items.length < EXPORT_PAGE_SIZE) break;
				exportPage += 1;
			}
			downloadCsv(all);
			showSuccess('Usage CSV exported');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			exporting = false;
		}
	}

	function downloadCsv(items: AdminUsageLog[]) {
		const header = [
			'time',
			'user',
			'api_key',
			'account',
			'group',
			'model',
			'endpoint',
			'type',
			'tokens',
			'user_billed',
			'account_billed',
			'duration_ms',
			'status',
			'request_id',
			'ip_address'
		];
		const lines = [header.join(',')];
		for (const row of items) {
			lines.push(
				[
					row.created_at,
					usageUserLabel(row),
					usageApiKeyLabel(row),
					usageAccountLabel(row),
					usageGroupLabel(row),
					usageModelLabel(row),
					usageEndpointLabel(row),
					requestTypeLabel(row),
					totalTokens(row),
					row.actual_cost ?? row.total_cost ?? 0,
					accountBilled(row),
					row.duration_ms ?? '',
					statusLabel(row),
					row.request_id ?? '',
					row.ip_address ?? ''
				]
					.map(escapeCsvValue)
					.join(',')
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

	function defaultStartDate(): string {
		const date = new Date();
		date.setDate(date.getDate() - 7);
		return date.toISOString().slice(0, 10);
	}

	function defaultEndDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	onMount(() => {
		refreshAll();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.usage', { default: 'Usage' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
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
			<Button variant="outline" onclick={refreshAll} disabled={loading || statsLoading}>
				<RefreshCw size={15} class={loading || statsLoading ? 'animate-spin' : ''} />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button onclick={exportCsv} disabled={exporting || loading}>
				<Download size={15} />
				{exporting ? 'Exporting' : 'Export CSV'}
			</Button>
		</div>
	</header>

	<UsageStatsCards {summary} />

	<section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
		<Card class="p-3">
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<div class="relative md:col-span-2">
					<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						class="pl-9"
						placeholder="User ID or model"
						bind:value={searchInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') resetAndLoad();
						}}
					/>
				</div>
				<Input type="date" bind:value={startDate} onchange={resetAndLoad} aria-label="Start date" />
				<Input type="date" bind:value={endDate} onchange={resetAndLoad} aria-label="End date" />
				<NativeSelect bind:value={requestTypeFilter} options={requestTypeOptions} onchange={resetAndLoad} data-testid="admin-usage-request-type-filter" />
				<NativeSelect bind:value={billingModeFilter} options={billingModeOptions} onchange={resetAndLoad} data-testid="admin-usage-billing-mode-filter" />
				<NativeSelect bind:value={sortChoice} options={sortOptions} onchange={resetAndLoad} data-testid="admin-usage-sort" />
				<label class="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
					<Checkbox bind:checked={exactTotal} onchange={resetAndLoad} />
					Exact total
				</label>
				<Button onclick={resetAndLoad}>
					{$_('common.search', { default: 'Search' })}
				</Button>
			</div>
		</Card>

		<UsageCharts {endpointChartData} {statsLoading} empty={topEndpoints.length === 0} endpointCount={topEndpoints.length} />
	</section>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={74} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid min-w-[1320px] grid-cols-[170px_minmax(220px,1.2fr)_minmax(220px,1.2fr)_150px_150px_110px_120px_120px_100px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Time</div>
					<div>User / key</div>
					<div>Model / endpoint</div>
					<div>Account</div>
					<div>Group</div>
					<div>Tokens</div>
					<div>User billed</div>
					<div>Duration</div>
					<div>Status</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1320px] grid-cols-[170px_minmax(220px,1.2fr)_minmax(220px,1.2fr)_150px_150px_110px_120px_120px_100px] items-center border-b px-3 py-3 text-sm" data-testid="admin-usage-row" data-usage-id={row.id}>
					<div class="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
					<div class="min-w-0">
						<div class="truncate font-medium">{usageUserLabel(row)}</div>
						<div class="truncate text-xs text-muted-foreground">{usageApiKeyLabel(row)} · {row.request_id || `#${row.id}`}</div>
					</div>
					<div class="min-w-0">
						<div class="truncate font-medium" title={usageModelLabel(row)}>{usageModelLabel(row)}</div>
						<div class="truncate text-xs text-muted-foreground" title={usageEndpointLabel(row)}>{usageEndpointLabel(row)}</div>
					</div>
					<div class="truncate text-xs text-muted-foreground" title={usageAccountLabel(row)}>{usageAccountLabel(row)}</div>
					<div class="truncate text-xs text-muted-foreground" title={usageGroupLabel(row)}>{usageGroupLabel(row)}</div>
					<div class="font-mono text-xs">{formatTokens(totalTokens(row))}</div>
					<div>
						<div class="font-mono text-xs">{formatMoney(row.actual_cost ?? row.total_cost, 6)}</div>
						<div class="font-mono text-[11px] text-muted-foreground">{formatMoney(accountBilled(row), 6)}</div>
					</div>
					<div>
						<div class="font-mono text-xs">{formatDuration(row.duration_ms)}</div>
						<div class="text-[11px] text-muted-foreground">{requestTypeLabel(row)}</div>
					</div>
					<div>
						<Badge variant="outline" class={statusTone(row)}>{statusLabel(row)}</Badge>
					</div>
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
			<span>{formatInteger(total)} records · page {page} / {totalPages}</span>
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
</div>
