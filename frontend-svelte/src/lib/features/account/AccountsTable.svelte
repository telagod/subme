<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Clock, Pencil, RefreshCw, Shield, Wrench } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import AccountStatsRow from './AccountStatsRow.svelte';
	import {
		clearAccountError, recoverAccountState, refreshAccount, revertProxyFallback,
		setAccountPrivacy, setAccountSchedulable, updateAccountStatus,
		type Account, type WindowStats
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		accountIsSchedulable, accountPoolMode,
		formatGroupNames, formatProxyLabel, statusTone
	} from '$lib/features/supply/supply';

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

	function poolModeLabel(a: Account): string {
		if (!accountPoolMode(a)) return '';
		const retry = a.credentials?.pool_mode_retry_count;
		return retry ? `pool(${retry})` : 'pool';
	}

	function formatRelativeTime(v: string | null | undefined): string {
		if (!v) return '-';
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return v;
		const diff = Date.now() - d.getTime();
		if (diff < 60000) return 'just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		return `${Math.floor(diff / 86400000)}d ago`;
	}

	function modelCount(a: Account): string {
		const mm = (a as Record<string, unknown>).model_mapping;
		if (mm && typeof mm === 'object' && !Array.isArray(mm)) {
			return String(Object.keys(mm as Record<string, string>).length);
		}
		return '-';
	}

	function quotaSummary(a: Account): string {
		const rec = a as Record<string, unknown>;
		const parts: string[] = [];
		if (typeof rec.quota_daily_limit === 'number' && rec.quota_daily_limit > 0)
			parts.push(`$${rec.quota_daily_limit}/d`);
		if (typeof rec.quota_weekly_limit === 'number' && rec.quota_weekly_limit > 0)
			parts.push(`$${rec.quota_weekly_limit}/w`);
		if (typeof rec.quota_total_limit === 'number' && rec.quota_total_limit > 0)
			parts.push(`$${rec.quota_total_limit}`);
		return parts.length ? parts.join(' ') : '-';
	}

	function hasFallback(a: Account): boolean {
		return (a as Record<string, unknown>).proxy_fallback_origin_id != null;
	}

	function priorityLabel(a: Account): string {
		return a.priority != null ? String(a.priority) : '-';
	}

	function rateLabel(a: Account): string {
		return a.rate_multiplier != null ? `${a.rate_multiplier.toFixed(2)}x` : '-';
	}

	function concurrencyLabel(a: Account): string {
		return a.concurrency != null ? String(a.concurrency) : '-';
	}
</script>

<VirtualTable {rows} rowHeight={72} {loading} getRowKey={(r) => r.id} class="max-h-[680px]">
	{#snippet header()}
		<tr class="text-xs text-muted-foreground">
			<th class="w-8 px-2"><Checkbox checked={allSel} onchange={onTogglePage} data-testid="accounts-select-all" /></th>
			<th class="px-3">{$_('admin.accounts.col.account', { default: '账户' })}</th>
			<th class="px-3">{$_('admin.accounts.col.platform', { default: '平台' })}</th>
			<th class="px-3">{$_('admin.accounts.col.status', { default: '状态' })}</th>
			<th class="px-3">{$_('admin.accounts.col.capacity', { default: '容量' })}</th>
			<th class="px-3">{$_('admin.accounts.col.usage', { default: '用量' })}</th>
			<th class="px-3">{$_('admin.accounts.col.groups', { default: '分组' })}</th>
			<th class="px-3">{$_('admin.accounts.col.proxy', { default: '代理' })}</th>
			<th class="px-3">{$_('admin.accounts.col.models', { default: '模型' })}</th>
			<th class="px-3 text-right">{$_('admin.accounts.col.actions', { default: '操作' })}</th>
		</tr>
	{/snippet}

	{#snippet row({ row: account }: { row: Account; index: number })}
		<tr class="border-b border-border text-sm hover:bg-muted/30" data-testid="account-row">
			<td class="w-8 px-2">
				<Checkbox checked={selectedIds.has(account.id)} onchange={() => onToggleSelection(account.id)} aria-label="Select account" />
			</td>
			<!-- Account name + email -->
			<td class="max-w-[220px] px-3">
				<div class="flex flex-col gap-0.5">
					<span class="truncate text-sm font-medium">{account.name || account.email || `#${account.id}`}</span>
					{#if account.email && account.name}
						<span class="truncate text-[10px] text-muted-foreground">{account.email}</span>
					{/if}
				</div>
			</td>
			<!-- Platform + type badge -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5">
					<Badge variant="outline">{account.platform}</Badge>
					<span class="text-[10px] text-muted-foreground">{account.type}</span>
				</div>
			</td>
			<!-- Status -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5">
					<Badge variant="outline" class={statusTone(account.status)}>{account.status}</Badge>
					{#if account.status === 'error' && account.error_message}
						<span class="max-w-[140px] truncate text-[10px] text-destructive" title={account.error_message}>{account.error_message}</span>
					{/if}
					{#if account.status === 'temp_unschedulable'}
						<Button variant="ghost" size="sm" class="h-5 px-1 text-[10px]" onclick={() => onTempHold(account)}>
							{$_('admin.accounts.tempHold', { default: 'temp hold' })}
						</Button>
					{/if}
				</div>
			</td>
			<!-- Capacity: priority, weight, concurrency, rate, schedulable, pool -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5 text-[11px]">
					<div class="flex flex-wrap gap-1.5 text-muted-foreground">
						<span title="Priority">P{priorityLabel(account)}</span>
						<span title="Weight">W{account.weight ?? '-'}</span>
						<span title="Concurrency">C{concurrencyLabel(account)}</span>
						<span title="Rate">{rateLabel(account)}</span>
					</div>
					<div class="flex flex-wrap gap-1">
						{#if accountIsSchedulable(account)}
							<Badge variant="outline" class="h-4 px-1 text-[9px] bg-emerald-500/10 text-emerald-700">{$_('admin.accounts.schedulable', { default: 'sched' })}</Badge>
						{:else}
							<Badge variant="outline" class="h-4 px-1 text-[9px] bg-zinc-500/10 text-zinc-500">{$_('admin.accounts.unschedulable', { default: 'unsched' })}</Badge>
						{/if}
						{#if accountPoolMode(account)}
							<Badge variant="outline" class="h-4 px-1 text-[9px] bg-sky-500/10 text-sky-700">{poolModeLabel(account)}</Badge>
						{/if}
						{#if account.privacy_mode}
							<Badge variant="outline" class="h-4 px-1 text-[9px] bg-purple-500/10 text-purple-700">
								<Shield size={8} class="mr-0.5" />{$_('admin.accounts.privacy', { default: 'priv' })}
							</Badge>
						{/if}
					</div>
				</div>
			</td>
			<!-- Usage (today stats) -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5">
					<AccountStatsRow label="1h" stats={todayStats[String(account.id)] ?? null} color="indigo" />
					{#if account.last_used_at}
						<span class="text-[10px] text-muted-foreground">
							<Clock size={9} class="mr-0.5 inline" />{formatRelativeTime(account.last_used_at)}
						</span>
					{/if}
				</div>
			</td>
			<!-- Groups -->
			<td class="max-w-[140px] truncate px-3 text-xs text-muted-foreground">{formatGroupNames(account)}</td>
			<!-- Proxy -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5">
					<span class="text-xs">{formatProxyLabel(account.proxy, account.proxy_id)}</span>
					{#if hasFallback(account)}
						<div class="flex items-center gap-1">
							<Badge variant="outline" class="h-4 px-1 text-[9px] bg-amber-500/10 text-amber-500">
								{$_('admin.accounts.fallbackActive', { default: 'fallback' })}
							</Badge>
							<Button variant="ghost" size="sm" class="h-4 px-1 text-[9px] text-muted-foreground" onclick={() => act('Proxy reverted', () => revertProxyFallback(account.id))}>
								{$_('admin.accounts.revert', { default: 'revert' })}
							</Button>
						</div>
					{/if}
				</div>
			</td>
			<!-- Models + Quota -->
			<td class="px-3">
				<div class="flex flex-col gap-0.5 text-[11px]">
					<span class="text-muted-foreground" title="Model whitelist count">{modelCount(account)} {$_('admin.accounts.models', { default: '个模型' })}</span>
					<span class="font-mono text-muted-foreground" title="Quota">{quotaSummary(account)}</span>
				</div>
			</td>
			<!-- Actions -->
			<td class="px-3 text-right">
				<div class="flex flex-wrap justify-end gap-0.5">
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => onEdit(account)} title={$_('common.edit', { default: 'Edit' })}>
						<Pencil size={12} />
					</Button>
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => onTools(account)} title={$_('admin.accounts.tools', { default: 'Tools' })}>
						<Wrench size={12} />
					</Button>
					{#if account.type === 'oauth' || account.type === 'setup-token'}
						<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => onReAuth(account)}>
							{$_('admin.accounts.reauth', { default: 'ReAuth' })}
						</Button>
						<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.tokenRefreshed', { default: 'Token refreshed' }), () => refreshAccount(account.id))}>
							{$_('admin.accounts.refreshToken', { default: 'Refresh token' })}
						</Button>
					{/if}
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.privacySet', { default: 'Privacy set' }), () => setAccountPrivacy(account.id, true))}>
						{$_('admin.accounts.privacy', { default: 'Privacy' })}
					</Button>
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => act($_('admin.accounts.stateRecovered', { default: 'State recovered' }), () => recoverAccountState(account.id))}>
						{$_('admin.accounts.recover', { default: 'Recover' })}
					</Button>
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => act(
						accountIsSchedulable(account) ? $_('admin.accounts.unscheduled', { default: 'Unscheduled' }) : $_('admin.accounts.scheduled', { default: 'Scheduled' }),
						() => setAccountSchedulable(account.id, !accountIsSchedulable(account))
					)}>
						{accountIsSchedulable(account) ? $_('admin.accounts.unsched', { default: 'Unsched' }) : $_('admin.accounts.sched', { default: 'Sched' })}
					</Button>
					{#if account.status === 'error'}
						<Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-amber-600" onclick={() => act($_('admin.accounts.errorCleared', { default: 'Error cleared' }), () => clearAccountError(account.id))}>
							{$_('admin.accounts.clearErr', { default: 'Clear error' })}
						</Button>
					{/if}
					<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => act(account.status === 'active' ? $_('admin.accounts.disabled', { default: 'Disabled' }) : $_('admin.accounts.activated', { default: 'Activated' }), () => updateAccountStatus(account.id, account.status === 'active' ? 'inactive' : 'active'))}>
						{account.status === 'active' ? $_('admin.accounts.disable', { default: 'Disable' }) : $_('admin.accounts.enable', { default: 'Enable' })}
					</Button>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet empty()}
		<p class="py-8 text-center text-muted-foreground">{$_('admin.accounts.noResults', { default: '无账户匹配当前筛选条件。' })}</p>
	{/snippet}
</VirtualTable>
