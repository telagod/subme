<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Tag, Trash2 } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		createPromoCode,
		deletePromoCode,
		listPromoCodes,
		updatePromoCode,
		type PromoCode
	} from '$lib/api/admin/promo';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		PAGE_SIZE,
		formatDate,
		formatMoney,
		formatUsage,
		statusTone,
		summarizePromoCodes
	} from '$lib/features/codes/codes';

	const STATUS_OPTIONS = ['active', 'disabled'];
	const statusOptions = [
		{ value: ALL, label: 'All status' },
		...STATUS_OPTIONS.map((value) => ({ value, label: value }))
	];

	let rows = $state<PromoCode[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let statusFilter = $state(ALL);
	let showCreate = $state(false);
	let form = $state({ code: '', bonus_amount: 5, max_uses: 0, expires_at: '', notes: '' });

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizePromoCodes(rows));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listPromoCodes(page, PAGE_SIZE, {
				search: searchInput.trim() || undefined,
				status: statusFilter === ALL ? undefined : statusFilter,
				sort_by: 'created_at',
				sort_order: 'desc'
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

	async function runAction(message: string, action: () => Promise<unknown>) {
		saving = true;
		try {
			await action();
			showSuccess(message);
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function submitCreate() {
		await runAction('Promo code saved', () =>
			createPromoCode({
				code: form.code.trim() || undefined,
				bonus_amount: Number(form.bonus_amount) || 0,
				max_uses: Number(form.max_uses) || 0,
				expires_at: form.expires_at ? Math.floor(new Date(`${form.expires_at}T23:59:59Z`).getTime() / 1000) : null,
				notes: form.notes.trim() || undefined
			})
		);
		showCreate = false;
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.promoCodes', { default: 'Promo codes' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.quench.promoCodes', { default: 'Promo codes' })}
			</h1>
			<p class="text-sm text-muted-foreground">{$_('admin.promo.description', { default: 'Create, search, disable, and remove balance promo codes.' })}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button onclick={() => (showCreate = !showCreate)}>
				<Plus size={15} />{$_('common.create', { default: 'Create' })}
			</Button>
		</div>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-1 text-2xl font-semibold">{item.label === 'Bonus' ? formatMoney(item.value) : item.value}</p>
			</Card>
		{/each}
	</section>

	{#if showCreate}
		<Card>
			<div class="grid gap-3 md:grid-cols-5">
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.promo.code', { default: 'Code' })}</span>
					<Input class="h-9 px-2" placeholder={$_('admin.promo.autoWhenBlank', { default: 'auto when blank' })} bind:value={form.code} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.promo.bonus', { default: 'Bonus' })}</span>
					<Input class="h-9 px-2" type="number" min="0" step="0.01" bind:value={form.bonus_amount} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.promo.maxUses', { default: 'Max uses' })}</span>
					<Input class="h-9 px-2" type="number" min="0" bind:value={form.max_uses} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.promo.expires', { default: 'Expires' })}</span>
					<Input class="h-9 px-2" type="date" bind:value={form.expires_at} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('common.notes', { default: 'Notes' })}</span>
					<Input class="h-9 px-2" bind:value={form.notes} />
				</label>
			</div>
			<div class="mt-3 flex justify-end">
				<Button disabled={saving || form.bonus_amount <= 0} onclick={submitCreate}>{$_('admin.promo.saveCode', { default: 'Save promo code' })}</Button>
			</div>
		</Card>
	{/if}

	<Card class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
		<div class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input class="pl-9" placeholder="Search promo codes" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect class="h-9" bind:value={statusFilter} options={statusOptions} onchange={resetAndLoad} data-testid="admin-promo-status-filter" />
			<Button class="h-9" onclick={resetAndLoad}>{$_('common.search', { default: 'Search' })}</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={64} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid grid-cols-[220px_120px_120px_110px_140px_160px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>{$_('admin.promo.code', { default: 'Code' })}</div><div>{$_('admin.promo.bonus', { default: 'Bonus' })}</div><div>{$_('common.usage', { default: 'Usage' })}</div><div>{$_('common.status', { default: 'Status' })}</div><div>{$_('admin.promo.expires', { default: 'Expires' })}</div><div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[870px] grid-cols-[220px_120px_120px_110px_140px_160px] items-center border-b px-3 py-3 text-sm" data-testid="admin-promo-row" data-code-id={row.id}>
					<div class="flex items-center gap-2"><Tag class="h-4 w-4 text-muted-foreground" /><code class="truncate font-mono text-xs">{row.code}</code></div>
					<div class="font-mono text-xs">{formatMoney(row.bonus_amount)}</div>
					<div class="text-xs text-muted-foreground">{formatUsage(row.used_count, row.max_uses)}</div>
					<div><Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge></div>
					<div class="text-xs text-muted-foreground">{formatDate(row.expires_at)}</div>
					<div class="flex justify-end gap-1.5">
						<Button variant="outline" size="sm" disabled={saving} onclick={() => runAction($_('admin.promo.statusUpdated', { default: 'Promo status updated' }), () => updatePromoCode(row.id, { status: row.status === 'active' ? 'disabled' : 'active' }))}>
							{row.status === 'active' ? $_('common.disable', { default: 'Disable' }) : $_('common.enable', { default: 'Enable' })}
						</Button>
						<Button
							variant="outline"
							size="icon"
							class="text-destructive"
							disabled={saving}
							onclick={() => runAction('Promo code deleted', () => deletePromoCode(row.id))}
							aria-label="Delete promo code"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">No promo codes found</div>{/snippet}
			{#snippet loadingSlot()}<div class="p-4 text-sm text-muted-foreground">Loading promo codes…</div>{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} codes · page {page} / {totalPages}</span>
			<div class="flex gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
			</div>
		</div>
	</Card>
</div>
