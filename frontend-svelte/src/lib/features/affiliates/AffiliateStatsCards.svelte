<script lang="ts">
	/**
	 * AffiliateStatsCards — 3 stat cards: totalInvited, totalRebate, rebateRate
	 *
	 * Pure display component. Receives pre-fetched referral data via props.
	 */
	import { _ } from 'svelte-i18n';
	import { Users, TrendingUp, Wallet, Snowflake, Percent } from '@lucide/svelte';
	import type { ReferralInfo } from '$lib/api/user/affiliates';

	type Props = {
		referral: ReferralInfo | null;
	};

	let { referral }: Props = $props();

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		return `${sign}$${Math.abs(v).toFixed(2)}`;
	}
</script>

<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="affiliates-stats">
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<Users class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">
				{$_('user.affiliates.stats.totalInvited', { default: 'Total invited' })}
			</span>
		</div>
		<p
			class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
			data-testid="affiliates-stat-invited"
		>
			{referral?.totalInvited ?? 0}
		</p>
	</div>
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<TrendingUp class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">
				{$_('user.affiliates.stats.totalRebate', { default: 'Total rebate' })}
			</span>
		</div>
		<p
			class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
			data-testid="affiliates-stat-rebate"
		>
			{fmtMoney((referral?.availableRebate ?? 0) + (referral?.frozenRebate ?? 0))}
		</p>
		<div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
			<span class="inline-flex items-center gap-1">
				<Wallet class="h-3 w-3 text-emerald-600" />
				<span data-testid="affiliates-stat-available">
					{$_('user.affiliates.stats.available', { default: 'Available' })}:
					{fmtMoney(referral?.availableRebate ?? 0)}
				</span>
			</span>
			<span class="inline-flex items-center gap-1">
				<Snowflake class="h-3 w-3 text-sky-600" />
				<span data-testid="affiliates-stat-frozen">
					{$_('user.affiliates.stats.frozen', { default: 'Frozen' })}:
					{fmtMoney(referral?.frozenRebate ?? 0)}
				</span>
			</span>
		</div>
	</div>
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="flex items-center gap-2 text-muted-foreground">
			<Percent class="h-4 w-4" />
			<span class="text-xs font-medium uppercase tracking-wide">
				{$_('affiliate.stats.rebateRate', { default: 'My Rebate Rate' })}
			</span>
		</div>
		<p
			class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
			data-testid="affiliates-stat-rate"
		>
			{(referral?.rebateRatePercent ?? 0).toFixed(1)}%
		</p>
	</div>
</section>
