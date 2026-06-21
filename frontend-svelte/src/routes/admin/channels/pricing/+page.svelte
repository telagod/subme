<script lang="ts">
	/**
	 * Admin · Channels · Pricing Table（M13）
	 *
	 * Read-only surface by design. It lists channel-side pricing rules from
	 * the existing admin channel list response and never imports create/update/
	 * delete helpers or default-pricing lookup helpers.
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, DollarSign, RefreshCw, Search } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { listChannels, type Channel } from '$lib/api/admin/channels';
	import {
		ALL,
		PAGE_SIZE,
		flattenChannelPricing,
		formatPrice,
		statusTone,
		summarizeChannels,
		type ChannelPricingRow
	} from '$lib/features/supply/supply';

	let channels = $state<Channel[]>([]);
	let pricingRows = $state<ChannelPricingRow[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let statusFilter = $state(ALL);
	const statusOptions = [
		{ value: ALL, label: 'All statuses' },
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeChannels(channels));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listChannels(page, PAGE_SIZE, {
				status: statusFilter === ALL ? undefined : statusFilter,
				search: searchInput.trim() || undefined,
				sort_by: 'created_at',
				sort_order: 'desc'
			});
			channels = resp.items;
			total = resp.total;
			pricingRows = flattenChannelPricing(channels);
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			channels = [];
			pricingRows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadRows();
	});

	function applyFilters() {
		page = 1;
		void loadRows();
	}
</script>

<svelte:head>
	<title>{$_('admin.channels.title', { default: 'Channel Pricing' })}</title>
</svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M13 · Supply · Read-only</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.channels.title', { default: 'Channel Pricing' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.channels.description', { default: 'Inspect channel-side pricing rules, associated groups, billing mode, and interval prices without mutating billing configuration.' })}
			</p>
		</div>
		<Button variant="outline" onclick={loadRows} disabled={loading}>
			<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
		</Button>
	</header>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-2 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</div>

	<Alert variant="warning" data-testid="channel-pricing-readonly-banner">
		This is a read-only virtual table. Use the channel editor for pricing mutations.
	</Alert>

	<Card class="p-3">
		<div class="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
			<label class="relative">
				<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
				<Input class="pl-9" placeholder="Search channels or models" bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && applyFilters()} />
			</label>
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={applyFilters} data-testid="channels-status-filter" />
			<Button onclick={applyFilters}>Apply</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden" data-testid="channels-pricing-page">
		<VirtualTable rows={pricingRows} rowHeight={68} loading={loading} getRowKey={(row) => row.key} class="max-h-[700px]">
			{#snippet header()}
				<div class="grid grid-cols-[1.2fr_1fr_1.1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
					<span>Channel</span><span>Model</span><span>Platform</span><span>Mode</span><span>Input</span><span>Output</span><span>Request</span>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid grid-cols-[1.2fr_1fr_1.1fr_0.8fr_0.8fr_0.8fr_0.8fr] items-center gap-3 border-b px-4 py-3 text-sm" data-testid="channel-pricing-row">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<DollarSign size={15} class="text-muted-foreground" />
							<p class="truncate font-medium">{row.channel.name}</p>
						</div>
						<p class="truncate text-xs text-muted-foreground">
							<Badge variant="outline" class={statusTone(row.channel.status)}>{row.channel.status}</Badge>
							<span class="ml-1">{row.channel.group_ids?.length ?? 0} groups</span>
						</p>
					</div>
					<p class="truncate text-xs" title={row.model}>{row.model}</p>
					<p class="truncate text-xs">{row.pricing?.platform ?? '-'}</p>
					<p class="truncate text-xs">{row.pricing?.billing_mode ?? '-'}</p>
					<p class="font-mono text-xs">{formatPrice(row.pricing?.input_price)}</p>
					<p class="font-mono text-xs">{formatPrice(row.pricing?.output_price)}</p>
					<p class="font-mono text-xs">{formatPrice(row.pricing?.per_request_price)}</p>
				</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-10 text-center text-sm text-muted-foreground">No channel pricing rows match the current filters.</div>
			{/snippet}
		</VirtualTable>
	</Card>

	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">{total} channels · {pricingRows.length} pricing rows on this page</p>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
			<span class="text-sm">{page} / {totalPages}</span>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
		</div>
	</div>
</section>
