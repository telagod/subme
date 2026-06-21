<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getUserAPIKeys, type AdminUser, type UserAPIKey } from '$lib/api/admin/users';
	import Badge from '$lib/ui/Badge.svelte';

	type Props = { user: AdminUser; active: boolean };
	let { user, active }: Props = $props();

	let items = $state<UserAPIKey[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	function fmt(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	function mask(key: string): string {
		if (key.length <= 26) return key;
		return key.substring(0, 20) + '...' + key.substring(key.length - 6);
	}

	async function load() {
		if (loaded) return;
		loading = true; error = null;
		try {
			const res = await getUserAPIKeys(user.id);
			items = res.items ?? []; total = res.total ?? 0; loaded = true;
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
		<div class="py-5 text-center text-sm text-muted-foreground">{$_('admin.users.noKeys', { default: 'No API keys' })}</div>
	{:else}
		{#each items as key}
			<div class="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3">
				<div class="flex items-center justify-between">
					<div class="text-sm font-semibold text-foreground">{key.name}</div>
					<Badge class={key.status === 'active'
						? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
						: 'border-destructive/30 bg-destructive/10 text-destructive'}>
						{key.status === 'active' ? $_('admin.users.keyActive', { default: 'Active' }) : key.status}
					</Badge>
				</div>
				<div class="break-all font-mono text-xs text-muted-foreground">{mask(key.key)}</div>
				<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
					{#if key.group?.name}<span>{$_('admin.users.keyGroup', { default: 'Group:' })} {key.group.name}</span>{/if}
					<span>{$_('admin.users.keyQuota', { default: 'Quota:' })} {key.quota === 0 ? $_('admin.users.unlimited', { default: 'Unlimited' }) : `$${key.quota.toFixed(2)}`}</span>
					<span>{$_('admin.users.keyUsed', { default: 'Used:' })} ${key.quota_used.toFixed(4)}</span>
					<span>{$_('admin.users.keyCreated', { default: 'Created:' })} {fmt(key.created_at)}</span>
					{#if key.last_used_at}<span>{$_('admin.users.keyLastUsed', { default: 'Last used:' })} {fmt(key.last_used_at)}</span>{/if}
				</div>
			</div>
		{/each}
		{#if total > items.length}
			<div class="text-center text-xs text-muted-foreground">{$_('admin.users.showingOf', { default: 'Showing {shown} of {total}', values: { shown: items.length, total } })}</div>
		{/if}
	{/if}
</div>
