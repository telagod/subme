<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { CheckCircle2, Clock3, CreditCard, Gift, Loader2, RotateCw, Sparkles, Zap } from '@lucide/svelte';
	import {
		getRedeemHistory, redeemCode,
		type RedeemHistoryItem, type RedeemResult
	} from '$lib/api/user/redeem';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		formatDateTime, formatHistoryValue, formatMoney, formatResultDetail,
		historyTitleKey, isAdminAdjustment, isBalanceType, isSubscriptionType
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
		try { history = await getRedeemHistory(); }
		catch (err) { const msg = (err as Error)?.message ?? ''; if (msg !== 'unauthorized') showError(msg || 'Failed to load history'); }
		finally { loadingHistory = false; }
	}

	async function handleRedeem() {
		const trimmed = code.trim();
		if (!trimmed || submitting) return;
		submitting = true; errorMessage = ''; result = null;
		try {
			result = await redeemCode(trimmed);
			code = '';
			await auth.refreshUser();
			await loadHistory();
			showSuccess($_('redeem.codeRedeemSuccess', { default: 'Code redeemed successfully!' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			errorMessage = msg || $_('redeem.failedToRedeem', { default: 'Redemption failed' });
			showError(errorMessage);
		} finally { submitting = false; }
	}

	onMount(() => { void loadHistory(); });
</script>

<svelte:head>
	<title>{$_('redeem.title', { default: 'Redeem' })} · sub2api</title>
</svelte:head>

<div class="space-y-6 p-4 lg:p-6" data-testid="redeem-page">

	<!-- Hero: code input -->
	<div class="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-primary/5 p-6 sm:p-8">
		<Sparkles class="absolute right-6 top-6 h-24 w-24 text-primary/5" />
		<div class="relative max-w-xl">
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
				{$_('redeem.heroTitle', { default: 'Redeem a code' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground sm:text-base">
				{$_('redeem.heroDesc', { default: 'Enter your redemption code to top up balance or unlock features.' })}
			</p>
			<form class="mt-5 flex flex-col gap-3 sm:flex-row" onsubmit={(e) => { e.preventDefault(); void handleRedeem(); }}>
				<div class="relative min-w-0 flex-1">
					<Gift class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						data-testid="redeem-code-input"
						class="h-12 pl-10 text-base font-mono tracking-wider"
						type="text" autocomplete="off" required
						bind:value={code} disabled={submitting}
						placeholder={$_('redeem.placeholder', { default: 'XXXX-XXXX-XXXX' })}
					/>
				</div>
				<Button type="submit" data-testid="redeem-submit" class="h-12 gap-2 px-6 text-base" disabled={!code.trim() || submitting}>
					{#if submitting}
						<Loader2 class="h-4 w-4 animate-spin" />
						{$_('redeem.redeeming', { default: 'Redeeming...' })}
					{:else}
						<CheckCircle2 class="h-4 w-4" />
						{$_('redeem.redeemButton', { default: 'Redeem' })}
					{/if}
				</Button>
			</form>
			<p class="mt-2 text-xs text-muted-foreground">{$_('redeem.caseSensitive', { default: 'Codes are case-sensitive' })}</p>
		</div>
	</div>

	<!-- Success / error feedback -->
	{#if result}
		<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5" data-testid="redeem-success">
			<div class="flex gap-3">
				<CheckCircle2 class="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
				<div>
					<p class="font-semibold text-emerald-700 dark:text-emerald-300">{$_('redeem.redeemSuccess', { default: 'Redeemed successfully!' })}</p>
					<p class="mt-1 text-sm text-emerald-700/80 dark:text-emerald-200/80">{formatResultDetail(result)}</p>
					{#if result.new_balance !== undefined}
						<p class="mt-1 text-xs">{$_('redeem.newBalance', { default: 'New balance' })}: <span class="font-mono font-semibold">{formatMoney(result.new_balance)}</span></p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
	{#if errorMessage}
		<div class="rounded-xl border border-destructive/30 bg-destructive/10 p-5" data-testid="redeem-error">
			<p class="font-semibold text-destructive">{$_('redeem.redeemFailed', { default: 'Redemption failed' })}</p>
			<p class="mt-1 text-sm text-destructive/80">{errorMessage}</p>
		</div>
	{/if}

	<!-- Stats strip -->
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
				<CreditCard class="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('redeem.currentBalance', { default: 'Balance' })}</p>
				<p class="text-2xl font-bold tabular-nums" data-testid="redeem-balance-value">{formatMoney(balance)}</p>
			</div>
		</div>
		<div class="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
				<Zap class="h-6 w-6 text-blue-600 dark:text-blue-400" />
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('redeem.concurrency', { default: 'Concurrency' })}</p>
				<p class="text-2xl font-bold tabular-nums" data-testid="redeem-concurrency-value">{concurrency} <span class="text-sm font-normal text-muted-foreground">{$_('redeem.requests', { default: 'req' })}</span></p>
			</div>
		</div>
		<div class="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
				<Gift class="h-6 w-6 text-amber-600 dark:text-amber-400" />
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('redeem.totalRedeemed', { default: 'Redeemed' })}</p>
				<p class="text-2xl font-bold tabular-nums">{history.length} <span class="text-sm font-normal text-muted-foreground">{$_('redeem.times', { default: 'times' })}</span></p>
			</div>
		</div>
	</div>

	<!-- History -->
	<div class="rounded-xl border border-border bg-card">
		<div class="flex items-center justify-between border-b border-border px-5 py-3.5">
			<h2 class="font-semibold">{$_('redeem.recentActivity', { default: 'Recent activity' })}</h2>
			<Button variant="ghost" size="sm" class="gap-1.5 text-xs text-muted-foreground" onclick={loadHistory} disabled={loadingHistory}>
				<RotateCw class="h-3.5 w-3.5 {loadingHistory ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</Button>
		</div>
		{#if loadingHistory}
			<div class="flex items-center justify-center py-12" data-testid="redeem-history-loading">
				<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		{:else if history.length}
			<div class="divide-y divide-border" data-testid="redeem-history-list">
				{#each history as item}
					<div class="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30" data-testid="redeem-history-row">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {isBalanceType(item.type) ? 'bg-emerald-500/10' : isSubscriptionType(item.type) ? 'bg-blue-500/10' : 'bg-muted'}">
							{#if isBalanceType(item.type)}
								<CreditCard class="h-4 w-4 {item.value >= 0 ? 'text-emerald-600' : 'text-destructive'}" />
							{:else if isSubscriptionType(item.type)}
								<Gift class="h-4 w-4 text-blue-600" />
							{:else}
								<Zap class="h-4 w-4 text-muted-foreground" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{$_(historyTitleKey(item), { default: item.type })}</p>
							<p class="text-xs text-muted-foreground">{formatDateTime(item.used_at || item.created_at)}</p>
						</div>
						<div class="text-right">
							<p class="text-sm font-semibold tabular-nums {item.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}">{formatHistoryValue(item)}</p>
							{#if isAdminAdjustment(item.type)}
								<p class="text-xs text-muted-foreground">{$_('redeem.adminAdjustment', { default: 'Admin' })}</p>
							{:else}
								<p class="font-mono text-[10px] text-muted-foreground/60">{item.code?.slice(0, 8)}…</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-col items-center py-12 text-center" data-testid="redeem-history-empty">
				<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
					<Clock3 class="h-6 w-6 text-muted-foreground/50" />
				</div>
				<p class="mt-3 text-sm text-muted-foreground">{$_('redeem.historyEmpty', { default: 'No redemption history yet' })}</p>
				<p class="mt-1 text-xs text-muted-foreground/60">{$_('redeem.historyHint', { default: 'Redeem a code above to get started' })}</p>
			</div>
		{/if}
	</div>
</div>
