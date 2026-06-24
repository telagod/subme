<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import type { Proxy, ProxyQualityCheckResult } from '$lib/api/admin/proxies';
	import { qualityScoreText, qualityMessage, qualityDetailRows, detailText, formatLatency } from './proxy-helpers';

	interface Props {
		open: boolean;
		subject: Proxy | null;
		report: ProxyQualityCheckResult | null;
		onClose: () => void;
	}

	let { open = $bindable(), subject, report, onClose }: Props = $props();
</script>

<StandardDialog bind:open title="Proxy quality report" width="lg" data-testid="proxy-quality-dialog">
	<div class="mt-4 space-y-4">
		<Card class="space-y-3">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="truncate text-sm font-medium">{subject?.name ?? 'Proxy'}</p>
					<p class="mt-1 text-sm text-muted-foreground" data-testid="proxy-quality-summary">{qualityMessage(report)}</p>
				</div>
				<div class="text-right">
					<p class="text-2xl font-semibold" data-testid="proxy-quality-score">{qualityScoreText(report)}</p>
					<p class="text-xs text-muted-foreground">score</p>
				</div>
			</div>
			<div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
				<p>Exit IP: <span class="text-foreground">{detailText(report?.exit_ip)}</span></p>
				<p>Country: <span class="text-foreground">{detailText(report?.country)}</span></p>
				<p>Base latency: <span class="text-foreground">{formatLatency(report?.base_latency_ms)}</span></p>
				<p>Status: <span class="text-foreground">{report?.success ? 'passed' : 'failed'}</span></p>
			</div>
		</Card>

		<div class="max-h-80 overflow-auto rounded-md border border-border" data-testid="proxy-quality-targets">
			{#if qualityDetailRows(report).length === 0}
				<p class="p-4 text-sm text-muted-foreground">No target details returned.</p>
			{:else}
				<div class="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-3 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
					<span>{$_('admin.proxies.target', { default: '目标' })}</span><span>{$_('common.status', { default: 'Status' })}</span><span>HTTP</span><span>{$_('common.latency', { default: '延迟' })}</span><span>{$_('common.message', { default: '消息' })}</span>
				</div>
				{#each qualityDetailRows(report) as item}
					<div class="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
						<p class="truncate">{detailText(item.target)}</p>
						<p class="truncate">{detailText(item.status)}</p>
						<p class="truncate">{detailText(item.http_status)}</p>
						<p class="truncate">{formatLatency(item.latency_ms)}</p>
						<p class="truncate text-muted-foreground">{detailText(item.message)}</p>
					</div>
				{/each}
			{/if}
		</div>
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>{$_('common.close', { default: 'Close' })}</Button>
	</div>
</StandardDialog>
