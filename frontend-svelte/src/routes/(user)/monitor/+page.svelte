<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Activity, Gauge, RefreshCw, Search, X } from '@lucide/svelte';
	import {
		getUserChannelMonitorStatus,
		listUserChannelMonitors,
		type UserMonitorDetail,
		type UserMonitorView
	} from '$lib/api/user/channelMonitor';
	import { showError } from '$lib/stores/toast.svelte';
	import {
		availabilityForWindow,
		filterMonitors,
		formatAvailability,
		formatLatency,
		overallStatus,
		providerTone,
		statusTone,
		type MonitorWindow
	} from '$lib/features/channel-status/channel-status';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	const WINDOWS: MonitorWindow[] = ['7d', '15d', '30d'];

	let items = $state<UserMonitorView[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let searchQuery = $state('');
	let currentWindow = $state<MonitorWindow>('7d');
	let selected = $state<UserMonitorView | null>(null);
	let detail = $state<UserMonitorDetail | null>(null);
	let detailLoading = $state(false);

	const filteredItems = $derived(filterMonitors(items, searchQuery));
	const currentOverall = $derived(overallStatus(items));
	const operationalCount = $derived(items.filter((item) => item.primary_status === 'operational').length);
	const avgAvailability = $derived.by(() => {
		const values = items.map((item) => item.availability_7d).filter((value) => Number.isFinite(value));
		if (!values.length) return 0;
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	});

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const res = await listUserChannelMonitors();
			items = res.items ?? [];
			if (selected) {
				selected = items.find((item) => item.id === selected?.id) ?? null;
				if (!selected) detail = null;
			}
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') {
				loadError = msg || $_('channelStatus.loadError', { default: 'Failed to load channel status' });
				showError(loadError);
			}
			items = [];
		} finally {
			loading = false;
		}
	}

	async function openDetail(row: UserMonitorView) {
		selected = row;
		detail = null;
		detailLoading = true;
		try {
			detail = await getUserChannelMonitorStatus(row.id);
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') showError(msg || $_('channelStatus.detailLoadError', { default: 'Failed to load channel detail' }));
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		selected = null;
		detail = null;
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('channelStatus.title', { default: 'Channel Status' })} · sub2api</title>
</svelte:head>

<section class="space-y-5" data-testid="channel-status-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('channelStatus.title', { default: 'Channel Status' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('channelStatus.description', { default: 'Inspect channel availability, latency and recent status' })}
			</p>
		</div>
		<Button
			variant="outline"
			class="h-9 gap-2 text-muted-foreground"
			onclick={loadRows}
			disabled={loading}
		>
			<RefreshCw class={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
			{$_('common.refresh', { default: 'Refresh' })}
		</Button>
	</header>

	<section class="grid gap-3 md:grid-cols-3">
		<div class={`rounded-lg border p-4 ${statusTone(currentOverall === 'operational' ? 'operational' : 'degraded')}`}>
			<p class="text-xs font-semibold uppercase">{$_(`channelStatus.overall.${currentOverall}`, { default: currentOverall })}</p>
			<p class="mt-2 text-2xl font-semibold">{currentOverall}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-xs font-semibold uppercase text-muted-foreground">Operational</p>
			<p class="mt-2 text-2xl font-semibold">{operationalCount} / {items.length}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<p class="text-xs font-semibold uppercase text-muted-foreground">Average availability</p>
			<p class="mt-2 text-2xl font-semibold">{formatAvailability(avgAvailability)}</p>
		</div>
	</section>

	<div class="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
		<label class="relative block">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				class="h-10 pl-9"
				type="search"
				bind:value={searchQuery}
				data-testid="channel-status-search"
				placeholder={$_('channelStatus.searchPlaceholder', { default: 'Search channels...' })}
			/>
		</label>
		<div class="inline-flex rounded-md border border-border bg-background p-1">
			{#each WINDOWS as window}
				<Button
					variant="ghost"
					class={`rounded px-3 py-1.5 text-sm ${currentWindow === window ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
					onclick={() => (currentWindow = window)}
				>
					{$_(`channelStatus.windowTab.${window}`, { default: window })}
				</Button>
			{/each}
		</div>
	</div>

	{#if loadError}
		<Alert variant="destructive">
			{loadError}
		</Alert>
	{/if}

	{#if loading}
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each Array.from({ length: 6 }) as _, idx}
				<div class="h-40 animate-pulse rounded-lg border border-border bg-card" aria-hidden="true" data-testid={`channel-status-skeleton-${idx}`}></div>
			{/each}
		</div>
	{:else if filteredItems.length === 0}
		<div class="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center" data-testid="channel-status-empty">
			<Activity class="mb-3 h-10 w-10 text-muted-foreground" />
			<p class="font-medium">{$_('channelStatus.empty.title', { default: 'No channels available' })}</p>
			<p class="mt-1 text-sm text-muted-foreground">{$_('channelStatus.empty.description', { default: 'No monitored channels have been configured yet.' })}</p>
		</div>
	{:else}
		<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredItems as item}
					<Button
						variant="outline"
						class={`rounded-lg border bg-card p-4 text-left transition hover:bg-accent ${selected?.id === item.id ? 'ring-2 ring-primary' : ''}`}
						onclick={() => openDetail(item)}
						data-testid="channel-status-card"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h2 class="truncate font-semibold">{item.name}</h2>
								<p class="mt-1 truncate text-xs text-muted-foreground">{item.group_name || '-'}</p>
							</div>
							<span class={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase ${providerTone(item.provider)}`}>
								{item.provider}
							</span>
						</div>
						<div class="mt-4 grid grid-cols-2 gap-2 text-sm">
							<div>
								<p class="text-xs text-muted-foreground">{$_('channelStatus.columns.primaryModel', { default: 'Primary Model' })}</p>
								<p class="truncate font-medium">{item.primary_model}</p>
							</div>
							<div>
								<p class="text-xs text-muted-foreground">{$_('channelStatus.columns.latency', { default: 'Latency (ms)' })}</p>
								<p class="font-medium">{formatLatency(item.primary_latency_ms)}</p>
							</div>
							<div>
								<p class="text-xs text-muted-foreground">{$_('channelStatus.columns.availability7d', { default: '7d Availability' })}</p>
								<p class="font-medium">{formatAvailability(item.availability_7d)}</p>
							</div>
							<div>
								<p class="text-xs text-muted-foreground">Status</p>
								<span class={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(item.primary_status)}`}>{item.primary_status}</span>
							</div>
						</div>
						{#if item.extra_models.length}
							<div class="mt-3 flex flex-wrap gap-1">
								{#each item.extra_models.slice(0, 4) as extra}
									<span class={`rounded-full border px-2 py-0.5 text-xs ${statusTone(extra.status)}`}>
										{extra.model} · {formatLatency(extra.latency_ms)}
									</span>
								{/each}
							</div>
						{/if}
					</Button>
				{/each}
			</div>

			<aside class="rounded-lg border border-border bg-card" data-testid="channel-status-detail">
				<div class="flex items-center justify-between border-b border-border px-4 py-3">
					<div>
						<p class="text-sm font-semibold">{selected?.name ?? $_('channelStatus.detailTitle', { default: 'Channel Detail' })}</p>
						<p class="text-xs text-muted-foreground">{selected?.group_name ?? ''}</p>
					</div>
					{#if selected}
						<Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground" onclick={closeDetail} aria-label={$_('channelStatus.closeDetail', { default: 'Close' })}>
							<X class="h-4 w-4" />
						</Button>
					{/if}
				</div>
				{#if detailLoading}
					<div class="flex h-48 items-center justify-center">
						<RefreshCw class="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				{:else if detail}
					<div class="divide-y divide-border">
						{#each detail.models as model}
							<div class="p-4" data-testid="channel-status-detail-row">
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium">{model.model}</p>
										<p class="text-xs text-muted-foreground">{formatLatency(model.latest_latency_ms)} · avg {formatLatency(model.avg_latency_7d_ms)}</p>
									</div>
									<span class={`rounded-full border px-2 py-0.5 text-xs ${statusTone(model.latest_status)}`}>
										{model.latest_status}
									</span>
								</div>
								<div class="mt-3 flex items-center gap-2">
									<Gauge class="h-4 w-4 text-muted-foreground" />
									<span class="text-sm">{formatAvailability(availabilityForWindow(model, currentWindow))}</span>
									<span class="text-xs text-muted-foreground">{currentWindow}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
						Select a channel to inspect model-level availability.
					</div>
				{/if}
			</aside>
		</div>
	{/if}
</section>
