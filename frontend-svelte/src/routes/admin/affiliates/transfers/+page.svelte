<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, Users, Wallet } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		listTransferRecords,
		type AffiliateTransferRecord
	} from '$lib/api/admin/affiliates';
	import {
		PAGE_SIZE,
		formatDateTime,
		formatMoney,
		summarizeTransfers,
		userLabel
	} from '$lib/features/admin-affiliates/affiliate-records';

	let rows = $state<AffiliateTransferRecord[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let searchInput = $state('');
	let startAt = $state('');
	let endAt = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeTransfers(rows));

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
			const resp = await listTransferRecords({
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

	function quota(value?: number | null): string {
		return value === null || value === undefined ? '—' : formatMoney(value);
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>Affiliate transfer records</title>
</svelte:head>

<div class="space-y-4 px-5 py-5" data-testid="admin-affiliate-transfers-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Affiliate transfer records</h1>
			<p class="text-sm text-muted-foreground">Inspect affiliate quota transfers into user balance snapshots.</p>
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
					{#if item.label === 'Users'}
						<Users class="h-5 w-5 text-muted-foreground" />
					{:else}
						<Wallet class="h-5 w-5 text-muted-foreground" />
					{/if}
				</div>
			</Card>
		{/each}
	</section>

	<Card class="p-3">
		<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input class="pl-9" placeholder="Search user or ledger" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
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
		<VirtualTable rows={rows} rowHeight={78} getRowKey={(row) => `${row.ledger_id}-${row.user_id}-${row.created_at}`} loading={loading}>
			{#snippet header()}
				<div class="grid min-w-[1100px] grid-cols-[110px_minmax(240px,1fr)_130px_140px_150px_150px_120px_170px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Ledger</div>
					<div>User</div>
					<div>Amount</div>
					<div>Balance after</div>
					<div>Available after</div>
					<div>Frozen after</div>
					<div>Snapshot</div>
					<div>Created at</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1100px] grid-cols-[110px_minmax(240px,1fr)_130px_140px_150px_150px_120px_170px] items-center border-b px-3 py-3 text-sm" data-testid="admin-affiliate-transfer-row">
					<div class="font-mono text-xs">#{row.ledger_id}</div>
					<div class="truncate">{userLabel(row.user_id, row.user_email, row.username)}</div>
					<div class="font-mono text-xs font-semibold text-primary">{formatMoney(row.amount)}</div>
					<div class="font-mono text-xs">{quota(row.balance_after)}</div>
					<div class="font-mono text-xs">{quota(row.available_quota_after)}</div>
					<div class="font-mono text-xs">{quota(row.frozen_quota_after)}</div>
					<div class="text-xs">{row.snapshot_available ? 'yes' : 'no'}</div>
					<div class="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
				</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-6 text-center text-sm text-muted-foreground">No transfer records found</div>
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
