<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { listAdminOrders, type AdminOrder } from '$lib/api/admin/orders';
	import type { AdminUser } from '$lib/api/admin/users';
	import Badge from '$lib/ui/Badge.svelte';

	type Props = { user: AdminUser; active: boolean };
	let { user, active }: Props = $props();

	let items = $state<AdminOrder[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	function statusTone(s: string): string {
		const lower = s.toLowerCase();
		if (lower === 'paid' || lower === 'completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600';
		if (lower === 'pending' || lower === 'recharging') return 'border-amber-500/30 bg-amber-500/10 text-amber-600';
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}

	function fmtAmount(cents: number | null | undefined): string {
		if (cents == null) return '$0.00';
		return `$${(cents / 100).toFixed(2)}`;
	}

	async function load() {
		if (loaded) return;
		loading = true; error = null;
		try {
			const res = await listAdminOrders({ page: 1, page_size: 20, user_id: user.id });
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
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('admin.users.noOrders', { default: 'No orders' })}</div>
	{:else}
		{#each items as order}
			<div class="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="font-mono text-xs text-foreground">{order.out_trade_no || `#${order.id}`}</span>
						{#if order.order_type}
							<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{order.order_type}</span>
						{/if}
					</div>
					<Badge class={statusTone(order.status)}>{order.status}</Badge>
				</div>
				<div class="flex flex-wrap items-center gap-3 text-xs">
					<span class="font-medium text-emerald-500">{fmtAmount(order.pay_amount)}</span>
					{#if order.payment_type}<span class="text-muted-foreground">{order.payment_type}</span>{/if}
					{#if order.plan_name}<span class="text-muted-foreground">{order.plan_name}</span>{/if}
					<span class="text-muted-foreground">{fmt(order.created_at)}</span>
				</div>
			</div>
		{/each}
		{#if total > items.length}
			<div class="text-center text-xs text-muted-foreground">{$_('admin.users.showingOf', { default: 'Showing {shown} of {total}', values: { shown: items.length, total } })}</div>
		{/if}
	{/if}
</div>
