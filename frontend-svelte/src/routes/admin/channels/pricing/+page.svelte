<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, DollarSign, Info, RefreshCw, Search } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { listChannels, type Channel } from '$lib/api/admin/channels';
	import { ALL, PAGE_SIZE, flattenChannelPricing, formatPrice, statusTone, type ChannelPricingRow } from '$lib/features/supply/supply';

	let channels = $state<Channel[]>([]);
	let pricingRows = $state<ChannelPricingRow[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let statusFilter = $state(ALL);

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const activeCount = $derived(channels.filter(c => c.status === 'active').length);
	const totalPricingRows = $derived(pricingRows.length);

	async function loadRows() {
		loading = true; loadError = null;
		try {
			const resp = await listChannels(page, PAGE_SIZE, {
				status: statusFilter === ALL ? undefined : statusFilter,
				search: searchInput.trim() || undefined,
				sort_by: 'created_at', sort_order: 'desc'
			});
			channels = resp.items; total = resp.total;
			pricingRows = flattenChannelPricing(channels);
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			channels = []; pricingRows = []; total = 0;
		} finally { loading = false; }
	}

	onMount(() => { void loadRows(); });
	function applyFilters() { page = 1; void loadRows(); }
</script>

<svelte:head>
	<title>{$_('admin.channelsPricing.title', { default: 'Channel Pricing' })} · sub2api</title>
</svelte:head>

<div class="space-y-5 p-4 lg:p-6" data-testid="channels-pricing-page">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{$_('admin.channelsPricing.title', { default: 'Channel Pricing' })}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{$_('admin.channelsPricing.desc', { default: 'View channel pricing rules, associated groups, and billing modes.' })}</p>
		</div>
		<Button variant="outline" onclick={loadRows} disabled={loading}>
			<RefreshCw size={16} class={loading ? 'animate-spin' : ''} />
			{$_('common.refresh', { default: 'Refresh' })}
		</Button>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-card px-4 py-3">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('admin.channelsPricing.statsChannels', { default: 'Channels' })}</p>
			<p class="mt-1 text-2xl font-semibold">{total}</p>
		</div>
		<div class="rounded-lg border border-border bg-card px-4 py-3">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('admin.channelsPricing.statsActive', { default: 'Active' })}</p>
			<p class="mt-1 text-2xl font-semibold">{activeCount}</p>
		</div>
		<div class="rounded-lg border border-border bg-card px-4 py-3">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('admin.channelsPricing.statsPricingRules', { default: 'Pricing rules' })}</p>
			<p class="mt-1 text-2xl font-semibold">{totalPricingRows}</p>
		</div>
		<div class="rounded-lg border border-border bg-card px-4 py-3">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$_('admin.channelsPricing.statsPage', { default: 'Page' })}</p>
			<p class="mt-1 text-2xl font-semibold">{page}<span class="text-sm font-normal text-muted-foreground">/{totalPages}</span></p>
		</div>
	</div>

	<!-- Info banner -->
	<div class="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300" data-testid="channel-pricing-readonly-banner">
		<Info size={16} class="shrink-0" />
		{$_('admin.channelsPricing.readonlyHint', { default: 'Read-only view. Use the channel editor to modify pricing.' })}
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap items-end gap-3">
		<div class="relative min-w-0 flex-1">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input class="h-9 pl-9" placeholder={$_('admin.channelsPricing.searchPlaceholder', { default: 'Search channels or models...' })} bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && applyFilters()} />
		</div>
		<NativeSelect value={statusFilter} onchange={(e) => { statusFilter = (e.currentTarget as HTMLSelectElement).value; applyFilters(); }}
			options={[
				{ value: ALL, label: $_('admin.channelsPricing.allStatuses', { default: 'All statuses' }) },
				{ value: 'active', label: $_('admin.channelsPricing.active', { default: 'Active' }) },
				{ value: 'inactive', label: $_('admin.channelsPricing.inactive', { default: 'Inactive' }) }
			]}
			class="h-9"
			data-testid="channels-status-filter"
		/>
	</div>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

	<!-- Table -->
	<div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<th class="min-w-[200px] px-4 py-2.5 text-left">{$_('admin.channelsPricing.colChannel', { default: 'Channel' })}</th>
						<th class="min-w-[160px] px-3 py-2.5 text-left">{$_('admin.channelsPricing.colModel', { default: 'Model' })}</th>
						<th class="w-[100px] px-3 py-2.5 text-left">{$_('admin.channelsPricing.colPlatform', { default: 'Platform' })}</th>
						<th class="w-[80px] px-3 py-2.5 text-left">{$_('admin.channelsPricing.colMode', { default: 'Mode' })}</th>
						<th class="w-[90px] px-3 py-2.5 text-right">{$_('admin.channelsPricing.colInput', { default: 'Input' })}</th>
						<th class="w-[90px] px-3 py-2.5 text-right">{$_('admin.channelsPricing.colOutput', { default: 'Output' })}</th>
						<th class="w-[90px] px-3 py-2.5 text-right">{$_('admin.channelsPricing.colRequest', { default: 'Request' })}</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						{#each Array(6) as _, i (i)}
							<tr class="border-b border-border"><td colspan="7" class="px-4 py-3"><div class="h-4 animate-pulse rounded bg-muted"></div></td></tr>
						{/each}
					{:else if pricingRows.length === 0}
						<tr>
							<td colspan="7" class="py-16 text-center">
								<DollarSign class="mx-auto h-10 w-10 text-muted-foreground/20" />
								<p class="mt-3 text-sm text-muted-foreground">{$_('admin.channelsPricing.empty', { default: 'No pricing rules match current filters' })}</p>
							</td>
						</tr>
					{:else}
						{#each pricingRows as row (row.key)}
							<tr class="border-b border-border transition-colors hover:bg-muted/30" data-testid="channel-pricing-row">
								<td class="px-4 py-2.5">
									<p class="truncate font-medium">{row.channel.name}</p>
									<div class="mt-0.5 flex items-center gap-1.5">
										<Badge variant="outline" class="text-[10px] {statusTone(row.channel.status)}">{row.channel.status}</Badge>
										<span class="text-[10px] text-muted-foreground">{row.channel.group_ids?.length ?? 0} {$_('admin.channelsPricing.groups', { default: 'groups' })}</span>
									</div>
								</td>
								<td class="px-3 py-2.5">
									<p class="truncate font-mono text-xs" title={row.model}>{row.model}</p>
								</td>
								<td class="px-3 py-2.5">
									<span class="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">{row.pricing?.platform ?? '—'}</span>
								</td>
								<td class="px-3 py-2.5 text-xs text-muted-foreground">{row.pricing?.billing_mode ?? '—'}</td>
								<td class="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{formatPrice(row.pricing?.input_price)}</td>
								<td class="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{formatPrice(row.pricing?.output_price)}</td>
								<td class="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatPrice(row.pricing?.per_request_price)}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Pagination -->
	{#if total > 0}
		<div class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
			<span class="text-muted-foreground">
				{$_('admin.channelsPricing.totalInfo', { default: '{channels} channels · {rules} pricing rules', values: { channels: total, rules: totalPricingRows } })}
			</span>
			{#if totalPages > 1}
				<div class="flex items-center gap-1.5">
					<Button size="sm" variant="outline" disabled={page <= 1 || loading} onclick={() => { page--; void loadRows(); }}>
						<ChevronLeft size={16} />
					</Button>
					<span class="min-w-[60px] text-center text-xs text-muted-foreground">{page} / {totalPages}</span>
					<Button size="sm" variant="outline" disabled={page >= totalPages || loading} onclick={() => { page++; void loadRows(); }}>
						<ChevronRight size={16} />
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>
