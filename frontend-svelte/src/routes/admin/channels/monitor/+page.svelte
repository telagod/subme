<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		FileText,
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
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		createChannelMonitor,
		deleteChannelMonitor,
		listChannelMonitors,
		runChannelMonitorNow,
		updateChannelMonitor,
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
		providerLabel,
		providerTone,
		statusTone,
		summarizeMonitors
	} from '$lib/features/channel-monitor/channel-monitor';
	import MonitorEditorCard from '$lib/features/channel-monitor/MonitorEditorCard.svelte';
	import MonitorTemplateManagerDialog from '$lib/features/channel-monitor/MonitorTemplateManagerDialog.svelte';

	const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];
	const providerOptions = $derived([
		{ value: ALL, label: 'All providers' },
		...PROVIDERS.map((value) => ({ value, label: providerLabel(value) }))
	]);
	const enabledOptions = [
		{ value: ALL, label: 'All states' },
		{ value: 'true', label: 'Enabled' },
		{ value: 'false', label: 'Disabled' }
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
	let templateManagerOpen = $state(false);

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
				enabled: enabledFilter === ALL ? undefined : enabledFilter === 'true'
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
		showEditor = true;
	}

	function openEdit(row: ChannelMonitor) {
		editing = row;
		showEditor = true;
	}

	async function handleEditorSave(payload: Record<string, unknown>) {
		saving = true;
		try {
			if (editing) {
				await updateChannelMonitor(editing.id, payload);
			} else {
				await createChannelMonitor(payload as unknown as Parameters<typeof createChannelMonitor>[0]);
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
	<title>{$_('nav.quench.channelMonitor', { default: '渠道监控' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.quench.channelMonitor', { default: '渠道监控' })}
			</h1>
			<p class="text-sm text-muted-foreground">Track provider health, latency, and model availability.</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => (templateManagerOpen = true)} data-testid="open-template-manager">
				<FileText size={15} />{$_('admin.channelMonitor.template.managerButton', { default: '模板' })}
			</Button>
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />Refresh
			</Button>
			<Button onclick={openCreate}>
				<Plus size={15} />{$_('common.create', { default: 'Create' })}
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
		<MonitorEditorCard {editing} {saving} onSave={handleEditorSave} onCancel={() => (showEditor = false)} />
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
			<Input class="pl-9" placeholder={$_('admin.channelMonitor.searchPlaceholder', { default: '搜索监控' })} bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect bind:value={providerFilter} options={providerOptions} onchange={resetAndLoad} data-testid="admin-channel-monitor-provider-filter" />
			<NativeSelect bind:value={enabledFilter} options={enabledOptions} onchange={resetAndLoad} data-testid="admin-channel-monitor-enabled-filter" />
			<Button onclick={resetAndLoad}>{$_('common.search', { default: '搜索' })}</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={76} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid grid-cols-[minmax(230px,1.3fr)_120px_minmax(170px,1fr)_120px_120px_150px_210px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>{$_('common.name', { default: '名称' })}</div><div>{$_('common.provider', { default: '供应商' })}</div><div>{$_('common.model', { default: '模型' })}</div><div>{$_('common.status', { default: '状态' })}</div><div>{$_('common.latency', { default: '延迟' })}</div><div>{$_('admin.channelMonitor.lastCheck', { default: '最后检查' })}</div><div class="text-right">{$_('common.actions', { default: '操作' })}</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[1180px] grid-cols-[minmax(230px,1.3fr)_120px_minmax(170px,1fr)_120px_120px_150px_210px] items-center border-b px-3 py-3 text-sm" data-testid="admin-channel-monitor-row" data-monitor-id={row.id}>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<div class={`h-2 w-2 rounded-full ${row.enabled ? 'bg-emerald-500' : 'bg-muted-foreground'}`}></div>
							<div class="truncate font-medium">{row.name}</div>
							{#if row.template_id}
								<Badge variant="outline" class="gap-1 text-xs border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
									<FileText class="inline h-3 w-3" />TPL
								</Badge>
							{/if}
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
						<Button variant="outline" size="sm" disabled={runningId === row.id} onclick={() => runNow(row)}><Play class="mr-1 inline h-3.5 w-3.5" />{$_('admin.channelMonitor.run', { default: '执行' })}</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => toggleEnabled(row)}>{row.enabled ? $_('common.disable', { default: 'Disable' }) : $_('common.enable', { default: 'Enable' })}</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => openEdit(row)}>{$_('common.edit', { default: 'Edit' })}</Button>
						<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => removeMonitor(row)}><Trash2 class="inline h-3.5 w-3.5" /></Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">{$_('admin.channelMonitor.empty', { default: '暂无渠道监控' })}</div>{/snippet}
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

<MonitorTemplateManagerDialog bind:open={templateManagerOpen} onUpdated={loadRows} />
