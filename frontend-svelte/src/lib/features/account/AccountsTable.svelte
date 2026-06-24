<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Clock, KeyRound, Pencil, Server, Settings, Shield } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import AccountStatsRow from './AccountStatsRow.svelte';
	import {
		clearAccountError, recoverAccountState, refreshAccount, revertProxyFallback,
		setAccountPrivacy, setAccountSchedulable, updateAccountStatus,
		type Account, type WindowStats
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { accountIsSchedulable, accountPoolMode, formatGroupNames, formatProxyLabel, statusTone } from '$lib/features/supply/supply';

	type Props = {
		rows: Account[];
		loading: boolean;
		selectedIds: Set<number>;
		todayStats?: Record<string, WindowStats>;
		onToggleSelection: (id: number) => void;
		onTogglePage: () => void;
		onEdit: (account: Account) => void;
		onTools: (account: Account) => void;
		onReAuth: (account: Account) => void;
		onTempHold: (account: Account) => void;
		onRefresh: () => void;
	};
	let {
		rows, loading, selectedIds, todayStats = {},
		onToggleSelection, onTogglePage, onEdit, onTools, onReAuth, onTempHold, onRefresh
	}: Props = $props();

	let busy = $state(false);
	const allSel = $derived(rows.length > 0 && rows.every(r => selectedIds.has(r.id)));

	async function act(label: string, fn: () => Promise<unknown>) {
		busy = true;
		try { await fn(); showSuccess(label); onRefresh(); }
		catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	function platformColor(p: string): string {
		const lc = (p || '').toLowerCase();
		if (lc.includes('anthropic')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20';
		if (lc.includes('openai')) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
		if (lc.includes('google') || lc.includes('gemini')) return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20';
		if (lc.includes('bedrock') || lc.includes('amazon')) return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20';
		if (lc.includes('deepseek')) return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/20';
		return 'bg-muted text-muted-foreground border-border';
	}

	function typeLabel(t: string): string {
		if (t === 'api_key') return 'API Key';
		if (t === 'oauth') return 'OAuth';
		if (t === 'setup-token') return 'Setup';
		return t;
	}

	function modelCount(a: Account): number {
		const mm = (a as Record<string, unknown>).model_mapping;
		if (mm && typeof mm === 'object' && !Array.isArray(mm)) return Object.keys(mm as Record<string, string>).length;
		return 0;
	}

	function relTime(v: string | null | undefined): string {
		if (!v) return '';
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return '';
		const diff = Date.now() - d.getTime();
		if (diff < 60000) return 'just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
		return `${Math.floor(diff / 86400000)}d`;
	}

	function hasFallback(a: Account): boolean { return (a as Record<string, unknown>).proxy_fallback_origin_id != null; }
</script>

<div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm" data-testid="accounts-table-container">
	<div class="overflow-x-auto">
		<table class="w-full text-sm" data-testid="accounts-table">
			<thead>
				<tr class="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					<th class="w-10 px-3 py-2.5"><Checkbox checked={allSel} onchange={onTogglePage} data-testid="accounts-select-all" /></th>
					<th class="min-w-[200px] px-4 py-2.5 text-left">{$_('admin.accounts.col.account', { default: 'Account' })}</th>
					<th class="w-[90px] px-3 py-2.5 text-left">{$_('admin.accounts.col.platform', { default: 'Platform' })}</th>
					<th class="w-[90px] px-3 py-2.5 text-left">{$_('admin.accounts.col.status', { default: 'Status' })}</th>
					<th class="w-[120px] px-3 py-2.5 text-left">{$_('admin.accounts.col.capacity', { default: 'Capacity' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-left">{$_('admin.accounts.col.usage', { default: 'Usage' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-left">{$_('admin.accounts.col.groups', { default: 'Groups' })}</th>
					<th class="w-[90px] px-3 py-2.5 text-left">{$_('admin.accounts.col.proxy', { default: 'Proxy' })}</th>
					<th class="w-[80px] px-3 py-2.5 text-left">{$_('admin.accounts.col.models', { default: 'Models' })}</th>
					<th class="w-[100px] px-3 py-2.5 text-right">{$_('admin.accounts.col.actions', { default: 'Actions' })}</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					{#each Array(5) as _, i (i)}
						<tr class="border-b border-border"><td colspan="10" class="px-4 py-4"><div class="h-5 animate-pulse rounded bg-muted"></div></td></tr>
					{/each}
				{:else if rows.length === 0}
					<tr>
						<td colspan="10" class="py-16 text-center">
							<Server class="mx-auto h-10 w-10 text-muted-foreground/20" />
							<p class="mt-3 text-sm text-muted-foreground">{$_('admin.accounts.noResults', { default: 'No accounts match the current filters.' })}</p>
						</td>
					</tr>
				{:else}
					{#each rows as account (account.id)}
						<tr class="border-b border-border transition-colors hover:bg-muted/30" data-testid="account-row">
							<td class="px-3 py-3">
								<Checkbox checked={selectedIds.has(account.id)} onchange={() => onToggleSelection(account.id)} aria-label="Select account" />
							</td>
							<!-- Account name + type -->
							<td class="px-4 py-3">
								<div class="flex items-center gap-3">
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-bold text-primary">
										{(account.name || '#')[0].toUpperCase()}
									</div>
									<div class="min-w-0">
										<p class="truncate font-medium">{account.name || `#${account.id}`}</p>
										<div class="mt-0.5 flex items-center gap-1.5">
											<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{typeLabel(account.type)}</span>
											{#if account.email && account.name}
												<span class="truncate text-[10px] text-muted-foreground">{account.email}</span>
											{/if}
										</div>
									</div>
								</div>
							</td>
							<!-- Platform -->
							<td class="px-3 py-3">
								<span class="inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase {platformColor(account.platform)}">
									{account.platform}
								</span>
							</td>
							<!-- Status -->
							<td class="px-3 py-3">
								<Badge variant="outline" class={statusTone(account.status)}>{account.status}</Badge>
								{#if account.status === 'error' && account.error_message}
									<p class="mt-0.5 max-w-[120px] truncate text-[10px] text-destructive" title={account.error_message}>{account.error_message}</p>
								{/if}
							</td>
							<!-- Capacity -->
							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-1">
									<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono" title="Priority">P{account.priority ?? '-'}</span>
									<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono" title="Concurrency">C{account.concurrency ?? '-'}</span>
									{#if accountIsSchedulable(account)}
										<span class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">✓</span>
									{/if}
									{#if accountPoolMode(account)}
										<span class="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">pool</span>
									{/if}
								</div>
							</td>
							<!-- Usage -->
							<td class="px-3 py-3">
								{#if account.last_used_at}
									<div class="flex items-center gap-1 text-[11px] text-muted-foreground">
										<Clock size={10} />
										<span>{relTime(account.last_used_at)}</span>
									</div>
								{:else}
									<span class="text-xs text-muted-foreground/50">—</span>
								{/if}
							</td>
							<!-- Groups -->
							<td class="px-3 py-3">
								{#if formatGroupNames(account) && formatGroupNames(account) !== '-' && formatGroupNames(account) !== 'None'}
									<span class="inline-block max-w-[90px] truncate rounded bg-muted px-1.5 py-0.5 text-[10px]">{formatGroupNames(account)}</span>
								{:else}
									<span class="text-xs text-muted-foreground/50">—</span>
								{/if}
							</td>
							<!-- Proxy -->
							<td class="px-3 py-3">
								{#if formatProxyLabel(account.proxy, account.proxy_id) && formatProxyLabel(account.proxy, account.proxy_id) !== '-' && formatProxyLabel(account.proxy, account.proxy_id) !== 'None'}
									<span class="text-xs">{formatProxyLabel(account.proxy, account.proxy_id)}</span>
									{#if hasFallback(account)}
										<span class="mt-0.5 block rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-600">fallback</span>
									{/if}
								{:else}
									<span class="text-xs text-muted-foreground/50">—</span>
								{/if}
							</td>
							<!-- Models -->
							<td class="px-3 py-3">
								{#if modelCount(account) > 0}
									<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{modelCount(account)}</span>
								{:else}
									<span class="text-xs text-muted-foreground/50">—</span>
								{/if}
							</td>
							<!-- Actions -->
							<td class="px-3 py-3">
								<div class="flex flex-wrap items-center justify-end gap-0.5">
									<Button size="sm" variant="ghost" class="h-7 gap-1 px-2 text-xs" onclick={() => onEdit(account)}>
										<Pencil size={12} />{$_('common.edit', { default: 'Edit' })}
									</Button>
									<Button size="sm" variant="ghost" class="h-7 gap-1 px-2 text-xs" onclick={() => onTools(account)}>
										<Settings size={12} />{$_('admin.accounts.tools', { default: 'Tools' })}
									</Button>
									{#if account.type === 'oauth' || account.type === 'setup-token'}
										<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => onReAuth(account)}>
											{$_('admin.accounts.reauth', { default: 'ReAuth' })}
										</Button>
										<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.tokenRefreshed', { default: 'Token refreshed' }), () => refreshAccount(account.id))}>
											{$_('admin.accounts.refreshToken', { default: 'Refresh token' })}
										</Button>
									{/if}
									<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.privacySet', { default: 'Privacy set' }), () => setAccountPrivacy(account.id, true))}>
										{$_('admin.accounts.privacy', { default: 'Privacy' })}
									</Button>
									<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.stateRecovered', { default: 'State recovered' }), () => recoverAccountState(account.id))}>
										{$_('admin.accounts.recover', { default: 'Recover' })}
									</Button>
									{#if account.status === 'temp_unschedulable'}
										<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => onTempHold(account)}>
											{$_('admin.accounts.tempHold', { default: 'temp hold' })}
										</Button>
									{/if}
									{#if account.status === 'error'}
										<Button size="sm" variant="ghost" class="h-7 px-2 text-xs text-amber-600" onclick={() => act($_('admin.accounts.errorCleared', { default: 'Error cleared' }), () => clearAccountError(account.id))}>
											{$_('admin.accounts.clearErr', { default: 'Clear error' })}
										</Button>
									{/if}
									<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => act(account.status === 'active' ? $_('admin.accounts.disabled', { default: 'Disabled' }) : $_('admin.accounts.activated', { default: 'Activated' }), () => updateAccountStatus(account.id, account.status === 'active' ? 'inactive' : 'active'))}>
										{account.status === 'active' ? $_('admin.accounts.disable', { default: 'Disable' }) : $_('admin.accounts.enable', { default: 'Enable' })}
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
