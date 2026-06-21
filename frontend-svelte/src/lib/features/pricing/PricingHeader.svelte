<script lang="ts">
	/**
	 * PricingHeader — Title, summary, and action buttons for the pricing desk.
	 */
	import { _ } from 'svelte-i18n';
	import {
		RefreshCw,
		CloudDownload,
		AlertCircle
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		visibleTotalCount: number;
		providerCount: number;
		syncedText: string | null;
		loading: boolean;
		syncLoading: boolean;
		syncToast: number | null;
		loadError: string | null;
		onRefresh: () => void;
		onSync: () => void;
	};

	let {
		visibleTotalCount,
		providerCount,
		syncedText,
		loading,
		syncLoading,
		syncToast,
		loadError,
		onRefresh,
		onSync
	}: Props = $props();
</script>

<!-- Header -->
<div class="flex items-start justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-2xl font-semibold tracking-tight">
			{$_('admin.pricingList.title', { default: 'PayGo Pricing' })}
		</h1>
		<p class="text-sm text-muted-foreground">
			{$_('admin.pricingList.subtitle', { default: 'OpenRouter pricing catalog' })}
		</p>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
			<span data-testid="pricing-summary">
				{$_('admin.pricingList.mainstreamSummary', {
					values: { models: visibleTotalCount, providers: providerCount },
					default: '{models} models · {providers} providers'
				})}
			</span>
			<span>·</span>
			<span>{$_('admin.pricingList.sourceHint', { default: 'Source: OpenRouter + LiteLLM' })}</span>
			{#if syncedText}
				<span>·</span>
				<span>
					{$_('admin.pricingList.lastSynced', {
						values: { time: syncedText },
						default: 'last synced {time}'
					})}
				</span>
			{/if}
		</div>
	</div>
	<div class="flex items-center gap-2">
		<Button
			variant="outline"
			size="sm"
			onclick={onRefresh}
			disabled={loading}
			data-testid="pricing-refresh"
		>
			<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
			{$_('admin.pricingList.refresh', { default: 'Refresh' })}
		</Button>
		<Button
			size="sm"
			onclick={onSync}
			disabled={syncLoading}
			data-testid="pricing-sync"
		>
			<CloudDownload class="h-3.5 w-3.5 {syncLoading ? 'animate-spin' : ''}" />
			{$_('admin.pricingList.syncCatalog', { default: 'Sync catalog' })}
		</Button>
	</div>
</div>

<!-- Sync success toast -->
{#if syncToast != null}
	<Alert
		class="border-primary/40 bg-primary/10 text-primary"
		data-testid="pricing-sync-toast"
	>
		{$_('admin.pricingList.syncSuccess', {
			values: { n: syncToast },
			default: '{n} models synced'
		})}
	</Alert>
{/if}

{#if loadError}
	<Alert
		variant="destructive"
		class="flex items-center gap-2"
		data-testid="pricing-error"
	>
		<AlertCircle class="h-4 w-4" />
		<span>{$_('admin.pricingList.loadFailed', { default: 'Load failed: ' })}{loadError}</span>
		<Button
			variant="outline"
			size="sm"
			class="ml-auto h-6 px-2 text-xs"
			onclick={onRefresh}
		>
			{$_('admin.providerVerify.retry', { default: 'Retry' })}
		</Button>
	</Alert>
{/if}
