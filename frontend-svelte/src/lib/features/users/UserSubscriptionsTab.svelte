<script lang="ts">
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

	function fmtCost(v: number | null | undefined): string {
		if (v == null) return '0.00';
		return v.toFixed(4);
	}

	function statusTone(s: string): string {
		if (s === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
		if (s === 'expired') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}

	function statusLabel(s: string): string {
		if (s === 'active') return $_('admin.users.subStatusActive', { default: 'Active' });
		if (s === 'expired') return $_('admin.users.subStatusExpired', { default: 'Expired' });
		if (s === 'revoked') return $_('admin.users.subStatusRevoked', { default: 'Revoked' });
		return s;
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

	$effect(() => { if (active && !loaded) load(); });
</script>

<div class="flex flex-col gap-2.5">
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
						{#if sub.plan_name}<span class="font-medium text-foreground">{sub.plan_name}</span>{/if}
						{#if sub.group_name}<span class="text-muted-foreground">({sub.group_name})</span>{/if}
					</div>
					<Badge class={statusTone(sub.status)}>{statusLabel(sub.status)}</Badge>
				</div>
				<div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
					<span>{$_('admin.users.subStart', { default: 'Start:' })} {fmt(sub.started_at)}</span>
					{#if sub.expires_at}
						<span>{$_('admin.users.subExpires', { default: 'Expires:' })} {fmt(sub.expires_at)}</span>
					{:else}
						<span>{$_('admin.users.subPermanent', { default: 'Permanent' })}</span>
					{/if}
				</div>
				{#if sub.mtd_cost != null || sub.price_paid != null}
					<div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
						{#if sub.mtd_cost != null}
							<span>{$_('admin.users.subMtdCost', { default: 'MTD Cost:' })} ${fmtCost(sub.mtd_cost)}</span>
						{/if}
						{#if sub.price_paid != null}
							<span>{$_('admin.users.subPricePaid', { default: 'Paid:' })} ${fmtCost(sub.price_paid)}</span>
						{/if}
						{#if sub.remaining_value != null}
							<span>{$_('admin.users.subRemaining', { default: 'Remaining:' })} ${fmtCost(sub.remaining_value)}</span>
						{/if}
					</div>
				{/if}
			</Card>
		{/each}
		{#if total > items.length}
			<div class="text-center text-xs text-muted-foreground">{$_('admin.users.showingOf', { default: 'Showing {shown} of {total}', values: { shown: items.length, total } })}</div>
		{/if}
	{/if}
</div>
