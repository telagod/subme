<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		AlertTriangle,
		BarChart3,
		Clock,
		Database,
		KeyRound,
		RefreshCw,
		Server,
		Users
	} from '@lucide/svelte';
	import { getDashboardSnapshot, type DashboardSnapshot } from '$lib/api/admin/dashboard';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ChartIsland from '$lib/ui/ChartIsland.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import {
		buildKpis,
		formatCompact,
		formatMoney,
		normalizeStats,
		recentTrend,
		topGroups,
		topModels,
		topUsers
	} from '$lib/features/admin-dashboard/dashboard';

	let snapshot = $state<DashboardSnapshot>({});
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let granularity = $state<'day' | 'hour'>('day');

	const stats = $derived(normalizeStats(snapshot));
	const kpis = $derived(buildKpis(stats));
	const models = $derived(topModels(snapshot));
	const groups = $derived(topGroups(snapshot));
	const users = $derived(topUsers(snapshot));
	const trend = $derived(recentTrend(snapshot));
	const trendChartData = $derived({
		labels: trend.map((p) => p.date ?? p.time ?? ''),
		datasets: [
			{ label: 'Requests', data: trend.map((p) => p.requests), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)', tension: 0.3 },
			{ label: 'Tokens', data: trend.map((p) => p.tokens ?? Number(p.input_tokens ?? 0) + Number(p.output_tokens ?? 0)), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', tension: 0.3, yAxisID: 'y1' }
		]
	});
	const modelChartData = $derived({
		labels: models.map((m) => m.model ?? m.name ?? 'unknown'),
		datasets: [{ label: 'Cost', data: models.map((m) => Number(m.actual_cost ?? m.cost ?? 0)), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'] }]
	});
	const granularityOptions = [
		{ value: 'day', label: 'Day' },
		{ value: 'hour', label: 'Hour' }
	];

	async function loadDashboard() {
		loading = true;
		loadError = null;
		try {
			snapshot = await getDashboardSnapshot({ granularity });
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			snapshot = {};
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadDashboard();
	});

	const iconMap = [KeyRound, Server, BarChart3, Users, Database, Database, BarChart3, Clock];
</script>

<svelte:head>
	<title>{$_('admin.dashboard.title', { default: 'Admin Dashboard' })}</title>
</svelte:head>

<section class="space-y-5" data-testid="admin-dashboard-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M14 · Operations</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">
				{$_('admin.dashboard.title', { default: 'Admin Dashboard' })}
			</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.dashboard.description', {
					default: 'System-wide usage, account health, spend, and high-volume model activity.'
				})}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect
				bind:value={granularity}
				options={granularityOptions}
				onchange={loadDashboard}
				data-testid="dashboard-granularity"
			/>
			<Button variant="outline" class="px-3" onclick={loadDashboard} disabled={loading}>
				<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
			</Button>
		</div>
	</header>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each kpis as item, index (item.key)}
			{@const Icon = iconMap[index]}
			<div class="rounded-lg border bg-card p-4" data-testid="dashboard-kpi">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
						<p class="mt-2 text-2xl font-semibold">{loading ? '-' : item.value}</p>
						<p class="mt-1 text-xs text-muted-foreground">{loading ? 'Loading...' : item.sub}</p>
					</div>
					<Icon size={18} class="text-muted-foreground" />
				</div>
			</div>
		{/each}
	</div>

	<div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
		<div class="rounded-lg border bg-card">
			<div class="border-b p-4">
				<h2 class="text-sm font-semibold">Recent Usage Trend</h2>
				<p class="mt-1 text-xs text-muted-foreground">Last {trend.length} buckets from the dashboard snapshot.</p>
			</div>
			<div class="p-4">
				<ChartIsland type="line" data={trendChartData} loading={loading} empty={trend.length === 0}
					options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } }, interaction: { mode: 'nearest', axis: 'x', intersect: false }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, position: 'left', ticks: { font: { size: 10 } } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { font: { size: 10 } } } } }} />
			</div>
		</div>

		<div class="rounded-lg border bg-card">
			<div class="border-b p-4">
				<h2 class="text-sm font-semibold">Top Users</h2>
				<p class="mt-1 text-xs text-muted-foreground">Ranked by actual spend in the selected range.</p>
			</div>
			<div class="divide-y">
				{#if users.length === 0}
					<p class="p-6 text-sm text-muted-foreground">No user ranking data available.</p>
				{:else}
					{#each users as user}
						<div class="flex items-center justify-between gap-3 p-3 text-sm" data-testid="dashboard-user-row">
							<div class="min-w-0">
								<p class="truncate font-medium">{user.user_email ?? user.email ?? `User #${user.user_id ?? '-'}`}</p>
								<p class="text-xs text-muted-foreground">{formatCompact(user.requests)} requests · {formatCompact(user.tokens)} tokens</p>
							</div>
							<p class="font-mono text-xs">{formatMoney(user.actual_cost ?? user.cost)}</p>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<div class="rounded-lg border bg-card">
			<div class="border-b p-4">
				<h2 class="text-sm font-semibold">Top Models</h2>
			</div>
			<div class="p-4">
				<ChartIsland type="doughnut" data={modelChartData} loading={loading} empty={models.length === 0}
					options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
			</div>
		</div>

		<div class="rounded-lg border bg-card">
			<div class="border-b p-4">
				<h2 class="text-sm font-semibold">Top Groups</h2>
			</div>
			<div class="divide-y">
				{#if groups.length === 0}
					<p class="p-6 text-sm text-muted-foreground">No group data available.</p>
				{:else}
					{#each groups as group}
						<div class="flex items-center justify-between gap-3 p-3 text-sm" data-testid="dashboard-group-row">
							<div class="min-w-0">
								<p class="truncate font-medium">{group.group_name ?? group.name ?? `Group #${group.group_id ?? '-'}`}</p>
								<p class="text-xs text-muted-foreground">{formatCompact(group.requests)} requests · {formatCompact(group.tokens)} tokens</p>
							</div>
							<p class="font-mono text-xs">{formatMoney(group.actual_cost ?? group.cost)}</p>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</section>
