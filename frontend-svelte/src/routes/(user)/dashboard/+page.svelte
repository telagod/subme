<script lang="ts">
	/**
	 * /(user)/dashboard · M6 user dashboard
	 *
	 * 设计：
	 *   - auth store 为 user 上下文唯一事实源（greeting / simpleMode toggle / 401 fallback）。
	 *   - 三张顶部卡片：Quota usage、Today's requests、Active subscriptions。
	 *   - 中段：7-day usage line chart（lazy-loaded chart.js + svelte-chartjs，
	 *     全程不在 eager bundle 里；见 UsageChart.svelte 注释）。
	 *   - 底部：Recent activity 表格（前 10 条；空态 → "No activity yet" + CTA 到 /keys）。
	 *   - Loading skeleton + error retry，每段独立失败兜底。
	 *   - 401 路径：apiClient interceptor 已统一兜底（hooks.client.ts 装的 hook
	 *     调 auth.logout() + goto('/login')）；本页只需要捕获 error message
	 *     === 'unauthorized'，避免重复触发 toast / 白屏。
	 *
	 * data-density 留给 CSS：tailwind `space-y-6` + 卡片紧凑型 padding。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getDashboardSummary,
		getRecentUsage,
		type DashboardSummary,
		type UsageEntry
	} from '$lib/api/user/dashboard';
	import UsageChart from '$lib/features/dashboard/UsageChart.svelte';

	// ── state ──────────────────────────────────────────────────────────
	let summary = $state<DashboardSummary | null>(null);
	let recent = $state<UsageEntry[] | null>(null);

	let loadingSummary = $state(true);
	let loadingRecent = $state(true);

	let summaryError = $state<string | null>(null);
	let recentError = $state<string | null>(null);

	const userEmail = $derived(auth.user?.email ?? '');
	const greetingText = $derived(
		userEmail
			? $_('user.dashboard.greeting', { values: { email: userEmail }, default: `Hello, ${userEmail}` })
			: $_('user.dashboard.greetingFallback', { default: 'Welcome back' })
	);

	// ── data loaders ───────────────────────────────────────────────────

	async function loadSummary() {
		loadingSummary = true;
		summaryError = null;
		try {
			summary = await getDashboardSummary();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			// 401 已由 interceptor 处理，避免重复抛错弹 toast。
			if (msg === 'unauthorized') return;
			summaryError = msg || 'load failed';
		} finally {
			loadingSummary = false;
		}
	}

	async function loadRecent() {
		loadingRecent = true;
		recentError = null;
		try {
			recent = await getRecentUsage(10);
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			recentError = msg || 'load failed';
			recent = [];
		} finally {
			loadingRecent = false;
		}
	}

	onMount(() => {
		void loadSummary();
		void loadRecent();
	});

	// ── derived UI helpers ────────────────────────────────────────────

	function fmtMoney(v: number): string {
		if (!Number.isFinite(v)) return '--';
		return `$${v.toFixed(4)}`;
	}

	function fmtInt(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '--';
		return Math.round(v).toLocaleString();
	}

	function fmtTimestamp(s: string): string {
		if (!s) return '--';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	const quotaPercent = $derived.by(() => {
		const q = summary?.quota;
		if (!q || q.unlimited || q.total <= 0) return 0;
		return Math.min(100, Math.round((q.used / q.total) * 100));
	});
</script>

<svelte:head>
	<title>{$_('nav.dashboard', { default: 'Dashboard' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="user-dashboard">
	<!-- Header -->
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div class="space-y-1">
			<h1
				class="text-2xl font-semibold tracking-tight text-foreground"
				data-testid="dashboard-greeting"
			>
				{greetingText}
			</h1>
			<p class="text-sm text-muted-foreground">
				{auth.isSimpleMode
					? $_('user.dashboard.simpleMode', { default: 'Simple mode' })
					: $_('user.dashboard.standardMode', { default: 'Standard mode' })}
			</p>
		</div>
	</header>

	<!-- Top row: 3 cards -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="dashboard-top-row">
		<!-- Quota card -->
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="dashboard-card-quota"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.dashboard.quotaCard.title', { default: 'Quota' })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-6 w-32 animate-pulse rounded bg-muted"></div>
				<div class="mt-2 h-2 w-full animate-pulse rounded bg-muted"></div>
			{:else if summary?.quota}
				<p
					class="mt-2 text-xl font-semibold text-foreground"
					data-testid="dashboard-quota-value"
				>
					{#if summary.quota.unlimited}
						{$_('user.dashboard.quotaCard.unlimited', { default: 'Unlimited' })}
					{:else}
						{$_('user.dashboard.quotaCard.usedOf', {
							values: {
								used: fmtMoney(summary.quota.used),
								total: fmtMoney(summary.quota.total)
							},
							default: `${fmtMoney(summary.quota.used)} of ${fmtMoney(summary.quota.total)}`
						})}
					{/if}
				</p>
				{#if !summary.quota.unlimited}
					<div
						class="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-valuenow={quotaPercent}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label={$_('user.dashboard.quotaCard.usedAria', {
							values: { percent: String(quotaPercent) },
							default: `Quota used: ${quotaPercent}%`
						})}
					>
						<div
							class="h-full rounded-full bg-primary transition-all"
							style="width: {quotaPercent}%"
							data-testid="dashboard-quota-bar"
						></div>
					</div>
				{/if}
			{:else}
				<p class="mt-2 text-xl font-semibold text-muted-foreground">--</p>
			{/if}
		</article>

		<!-- Today's requests -->
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="dashboard-card-requests"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.dashboard.requestsCard.title', { default: "Today's requests" })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
			{:else if summary?.todayRequests !== null && summary?.todayRequests !== undefined}
				<p
					class="mt-2 text-3xl font-semibold text-foreground"
					data-testid="dashboard-requests-value"
				>
					{fmtInt(summary.todayRequests)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{$_('user.dashboard.requestsCard.subtitle', { default: 'Across all keys' })}
				</p>
			{:else}
				<p class="mt-2 text-3xl font-semibold text-muted-foreground">--</p>
			{/if}
		</article>

		<!-- Active subscriptions -->
		<article
			class="rounded-lg border border-border bg-card p-4 shadow-sm"
			data-testid="dashboard-card-subscriptions"
		>
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.dashboard.subscriptionsCard.title', { default: 'Active subscriptions' })}
			</h2>
			{#if loadingSummary}
				<div class="mt-3 h-8 w-16 animate-pulse rounded bg-muted"></div>
			{:else if summary?.activeSubscriptions !== null && summary?.activeSubscriptions !== undefined}
				<p
					class="mt-2 text-3xl font-semibold text-foreground"
					data-testid="dashboard-subscriptions-value"
				>
					{fmtInt(summary.activeSubscriptions)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{summary.activeSubscriptions === 0
						? $_('user.dashboard.subscriptionsCard.none', { default: 'No active subscriptions' })
						: $_('user.dashboard.subscriptionsCard.subtitle', {
								values: { count: String(summary.activeSubscriptions) },
								default: `${summary.activeSubscriptions} active`
							})}
				</p>
			{:else}
				<p class="mt-2 text-3xl font-semibold text-muted-foreground">--</p>
			{/if}
		</article>
	</div>

	<!-- Summary-level error w/ retry (cards already degraded above; retry refetches all) -->
	{#if summaryError}
		<div
			class="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			data-testid="dashboard-summary-error"
		>
			<span>{$_('user.dashboard.errors.loadFailed', { default: 'Failed to load dashboard' })}</span>
			<button
				type="button"
				class="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
				onclick={() => loadSummary()}
				data-testid="dashboard-summary-retry"
			>
				{$_('user.dashboard.errors.retry', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- 7-day chart -->
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="dashboard-chart-card"
	>
		<h2 class="mb-3 text-sm font-medium text-muted-foreground">
			{$_('user.dashboard.chart.title', { default: '7-day usage' })}
		</h2>
		<UsageChart data={summary?.trend ?? null} loading={loadingSummary} />
	</article>

	<!-- Recent activity -->
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="dashboard-recent-card"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-medium text-muted-foreground">
				{$_('user.dashboard.recent.title', { default: 'Recent activity' })}
			</h2>
			{#if recentError && !loadingRecent}
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
					onclick={() => loadRecent()}
					data-testid="dashboard-recent-retry"
				>
					{$_('user.dashboard.errors.retry', { default: 'Retry' })}
				</button>
			{/if}
		</div>
		{#if loadingRecent}
			<div class="space-y-2" data-testid="dashboard-recent-loading">
				{#each Array.from({ length: 4 }) as _placeholder, i (i)}
					<div class="h-8 w-full animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{:else if recent === null || recent.length === 0}
			<div
				class="flex flex-col items-center justify-center gap-2 py-8 text-center"
				data-testid="dashboard-recent-empty"
			>
				<p class="text-sm font-medium text-foreground">
					{$_('user.dashboard.recent.empty', { default: 'No activity yet' })}
				</p>
				<p class="text-xs text-muted-foreground">
					{$_('user.dashboard.recent.emptyHint', { default: 'Start by creating an API key.' })}
				</p>
				<a
					href="/keys"
					class="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					data-testid="dashboard-recent-empty-cta"
				>
					{$_('user.dashboard.recent.emptyCta', { default: 'Create an API key' })}
				</a>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table
					class="w-full text-left text-sm"
					data-testid="dashboard-recent-table"
				>
					<thead>
						<tr class="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
							<th class="py-2 pr-3 font-medium">
								{$_('user.dashboard.recent.columnTimestamp', { default: 'Time' })}
							</th>
							<th class="py-2 pr-3 font-medium">
								{$_('user.dashboard.recent.columnEndpoint', { default: 'Endpoint' })}
							</th>
							<th class="py-2 pr-3 font-medium">
								{$_('user.dashboard.recent.columnModel', { default: 'Model' })}
							</th>
							<th class="py-2 pr-3 text-right font-medium">
								{$_('user.dashboard.recent.columnTokens', { default: 'Tokens' })}
							</th>
							<th class="py-2 text-right font-medium">
								{$_('user.dashboard.recent.columnCost', { default: 'Cost' })}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each recent as row (row.id)}
							<tr class="border-b border-border/40 last:border-0">
								<td class="py-2 pr-3 text-xs text-muted-foreground">{fmtTimestamp(row.timestamp)}</td>
								<td class="py-2 pr-3 font-mono text-xs">{row.endpoint || '--'}</td>
								<td class="py-2 pr-3 text-xs">{row.model || '--'}</td>
								<td class="py-2 pr-3 text-right tabular-nums">{fmtInt(row.tokens)}</td>
								<td class="py-2 text-right tabular-nums">{fmtMoney(row.cost)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</article>
</section>
