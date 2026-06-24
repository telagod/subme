<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Clock, MoreHorizontal, Pencil, Server, Settings, Shield, KeyRound, RefreshCw, Power, AlertTriangle, Trash2 } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import {
		clearAccountError, recoverAccountState, refreshAccount,
		setAccountPrivacy, updateAccountStatus,
		type Account, type WindowStats
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { accountIsSchedulable, accountPoolMode, formatGroupNames, formatProxyLabel } from '$lib/features/supply/supply';

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
	let { rows, loading, selectedIds, todayStats = {}, onToggleSelection, onTogglePage, onEdit, onTools, onReAuth, onTempHold, onRefresh }: Props = $props();

	const allSel = $derived(rows.length > 0 && rows.every(r => selectedIds.has(r.id)));
	let openMenuId = $state<number | null>(null);

	async function act(label: string, fn: () => Promise<unknown>) {
		try { await fn(); showSuccess(label); onRefresh(); }
		catch (err) { showError(err instanceof Error ? err.message : String(err)); }
	}

	function platformColor(p: string): string {
		const lc = (p || '').toLowerCase();
		if (lc.includes('anthropic')) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
		if (lc.includes('openai')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
		if (lc.includes('google') || lc.includes('gemini')) return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400';
		if (lc.includes('bedrock') || lc.includes('amazon')) return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400';
		if (lc.includes('deepseek')) return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400';
		return 'border-border bg-muted text-muted-foreground';
	}

	function statusColor(s: string): string {
		if (s === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
		if (s === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive';
		if (s === 'rate_limited') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
		if (s === 'temp_unschedulable') return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400';
		return 'border-border bg-muted text-muted-foreground';
	}

	function statusLabel(s: string): string {
		if (s === 'active') return $_('admin.accounts.statusActive', { default: 'Active' });
		if (s === 'error') return $_('admin.accounts.statusError', { default: 'Error' });
		if (s === 'inactive') return $_('admin.accounts.statusInactive', { default: 'Inactive' });
		if (s === 'rate_limited') return $_('admin.accounts.statusRateLimited', { default: 'Rate limited' });
		if (s === 'temp_unschedulable') return $_('admin.accounts.statusTempUnsched', { default: 'Temp hold' });
		return s;
	}

	function relTime(v: string | null | undefined): string {
		if (!v) return '';
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return '';
		const diff = Date.now() - d.getTime();
		if (diff < 60000) return $_('admin.accounts.justNow', { default: 'just now' });
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
		return `${Math.floor(diff / 86400000)}d`;
	}

	function groups(a: Account): string {
		const g = formatGroupNames(a);
		return (g && g !== '-' && g !== 'None') ? g : '';
	}

	function proxy(a: Account): string {
		const p = formatProxyLabel(a.proxy, a.proxy_id);
		return (p && p !== '-' && p !== 'None') ? p : '';
	}

	function modelCount(a: Account): number {
		const mm = (a as Record<string, unknown>).model_mapping;
		if (mm && typeof mm === 'object' && !Array.isArray(mm)) return Object.keys(mm as Record<string, string>).length;
		return 0;
	}
</script>

<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid="accounts-table-container">
	<div class="overflow-x-auto">
		<table class="w-full text-sm" data-testid="accounts-table">
			<thead>
				<tr class="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
					<th class="w-10 px-4 py-3"><Checkbox checked={allSel} onchange={onTogglePage} data-testid="accounts-select-all" /></th>
					<th class="min-w-[280px] px-4 py-3 text-left">{$_('admin.accounts.col.account', { default: 'Account' })}</th>
					<th class="w-[100px] px-4 py-3 text-left">{$_('admin.accounts.col.status', { default: 'Status' })}</th>
					<th class="w-[140px] px-4 py-3 text-left">{$_('admin.accounts.col.config', { default: 'Config' })}</th>
					<th class="w-[120px] px-4 py-3 text-left">{$_('admin.accounts.col.routing', { default: 'Routing' })}</th>
					<th class="w-[80px] px-4 py-3 text-right">{$_('admin.accounts.col.actions', { default: 'Actions' })}</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					{#each Array(5) as _, i (i)}
						<tr class="border-b border-border"><td colspan="6" class="px-4 py-5"><div class="h-6 animate-pulse rounded bg-muted"></div></td></tr>
					{/each}
				{:else if rows.length === 0}
					<tr>
						<td colspan="6" class="py-20 text-center">
							<Server class="mx-auto h-12 w-12 text-muted-foreground/15" />
							<p class="mt-4 font-medium text-muted-foreground">{$_('admin.accounts.noResults', { default: 'No accounts match the current filters.' })}</p>
						</td>
					</tr>
				{:else}
					{#each rows as account (account.id)}
						<tr class="group border-b border-border transition-colors hover:bg-muted/20" data-testid="account-row">
							<td class="px-4 py-3.5">
								<Checkbox checked={selectedIds.has(account.id)} onchange={() => onToggleSelection(account.id)} aria-label="Select account" />
							</td>

							<!-- Account: name + platform + type + email -->
							<td class="px-4 py-3.5">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-bold text-primary ring-1 ring-primary/10">
										{(account.name || '#')[0].toUpperCase()}
									</div>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="truncate font-medium text-foreground">{account.name || `#${account.id}`}</span>
											<span class="inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase {platformColor(account.platform)}">{account.platform}</span>
										</div>
										<div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
											<span class="rounded bg-muted px-1.5 py-0.5 text-[10px]">{account.type === 'api_key' ? 'API Key' : account.type === 'oauth' ? 'OAuth' : account.type}</span>
											{#if account.email}
												<span class="truncate">{account.email}</span>
											{/if}
											{#if account.last_used_at}
												<span class="flex items-center gap-0.5"><Clock size={10} />{relTime(account.last_used_at)}</span>
											{/if}
										</div>
									</div>
								</div>
							</td>

							<!-- Status -->
							<td class="px-4 py-3.5">
								<span class="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold {statusColor(account.status)}">{statusLabel(account.status)}</span>
								{#if account.status === 'error' && account.error_message}
									<p class="mt-1 max-w-[120px] truncate text-[10px] text-destructive/80" title={account.error_message}>{account.error_message}</p>
								{/if}
							</td>

							<!-- Config: priority, concurrency, schedulable, pool -->
							<td class="px-4 py-3.5">
								<div class="space-y-1">
									<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span title={$_('admin.accounts.priority', { default: 'Priority' })}>{$_('admin.accounts.priShort', { default: 'Pri' })} <span class="font-mono font-medium text-foreground">{account.priority ?? 50}</span></span>
										<span class="text-border">·</span>
										<span title={$_('admin.accounts.concurrencyLabel', { default: 'Concurrency' })}>{$_('admin.accounts.conShort', { default: 'Con' })} <span class="font-mono font-medium text-foreground">{account.concurrency ?? 3}</span></span>
									</div>
									<div class="flex gap-1">
										{#if accountIsSchedulable(account)}
											<span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{$_('admin.accounts.schedulable', { default: 'Schedulable' })}</span>
										{/if}
										{#if accountPoolMode(account)}
											<span class="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">{$_('admin.accounts.poolMode', { default: 'Pool' })}</span>
										{/if}
									</div>
								</div>
							</td>

							<!-- Routing: groups + proxy + models -->
							<td class="px-4 py-3.5">
								<div class="space-y-1 text-xs">
									{#if groups(account)}
										<div class="flex items-center gap-1 text-muted-foreground">
											<Shield size={11} />
											<span class="truncate max-w-[100px]" title={groups(account)}>{groups(account)}</span>
										</div>
									{/if}
									{#if proxy(account)}
										<div class="flex items-center gap-1 text-muted-foreground">
											<Server size={11} />
											<span class="truncate max-w-[100px]">{proxy(account)}</span>
										</div>
									{/if}
									{#if modelCount(account) > 0}
										<div class="flex items-center gap-1 text-muted-foreground">
											<KeyRound size={11} />
											<span>{modelCount(account)} {$_('admin.accounts.models', { default: 'models' })}</span>
										</div>
									{/if}
									{#if !groups(account) && !proxy(account) && modelCount(account) === 0}
										<span class="text-muted-foreground/40">—</span>
									{/if}
								</div>
							</td>

							<!-- Actions -->
							<td class="px-4 py-3.5">
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
									<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.stateRecovered', { default: 'Recovered' }), () => recoverAccountState(account.id))}>
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
