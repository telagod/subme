<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { getUserUsage, type AdminUser, type UserUsageStats } from '$lib/api/admin/users';
	import Card from '$lib/ui/Card.svelte';

	type Props = { user: AdminUser };
	let { user }: Props = $props();

	let stats = $state<UserUsageStats | null>(null);
	let loading = $state(true);

	function fmtTok(v: number): string {
		if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
		if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
		if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
		return Math.round(v).toLocaleString();
	}

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	async function load() {
		loading = true;
		try { stats = await getUserUsage(user.id, 'month'); }
		catch { stats = null; }
		finally { loading = false; }
	}

	onMount(load);
	$effect(() => { void user.id; load(); });
</script>

<div class="flex flex-col gap-5 p-1">
	<div class="grid grid-cols-3 gap-2.5">
		<Card class="flex flex-col gap-1 px-4 py-3.5">
			<span class="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.kpiRequests', { default: 'Month Requests' })}
			</span>
			<span class="font-mono text-lg font-bold tabular-nums text-foreground">
				{loading ? '…' : (stats?.total_requests ?? 0).toLocaleString()}
			</span>
		</Card>
		<Card class="flex flex-col gap-1 px-4 py-3.5">
			<span class="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.kpiTokens', { default: 'Month Tokens' })}
			</span>
			<span class="font-mono text-lg font-bold tabular-nums text-foreground">
				{loading ? '…' : fmtTok(stats?.total_tokens ?? 0)}
			</span>
		</Card>
		<Card class="flex flex-col gap-1 px-4 py-3.5">
			<span class="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.kpiConcurrency', { default: 'Concurrency' })}
			</span>
			<span class="font-mono text-lg font-bold tabular-nums text-foreground">
				{user.current_concurrency ?? 0}<span class="ml-0.5 text-xs font-normal text-muted-foreground">/{user.concurrency ?? '∞'}</span>
			</span>
		</Card>
	</div>

	<div class="flex flex-col">
		{#each [
			{ label: $_('admin.users.infoId', { default: 'User ID' }), value: `#${user.id}`, mono: true },
			{ label: $_('admin.users.infoEmail', { default: 'Email' }), value: user.email },
			{ label: $_('admin.users.infoUsername', { default: 'Username' }), value: user.username, show: !!user.username },
			{ label: $_('admin.users.infoConcurrency', { default: 'Concurrency' }), value: String(user.concurrency ?? '—'), mono: true },
			{ label: $_('admin.users.infoRpm', { default: 'RPM Limit' }), value: user.rpm_limit === 0 ? $_('admin.users.unlimited', { default: 'Unlimited' }) : String(user.rpm_limit ?? '—'), mono: true },
			{ label: $_('admin.users.infoRegistered', { default: 'Registered' }), value: fmt(user.created_at) },
			{ label: $_('admin.users.infoLastActive', { default: 'Last Active' }), value: fmt(user.last_used_at), show: !!user.last_used_at },
			{ label: $_('admin.users.infoNotes', { default: 'Notes' }), value: user.notes ?? '', show: !!user.notes }
		] as row}
			{#if row.show !== false}
				<div class="flex items-baseline gap-3 border-b border-border py-2.5 text-sm">
					<span class="w-24 shrink-0 text-xs text-muted-foreground">{row.label}</span>
					<span class="flex-1 break-all text-foreground" class:font-mono={row.mono} class:text-xs={row.mono}>{row.value}</span>
				</div>
			{/if}
		{/each}
	</div>
</div>
