<script lang="ts">
	/**
	 * PricingTable — Virtual table rendering sorted catalog models.
	 *
	 * Receives rows, loading state, and event callbacks from the page.
	 * Owns: header/row/empty/loading snippets, grid CSS.
	 * Does NOT own: data fetching, filtering, sorting (all in page).
	 */
	import { _ } from 'svelte-i18n';
	import {
		PackageSearch,
		CloudDownload,
		SquarePen
	} from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import InteractiveRow from '$lib/ui/InteractiveRow.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import type { CatalogModelListItem } from '$lib/api/admin/modelCatalog';
	import {
		extractProvider,
		fmtPriceMTok,
		fmtCtx,
		sourceLabel
	} from '$lib/utils/pricing';

	type Props = {
		rows: CatalogModelListItem[];
		loading: boolean;
		syncLoading: boolean;
		onRowClick: (m: CatalogModelListItem) => void;
		onSync: () => void;
	};

	let { rows, loading, syncLoading, onRowClick, onSync }: Props = $props();

	function handleRowKey(e: KeyboardEvent, m: CatalogModelListItem) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onRowClick(m);
		}
	}
</script>

<Card padded={false} class="flex min-h-0 flex-1 flex-col overflow-hidden">
	<VirtualTable
		{rows}
		rowHeight={56}
		overscan={8}
		{loading}
		getRowKey={(r) => r.id}
	>
		{#snippet header()}
			<div class="pricing-grid min-h-[var(--row-h,56px)] items-center gap-2 border-b border-border bg-card px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
				<div>{$_('admin.pricingList.columns.model', { default: 'Model' })}</div>
				<div>{$_('admin.pricingList.columns.provider', { default: 'Provider' })}</div>
				<div class="text-right">
					{$_('admin.pricingList.columns.input', { default: 'Input' })}
				</div>
				<div class="text-right">
					{$_('admin.pricingList.columns.output', { default: 'Output' })}
				</div>
				<div class="text-right">
					{$_('admin.pricingList.columns.cacheRead', { default: 'Cache Read' })}
				</div>
				<div class="text-right">
					{$_('admin.pricingList.columns.context', { default: 'Context' })}
				</div>
				<div>{$_('admin.pricingList.columns.source', { default: 'Source' })}</div>
			</div>
		{/snippet}

		{#snippet row({ row: m })}
			<InteractiveRow
				class="pricing-grid min-h-[var(--row-h,56px)] items-center gap-2 border-b border-border px-3 py-2 hover:bg-muted/40"
				data-testid="pricing-row"
				data-model-id={m.id}
				onclick={() => onRowClick(m)}
				onkeydown={(e) => handleRowKey(e, m)}
			>
				<div class="min-w-0">
					<div class="flex items-center gap-1 truncate text-sm font-medium">
						<span class="truncate">{m.name}</span>
						{#if m.has_override}
							<SquarePen
								class="h-3 w-3 flex-shrink-0 text-amber-600"
								data-testid="pricing-override-badge"
							/>
						{/if}
					</div>
					<div class="truncate font-mono text-[10px] text-muted-foreground">{m.id}</div>
				</div>
				<div class="text-xs">
					<Badge variant="outline" class="rounded px-1.5 py-0.5 font-mono uppercase">
						{extractProvider(m.id) || '—'}
					</Badge>
				</div>
				<div class="text-right text-sm tabular-nums">{fmtPriceMTok(m.baseline?.input)}</div>
				<div class="text-right text-sm tabular-nums">{fmtPriceMTok(m.baseline?.output)}</div>
				<div class="text-right text-sm tabular-nums text-muted-foreground">
					{fmtPriceMTok(m.baseline?.cache_read)}
				</div>
				<div class="text-right text-sm tabular-nums text-muted-foreground">
					{fmtCtx(m.context_len)}
				</div>
				<div class="text-xs">
					<Badge variant="outline" class="rounded px-1.5 py-0.5 font-mono uppercase">
						{sourceLabel(m.baseline?.source)}
					</Badge>
				</div>
			</InteractiveRow>
		{/snippet}

		{#snippet empty()}
			<div
				class="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground"
				data-testid="pricing-empty"
			>
				<PackageSearch class="h-8 w-8 opacity-30" />
				<div>{$_('admin.pricingList.empty.title', { default: 'No models in catalog' })}</div>
				<div class="text-xs">
					{$_('admin.pricingList.empty.hint', { default: 'Sync to pull latest models' })}
				</div>
				<Button
					size="sm"
					class="mt-2"
					onclick={onSync}
					disabled={syncLoading}
					data-testid="pricing-empty-sync"
				>
					<CloudDownload class="h-3.5 w-3.5 {syncLoading ? 'animate-spin' : ''}" />
					{$_('admin.pricingList.empty.action', { default: 'Sync catalog' })}
				</Button>
			</div>
		{/snippet}

		{#snippet loadingSlot()}
			<div class="space-y-2 p-3" data-testid="pricing-loading">
				{#each Array(6) as _, i (i)}
					<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{/snippet}
	</VirtualTable>
</Card>

<style>
	.pricing-grid {
		display: grid;
		grid-template-columns: minmax(0, 2.4fr) 0.9fr 0.9fr 0.9fr 0.9fr 0.8fr 0.9fr;
	}
	:global([data-density='compact']) .pricing-grid {
		--row-h: 36px;
	}
</style>
