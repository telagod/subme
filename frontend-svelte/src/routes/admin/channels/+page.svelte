<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, DollarSign, Eye, Plus, RefreshCw, Search, Signal, Trash2 } from '@lucide/svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import ChannelFormDialog from '$lib/features/supply/ChannelFormDialog.svelte';
	import { deleteChannel, listChannels, updateChannel, type Channel } from '$lib/api/admin/channels';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, VIRTUAL_THRESHOLD, channelPricingRowCount, statusTone, summarizeChannels } from '$lib/features/supply/supply';

	const STATUS_OPTIONS = ['active', 'inactive', 'disabled', 'error'];
	const statusOptions = $derived([{ value: ALL, label: 'All statuses' }, ...STATUS_OPTIONS.map(s => ({ value: s, label: s }))]);

	let rows = $state<Channel[]>([]); let total = $state(0); let loading = $state(false); let saving = $state(false);
	let loadError = $state<string | null>(null); let page = $state(1); let searchInput = $state(''); let statusFilter = $state(ALL);
	let formOpen = $state(false); let editing = $state<Channel | null>(null);
	let deleteOpen = $state(false); let deleteTarget = $state<Channel | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);
	const summary = $derived(summarizeChannels(rows));

	function formatDate(v: string | undefined): string { if (!v) return '-'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(); }
	function formatGroupNames(ch: Channel): string { const groups = ch.groups; if (Array.isArray(groups) && groups.length) return groups.map((g: { name?: string; id: number }) => g.name ?? `#${g.id}`).join(', '); return ch.group_ids?.join(', ') ?? '-'; }
	function mappingCount(ch: Channel): number { const m = ch.model_mapping; if (!m || typeof m !== 'object') return 0; return Object.values(m).reduce((acc, v) => acc + (v && typeof v === 'object' ? Object.keys(v).length : 0), 0); }

	async function loadRows() { loading = true; loadError = null; try { const r = await listChannels(page, PAGE_SIZE, { status: statusFilter === ALL ? undefined : statusFilter, search: searchInput.trim() || undefined, sort_by: 'created_at', sort_order: 'desc' }); rows = r.items; total = r.total; } catch (err) { loadError = err instanceof Error ? err.message : String(err); rows = []; total = 0; } finally { loading = false; } }
	function apply() { page = 1; void loadRows(); }
	function openCreate() { editing = null; formOpen = true; }
	function openEdit(ch: Channel) { editing = ch; formOpen = true; }
	function openDelete(ch: Channel) { deleteTarget = ch; deleteOpen = true; }
	async function confirmDelete() { if (!deleteTarget) return; saving = true; try { await deleteChannel(deleteTarget.id); showSuccess('Channel deleted'); deleteOpen = false; deleteTarget = null; await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { saving = false; } }
	async function toggleStatus(ch: Channel) { saving = true; try { await updateChannel(ch.id, { status: ch.status === 'active' ? 'disabled' : 'active' }); showSuccess('Status updated'); await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { saving = false; } }

	onMount(() => void loadRows());
</script>

<svelte:head><title>{$_('admin.channels.title', { default: 'Channels' })}</title></svelte:head>

<section class="space-y-5" data-testid="channels-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div><h1 class="text-2xl font-semibold text-foreground">{$_('admin.channels.title', { default: 'Channels' })}</h1><p class="mt-1 max-w-3xl text-sm text-muted-foreground">{$_('admin.channels.description', { default: 'Manage channel status, group bindings, model restrictions, pricing, and monitoring links. Note: the pricing matrix remains read-only unless channel-mapped billing is enabled.' })}</p></div>
		<div class="flex gap-2"><Button variant="outline" onclick={loadRows} disabled={loading}><RefreshCw size={16} class={loading ? 'animate-spin' : ''} />{$_('common.refresh', { default: 'Refresh' })}</Button><Button onclick={openCreate}>New channel</Button></div>
	</header>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{#each summary as item}<Card><p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p><p class="mt-2 text-2xl font-semibold">{item.value}</p></Card>{/each}</div>

	<Card class="p-3">
		<div class="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
			<label class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} /><Input class="pl-9" placeholder={$_('admin.channels.searchPlaceholder', { default: 'Search name or description' })} bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && apply()} /></label>
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={apply} data-testid="channels-main-status-filter" />
			<Button onclick={apply}>Apply</Button>
		</div>
	</Card>

	{#if loadError}<Alert variant="destructive" class="flex items-center gap-2"><AlertTriangle size={16} />{loadError}</Alert>{/if}

	<Card padded={false} class="overflow-hidden overflow-x-auto">
		<table class="w-full min-w-[980px] text-sm">
			<thead class="border-b text-xs uppercase text-muted-foreground"><tr><th class="px-4 py-3 text-left">Channel</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Groups</th><th class="px-4 py-3 text-left">Pricing</th><th class="px-4 py-3 text-left">Mapping</th><th class="px-4 py-3 text-left">Updated</th><th class="px-4 py-3 text-left">Actions</th></tr></thead>
			<tbody>
				{#if loading}<tr><td colspan="7" class="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
				{:else if rows.length === 0}<tr><td colspan="7" class="px-4 py-10 text-center text-muted-foreground">No channels match the current filters.</td></tr>
				{:else}{#each rows as row}
					<tr class="border-b last:border-b-0" data-testid="channels-row">
						<td class="px-4 py-3"><div class="flex min-w-0 items-center gap-2"><Signal size={15} class="shrink-0 text-muted-foreground" /><div class="min-w-0"><p class="truncate font-medium">{row.name}</p><p class="truncate text-xs text-muted-foreground">{row.description || `#${row.id}`}</p></div></div></td>
						<td class="px-4 py-3"><Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge></td>
						<td class="max-w-[220px] truncate px-4 py-3 text-xs" title={formatGroupNames(row)}>{formatGroupNames(row)}</td>
						<td class="px-4 py-3 font-mono text-xs">{channelPricingRowCount(row)}</td>
						<td class="px-4 py-3 font-mono text-xs">{mappingCount(row)}</td>
						<td class="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.updated_at ?? row.created_at)}</td>
						<td class="px-4 py-3"><div class="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="icon" href="/admin/channels/pricing" aria-label="Pricing"><DollarSign size={15} /></Button>
							<Button variant="outline" size="icon" href="/admin/channels/monitor" aria-label="Monitor"><Eye size={15} /></Button>
							<Button variant="outline" size="sm" onclick={() => openEdit(row)}>Edit</Button>
							<Button variant="outline" size="sm" disabled={saving} onclick={() => toggleStatus(row)}>{row.status === 'active' ? 'Disable' : 'Enable'}</Button>
							<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => openDelete(row)}>Delete</Button>
						</div></td>
					</tr>
				{/each}{/if}
			</tbody>
		</table>
	</Card>

	<div class="flex items-center justify-between"><p class="text-sm text-muted-foreground">{total} channels</p>
		<div class="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page--; void loadRows(); }} aria-label="Previous"><ChevronLeft size={16} /></Button><span class="text-sm">{page} / {totalPages}</span><Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page++; void loadRows(); }} aria-label="Next"><ChevronRight size={16} /></Button></div>
	</div>
</section>

<ChannelFormDialog bind:open={formOpen} channel={editing} onSaved={loadRows} onClose={() => {}} />

<StandardDialog bind:open={deleteOpen} title="Delete channel" width="sm" data-testid="channel-delete-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Delete channel "{deleteTarget?.name}"? This cannot be undone.</p>
		<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (deleteOpen = false)}>Cancel</Button><Button variant="outline" class="border-destructive/30 text-destructive" disabled={saving} onclick={confirmDelete} data-testid="channel-delete-confirm">{saving ? 'Deleting...' : 'Delete'}</Button></div>
	</div>
</StandardDialog>
