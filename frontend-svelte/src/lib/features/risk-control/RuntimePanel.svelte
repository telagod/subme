<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { getRiskStatus, type ContentModerationRuntimeStatus } from '$lib/api/admin/riskControl';
	import { showError } from '$lib/stores/toast.svelte';
	import { AUTO_REFRESH_MS, formatNumber, modeLabel } from './risk-control';

	type Props = {
		status: ContentModerationRuntimeStatus | null;
		mode: string;
		enabled: boolean;
	};

	let { status = $bindable(), mode, enabled }: Props = $props();

	let refreshing = $state(false);
	let lastRefresh = $state<string | null>(null);

	const queueUsage = $derived(Math.min(100, Math.max(0, Number(status?.queue_usage_percent ?? 0))));
	const isPreBlock = $derived(mode === 'pre_block');
	const isObserve = $derived(mode === 'observe');
	const showMetrics = $derived(enabled && (isPreBlock || isObserve));

	const workerSlots = $derived.by(() => {
		const total = status?.worker_count ?? 0;
		const active = status?.active_workers ?? 0;
		const on = Boolean(status?.risk_control_enabled && enabled && mode !== 'off');
		return Array.from({ length: total }, (_, i) => ({
			id: i + 1,
			state: !on ? 'disabled' : i < active ? 'active' : 'idle'
		}));
	});

	async function refresh() {
		refreshing = true;
		try {
			status = await getRiskStatus();
			lastRefresh = new Date().toLocaleTimeString();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		const timer = setInterval(() => { void refresh(); }, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	});
</script>

<Card class="p-0">
	<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
		<div>
			<h2 class="text-sm font-semibold text-foreground">Runtime Status</h2>
			<p class="mt-0.5 text-[11px] text-muted-foreground">
				Auto-refreshes every 15s
				{#if lastRefresh}
					<span class="ml-1"> &middot; last: {lastRefresh}</span>
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Badge variant="outline" class="text-[11px]">{modeLabel(status?.mode ?? mode)}</Badge>
			<Button variant="outline" size="icon" class="h-7 w-7" onclick={refresh} disabled={refreshing}>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} />
			</Button>
		</div>
	</div>

	<div class="p-4 space-y-4">
		<!-- Queue usage bar -->
		<div>
			<div class="flex justify-between text-xs text-muted-foreground">
				<span>{$_('admin.risk.queueUsage', { default: 'Queue usage' })}</span>
				<span>{Math.round(queueUsage * 10) / 10}%</span>
			</div>
			<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full transition-all duration-300
						{queueUsage > 80 ? 'bg-destructive' : queueUsage > 50 ? 'bg-amber-500' : 'bg-primary'}"
					style={`width:${queueUsage}%`}
				></div>
			</div>
			<div class="mt-1 text-[11px] text-muted-foreground">
				{formatNumber(status?.queue_length)} / {formatNumber(status?.queue_size)}
			</div>
		</div>

		<!-- Core metrics grid -->
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<div class="rounded-md border bg-background p-2.5">
				<p class="text-[11px] text-muted-foreground">Active workers</p>
				<p class="mt-1 text-lg font-semibold">{status?.active_workers ?? 0}</p>
			</div>
			<div class="rounded-md border bg-background p-2.5">
				<p class="text-[11px] text-muted-foreground">Idle workers</p>
				<p class="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{status?.idle_workers ?? 0}</p>
			</div>
			<div class="rounded-md border bg-background p-2.5">
				<p class="text-[11px] text-muted-foreground">Processed</p>
				<p class="mt-1 text-lg font-semibold">{formatNumber(status?.processed)}</p>
			</div>
			<div class="rounded-md border bg-background p-2.5">
				<p class="text-[11px] text-muted-foreground">Dropped + Errors</p>
				<p class="mt-1 text-lg font-semibold">{formatNumber((status?.dropped ?? 0) + (status?.errors ?? 0))}</p>
			</div>
		</div>

		{#if showMetrics && isPreBlock}
			<!-- Pre-block metrics -->
			<div class="space-y-2">
				<h3 class="text-xs font-medium text-muted-foreground">Pre-block Metrics</h3>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					<div class="rounded-md bg-muted/50 p-2.5">
						<p class="text-[11px] text-muted-foreground">Active</p>
						<p class="mt-1 text-lg font-semibold">{formatNumber(status?.pre_block_active)}</p>
					</div>
					<div class="rounded-md bg-muted/50 p-2.5">
						<p class="text-[11px] text-muted-foreground">Checked</p>
						<p class="mt-1 text-lg font-semibold">{formatNumber(status?.pre_block_checked)}</p>
					</div>
					<div class="rounded-md bg-emerald-500/5 p-2.5">
						<p class="text-[11px] text-muted-foreground">Allowed</p>
						<p class="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(status?.pre_block_allowed)}</p>
					</div>
					<div class="rounded-md bg-destructive/5 p-2.5">
						<p class="text-[11px] text-muted-foreground">Blocked</p>
						<p class="mt-1 text-lg font-semibold text-destructive">{formatNumber(status?.pre_block_blocked)}</p>
					</div>
					<div class="rounded-md bg-amber-500/5 p-2.5">
						<p class="text-[11px] text-muted-foreground">Errors</p>
						<p class="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">{formatNumber(status?.pre_block_errors)}</p>
					</div>
					<div class="rounded-md bg-muted/50 p-2.5">
						<p class="text-[11px] text-muted-foreground">Avg latency</p>
						<p class="mt-1 text-lg font-semibold">{formatNumber(status?.pre_block_avg_latency_ms)} ms</p>
					</div>
				</div>
			</div>

			<!-- API key load -->
			{#if (status?.pre_block_api_key_loads ?? []).length > 0}
				{@const maxTotal = Math.max(1, ...status!.pre_block_api_key_loads.map((k) => k.total || 0))}
				<div class="space-y-2">
					<h3 class="text-xs font-medium text-muted-foreground">API Key Load Distribution</h3>
					<div class="max-h-48 space-y-1.5 overflow-y-auto pr-1">
						{#each status!.pre_block_api_key_loads.sort((a, b) => a.index - b.index) as key}
							<div class="rounded-md border bg-background px-3 py-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-mono font-medium">#{key.index + 1} {key.masked || ''}</span>
									<Badge variant="outline" class="text-[10px] {key.status === 'ok' ? 'text-emerald-600' : key.status === 'frozen' ? 'text-destructive' : ''}">{key.status}</Badge>
								</div>
								<div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
									<div class="h-full rounded-full bg-primary" style={`width:${Math.min(100, (key.total / maxTotal) * 100).toFixed(1)}%`}></div>
								</div>
								<div class="mt-1 flex gap-3 text-[10px] text-muted-foreground">
									<span>total: {formatNumber(key.total)}</span>
									<span>ok: {formatNumber(key.success)}</span>
									<span>err: {formatNumber(key.errors)}</span>
									<span>avg: {formatNumber(key.avg_latency_ms)} ms</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		{#if showMetrics && isObserve}
			<!-- Worker pool visualization -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<h3 class="text-xs font-medium text-muted-foreground">Worker Pool</h3>
					<span class="text-[11px] text-muted-foreground">
						{status?.active_workers ?? 0} active / {status?.worker_count ?? 0} total
					</span>
				</div>
				<div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10">
					{#each workerSlots as w (w.id)}
						<div
							class="flex h-9 items-center justify-between rounded-md border px-2 text-xs
								{w.state === 'active' ? 'border-border bg-muted/80 text-foreground' :
								 w.state === 'idle' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
								 'border-border/50 text-muted-foreground/50'}"
							title={w.state}
						>
							<span class="font-semibold">#{w.id}</span>
							<span class="h-2 w-2 rounded-full
								{w.state === 'active' ? 'bg-primary' :
								 w.state === 'idle' ? 'bg-emerald-500' :
								 'bg-muted-foreground/30'}"></span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if status?.last_cleanup_at}
			<div class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
				<span>{$_('admin.risk.lastCleanup', { default: 'Last cleanup' })}: {new Date(status.last_cleanup_at).toLocaleString()}</span>
				<span>&middot; hit: {status.last_cleanup_deleted_hit}</span>
				<span>&middot; non-hit: {status.last_cleanup_deleted_non_hit}</span>
			</div>
		{/if}
	</div>
</Card>
