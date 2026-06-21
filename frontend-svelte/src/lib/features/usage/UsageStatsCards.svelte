<script lang="ts">
	/**
	 * UsageStatsCards · 3 summary cards (requests / tokens / cost)
	 *
	 * Displays aggregated usage stats with loading skeleton and error retry.
	 */
	import { _ } from 'svelte-i18n';
	import type { UsageSummary } from '$lib/api/user/usage';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';

	let {
		summary,
		loading,
		error,
		onRetry
	}: {
		summary: UsageSummary | null;
		loading: boolean;
		error: string | null;
		onRetry: () => void;
	} = $props();

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return `$${v.toFixed(4)}`;
	}

	function fmtInt(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return Math.round(v).toLocaleString();
	}
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="usage-summary-row">
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="usage-card-requests"
	>
		<h2 class="text-sm font-medium text-muted-foreground">
			{$_('user.usage.totalRequests', { default: 'Total requests' })}
		</h2>
		{#if loading}
			<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
		{:else if summary}
			<p
				class="mt-2 text-3xl font-semibold text-foreground"
				data-testid="usage-requests-value"
			>
				{fmtInt(summary.totalRequests)}
			</p>
		{:else}
			<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
		{/if}
	</article>
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="usage-card-tokens"
	>
		<h2 class="text-sm font-medium text-muted-foreground">
			{$_('user.usage.totalTokens', { default: 'Total tokens' })}
		</h2>
		{#if loading}
			<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
		{:else if summary}
			<p
				class="mt-2 text-3xl font-semibold text-foreground"
				data-testid="usage-tokens-value"
			>
				{fmtInt(summary.totalTokens)}
			</p>
		{:else}
			<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
		{/if}
	</article>
	<article
		class="rounded-lg border border-border bg-card p-4 shadow-sm"
		data-testid="usage-card-cost"
	>
		<h2 class="text-sm font-medium text-muted-foreground">
			{$_('user.usage.totalCost', { default: 'Total cost' })}
		</h2>
		{#if loading}
			<div class="mt-3 h-8 w-24 animate-pulse rounded bg-muted"></div>
		{:else if summary}
			<p
				class="mt-2 text-3xl font-semibold text-foreground"
				data-testid="usage-cost-value"
			>
				{fmtMoney(summary.totalCost)}
			</p>
		{:else}
			<p class="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
		{/if}
	</article>
</div>

{#if error}
	<Alert variant="destructive" class="flex items-center justify-between" data-testid="usage-summary-error">
		<span>
			{$_('user.usage.errors.summaryFailed', { default: 'Failed to load summary' })}
		</span>
		<Button
			type="button"
			variant="outline"
			size="sm"
			class="border-destructive/40 hover:bg-destructive/20"
			onclick={onRetry}
			data-testid="usage-summary-retry"
		>
			{$_('user.usage.retry', { default: 'Retry' })}
		</Button>
	</Alert>
{/if}
