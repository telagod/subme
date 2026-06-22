<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		BarChart3,
		CalendarDays,
		Code2,
		Eye,
		EyeOff,
		KeyRound,
		Loader2,
		RefreshCw,
		Search
	} from '@lucide/svelte';
	import { authApi, type PublicSettings } from '$lib/api/auth';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import { legalSiteLogo } from '$lib/features/public-pages/legal';
	import {
		buildKeyUsageQueryParams,
		buildRingItems,
		fetchKeyUsage,
		fmtNum,
		summarizeUsageStats,
		usd,
		type DailyUsageDays,
		type DateRangeKey,
		type KeyUsageResponse
	} from '$lib/features/public-pages/key-usage';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	let settings = $state<PublicSettings | null>(null);
	let apiKey = $state('');
	let keyVisible = $state(false);
	let isQuerying = $state(false);
	let showResults = $state(false);
	let showDatePicker = $state(false);
	let resultData = $state<KeyUsageResponse | null>(null);
	let currentRange = $state<DateRangeKey>('today');
	let customStartDate = $state('');
	let customEndDate = $state('');
	let dailyUsageDays = $state<DailyUsageDays>(30);

	const siteName = $derived(settings?.site_name || 'subme');
	const siteLogo = $derived(legalSiteLogo(settings) || '/logo.svg');
	const docUrl = $derived(settings?.doc_url || '');
	const githubUrl = 'https://github.com/telagod/subme';
	const dateRanges = $derived([
		{ key: 'today' as const, label: $_('keyUsage.dateRangeToday', { default: 'Today' }) },
		{ key: '7d' as const, label: $_('keyUsage.dateRange7d', { default: '7 Days' }) },
		{ key: '30d' as const, label: $_('keyUsage.dateRange30d', { default: '30 Days' }) },
		{ key: 'custom' as const, label: $_('keyUsage.dateRangeCustom', { default: 'Custom' }) }
	]);
	const ringItems = $derived(buildRingItems(resultData));
	const usageStatCells = $derived(summarizeUsageStats(resultData));
	const dailyUsageRows = $derived(Array.isArray(resultData?.daily_usage) ? resultData.daily_usage : []);
	const modelStats = $derived(Array.isArray(resultData?.model_stats) ? resultData.model_stats : []);
	const statusInfo = $derived.by(() => {
		if (!resultData) return null;
		if (resultData.mode === 'quota_limited') {
			const status = resultData.status || 'unknown';
			return {
				label: $_('keyUsage.quotaMode', { default: 'Key quota mode' }),
				statusText: status,
				active: resultData.isValid !== false && status === 'active'
			};
		}
		return {
			label: resultData.planName || $_('keyUsage.walletBalance', { default: 'Wallet balance' }),
			statusText: 'active',
			active: true
		};
	});

	onMount(() => {
		void authApi.getPublicSettings().then((value) => {
			settings = value;
		}).catch(() => {});
	});

	function getDateParams(): string {
		return buildKeyUsageQueryParams({
			range: currentRange,
			dailyUsageDays,
			customStartDate,
			customEndDate
		});
	}

	function setDateRange(range: DateRangeKey) {
		currentRange = range;
		if (range !== 'custom' && resultData && apiKey.trim()) void queryKey();
	}

	function setDailyUsageDays(days: DailyUsageDays) {
		if (dailyUsageDays === days) return;
		dailyUsageDays = days;
		if (resultData && apiKey.trim()) void queryKey();
	}

	async function queryKey() {
		if (isQuerying) return;
		const key = apiKey.trim();
		if (!key) {
			showInfo($_('keyUsage.enterApiKey', { default: 'Please enter an API key' }));
			return;
		}

		isQuerying = true;
		showResults = true;
		resultData = null;
		try {
			resultData = await fetchKeyUsage(key, getDateParams());
			showDatePicker = true;
			showSuccess($_('keyUsage.querySuccess', { default: 'Query successful' }));
		} catch (err) {
			showResults = false;
			showError(
				err instanceof Error
					? err.message
					: $_('keyUsage.queryFailedRetry', { default: 'Query failed, please try again later' })
			);
		} finally {
			isQuerying = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('keyUsage.title', { default: 'API Key Usage' })} · {siteName}</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground" data-testid="key-usage-page">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
			<a href="/home" class="flex min-w-0 items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary">
					<img src={siteLogo} alt="Logo" class="h-full w-full object-contain" />
				</span>
				<span class="truncate text-base font-semibold">{siteName}</span>
			</a>
			<div class="flex items-center gap-2">
				{#if docUrl}
					<a href={docUrl} target="_blank" rel="noopener noreferrer" class="hidden rounded-md border border-border px-3 py-2 text-sm hover:bg-accent sm:inline-flex">
						{$_('home.viewDocs', { default: 'Docs' })}
				</a>
			{/if}
			<a href={githubUrl} target="_blank" rel="noopener noreferrer" class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-accent" aria-label="GitHub">
				<Code2 class="h-4 w-4" />
			</a>
			</div>
		</div>
	</header>

	<section class="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
		<div class="space-y-2">
			<div class="flex items-center gap-2 text-muted-foreground">
				<KeyRound class="h-5 w-5" />
				<span class="text-sm font-medium">/v1/usage</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-normal sm:text-3xl">
				{$_('keyUsage.title', { default: 'API Key Usage' })}
			</h1>
			<p class="max-w-2xl text-sm text-muted-foreground">
				{$_('keyUsage.subtitle', {
					default: 'Enter your API key to view real-time consumption and usage status'
				})}
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card p-4 sm:p-5">
			<div class="grid gap-3 lg:grid-cols-[1fr_auto]">
				<div class="relative">
					<Input
						class="h-11 pr-11 font-mono"
						type={keyVisible ? 'text' : 'password'}
						placeholder={$_('keyUsage.placeholder', { default: 'sk-ant-mirror-xxxxxxxxxxxx' })}
						bind:value={apiKey}
						onkeydown={(e) => e.key === 'Enter' && queryKey()}
					/>
					<Button
						variant="ghost"
						size="icon"
						class="absolute right-2 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
						aria-label={$_('keyUsage.toggleKeyVisibility', { default: 'Toggle key visibility' })}
						onclick={() => (keyVisible = !keyVisible)}
					>
						{#if keyVisible}
							<EyeOff class="h-4 w-4" />
						{:else}
							<Eye class="h-4 w-4" />
						{/if}
					</Button>
				</div>
				<Button
					class="h-11 px-5"
					disabled={isQuerying}
					onclick={queryKey}
				>
					{#if isQuerying}
						<Loader2 class="h-4 w-4 animate-spin" />
						{$_('keyUsage.querying', { default: 'Querying...' })}
					{:else}
						<Search class="h-4 w-4" />
						{$_('keyUsage.query', { default: 'Query' })}
					{/if}
				</Button>
			</div>
			<p class="mt-3 text-xs text-muted-foreground">
				{$_('keyUsage.privacyNote', {
					default: 'Your key is processed locally in the browser and is never stored'
				})}
			</p>
		</div>

		{#if showDatePicker}
			<div class="rounded-lg border border-border bg-card p-4" data-testid="key-usage-date-range">
				<div class="flex flex-wrap items-center gap-2">
					<span class="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
						<CalendarDays class="h-4 w-4" />
						{$_('keyUsage.dateRange', { default: 'Date range:' })}
					</span>
					{#each dateRanges as range}
						<Button
							size="sm"
							variant={currentRange === range.key ? 'default' : 'outline'}
							onclick={() => setDateRange(range.key)}
						>
							{range.label}
						</Button>
					{/each}
					{#if currentRange === 'custom'}
						<Input class="h-8 w-auto px-2 text-xs" type="date" bind:value={customStartDate} />
						<Input class="h-8 w-auto px-2 text-xs" type="date" bind:value={customEndDate} />
						<Button size="sm" onclick={queryKey}>
							{$_('keyUsage.apply', { default: 'Apply' })}
						</Button>
					{/if}
				</div>
			</div>
		{/if}

		{#if showResults}
			{#if isQuerying && !resultData}
				<div class="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground" data-testid="key-usage-loading">
					<Loader2 class="mx-auto mb-3 h-8 w-8 animate-spin" />
					{$_('keyUsage.querying', { default: 'Querying...' })}
				</div>
			{:else if resultData}
				<section class="space-y-6" data-testid="key-usage-results">
					<div class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{statusInfo?.label}</p>
							<p class="mt-1 text-lg font-semibold">{statusInfo?.statusText}</p>
						</div>
						<span class="inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium {statusInfo?.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}">
							{statusInfo?.active ? $_('keyUsage.active', { default: 'Active' }) : $_('keyUsage.inactive', { default: 'Inactive' })}
						</span>
					</div>

					{#if ringItems.length > 0}
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each ringItems as item}
								<div class="rounded-lg border border-border bg-card p-4">
									<div class="flex items-start justify-between gap-3">
										<div>
											<p class="text-sm font-medium text-muted-foreground">{item.title}</p>
											<p class="mt-2 text-xl font-semibold">{item.amount}</p>
										</div>
										<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
											{#if item.isBalance}
												<BarChart3 class="h-5 w-5" />
											{:else}
												{item.pct}%
											{/if}
										</div>
									</div>
									{#if !item.isBalance}
										<div class="mt-4 h-2 overflow-hidden rounded-full bg-muted">
											<div class="h-full rounded-full bg-primary" style={`width: ${item.pct}%`}></div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if usageStatCells.length > 0}
						<div class="rounded-lg border border-border bg-card p-4">
							<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
								{$_('keyUsage.tokenStats', { default: 'Token statistics' })}
							</h2>
							<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
								{#each usageStatCells as cell}
									<div class="rounded-md border border-border bg-background p-3">
										<p class="text-xs text-muted-foreground">{cell.label}</p>
										<p class="mt-1 text-sm font-semibold">{cell.value}</p>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="rounded-lg border border-border bg-card p-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
								{$_('keyUsage.dailyDetail', { default: 'Daily breakdown' })}
							</h2>
							<div class="flex items-center gap-2">
								{#each [7, 30, 90] as days}
									<Button
										size="sm"
										variant={dailyUsageDays === days ? 'default' : 'outline'}
										class="px-2"
										onclick={() => setDailyUsageDays(days as DailyUsageDays)}
									>
										{days}d
									</Button>
								{/each}
								<Button variant="outline" size="icon" onclick={queryKey} aria-label={$_('keyUsage.refresh', { default: 'Refresh' })}>
									<RefreshCw class="h-4 w-4" />
								</Button>
							</div>
						</div>
						{#if dailyUsageRows.length > 0}
							<div class="mt-4 overflow-x-auto">
								<table class="w-full min-w-[760px] text-sm">
									<thead class="border-b text-xs uppercase text-muted-foreground">
										<tr>
											<th class="py-2 text-left">{$_('keyUsage.date', { default: 'Date' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.requests', { default: 'Requests' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.inputTokens', { default: 'Input tokens' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.outputTokens', { default: 'Output tokens' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.cacheReadTokens', { default: 'Cache read' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.cacheWriteTokens', { default: 'Cache write' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.cost', { default: 'Cost' })}</th>
										</tr>
									</thead>
									<tbody>
										{#each dailyUsageRows as row}
											<tr class="border-b last:border-b-0">
												<td class="py-2 font-medium">{row.date}</td>
												<td class="py-2 text-right">{fmtNum(row.requests)}</td>
												<td class="py-2 text-right">{fmtNum(row.input_tokens)}</td>
												<td class="py-2 text-right">{fmtNum(row.output_tokens)}</td>
												<td class="py-2 text-right">{fmtNum(row.cache_read_tokens)}</td>
												<td class="py-2 text-right">{fmtNum(row.cache_write_tokens)}</td>
												<td class="py-2 text-right">{usd(row.actual_cost ?? row.cost)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p class="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
								{$_('keyUsage.noDailyUsage', { default: 'No daily usage data' })}
							</p>
						{/if}
					</div>

					{#if modelStats.length > 0}
						<div class="rounded-lg border border-border bg-card p-4">
							<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
								{$_('keyUsage.modelStats', { default: 'Model usage statistics' })}
							</h2>
							<div class="mt-4 overflow-x-auto">
								<table class="w-full min-w-[760px] text-sm">
									<thead class="border-b text-xs uppercase text-muted-foreground">
										<tr>
											<th class="py-2 text-left">{$_('keyUsage.model', { default: 'Model' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.requests', { default: 'Requests' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.totalTokens', { default: 'Total tokens' })}</th>
											<th class="py-2 text-right">{$_('keyUsage.cost', { default: 'Cost' })}</th>
										</tr>
									</thead>
									<tbody>
										{#each modelStats as row}
											<tr class="border-b last:border-b-0">
												<td class="py-2 font-medium">{row.model || '-'}</td>
												<td class="py-2 text-right">{fmtNum(row.requests)}</td>
												<td class="py-2 text-right">{fmtNum(row.total_tokens)}</td>
												<td class="py-2 text-right">{usd(row.actual_cost ?? row.cost)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</section>
			{/if}
		{/if}
	</section>
</main>
