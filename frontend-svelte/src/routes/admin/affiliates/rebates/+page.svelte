<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, ChevronLeft, ChevronRight, CreditCard, RefreshCw, Search, Users, Wallet } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		listRebateRecords,
		type AffiliateRebateRecord
	} from '$lib/api/admin/affiliates';
	import {
		PAGE_SIZE,
		formatDateTime,
		formatMoney,
		summarizeRebates,
		userLabel
	} from '$lib/features/admin-affiliates/affiliate-records';

	let rows = $state<AffiliateRebateRecord[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let searchInput = $state('');
	let startAt = $state('');
	let endAt = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeRebates(rows));

	function userTimezone(): string {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return 'UTC';
		}
	}

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listRebateRecords({
				page,
				page_size: PAGE_SIZE,
				search: searchInput.trim() || undefined,
				start_at: startAt || undefined,
				end_at: endAt || undefined,
				sort_by: 'created_at',
				sort_order: 'desc',
				timezone: userTimezone()
			});
			rows = resp.items;
			total = resp.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function resetAndLoad() {
		page = 1;
		void loadRows();
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>Affiliate rebate records</title>
</svelte:head>

<div class="space-y-4 px-5 py-5" data-testid="admin-affiliate-rebates-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Affiliate rebate records</h1>
			<p class="text-sm text-muted-foreground">Inspect invite-driven rebate amounts created from paid orders.</p>
		</div>
		<Button variant="outline" onclick={loadRows} disabled={loading}>
			<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />
			Refresh
		</Button>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
						<p class="mt-1 text-2xl font-semibold">{item.label === 'Amount' ? formatMoney(item.value) : item.value}</p>
					</div>
					{#if item.label === 'Rebates'}
						<CreditCard class="h-5 w-5 text-muted-foreground" />
					{:else if item.label === 'Amount'}
						<Wallet class="h-5 w-5 text-muted-foreground" />
					{:else}
						<Users class="h-5 w-5 text-muted-foreground" />
					{/if}
				</div>
			</Card>
		{/each}
	</section>

	<Card class="p-3">
		<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input class="pl-9" placeholder="Search order, inviter, or invitee" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
			</div>
			<Input type="date" bind:value={startAt} onchange={resetAndLoad} aria-label="Start date" />
			<Input type="date" bind:value={endAt} onchange={resetAndLoad} aria-label="End date" />
			<Button onclick={resetAndLoad}>Search</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={78} getRowKey={(row) => `${row.order_id}-${row.inviter_id}-${row.created_at}`} loading={loading}>
			{#snippet header()}
				<div class="grid min-w-[1160px] grid-cols-[180px_minmax(240px,1fr)_minmax(240px,1fr)_120px_120px_120px_120px_170px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Order</div>
					<div>Inviter</div>
					<div>Invitee</div>
					<div>Order amount</div>
					<div>Paid</div>
					<div>Rebate</div>
					<div>Status</div>
					<div>Created at</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1160px] grid-cols-[180px_minmax(240px,1fr)_minmax(240px,1fr)_120px_120px_120px_120px_170px] items-center border-b px-3 py-3 text-sm" data-testid="admin-affiliate-rebate-row">
					<div class="min-w-0">
						<div class="font-mono text-xs">#{row.order_id}</div>
						<div class="truncate text-xs text-muted-foreground">{row.out_trade_no || '—'}</div>
					</div>
					<div class="truncate">{userLabel(row.inviter_id, row.inviter_email, row.inviter_username)}</div>
					<div class="truncate">{userLabel(row.invitee_id, row.invitee_email, row.invitee_username)}</div>
					<div class="font-mono text-xs">{formatMoney(row.order_amount)}</div>
					<div class="font-mono text-xs">{formatMoney(row.pay_amount)}</div>
					<div class="font-mono text-xs font-semibold text-primary">{formatMoney(row.rebate_amount)}</div>
					<div class="truncate text-xs">{row.order_status || '—'}</div>
					<div class="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
				</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-6 text-center text-sm text-muted-foreground">No rebate records found</div>
			{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} records · page {page} / {totalPages}</span>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
			</div>
		</div>
	</Card>
</div>
