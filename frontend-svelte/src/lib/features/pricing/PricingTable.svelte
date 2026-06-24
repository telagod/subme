<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { PackageSearch, CloudDownload, SquarePen } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { CatalogModelListItem } from '$lib/api/admin/modelCatalog';
	import { extractProvider, fmtPriceMTok, fmtCtx, sourceLabel } from '$lib/utils/pricing';

	type Props = {
		rows: CatalogModelListItem[];
		loading: boolean;
		syncLoading: boolean;
		onRowClick: (m: CatalogModelListItem) => void;
		onSync: () => void;
	};

	let { rows, loading, syncLoading, onRowClick, onSync }: Props = $props();

	function providerColor(p: string): string {
		const lc = p.toLowerCase();
		if (lc.includes('anthropic')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20';
		if (lc.includes('openai')) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
		if (lc.includes('google') || lc.includes('gemini')) return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20';
		if (lc.includes('bedrock') || lc.includes('amazon')) return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20';
		if (lc.includes('deepseek')) return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/20';
		return 'bg-muted text-muted-foreground border-border';
	}
</script>

<div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
	<div class="overflow-x-auto">
		<table class="w-full text-sm" data-testid="pricing-table">
			<thead>
				<tr class="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					<th class="min-w-[280px] px-4 py-2.5 text-left">{$_('admin.pricingList.columns.model', { default: '模型' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-left">{$_('admin.pricingList.columns.provider', { default: '供应商' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-right">{$_('admin.pricingList.columns.input', { default: 'INPUT' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-right">{$_('admin.pricingList.columns.output', { default: 'OUTPUT' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-right">{$_('admin.pricingList.columns.cacheRead', { default: 'CACHE' })}</th>
					<th class="w-[80px] px-3 py-2.5 text-right">{$_('admin.pricingList.columns.context', { default: 'CTX' })}</th>
					<th class="w-[70px] px-3 py-2.5 text-center">{$_('admin.pricingList.columns.source', { default: '来源' })}</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					{#each Array(8) as _, i (i)}
						<tr class="border-b border-border">
							<td colspan="7" class="px-4 py-3"><div class="h-4 w-full animate-pulse rounded bg-muted"></div></td>
						</tr>
					{/each}
				{:else if rows.length === 0}
					<tr>
						<td colspan="7" class="py-16 text-center" data-testid="pricing-empty">
							<PackageSearch class="mx-auto h-10 w-10 text-muted-foreground/20" />
							<p class="mt-3 text-sm text-muted-foreground">{$_('admin.pricingList.empty.title', { default: '暂无模型目录' })}</p>
							<Button size="sm" class="mt-3" onclick={onSync} disabled={syncLoading} data-testid="pricing-empty-sync">
								<CloudDownload class="h-3.5 w-3.5 {syncLoading ? 'animate-spin' : ''}" />
								{$_('admin.pricingList.empty.action', { default: '同步目录' })}
							</Button>
						</td>
					</tr>
				{:else}
					{#each rows as m (m.id)}
						{@const provider = extractProvider(m.id) || '—'}
						<tr
							class="cursor-pointer border-b border-border transition-colors hover:bg-muted/30"
							data-testid="pricing-row"
							data-model-id={m.id}
							onclick={() => onRowClick(m)}
						>
							<td class="px-4 py-2">
								<div class="flex items-center gap-1.5">
									<div class="min-w-0">
										<span class="text-sm font-medium text-foreground">{m.name}</span>
										{#if m.has_override}
											<SquarePen class="ml-1 inline h-3 w-3 text-amber-500" data-testid="pricing-override-badge" />
										{/if}
										<p class="truncate font-mono text-[10px] text-muted-foreground/60">{m.id}</p>
									</div>
								</div>
							</td>
							<td class="px-3 py-2">
								<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase {providerColor(provider)}">
									{provider}
								</span>
							</td>
							<td class="px-3 py-2 text-right font-mono text-sm tabular-nums">{fmtPriceMTok(m.baseline?.input)}</td>
							<td class="px-3 py-2 text-right font-mono text-sm tabular-nums">{fmtPriceMTok(m.baseline?.output)}</td>
							<td class="px-3 py-2 text-right font-mono text-sm tabular-nums text-muted-foreground">{fmtPriceMTok(m.baseline?.cache_read)}</td>
							<td class="px-3 py-2 text-right font-mono text-sm tabular-nums text-muted-foreground">{fmtCtx(m.context_len)}</td>
							<td class="px-3 py-2 text-center">
								<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
									{sourceLabel(m.baseline?.source)}
								</span>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
