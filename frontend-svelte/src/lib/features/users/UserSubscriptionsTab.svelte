<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { listAdminSubs, type AdminSubscription } from '$lib/api/admin/subscriptions';
	import type { AdminUser } from '$lib/api/admin/users';
	import Badge from '$lib/ui/Badge.svelte';
	import Card from '$lib/ui/Card.svelte';

	type Props = { user: AdminUser; active: boolean };
	let { user, active }: Props = $props();

	let items = $state<AdminSubscription[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString();
	}

	function statusTone(s: string): string {
		if (s === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
		if (s === 'expired') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}

	async function load() {
		if (loaded) return;
		loading = true; error = null;
		try {
			const res = await listAdminSubs({ page: 1, page_size: 20, user_id: user.id });
			items = res.data ?? []; total = res.total ?? 0; loaded = true;
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
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('admin.users.noSubscriptions', { default: 'No subscriptions' })}</div>
	{:else}
		{#each items as sub}
			<Card class="flex flex-col gap-1.5 px-3.5 py-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2 text-sm">
						<span class="font-mono text-xs text-foreground">#{sub.id}</span>
						{#if sub.group_name}<span class="text-foreground">{sub.group_name}</span>{/if}
					</div>
					<Badge class={statusTone(sub.status)}>{sub.status}</Badge>
				</div>
				<div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
					<span>{$_('admin.users.subStart', { default: 'Start:' })} {fmt(sub.started_at)}</span>
					{#if sub.expires_at}
						<span>{$_('admin.users.subExpires', { default: 'Expires:' })} {fmt(sub.expires_at)}</span>
					{:else}
						<span>{$_('admin.users.subPermanent', { default: 'Permanent' })}</span>
					{/if}
				</div>
			</Card>
		{/each}
		{#if total > items.length}
			<div class="text-center text-xs text-muted-foreground">{$_('admin.users.showingOf', { default: 'Showing {shown} of {total}', values: { shown: items.length, total } })}</div>
		{/if}
	{/if}
</div>
