<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		RefreshCw,
		Search,
		Ticket,
		UserPlus,
		Users,
		Wallet
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		getUserOverview,
		listInviteRecords,
		type AffiliateInviteRecord,
		type AffiliateUserOverview
	} from '$lib/api/admin/affiliates';
	import { showError } from '$lib/stores/toast.svelte';
	import {
		PAGE_SIZE,
		formatDateTime,
		formatMoney,
		overviewStats,
		summarizeInvites,
		userLabel
	} from '$lib/features/admin-affiliates/affiliate-records';

	let rows = $state<AffiliateInviteRecord[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let overviewLoading = $state(false);
	let loadError = $state<string | null>(null);
	let searchInput = $state('');
	let startAt = $state('');
	let endAt = $state('');
	let overview = $state<AffiliateUserOverview | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeInvites(rows));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listInviteRecords({
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

	async function openOverview(userId: number) {
		overviewLoading = true;
		overview = null;
		try {
			overview = await getUserOverview(userId);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			overviewLoading = false;
		}
	}

	function userTimezone(): string {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return 'UTC';
		}
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('nav.affiliateInviteRecords', { default: 'Affiliate invite records' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.affiliateInviteRecords', { default: 'Affiliate invite records' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('admin.affiliates.invitesDescription', { default: 'View site-wide inviter and invitee relationships.' })}
			</p>
		</div>
		<Button variant="outline" onclick={loadRows} disabled={loading}>
			<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />
			{$_('common.refresh', { default: 'Refresh' })}
		</Button>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
						<p class="mt-1 text-2xl font-semibold">{item.label === 'Rebate' ? formatMoney(item.value) : item.value}</p>
					</div>
					{#if item.label === 'Invites'}
						<UserPlus class="h-5 w-5 text-muted-foreground" />
					{:else if item.label === 'Inviters'}
						<Users class="h-5 w-5 text-muted-foreground" />
					{:else if item.label === 'Invitees'}
						<Ticket class="h-5 w-5 text-muted-foreground" />
					{:else}
						<Wallet class="h-5 w-5 text-muted-foreground" />
					{/if}
				</div>
			</Card>
		{/each}
	</section>

	<section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
		<Card class="p-3">
			<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
				<div class="relative">
					<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						class="pl-9"
						placeholder="Search inviter, invitee, or code"
						bind:value={searchInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') resetAndLoad();
						}}
					/>
				</div>
				<Input type="date" bind:value={startAt} onchange={resetAndLoad} aria-label="Start date" />
				<Input type="date" bind:value={endAt} onchange={resetAndLoad} aria-label="End date" />
				<Button onclick={resetAndLoad}>
					{$_('common.search', { default: 'Search' })}
				</Button>
			</div>
		</Card>

		<Card class="p-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">User overview</h2>
				<span class="text-xs text-muted-foreground">{overviewLoading ? 'Loading' : overview ? `#${overview.user_id}` : 'Select user'}</span>
			</div>
			{#if overview}
				<div class="mt-3 space-y-3">
					<div class="rounded-md bg-muted/50 p-2">
						<div class="font-mono text-xs">#{overview.user_id}</div>
						<div class="truncate text-sm font-medium">{overview.email}</div>
						<div class="truncate text-xs text-muted-foreground">{overview.username || '—'}</div>
					</div>
					<div class="grid grid-cols-2 gap-2">
						{#each overviewStats(overview) as stat}
							<div class="rounded-md border bg-background p-2">
								<p class="text-xs text-muted-foreground">{stat.label}</p>
								<p class="mt-1 truncate text-sm font-medium">{stat.value}</p>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<p class="mt-3 text-sm text-muted-foreground">Open an inviter or invitee to inspect affiliate totals.</p>
			{/if}
		</Card>
	</section>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={74} getRowKey={(row) => `${row.inviter_id}-${row.invitee_id}-${row.created_at}`} loading={loading}>
			{#snippet header()}
				<div class="grid min-w-[980px] grid-cols-[minmax(250px,1fr)_minmax(250px,1fr)_140px_130px_170px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Inviter</div>
					<div>Invitee</div>
					<div>Code</div>
					<div>Total rebate</div>
					<div>Invited at</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[980px] grid-cols-[minmax(250px,1fr)_minmax(250px,1fr)_140px_130px_170px] items-center border-b px-3 py-3 text-sm" data-testid="admin-affiliate-invite-row">
					<div class="min-w-0">
						<Button variant="ghost" class="h-auto max-w-full justify-start truncate px-0 py-0 text-left font-medium text-primary hover:bg-transparent hover:underline" onclick={() => openOverview(row.inviter_id)}>
							{userLabel(row.inviter_id, row.inviter_email, row.inviter_username)}
						</Button>
					</div>
					<div class="min-w-0">
						<Button variant="ghost" class="h-auto max-w-full justify-start truncate px-0 py-0 text-left font-medium text-primary hover:bg-transparent hover:underline" onclick={() => openOverview(row.invitee_id)}>
							{userLabel(row.invitee_id, row.invitee_email, row.invitee_username)}
						</Button>
					</div>
					<div class="truncate font-mono text-xs">{row.aff_code || '—'}</div>
					<div class="font-mono text-xs">{formatMoney(row.total_rebate)}</div>
					<div class="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
				</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-6 text-center text-sm text-muted-foreground">
					No invite records found
				</div>
			{/snippet}
			{#snippet loadingSlot()}
				<div class="space-y-2 p-3">
					{#each Array(6) as _}
						<div class="h-12 animate-pulse rounded bg-muted"></div>
					{/each}
				</div>
			{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} records · page {page} / {totalPages}</span>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page">
					<ChevronLeft size={16} />
				</Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page">
					<ChevronRight size={16} />
				</Button>
			</div>
		</div>
	</Card>
</div>
