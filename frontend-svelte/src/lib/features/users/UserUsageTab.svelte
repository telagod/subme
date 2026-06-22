<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { listAdminUsage, getAdminUsageStats } from '$lib/api/admin/usage';
	import type { AdminUser } from '$lib/api/admin/users';
	import Card from '$lib/ui/Card.svelte';

	type Props = { user: AdminUser; active: boolean };
	let { user, active }: Props = $props();

	interface UsageRow { id: number; model?: string; total_cost?: number; input_tokens?: number; output_tokens?: number; created_at?: string; [k: string]: unknown }

	let items = $state<UsageRow[]>([]);
	let total = $state(0);
	let stats = $state({ total_requests: 0, total_cost: 0, total_tokens: 0 });
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	function fmtTok(v: number): string {
		if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
		if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
		if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
		return Math.round(v).toLocaleString();
	}

	async function load() {
		if (loaded) return;
		loading = true; error = null;
		try {
			const [listRes, statsRes] = await Promise.all([
				listAdminUsage({ page: 1, page_size: 20, user_id: user.id }),
				getAdminUsageStats({ user_id: user.id })
			]);
			items = (listRes.items ?? []) as UsageRow[];
			total = listRes.total ?? 0;
			stats = {
				total_requests: (statsRes as Record<string, number>).total_requests ?? 0,
				total_cost: (statsRes as Record<string, number>).total_cost ?? 0,
				total_tokens: (statsRes as Record<string, number>).total_tokens ?? 0
			};
			loaded = true;
		} catch { error = $_('admin.users.loadFailed', { default: '加载失败' }); }
		finally { loading = false; }
	}

	$effect(() => { if (active && !loaded) load(); });
</script>

<div class="flex flex-col gap-3.5">
	{#if !loading && loaded}
		<div class="grid grid-cols-3 gap-2">
			<Card class="flex flex-col gap-1 px-3.5 py-3 shadow-none">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.usageRequests', { default: '总请求量' })}</span>
				<span class="text-sm font-bold text-foreground">{stats.total_requests.toLocaleString()}</span>
			</Card>
			<Card class="flex flex-col gap-1 px-3.5 py-3 shadow-none">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.usageCost', { default: '总费用' })}</span>
				<span class="text-sm font-bold text-emerald-500">${stats.total_cost.toFixed(4)}</span>
			</Card>
			<Card class="flex flex-col gap-1 px-3.5 py-3 shadow-none">
				<span class="text-[10.5px] text-muted-foreground">{$_('admin.users.usageTokens', { default: '总令牌量' })}</span>
				<span class="text-sm font-bold text-foreground">{fmtTok(stats.total_tokens)}</span>
			</Card>
		</div>
	{/if}

	{#if loading}
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('common.loading', { default: '加载中...' })}</div>
	{:else if error}
		<div class="text-sm text-destructive">{error}</div>
	{:else if !items.length}
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('admin.users.usageEmpty', { default: '暂无用量记录' })}</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b border-border text-xs text-muted-foreground">
						<th class="whitespace-nowrap px-2 py-2">{$_('admin.users.usageTime', { default: '时间' })}</th>
						<th class="whitespace-nowrap px-2 py-2">{$_('admin.users.usageModel', { default: '模型' })}</th>
						<th class="whitespace-nowrap px-2 py-2">{$_('admin.users.usageCostCol', { default: '费用' })}</th>
						<th class="whitespace-nowrap px-2 py-2">{$_('admin.users.usageTokensCol', { default: '令牌' })}</th>
					</tr>
				</thead>
				<tbody>
					{#each items as row}
						<tr class="border-b border-border">
							<td class="px-2 py-2 text-xs text-muted-foreground">{fmt(row.created_at)}</td>
							<td class="px-2 py-2 font-mono text-xs">{row.model ?? '—'}</td>
							<td class="px-2 py-2 text-xs text-emerald-500">${row.total_cost?.toFixed(6) ?? '—'}</td>
							<td class="px-2 py-2 text-xs">{((row.input_tokens ?? 0) + (row.output_tokens ?? 0)).toLocaleString()}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if total > items.length}
			<div class="text-center text-xs text-muted-foreground">{$_('admin.users.showingOf', { default: '显示 {shown} / {total}', values: { shown: items.length, total } })}</div>
		{/if}
	{/if}
</div>
