<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Pencil, RefreshCw, Trash2, Plus } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { Account } from '$lib/api/admin/accounts';

	type Props = {
		accounts: Account[];
		loading: boolean;
		onEdit: (a: Account) => void;
		onRefresh: (a: Account) => void;
		onDelete: (a: Account) => void;
		onAdd: () => void;
	};

	let { accounts, loading, onEdit, onRefresh, onDelete, onAdd }: Props = $props();

	const PLATFORMS = ['anthropic', 'openai', 'gemini', 'antigravity'];

	function platformColor(p: string): string {
		if (p === 'anthropic') return 'border-amber-500/20 bg-amber-500/5';
		if (p === 'openai') return 'border-emerald-500/20 bg-emerald-500/5';
		if (p === 'gemini') return 'border-blue-500/20 bg-blue-500/5';
		return 'border-border bg-card';
	}

	function statusColor(s: string): string {
		if (s === 'active') return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20';
		if (s === 'error') return 'bg-destructive/15 text-destructive border-destructive/20';
		if (s === 'rate_limited') return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
		return 'bg-muted text-muted-foreground border-border';
	}

	const grouped = $derived.by(() => {
		const map: Record<string, Account[]> = {};
		for (const p of PLATFORMS) map[p] = [];
		for (const a of accounts) {
			const p = a.platform ?? 'other';
			if (!map[p]) map[p] = [];
			map[p].push(a);
		}
		return Object.entries(map).filter(([, list]) => list.length > 0);
	});
</script>

{#if loading}
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each Array(8) as _, i (i)}
			<div class="h-32 animate-pulse rounded-lg border bg-muted"></div>
		{/each}
	</div>
{:else if accounts.length === 0}
	<div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
		<p class="text-sm text-muted-foreground">{$_('admin.accounts.empty', { default: 'No accounts yet' })}</p>
		<Button size="sm" onclick={onAdd}><Plus size={14} /> {$_('admin.accounts.newAccount', { default: 'New account' })}</Button>
	</div>
{:else}
	{#each grouped as [platform, list] (platform)}
		<div class="mb-5">
			<div class="mb-2 flex items-center gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{platform}</h3>
				<span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{list.length}</span>
			</div>
			<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each list as a (a.id)}
					<div class="group relative flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/20 {platformColor(platform)}">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{a.name}</p>
								{#if a.email}<p class="truncate text-xs text-muted-foreground">{a.email}</p>{/if}
							</div>
							<div class="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
								<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => onEdit(a)} title={$_('common.edit', { default: 'Edit' })}><Pencil size={12} /></Button>
								<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => onRefresh(a)} title={$_('common.refresh', { default: 'Refresh' })}><RefreshCw size={12} /></Button>
								<Button size="icon" variant="ghost" class="h-6 w-6 text-destructive" onclick={() => onDelete(a)} title={$_('common.delete', { default: 'Delete' })}><Trash2 size={12} /></Button>
							</div>
						</div>
						<div class="flex flex-wrap gap-1">
							<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium {statusColor(a.status)}">{a.status}</span>
							{#if a.type}<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{a.type}</span>{/if}
							{#if a.schedulable}<span class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">sched</span>{/if}
						</div>
						{#if a.groups && a.groups.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each a.groups.slice(0, 3) as g}
									<span class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{g.name}</span>
								{/each}
								{#if a.groups.length > 3}<span class="text-[10px] text-muted-foreground">+{a.groups.length - 3}</span>{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
{/if}
