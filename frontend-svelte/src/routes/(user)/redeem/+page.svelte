<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { CheckCircle2, Clock3, CreditCard, Gift, Loader2, RotateCw, Zap } from '@lucide/svelte';
	import {
		getRedeemHistory,
		redeemCode,
		type RedeemHistoryItem,
		type RedeemResult
	} from '$lib/api/user/redeem';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		formatDateTime,
		formatHistoryValue,
		formatMoney,
		formatResultDetail,
		historyTitleKey,
		isAdminAdjustment,
		isBalanceType,
		isSubscriptionType
	} from '$lib/features/redeem/redeem';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	let code = $state('');
	let submitting = $state(false);
	let loadingHistory = $state(true);
	let history = $state<RedeemHistoryItem[]>([]);
	let result = $state<RedeemResult | null>(null);
	let errorMessage = $state('');

	const balance = $derived(Number(auth.user?.balance ?? 0));
	const concurrency = $derived(Number(auth.user?.concurrency ?? 0));

	async function loadHistory() {
		loadingHistory = true;
		try {
			history = await getRedeemHistory();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') showError(msg || 'Failed to load redemption history');
		} finally {
			loadingHistory = false;
		}
	}

	async function handleRedeem() {
		const trimmed = code.trim();
		if (!trimmed || submitting) {
			showError($_('redeem.pleaseEnterCode', { default: 'Please enter a redeem code' }));
			return;
		}
		submitting = true;
		errorMessage = '';
		result = null;
		try {
			const resp = await redeemCode(trimmed);
			result = resp;
			code = '';
			await auth.refreshUser();
			await loadHistory();
			showSuccess($_('redeem.codeRedeemSuccess', { default: 'Code redeemed successfully!' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			errorMessage = msg || $_('redeem.failedToRedeem', { default: 'Failed to redeem code. Please check the code and try again.' });
			showError($_('redeem.redeemFailed', { default: 'Redemption Failed' }));
		} finally {
			submitting = false;
		}
	}

	onMount(() => {
		void loadHistory();
	});
</script>

<svelte:head>
	<title>{$_('redeem.title', { default: 'Redeem Code' })} · sub2api</title>
</svelte:head>

<section class="mx-auto max-w-3xl space-y-5" data-testid="redeem-page">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('redeem.title', { default: 'Redeem Code' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('redeem.description', { default: 'Enter your redeem code to add balance or increase concurrency' })}
			</p>
		</div>
		<Button
			variant="outline"
			class="h-9 gap-2 text-muted-foreground"
			onclick={loadHistory}
			disabled={loadingHistory}
		>
			<RotateCw class={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
			{$_('common.refresh', { default: 'Refresh' })}
		</Button>
	</header>

	<section class="grid gap-3 sm:grid-cols-2">
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-md border bg-background">
					<CreditCard class="h-5 w-5 text-muted-foreground" />
				</div>
				<div>
					<p class="text-xs text-muted-foreground">{$_('redeem.currentBalance', { default: 'Current Balance' })}</p>
					<p class="text-2xl font-semibold" data-testid="redeem-balance-value">{formatMoney(balance)}</p>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-md border bg-background">
					<Zap class="h-5 w-5 text-muted-foreground" />
				</div>
				<div>
					<p class="text-xs text-muted-foreground">{$_('redeem.concurrency', { default: 'Concurrency' })}</p>
					<p class="text-2xl font-semibold" data-testid="redeem-concurrency-value">
						{concurrency} <span class="text-sm font-normal text-muted-foreground">{$_('redeem.requests', { default: 'requests' })}</span>
					</p>
				</div>
			</div>
		</div>
	</section>

	<form class="rounded-lg border border-border bg-card p-4" onsubmit={(event) => { event.preventDefault(); void handleRedeem(); }}>
		<label for="redeem-code" class="text-sm font-medium">
			{$_('redeem.redeemCodeLabel', { default: 'Redeem Code' })}
		</label>
		<div class="mt-2 flex flex-col gap-2 sm:flex-row">
			<div class="relative min-w-0 flex-1">
				<Gift class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					id="redeem-code"
					data-testid="redeem-code-input"
					class="h-10 pl-9"
					type="text"
					autocomplete="off"
					required
					bind:value={code}
					disabled={submitting}
					placeholder={$_('redeem.redeemCodePlaceholder', { default: 'Enter your redeem code' })}
				/>
			</div>
			<Button
				type="submit"
				data-testid="redeem-submit"
				class="h-10 gap-2"
				disabled={!code.trim() || submitting}
			>
				{#if submitting}
					<Loader2 class="h-4 w-4 animate-spin" />
					{$_('redeem.redeeming', { default: 'Redeeming...' })}
				{:else}
					<CheckCircle2 class="h-4 w-4" />
					{$_('redeem.redeemButton', { default: 'Redeem Code' })}
				{/if}
			</Button>
		</div>
		<p class="mt-2 text-xs text-muted-foreground">
			{$_('redeem.redeemCodeHint', { default: 'Redeem codes are case-sensitive' })}
		</p>
	</form>

	{#if result}
		<section class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4" data-testid="redeem-success">
			<div class="flex gap-3">
				<CheckCircle2 class="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-300" />
				<div>
					<h2 class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
						{$_('redeem.redeemSuccess', { default: 'Code Redeemed Successfully!' })}
					</h2>
					<p class="mt-1 text-sm text-emerald-700/80 dark:text-emerald-200/80">{result.message}</p>
					<p class="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-100">
						{formatResultDetail(result)}
					</p>
					{#if result.new_balance !== undefined}
						<p class="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
							{$_('redeem.newBalance', { default: 'New Balance' })}: {formatMoney(result.new_balance)}
						</p>
					{/if}
					{#if result.new_concurrency !== undefined}
						<p class="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
							{$_('redeem.newConcurrency', { default: 'New Concurrency' })}: {result.new_concurrency}
						</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	{#if errorMessage}
		<section class="rounded-lg border border-destructive/30 bg-destructive/10 p-4" data-testid="redeem-error">
			<p class="text-sm font-semibold text-destructive">{$_('redeem.redeemFailed', { default: 'Redemption Failed' })}</p>
			<p class="mt-1 text-sm text-destructive/85">{errorMessage}</p>
		</section>
	{/if}

	<section class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold">{$_('redeem.recentActivity', { default: 'Recent Activity' })}</h2>
		</div>
		<div class="p-4">
			{#if loadingHistory}
				<div class="flex items-center justify-center py-8" data-testid="redeem-history-loading">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{:else if history.length}
				<div class="space-y-2">
					{#each history as item}
						<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3" data-testid="redeem-history-row">
							<div class="flex min-w-0 items-center gap-3">
								<div class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
									{#if isBalanceType(item.type)}
										<CreditCard class={`h-4 w-4 ${item.value >= 0 ? 'text-emerald-600' : 'text-destructive'}`} />
									{:else if isSubscriptionType(item.type)}
										<Gift class="h-4 w-4 text-muted-foreground" />
									{:else}
										<Zap class={`h-4 w-4 ${item.value >= 0 ? 'text-muted-foreground' : 'text-amber-600'}`} />
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">
										{$_(historyTitleKey(item), { default: item.type })}
									</p>
									<p class="text-xs text-muted-foreground">{formatDateTime(item.used_at || item.created_at)}</p>
								</div>
							</div>
							<div class="text-right">
								<p class="text-sm font-semibold">{formatHistoryValue(item)}</p>
								{#if isAdminAdjustment(item.type)}
									<p class="text-xs text-muted-foreground">{$_('redeem.adminAdjustment', { default: 'Admin Adjustment' })}</p>
								{:else}
									<p class="font-mono text-xs text-muted-foreground">{item.code.slice(0, 8)}...</p>
								{/if}
								{#if item.notes}
									<p class="max-w-48 truncate text-xs italic text-muted-foreground" title={item.notes}>{item.notes}</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col items-center py-8 text-center" data-testid="redeem-history-empty">
					<Clock3 class="mb-3 h-10 w-10 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						{$_('redeem.historyWillAppear', { default: 'Your redemption history will appear here' })}
					</p>
				</div>
			{/if}
		</div>
	</section>
</section>
