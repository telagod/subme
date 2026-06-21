<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Activity,
		ChevronLeft,
		ChevronRight,
		Play,
		Plus,
		RefreshCw,
		Search,
		Trash2
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		createChannelMonitor,
		deleteChannelMonitor,
		listChannelMonitors,
		runChannelMonitorNow,
		updateChannelMonitor,
		type APIMode,
		type ChannelMonitor,
		type CheckResult,
		type Provider
	} from '$lib/api/admin/channelMonitor';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		PAGE_SIZE,
		formatAvailability,
		formatDate,
		formatLatency,
		parseExtraModels,
		providerLabel,
		providerTone,
		statusTone,
		summarizeMonitors
	} from '$lib/features/channel-monitor/channel-monitor';

	const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];
	const ENABLED_OPTIONS = ['true', 'false'];
	const providerOptions = $derived([
		{ value: ALL, label: 'All providers' },
		...PROVIDERS.map((value) => ({ value, label: providerLabel(value) }))
	]);
	const formProviderOptions = $derived(PROVIDERS.map((value) => ({ value, label: providerLabel(value) })));
	const enabledOptions = [
		{ value: ALL, label: 'All states' },
		...ENABLED_OPTIONS.map((value) => ({ value, label: value === 'true' ? 'Enabled' : 'Disabled' }))
	];
	const apiModeOptions = [
		{ value: 'chat_completions', label: 'Chat completions' },
		{ value: 'responses', label: 'Responses' }
	];

	let rows = $state<ChannelMonitor[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let runningId = $state<number | null>(null);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let providerFilter = $state(ALL);
	let enabledFilter = $state(ALL);
	let showEditor = $state(false);
	let editing = $state<ChannelMonitor | null>(null);
	let runResults = $state<CheckResult[]>([]);
	let form = $state({
		name: '',
		provider: 'openai' as Provider,
		api_mode: 'chat_completions' as APIMode,
		endpoint: '',
		api_key: '',
		primary_model: '',
		extra_models: '',
		group_name: '',
		enabled: true,
		interval_seconds: 300,
		jitter_seconds: 0
	});

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeMonitors(rows));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listChannelMonitors({
				page,
				page_size: PAGE_SIZE,
				search: searchInput.trim() || undefined,
				provider: providerFilter === ALL ? undefined : (providerFilter as Provider),
				enabled:
					enabledFilter === ALL ? undefined : enabledFilter === 'true'
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
			name: '',
			provider: 'openai',
			api_mode: 'chat_completions',
			endpoint: '',
			api_key: '',
			primary_model: '',
			extra_models: '',
			group_name: '',
			enabled: true,
			interval_seconds: 300,
			jitter_seconds: 0
		};
		showEditor = true;
	}

	function openEdit(row: ChannelMonitor) {
		editing = row;
		form = {
			name: row.name,
			provider: row.provider,
			api_mode: row.api_mode,
			endpoint: row.endpoint,
			api_key: '',
			primary_model: row.primary_model,
			extra_models: row.extra_models.join('\n'),
			group_name: row.group_name,
			enabled: row.enabled,
			interval_seconds: row.interval_seconds,
			jitter_seconds: row.jitter_seconds
		};
		showEditor = true;
	}

	async function saveMonitor() {
		if (!form.name.trim() || !form.endpoint.trim() || !form.primary_model.trim()) return;
		saving = true;
		try {
			const payload = {
				name: form.name.trim(),
				provider: form.provider,
				api_mode: form.api_mode,
				endpoint: form.endpoint.trim(),
				api_key: form.api_key,
				primary_model: form.primary_model.trim(),
				extra_models: parseExtraModels(form.extra_models),
				group_name: form.group_name.trim(),
				enabled: form.enabled,
				interval_seconds: Number(form.interval_seconds) || 300,
				jitter_seconds: Number(form.jitter_seconds) || 0
			};
			if (editing) {
				await updateChannelMonitor(editing.id, payload);
			} else {
				await createChannelMonitor(payload);
			}
			showSuccess('Channel monitor saved');
			showEditor = false;
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function toggleEnabled(row: ChannelMonitor) {
		saving = true;
		try {
			await updateChannelMonitor(row.id, { enabled: !row.enabled });
			showSuccess('Monitor updated');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function runNow(row: ChannelMonitor) {
		runningId = row.id;
		runResults = [];
		try {
			const res = await runChannelMonitorNow(row.id);
			runResults = res.results;
			showSuccess('Monitor check completed');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			runningId = null;
		}
	}

	async function removeMonitor(row: ChannelMonitor) {
		saving = true;
		try {
			await deleteChannelMonitor(row.id);
			showSuccess('Monitor deleted');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.channelMonitor', { default: 'Channel monitor' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.quench.channelMonitor', { default: 'Channel monitor' })}
			</h1>
			<p class="text-sm text-muted-foreground">Track provider health, latency, and model availability.</p>
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
				<p class="mt-1 text-2xl font-semibold">{item.label.includes('availability') ? `${item.value}%` : item.value}</p>
			</Card>
		{/each}
	</section>

	{#if showEditor}
		<Card class="p-4">
			<div class="mb-3 flex items-center gap-2 text-sm font-semibold">
				<Activity class="h-4 w-4 text-muted-foreground" />
				{editing ? 'Edit monitor' : 'Create monitor'}
			</div>
			<div class="grid gap-3 lg:grid-cols-3">
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Name</span>
					<Input bind:value={form.name} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Provider</span>
					<NativeSelect bind:value={form.provider} options={formProviderOptions} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>API mode</span>
					<NativeSelect bind:value={form.api_mode} options={apiModeOptions} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground lg:col-span-2">
					<span>Endpoint</span>
					<Input bind:value={form.endpoint} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>API key {editing ? '(blank keeps current)' : ''}</span>
					<Input type="password" bind:value={form.api_key} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Primary model</span>
					<Input bind:value={form.primary_model} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Group name</span>
					<Input bind:value={form.group_name} />
				</label>
				<label class="flex items-center gap-2 pt-6 text-sm text-foreground">
					<Checkbox bind:checked={form.enabled} />
					<span>Enabled</span>
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Interval seconds</span>
					<Input type="number" min="30" bind:value={form.interval_seconds} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>Jitter seconds</span>
					<Input type="number" min="0" bind:value={form.jitter_seconds} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground lg:col-span-3">
					<span>Extra models</span>
					<Textarea class="font-mono text-xs" placeholder="one model per line or comma separated" bind:value={form.extra_models} />
				</label>
			</div>
			<div class="mt-3 flex justify-end gap-2">
				<Button variant="outline" disabled={saving} onclick={() => showEditor = false}>Cancel</Button>
				<Button disabled={saving || !form.name.trim() || !form.endpoint.trim() || !form.primary_model.trim()} onclick={saveMonitor}>Save</Button>
			</div>
		</Card>
	{/if}

	{#if runResults.length}
		<Card class="p-3">
			<div class="mb-2 text-sm font-semibold">Latest manual check</div>
			<div class="flex flex-wrap gap-2">
				{#each runResults as result}
					<Badge variant="outline" class={`py-1 ${statusTone(result.status)}`}>
						{result.model}: {result.status} · {formatLatency(result.latency_ms)}
					</Badge>
				{/each}
			</div>
		</Card>
	{/if}

	<Card class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
		<div class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input class="pl-9" placeholder="Search monitors" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect bind:value={providerFilter} options={providerOptions} onchange={resetAndLoad} data-testid="admin-channel-monitor-provider-filter" />
			<NativeSelect bind:value={enabledFilter} options={enabledOptions} onchange={resetAndLoad} data-testid="admin-channel-monitor-enabled-filter" />
			<Button onclick={resetAndLoad}>Search</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={76} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid grid-cols-[minmax(230px,1.3fr)_120px_minmax(170px,1fr)_120px_120px_150px_210px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>Name</div><div>Provider</div><div>Model</div><div>Status</div><div>Latency</div><div>Last check</div><div class="text-right">Actions</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1180px] grid-cols-[minmax(230px,1.3fr)_120px_minmax(170px,1fr)_120px_120px_150px_210px] items-center border-b px-3 py-3 text-sm" data-testid="admin-channel-monitor-row" data-monitor-id={row.id}>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<div class={`h-2 w-2 rounded-full ${row.enabled ? 'bg-emerald-500' : 'bg-muted-foreground'}`}></div>
							<div class="truncate font-medium">{row.name}</div>
						</div>
						<div class="truncate text-xs text-muted-foreground">{row.endpoint}</div>
					</div>
					<div><Badge variant="outline" class={providerTone(row.provider)}>{providerLabel(row.provider)}</Badge></div>
					<div class="truncate text-xs text-muted-foreground" title={[row.primary_model, ...row.extra_models].join(', ')}>
						{row.primary_model}{row.extra_models.length ? ` +${row.extra_models.length}` : ''}
					</div>
					<div><Badge variant="outline" class={statusTone(row.primary_status)}>{row.primary_status || 'unknown'}</Badge></div>
					<div class="text-xs text-muted-foreground">{formatLatency(row.primary_latency_ms)} · {formatAvailability(row)}</div>
					<div class="text-xs text-muted-foreground">{formatDate(row.last_checked_at)}</div>
					<div class="flex justify-end gap-1.5">
						<Button variant="outline" size="sm" disabled={runningId === row.id} onclick={() => runNow(row)}><Play class="mr-1 inline h-3.5 w-3.5" />Run</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => toggleEnabled(row)}>{row.enabled ? 'Disable' : 'Enable'}</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => openEdit(row)}>Edit</Button>
						<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => removeMonitor(row)}><Trash2 class="inline h-3.5 w-3.5" /></Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">No channel monitors found</div>{/snippet}
			{#snippet loadingSlot()}<div class="p-4 text-sm text-muted-foreground">Loading monitors…</div>{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} monitors · page {page} / {totalPages}</span>
			<div class="flex gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
			</div>
		</div>
	</Card>
</div>
