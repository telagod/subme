<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { listRiskLogs, type ContentModerationLog } from '$lib/api/admin/riskControl';
	import type { AdminUser } from '$lib/api/admin/users';
	import Badge from '$lib/ui/Badge.svelte';

	type Props = { user: AdminUser; active: boolean };
	let { user, active }: Props = $props();

	let items = $state<ContentModerationLog[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	async function load() {
		if (loaded) return;
		loading = true; error = null;
		try {
			const res = await listRiskLogs({ search: String(user.id), page: 1, page_size: 20 });
			items = (res.items ?? []).filter((l: ContentModerationLog) => l.user_id === user.id);
			loaded = true;
		} catch { error = $_('admin.users.loadFailed', { default: 'Failed to load' }); }
		finally { loading = false; }
	}

	$effect(() => { if (active) load(); });
	onMount(() => { if (active) load(); });
</script>

<div class="flex flex-col gap-2.5 p-1">
	{#if loading}
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('common.loading', { default: 'Loading...' })}</div>
	{:else if error}
		<div class="text-sm text-destructive">{error}</div>
	{:else if !items.length}
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('admin.users.noRiskLogs', { default: 'No risk logs' })}</div>
	{:else}
		{#each items as log}
			<div class="flex flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3 {log.flagged ? 'border-destructive/35 bg-destructive/[0.04]' : 'border-border'}">
				<div class="flex items-center justify-between">
					<div class="text-xs text-muted-foreground">{fmt(log.created_at)}</div>
					<div class="flex gap-1.5">
						{#if log.flagged}
							<Badge class="border-destructive/30 bg-destructive/10 text-destructive text-[10.5px]">
								{$_('admin.users.riskFlagged', { default: 'Flagged' })}
							</Badge>
						{/if}
						{#if log.auto_banned}
							<Badge class="border-destructive/30 bg-destructive/10 text-destructive text-[10.5px]">
								{$_('admin.users.riskBanned', { default: 'Auto-banned' })}
							</Badge>
						{/if}
						{#if !log.flagged}
							<Badge class="border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10.5px]">
								{$_('admin.users.riskPassed', { default: 'Passed' })}
							</Badge>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
					<span>{$_('admin.users.riskMode', { default: 'Mode:' })} {log.mode}</span>
					{#if log.highest_category}<span>{$_('admin.users.riskCategory', { default: 'Category:' })} {log.highest_category}</span>{/if}
					{#if log.highest_score}<span>{$_('admin.users.riskScore', { default: 'Score:' })} {(log.highest_score * 100).toFixed(1)}%</span>{/if}
					<span>{$_('admin.users.riskModel', { default: 'Model:' })} {log.model || '—'}</span>
				</div>
				{#if log.input_excerpt}
					<div class="max-h-12 overflow-hidden break-all whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
						{log.input_excerpt}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
