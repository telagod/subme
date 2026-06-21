<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, Megaphone, Plus, RefreshCw, Search, Trash2 } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		createAnnouncement,
		deleteAnnouncement,
		listAnnouncements,
		updateAnnouncement,
		type Announcement,
		type AnnouncementNotifyMode,
		type AnnouncementStatus
	} from '$lib/api/admin/announcements';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		EMPTY_TARGETING,
		PAGE_SIZE,
		dateTimeLocalToUnix,
		formatDate,
		notifyTone,
		parseTargetingJson,
		statusTone,
		summarizeAnnouncements,
		targetingSummary
	} from '$lib/features/announcements/announcements';

	const STATUS_OPTIONS: AnnouncementStatus[] = ['draft', 'active', 'archived'];
	const NOTIFY_OPTIONS: AnnouncementNotifyMode[] = ['silent', 'popup'];
	const statusOptions = [
		{ value: ALL, label: 'All status' },
		...STATUS_OPTIONS.map((value) => ({ value, label: value }))
	];
	const formStatusOptions = STATUS_OPTIONS.map((value) => ({ value, label: value }));
	const notifyOptions = NOTIFY_OPTIONS.map((value) => ({ value, label: value }));

	let rows = $state<Announcement[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let statusFilter = $state(ALL);
	let showEditor = $state(false);
	let editing = $state<Announcement | null>(null);
	let form = $state({
		title: '',
		content: '',
		status: 'draft' as AnnouncementStatus,
		notify_mode: 'silent' as AnnouncementNotifyMode,
		starts_at: '',
		ends_at: '',
		targeting: '{ "any_of": [] }'
	});

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeAnnouncements(rows));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listAnnouncements(page, PAGE_SIZE, {
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

	function openCreate() {
		editing = null;
		form = {
			title: '',
			content: '',
			status: 'draft',
			notify_mode: 'silent',
			starts_at: '',
			ends_at: '',
			targeting: JSON.stringify(EMPTY_TARGETING, null, 2)
		};
		showEditor = true;
	}

	function openEdit(row: Announcement) {
		editing = row;
		form = {
			title: row.title,
			content: row.content,
			status: row.status,
			notify_mode: row.notify_mode,
			starts_at: toDateTimeLocal(row.starts_at),
			ends_at: toDateTimeLocal(row.ends_at),
			targeting: JSON.stringify(row.targeting ?? EMPTY_TARGETING, null, 2)
		};
		showEditor = true;
	}

	async function saveAnnouncement() {
		if (!form.title.trim() || !form.content.trim()) return;
		saving = true;
		try {
			const targeting = parseTargetingJson(form.targeting);
			const starts_at = dateTimeLocalToUnix(form.starts_at);
			const ends_at = dateTimeLocalToUnix(form.ends_at);
			if (editing) {
				await updateAnnouncement(editing.id, {
					title: form.title.trim(),
					content: form.content.trim(),
					status: form.status,
					notify_mode: form.notify_mode,
					targeting,
					starts_at: starts_at ?? 0,
					ends_at: ends_at ?? 0
				});
			} else {
				await createAnnouncement({
					title: form.title.trim(),
					content: form.content.trim(),
					status: form.status,
					notify_mode: form.notify_mode,
					targeting,
					starts_at,
					ends_at
				});
			}
			showSuccess('Announcement saved');
			showEditor = false;
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function removeAnnouncement(row: Announcement) {
		saving = true;
		try {
			await deleteAnnouncement(row.id);
			showSuccess('Announcement deleted');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	function toDateTimeLocal(value?: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toISOString().slice(0, 16);
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.announcements', { default: 'Announcements' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.quench.announcements', { default: 'Announcements' })}
			</h1>
			<p class="text-sm text-muted-foreground">Publish popup or silent notices with optional targeting windows.</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />Refresh
			</Button>
			<Button onclick={openCreate}>
				<Plus size={15} />Create
			</Button>
		</div>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-1 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</section>

	{#if showEditor}
		<Card class="p-4">
			<div class="mb-3 flex items-center gap-2 text-sm font-semibold">
				<Megaphone class="h-4 w-4 text-muted-foreground" />
				{editing ? 'Edit announcement' : 'Create announcement'}
			</div>
			<div class="grid gap-3 lg:grid-cols-2">
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Title</span>
					<Input bind:value={form.title} />
				</label>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="space-y-1 text-xs font-medium text-muted-foreground">
						<span>Status</span>
						<NativeSelect bind:value={form.status} options={formStatusOptions} />
					</label>
					<label class="space-y-1 text-xs font-medium text-muted-foreground">
						<span>Notify mode</span>
						<NativeSelect bind:value={form.notify_mode} options={notifyOptions} />
					</label>
				</div>
				<label class="space-y-1 text-xs font-medium text-muted-foreground lg:col-span-2">
					<span>Content</span>
					<Textarea class="min-h-24" bind:value={form.content} />
				</label>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="space-y-1 text-xs font-medium text-muted-foreground">
						<span>Starts at</span>
						<Input type="datetime-local" bind:value={form.starts_at} />
					</label>
					<label class="space-y-1 text-xs font-medium text-muted-foreground">
						<span>Ends at</span>
						<Input type="datetime-local" bind:value={form.ends_at} />
					</label>
				</div>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Targeting JSON</span>
					<Textarea class="min-h-24 font-mono text-xs" bind:value={form.targeting} />
				</label>
			</div>
			<div class="mt-3 flex justify-end gap-2">
				<Button variant="outline" disabled={saving} onclick={() => showEditor = false}>Cancel</Button>
				<Button disabled={saving || !form.title.trim() || !form.content.trim()} onclick={saveAnnouncement}>Save</Button>
			</div>
		</Card>
	{/if}

	<Card class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
		<div class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input class="pl-9" placeholder="Search announcements" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={resetAndLoad} data-testid="admin-announcements-status-filter" />
			<Button onclick={resetAndLoad}>Search</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={76} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid grid-cols-[minmax(260px,1.4fr)_110px_110px_minmax(170px,1fr)_170px_160px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Title</div><div>Status</div><div>Notify</div><div>Targeting</div><div>Window</div><div class="text-right">Actions</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1080px] grid-cols-[minmax(260px,1.4fr)_110px_110px_minmax(170px,1fr)_170px_160px] items-center border-b px-3 py-3 text-sm" data-testid="admin-announcements-row" data-announcement-id={row.id}>
					<div class="min-w-0">
						<div class="truncate font-medium">{row.title}</div>
						<div class="truncate text-xs text-muted-foreground">#{row.id} · {formatDate(row.created_at)}</div>
					</div>
					<div><Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge></div>
					<div><Badge variant="outline" class={notifyTone(row.notify_mode)}>{row.notify_mode}</Badge></div>
					<div class="truncate text-xs text-muted-foreground" title={targetingSummary(row.targeting)}>{targetingSummary(row.targeting)}</div>
					<div class="text-xs text-muted-foreground">{formatDate(row.starts_at)} → {formatDate(row.ends_at)}</div>
					<div class="flex justify-end gap-1.5">
						<Button variant="outline" size="sm" disabled={saving} onclick={() => openEdit(row)}>Edit</Button>
						<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => removeAnnouncement(row)}><Trash2 class="inline h-3.5 w-3.5" /></Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">No announcements found</div>{/snippet}
			{#snippet loadingSlot()}<div class="p-4 text-sm text-muted-foreground">Loading announcements…</div>{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} announcements · page {page} / {totalPages}</span>
			<div class="flex gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
			</div>
		</div>
	</Card>
</div>
