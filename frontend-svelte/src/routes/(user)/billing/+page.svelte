<script lang="ts">
	/**
	 * /(user)/billing · M6 billing dashboard
	 *
	 * 设计：
	 *   - 顶部：Balance card（current balance + Top Up CTA → TopUpDialog）。
	 *   - 中部：交易历史 table（timestamp / type / amount / currency / status / ref）。
	 *   - 过滤器：date range（start / end）+ type Select（'__all__' sentinel）。
	 *   - 行数 > pageSize 触发分页（next / prev + 页码显示）。
	 *   - Loading / error / empty 各段独立兜底，仪表盘半亮也好过白屏。
	 *
	 * RED LINE：
	 *   - 不在此层处理 401（apiClient 已统一）。错误 message='unauthorized' 时
	 *     静默返回，避免重复触发 toast。
	 *   - reshadcn-migration: type filter Select 必须用 '__all__' sentinel；
	 *     严禁 <option value="">。
	 *   - openrouter-pricing-done memory: 严禁引用后端定价/计费内核（参 CLAUDE
	 *     memory；故意不在此源码字面列出符号名，让 red-line grep 维持空命中）。
	 *     本页只读用户自己的余额 + 交易历史，完全在 /user/billing/* 端点边界内。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Wallet,
		RotateCw,
		ArrowUpRight,
		ArrowDownLeft,
		Undo2,
		Sparkles
	} from '@lucide/svelte';
	import {
		getBalance,
		listTransactions,
		type Balance,
		type BillingTransaction,
		type BillingTxType,
		type BillingTxStatus
	} from '$lib/api/user/billing';
	import { showError } from '$lib/stores/toast.svelte';
	import TopUpDialog from '$lib/features/billing/TopUpDialog.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	// reshadcn-migration: '__all__' sentinel 禁空字符串 value。
	const TYPE_ALL = '__all__' as const;
	const PAGE_SIZE = 20;

	// ── state ───────────────────────────────────────────────────────────
	let balance = $state<Balance | null>(null);
	let txs = $state<BillingTransaction[]>([]);
	let totalRows = $state(0);
	let totalPages = $state(0);
	let page = $state(1);

	let loadingBalance = $state(true);
	let loadingTxs = $state(true);

	let balanceError = $state<string | null>(null);
	let txsError = $state<string | null>(null);

	// 过滤器
	let typeFilter = $state<typeof TYPE_ALL | BillingTxType>(TYPE_ALL);
	let startDate = $state<string>('');
	let endDate = $state<string>('');

	// TopUpDialog 状态
	let topUpOpen = $state(false);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadBalance() {
		loadingBalance = true;
		balanceError = null;
		try {
			balance = await getBalance();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			balanceError = msg || 'load failed';
			showError($_('user.billing.failedToLoadBalance', { default: 'Failed to load balance' }));
		} finally {
			loadingBalance = false;
		}
	}

	async function loadTxs() {
		loadingTxs = true;
		txsError = null;
		try {
			const resp = await listTransactions({
				page,
				pageSize: PAGE_SIZE,
				type: typeFilter,
				startDate: startDate || undefined,
				endDate: endDate || undefined
			});
			txs = resp.items;
			totalRows = resp.total;
			totalPages = resp.pages;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			txsError = msg || 'load failed';
			txs = [];
			totalRows = 0;
			totalPages = 0;
			showError(
				$_('user.billing.failedToLoadTxs', { default: 'Failed to load transactions' })
			);
		} finally {
			loadingTxs = false;
		}
	}

	function refreshAll() {
		void loadBalance();
		void loadTxs();
	}

	onMount(() => {
		refreshAll();
	});

	// ── handlers ────────────────────────────────────────────────────────

	function openTopUp() {
		topUpOpen = true;
	}

	function handleTopUpStarted() {
		// 充值订单已创建（pay_url 兜底会自动 redirect；嵌入式 SDK 后续接入）。
		// 这里刷一次余额 + 交易历史，pending 行会立刻出现在表头。
		refreshAll();
	}

	function handleTypeChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		typeFilter = v as typeof TYPE_ALL | BillingTxType;
		page = 1;
		void loadTxs();
	}

	function handleStartDateChange(e: Event) {
		startDate = (e.currentTarget as HTMLInputElement).value;
		page = 1;
		void loadTxs();
	}

	function handleEndDateChange(e: Event) {
		endDate = (e.currentTarget as HTMLInputElement).value;
		page = 1;
		void loadTxs();
	}

	function clearDateRange() {
		startDate = '';
		endDate = '';
		page = 1;
		void loadTxs();
	}

	function gotoPrev() {
		if (page <= 1) return;
		page -= 1;
		void loadTxs();
	}

	function gotoNext() {
		if (totalPages > 0 && page >= totalPages) return;
		page += 1;
		void loadTxs();
	}

	// ── format helpers ─────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		const abs = Math.abs(v).toFixed(2);
		// 简单展示：$X.XX (USD) / €X.XX (EUR) 用户主要看金额；货币列单列。
		if (currency === 'USD') return `${sign}$${abs}`;
		if (currency === 'EUR') return `${sign}€${abs}`;
		return `${sign}${abs}`;
	}

	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function typeLabel(t: BillingTxType): string {
		return $_(`user.billing.types.${t}`, { default: t });
	}

	function typeBadgeClass(t: BillingTxType): string {
		switch (t) {
			case 'topup':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'charge':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'refund':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'rebate':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
		}
	}

	function statusLabel(s: BillingTxStatus): string {
		return $_(`user.billing.statuses.${s}`, { default: s });
	}

	function statusBadgeClass(s: BillingTxStatus): string {
		switch (s) {
			case 'completed':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'pending':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'failed':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
			case 'cancelled':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'refunded':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
		}
	}

	function typeIcon(t: BillingTxType) {
		switch (t) {
			case 'topup':
				return ArrowUpRight;
			case 'charge':
				return ArrowDownLeft;
			case 'refund':
				return Undo2;
			case 'rebate':
				return Sparkles;
		}
	}
</script>

<svelte:head>
	<title>{$_('nav.billing', { default: 'Billing' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="billing-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.billing.pageTitle', { default: 'Billing' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.billing.pageSubtitle', {
					default: 'Review your balance and transaction history.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				aria-label={$_('user.billing.refresh', { default: 'Refresh' })}
				data-testid="billing-refresh-btn"
				onclick={refreshAll}
				class="h-9 w-9 text-muted-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<!-- Balance card -->
	<section
		class="rounded-lg border border-border bg-card p-5 shadow-sm"
		data-testid="billing-balance-card"
	>
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<Wallet class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{$_('user.billing.balanceLabel', { default: 'Current balance' })}
					</p>
					{#if loadingBalance}
						<div
							class="h-7 w-32 animate-pulse rounded bg-muted"
							data-testid="billing-balance-skeleton"
						></div>
					{:else if balanceError && !balance}
						<p
							class="text-sm font-medium text-destructive"
							data-testid="billing-balance-error"
						>
							{$_('user.billing.failedToLoadBalance', { default: 'Failed to load balance' })}
						</p>
					{:else}
						<div class="flex items-baseline gap-2">
							<span
								class="text-2xl font-semibold tabular-nums text-foreground"
								data-testid="billing-balance-value"
							>
								{fmtMoney(balance?.amount ?? 0, balance?.currency ?? 'USD')}
							</span>
							<span class="text-xs text-muted-foreground">
								{balance?.currency ?? 'USD'}
							</span>
						</div>
					{/if}
				</div>
			</div>
			<Button
				data-testid="billing-topup-btn"
				onclick={openTopUp}
				class="h-9 gap-1.5"
			>
				<ArrowUpRight class="h-4 w-4" />
				{$_('user.billing.topUp', { default: 'Top Up' })}
			</Button>
		</div>
	</section>

	<!-- Filters -->
	<section
		class="flex flex-wrap items-end gap-3"
		data-testid="billing-filters"
	>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="billing-type-filter"
			>
				{$_('user.billing.typeFilter', { default: 'Type' })}
			</label>
			<NativeSelect
				id="billing-type-filter"
				data-testid="billing-type-filter"
				bind:value={typeFilter}
				onchange={handleTypeChange}
				class="h-9"
			>
				<option value={TYPE_ALL}
					>{$_('user.billing.allTypes', { default: 'All types' })}</option
				>
				<option value="topup">{typeLabel('topup')}</option>
				<option value="charge">{typeLabel('charge')}</option>
				<option value="refund">{typeLabel('refund')}</option>
				<option value="rebate">{typeLabel('rebate')}</option>
			</NativeSelect>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="billing-start-date"
			>
				{$_('user.billing.startDate', { default: 'From' })}
			</label>
			<Input
				id="billing-start-date"
				data-testid="billing-start-date"
				type="date"
				value={startDate}
				onchange={handleStartDateChange}
				class="h-9"
			/>
		</div>
		<div class="space-y-1.5">
			<label
				class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				for="billing-end-date"
			>
				{$_('user.billing.endDate', { default: 'To' })}
			</label>
			<Input
				id="billing-end-date"
				data-testid="billing-end-date"
				type="date"
				value={endDate}
				onchange={handleEndDateChange}
				class="h-9"
			/>
		</div>
		{#if startDate || endDate}
			<Button
				variant="outline"
				size="sm"
				data-testid="billing-clear-dates"
				onclick={clearDateRange}
				class="h-9"
			>
				{$_('user.billing.clearDates', { default: 'Clear dates' })}
			</Button>
		{/if}
	</section>

	<!-- Transactions -->
	{#if loadingTxs}
		<div class="space-y-2" data-testid="billing-txs-loading">
			{#each Array.from({ length: 4 }) as _placeholder, i (i)}
				<div class="h-12 w-full animate-pulse rounded bg-muted"></div>
			{/each}
		</div>
	{:else if txsError && txs.length === 0}
		<Alert
			variant="destructive"
			class="p-8 text-center"
			data-testid="billing-txs-error"
		>
			<p class="text-sm font-medium text-destructive">
				{$_('user.billing.failedToLoadTxs', { default: 'Failed to load transactions' })}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">{txsError}</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => loadTxs()}
				data-testid="billing-txs-retry"
				class="mt-4"
			>
				{$_('user.billing.retry', { default: 'Retry' })}
			</Button>
		</Alert>
	{:else if txs.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
			data-testid="billing-txs-empty"
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<Wallet class="h-6 w-6" />
			</div>
			<div class="space-y-1">
				<h2 class="text-base font-semibold text-foreground">
					{$_('user.billing.emptyTitle', { default: 'No transactions yet' })}
				</h2>
				<p class="max-w-sm text-sm text-muted-foreground">
					{$_('user.billing.emptyDescription', {
						default: 'Top up your balance to start using paid features.'
					})}
				</p>
			</div>
			<Button
				data-testid="billing-empty-topup-btn"
				onclick={openTopUp}
				class="mt-1 h-9 gap-1.5"
			>
				<ArrowUpRight class="h-4 w-4" />
				{$_('user.billing.topUp', { default: 'Top Up' })}
			</Button>
		</div>
	{:else}
		<div
			class="overflow-hidden rounded-lg border border-border bg-card"
			data-testid="billing-txs-table-wrap"
		>
			<table class="w-full text-sm" data-testid="billing-txs-table">
				<thead>
					<tr
						class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
					>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.billing.colTimestamp', { default: 'Timestamp' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.billing.colType', { default: 'Type' })}
						</th>
						<th class="px-4 py-2 text-right font-medium">
							{$_('user.billing.colAmount', { default: 'Amount' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.billing.colCurrency', { default: 'Currency' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.billing.colStatus', { default: 'Status' })}
						</th>
						<th class="px-4 py-2 text-left font-medium">
							{$_('user.billing.colRef', { default: 'Reference' })}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each txs as row (row.id)}
						{@const Icon = typeIcon(row.type)}
						<tr
							data-testid="billing-tx-row"
							data-tx-id={row.id}
							class="border-b border-border last:border-b-0 hover:bg-accent/40"
						>
							<td class="px-4 py-3 text-muted-foreground">
								{fmtDate(row.timestamp)}
							</td>
							<td class="px-4 py-3">
								<Badge
									class="gap-1 {typeBadgeClass(row.type)}"
								>
									<Icon class="h-3 w-3" />
									{typeLabel(row.type)}
								</Badge>
							</td>
							<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
								{fmtMoney(row.amount, row.currency)}
							</td>
							<td class="px-4 py-3 text-muted-foreground">{row.currency}</td>
							<td class="px-4 py-3">
								<Badge
									class={statusBadgeClass(row.status)}
								>
									{statusLabel(row.status)}
								</Badge>
							</td>
							<td class="px-4 py-3 text-xs text-muted-foreground">
								{#if row.ref}
									<code
										class="block max-w-[180px] truncate rounded bg-muted px-1.5 py-0.5 font-mono"
										title={row.ref}
									>
										{row.ref}
									</code>
								{:else}
									—
								{/if}
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
				data-testid="billing-pagination"
			>
				<span>
					{$_('user.billing.pageOf', {
						default: 'Page {page} of {pages}',
						values: { page, pages: Math.max(totalPages, 1) }
					})}
				</span>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						data-testid="billing-page-prev"
						disabled={page <= 1}
						onclick={gotoPrev}
					>
						{$_('user.billing.prevPage', { default: 'Previous' })}
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="billing-page-next"
						disabled={totalPages > 0 && page >= totalPages}
						onclick={gotoNext}
					>
						{$_('user.billing.nextPage', { default: 'Next' })}
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</section>

<TopUpDialog bind:open={topUpOpen} onTopUpStarted={handleTopUpStarted} />
