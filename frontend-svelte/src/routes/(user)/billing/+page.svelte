<script lang="ts">
	/**
	 * /(user)/billing · M6 billing dashboard (thin orchestrator)
	 *
	 * Layout:
	 *   - Header with refresh button
	 *   - BalanceCard (balance display + Top Up CTA)
	 *   - TransactionHistoryTable (filters + table + pagination)
	 *   - TopUpDialog (modal, rendered at bottom)
	 *
	 * All data fetching lives here; child components receive data via props
	 * and communicate back via onXxx callbacks.
	 *
	 * RED LINE:
	 *   - 401 handling: apiClient handles uniformly; 'unauthorized' messages
	 *     silently return to avoid duplicate toasts.
	 *   - reshadcn-migration: type filter uses '__all__' sentinel (enforced
	 *     in TransactionHistoryTable).
	 *   - openrouter-pricing-done: no pricing/billing core references.
	 *     This page only reads user balance + transaction history within
	 *     /user/billing/* endpoint boundary.
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RotateCw } from '@lucide/svelte';
	import {
		getBalance,
		listTransactions,
		type Balance,
		type BillingTransaction,
		type BillingTxType
	} from '$lib/api/user/billing';
	import { showError } from '$lib/stores/toast.svelte';
	import BalanceCard from '$lib/features/billing/BalanceCard.svelte';
	import TransactionHistoryTable from '$lib/features/billing/TransactionHistoryTable.svelte';
	import TopUpDialog from '$lib/features/billing/TopUpDialog.svelte';
	import Button from '$lib/ui/Button.svelte';

	// reshadcn-migration: '__all__' sentinel.
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

	// Filters
	let typeFilter = $state<typeof TYPE_ALL | BillingTxType>(TYPE_ALL);
	let startDate = $state<string>('');
	let endDate = $state<string>('');

	// TopUpDialog state
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
					default: 'View your balance and transaction history.'
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
	<BalanceCard
		{balance}
		loading={loadingBalance}
		error={balanceError}
		onTopUp={openTopUp}
	/>

	<!-- Transaction history (filters + table + pagination) -->
	<TransactionHistoryTable
		{txs}
		loading={loadingTxs}
		error={txsError}
		{typeFilter}
		{startDate}
		{endDate}
		{page}
		{totalRows}
		{totalPages}
		pageSize={PAGE_SIZE}
		onTypeChange={handleTypeChange}
		onStartDateChange={handleStartDateChange}
		onEndDateChange={handleEndDateChange}
		onClearDates={clearDateRange}
		onPrevPage={gotoPrev}
		onNextPage={gotoNext}
		onRetry={() => loadTxs()}
		onTopUp={openTopUp}
	/>
</section>

<TopUpDialog bind:open={topUpOpen} onTopUpStarted={handleTopUpStarted} />
