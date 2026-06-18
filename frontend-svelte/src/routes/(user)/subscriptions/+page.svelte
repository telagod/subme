<script lang="ts">
	/**
	 * /(user)/subscriptions · M6 user subscriptions
	 *
	 * 设计：
	 *   - 顶部 header + 当前订阅摘要卡（CurrentSubCard）。
	 *     · 有当前订阅 → 渲染卡片，含 Cancel + Upgrade 按钮。
	 *     · 无当前订阅 → CTA「Browse plans」直接 goto('/purchase')。
	 *   - 下方「订阅历史」list（cancelled / expired 子集），每行展示 plan、status、
	 *     ended / cancelled 时间、价格快照。
	 *   - Loading / error / empty 各段独立兜底，仪表盘半亮也比白屏好。
	 *   - Cancel 触发 → CancelDialog（bits-ui Dialog）。完成 → 刷新两个列表。
	 *   - NO QUENCH 皮肤 —— Zinc neutral only。
	 *
	 * RED LINE：
	 *   - 不在此层处理 401（apiClient 已统一）。
	 *   - 不展示完整 plan grid —— 浏览/续费一律走 /purchase。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { CreditCard, RotateCw } from '@lucide/svelte';
	import {
		getCurrent,
		listHistory,
		type UserSubscription,
		type SubscriptionStatus
	} from '$lib/api/user/subscriptions';
	import { showError } from '$lib/stores/toast.svelte';
	import CurrentSubCard from '$lib/features/subscriptions/CurrentSubCard.svelte';
	import CancelDialog from '$lib/features/subscriptions/CancelDialog.svelte';

	// ── state ───────────────────────────────────────────────────────────
	let current = $state<UserSubscription | null>(null);
	let history = $state<UserSubscription[]>([]);

	let loadingCurrent = $state(true);
	let loadingHistory = $state(true);

	let currentError = $state<string | null>(null);
	let historyError = $state<string | null>(null);

	// dialog 状态
	let cancelOpen = $state(false);
	let cancelTarget = $state<UserSubscription | null>(null);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadCurrent() {
		loadingCurrent = true;
		currentError = null;
		try {
			current = await getCurrent();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			currentError = msg || 'load failed';
			showError(
				$_('user.subscriptions.failedToLoad', { default: 'Failed to load subscription' })
			);
		} finally {
			loadingCurrent = false;
		}
	}

	async function loadHistory() {
		loadingHistory = true;
		historyError = null;
		try {
			history = await listHistory();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			historyError = msg || 'load failed';
			history = [];
		} finally {
			loadingHistory = false;
		}
	}

	function refreshAll() {
		void loadCurrent();
		void loadHistory();
	}

	onMount(() => {
		refreshAll();
	});

	// ── handlers ────────────────────────────────────────────────────────

	function handleCancelClick(sub: UserSubscription) {
		cancelTarget = sub;
		cancelOpen = true;
	}

	function handleUpgradeClick(_sub: UserSubscription) {
		goto('/purchase');
	}

	function handleBrowsePlans() {
		goto('/purchase');
	}

	function handleCancelCompleted(_id: string) {
		// 取消成功 → 同时刷新 current 与 history。
		refreshAll();
	}

	// ── helpers ─────────────────────────────────────────────────────────

	function fmtDate(s: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function fmtMoney(v: number | null): string {
		if (v === null || !Number.isFinite(v)) return '—';
		return `$${v.toFixed(2)}`;
	}

	function statusLabel(s: SubscriptionStatus): string {
		return $_(`user.subscriptions.status.${s}`, { default: s });
	}

	function statusBadgeClass(s: SubscriptionStatus): string {
		switch (s) {
			case 'active':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'trialing':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
			case 'pending':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'cancelled':
			case 'canceled':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'expired':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
			default:
				return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
		}
	}
</script>

<svelte:head>
	<title>{$_('nav.mySubscriptions', { default: 'My Subscriptions' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="subscriptions-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.subscriptions.pageTitle', { default: 'My Subscriptions' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.subscriptions.pageSubtitle', {
					default: 'Manage your active subscription and review past plans.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				aria-label={$_('user.subscriptions.refresh', { default: 'Refresh' })}
				data-testid="subscriptions-refresh-btn"
				onclick={refreshAll}
				class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</button>
		</div>
	</header>

	<!-- Current subscription / empty CTA -->
	{#if loadingCurrent}
		<div
			class="rounded-lg border border-border bg-card p-6"
			data-testid="subscriptions-current-loading"
		>
			<div class="h-6 w-40 animate-pulse rounded bg-muted"></div>
			<div class="mt-3 h-4 w-64 animate-pulse rounded bg-muted"></div>
			<div class="mt-5 grid grid-cols-2 gap-4">
				<div class="h-12 animate-pulse rounded bg-muted"></div>
				<div class="h-12 animate-pulse rounded bg-muted"></div>
			</div>
		</div>
	{:else if currentError && !current}
		<div
			class="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			data-testid="subscriptions-current-error"
		>
			<span>{$_('user.subscriptions.failedToLoad', { default: 'Failed to load subscription' })}</span>
			<button
				type="button"
				class="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium hover:bg-destructive/20"
				onclick={() => loadCurrent()}
				data-testid="subscriptions-current-retry"
			>
				{$_('user.subscriptions.retry', { default: 'Retry' })}
			</button>
		</div>
	{:else if current}
		<CurrentSubCard
			subscription={current}
			onCancelClick={handleCancelClick}
			onUpgradeClick={handleUpgradeClick}
		/>
	{:else}
		<!-- Empty state: no active subscription -->
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
			data-testid="subscriptions-empty-state"
		>
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<CreditCard class="h-6 w-6" />
			</div>
			<div class="space-y-1">
				<h2 class="text-base font-semibold text-foreground">
					{$_('user.subscriptions.emptyTitle', { default: 'No active subscription' })}
				</h2>
				<p class="max-w-sm text-sm text-muted-foreground">
					{$_('user.subscriptions.emptyDescription', {
						default: 'Pick a plan to start using the API beyond the free quota.'
					})}
				</p>
			</div>
			<button
				type="button"
				data-testid="subscriptions-browse-plans-btn"
				onclick={handleBrowsePlans}
				class="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				{$_('user.subscriptions.browsePlans', { default: 'Browse plans' })}
			</button>
		</div>
	{/if}

	<!-- History -->
	<section class="space-y-3" data-testid="subscriptions-history">
		<header class="flex items-center justify-between">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.subscriptions.historyTitle', { default: 'Subscription history' })}
			</h2>
			{#if historyError && !loadingHistory}
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
					onclick={() => loadHistory()}
					data-testid="subscriptions-history-retry"
				>
					{$_('user.subscriptions.retry', { default: 'Retry' })}
				</button>
			{/if}
		</header>

		{#if loadingHistory}
			<div class="space-y-2" data-testid="subscriptions-history-loading">
				{#each Array.from({ length: 3 }) as _placeholder, i (i)}
					<div class="h-12 w-full animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{:else if history.length === 0}
			<div
				class="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
				data-testid="subscriptions-history-empty"
			>
				{$_('user.subscriptions.historyEmpty', { default: 'No past subscriptions yet.' })}
			</div>
		{:else}
			<div
				class="overflow-hidden rounded-lg border border-border bg-card"
				data-testid="subscriptions-history-table-wrap"
			>
				<table class="w-full text-sm" data-testid="subscriptions-history-table">
					<thead>
						<tr
							class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
						>
							<th class="px-4 py-2 text-left font-medium">
								{$_('user.subscriptions.colPlan', { default: 'Plan' })}
							</th>
							<th class="px-4 py-2 text-left font-medium">
								{$_('user.subscriptions.colStatus', { default: 'Status' })}
							</th>
							<th class="px-4 py-2 text-left font-medium">
								{$_('user.subscriptions.colEnded', { default: 'Ended' })}
							</th>
							<th class="px-4 py-2 text-right font-medium">
								{$_('user.subscriptions.colAmount', { default: 'Amount' })}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each history as row (row.id)}
							<tr
								data-testid="subscriptions-history-row"
								data-sub-id={row.id}
								class="border-b border-border last:border-b-0 hover:bg-accent/40"
							>
								<td class="px-4 py-3 font-medium text-foreground">
									<span class="block max-w-[220px] truncate" title={row.planName}>
										{row.planName || row.platform}
									</span>
								</td>
								<td class="px-4 py-3">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(row.status)}"
									>
										{statusLabel(row.status)}
									</span>
								</td>
								<td class="px-4 py-3 text-muted-foreground">
									{fmtDate(row.cancelledAt ?? row.expiresAt)}
								</td>
								<td class="px-4 py-3 text-right tabular-nums text-muted-foreground">
									{fmtMoney(row.pricePaid)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</section>

<CancelDialog
	bind:open={cancelOpen}
	subscription={cancelTarget}
	onCancelCompleted={handleCancelCompleted}
/>
