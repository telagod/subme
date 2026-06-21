<script lang="ts">
	/**
	 * BalanceCard · Balance display card with loading/error states + Top Up CTA
	 *
	 * Props-down / callbacks-up pattern:
	 *   - balance, loading, error passed from page
	 *   - onTopUp callback fires when user clicks the Top Up button
	 */
	import { _ } from 'svelte-i18n';
	import { Wallet, ArrowUpRight } from '@lucide/svelte';
	import type { Balance } from '$lib/api/user/billing';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		balance: Balance | null;
		loading: boolean;
		error: string | null;
		onTopUp: () => void;
	};

	let { balance, loading, error, onTopUp }: Props = $props();

	function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		const abs = Math.abs(v).toFixed(2);
		if (currency === 'USD') return `${sign}$${abs}`;
		if (currency === 'EUR') return `${sign}€${abs}`;
		return `${sign}${abs}`;
	}
</script>

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
				{#if loading}
					<div
						class="h-7 w-32 animate-pulse rounded bg-muted"
						data-testid="billing-balance-skeleton"
					></div>
				{:else if error && !balance}
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
			onclick={onTopUp}
			class="h-9 gap-1.5"
		>
			<ArrowUpRight class="h-4 w-4" />
			{$_('user.billing.topUp', { default: 'Top Up' })}
		</Button>
	</div>
</section>
