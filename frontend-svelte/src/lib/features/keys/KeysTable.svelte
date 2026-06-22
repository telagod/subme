<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Plus, Pencil, Trash2, KeyRound, Power } from '@lucide/svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { ApiKey, ApiKeyStatus } from '$lib/api/user/apiKeys';

	interface Props {
		keys: ApiKey[];
		loading: boolean;
		loadError: string | null;
		toggling: Set<number>;
		onRefresh: () => void;
		onCreate: () => void;
		onEdit: (key: ApiKey) => void;
		onRevoke: (key: ApiKey) => void;
		onToggleStatus: (key: ApiKey) => void;
	}

	let {
		keys,
		loading,
		loadError,
		toggling,
		onRefresh,
		onCreate,
		onEdit,
		onRevoke,
		onToggleStatus
	}: Props = $props();

	const VIRTUAL_THRESHOLD = 50;
	const useVirtual = $derived(keys.length > VIRTUAL_THRESHOLD);

	function maskKey(k: ApiKey): string {
		return `${k.prefix}…${k.suffix}`;
	}
	function fmtQuota(k: ApiKey): string {
		if (!k.quotaTotal) {
			return `$${k.quotaUsed.toFixed(2)} / ${$_('user.keys.unlimited', { default: '不限' })}`;
		}
		return `$${k.quotaUsed.toFixed(2)} / $${k.quotaTotal.toFixed(2)}`;
	}
	function fmtDate(s: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}
	function statusBadgeClass(s: ApiKeyStatus): string {
		switch (s) {
			case 'active':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'inactive':
				return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'quota_exhausted':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'expired':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
		}
	}
	function statusLabel(s: ApiKeyStatus): string {
		return $_(`user.keys.status.${s}`, { default: s });
	}
</script>

{#snippet actionButtons(k: ApiKey)}
	<Button
		variant="outline"
		size="icon"
		aria-label={k.status === 'active'
			? $_('user.keys.disableAria', { default: '禁用密钥' })
			: $_('user.keys.enableAria', { default: '启用密钥' })}
		data-testid="keys-toggle-btn"
		onclick={() => onToggleStatus(k)}
		disabled={toggling.has(k.id)}
		class="h-8 w-8 {k.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}"
	>
		<Power class="h-3.5 w-3.5" />
	</Button>
	<Button
		variant="outline"
		size="icon"
		aria-label={$_('user.keys.editAria', { default: '编辑密钥' })}
		data-testid="keys-edit-btn"
		onclick={() => onEdit(k)}
		class="h-8 w-8"
	>
		<Pencil class="h-3.5 w-3.5" />
	</Button>
	<Button
		variant="outline"
		size="icon"
		aria-label={$_('user.keys.revokeAria', { default: '撤销密钥' })}
		data-testid="keys-revoke-btn"
		data-key-id={k.id}
		onclick={() => onRevoke(k)}
		class="h-8 w-8 text-destructive hover:bg-destructive/10"
	>
		<Trash2 class="h-3.5 w-3.5" />
	</Button>
{/snippet}

{#if loading}
	<div class="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="keys-loading">
		{$_('user.keys.loading', { default: '加载中…' })}
	</div>
{:else if loadError && keys.length === 0}
	<Alert variant="destructive" class="p-8 text-center" data-testid="keys-error">
		<p class="text-sm font-medium text-destructive">
			{$_('user.keys.failedToLoad', { default: '加载 API 密钥失败' })}
		</p>
		<p class="mt-1 text-xs text-muted-foreground">{loadError}</p>
		<Button variant="outline" size="sm" onclick={onRefresh} class="mt-4">
			{$_('user.keys.retry', { default: '重试' })}
		</Button>
	</Alert>
{:else if keys.length === 0}
	<!-- Empty state -->
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
		data-testid="keys-empty-state"
	>
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
			<KeyRound class="h-6 w-6" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.keys.emptyTitle', { default: '暂无 API 密钥' })}
			</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				{$_('user.keys.emptyDescription', {
					default: '创建您的第一个密钥以开始调用 API。'
				})}
			</p>
		</div>
		<Button
			data-testid="keys-empty-create-btn"
			onclick={onCreate}
			class="mt-1 h-9 gap-1.5"
		>
			<Plus class="h-4 w-4" />
			{$_('user.keys.createFirstKey', { default: '创建您的第一个密钥' })}
		</Button>
	</div>
{:else if useVirtual}
	<!-- Virtual table path (> 50 rows) -->
	<div class="rounded-lg border border-border bg-card" data-testid="keys-virtual-wrap">
		<div class="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_1fr_0.7fr_0.9fr_0.8fr] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<div>{$_('user.keys.colName', { default: '名称' })}</div>
			<div>{$_('user.keys.colKey', { default: '密钥' })}</div>
			<div>{$_('user.keys.colGroup', { default: '分组' })}</div>
			<div>{$_('user.keys.colUsage', { default: '用量' })}</div>
			<div>{$_('user.keys.colQuota', { default: '配额' })}</div>
			<div>{$_('user.keys.colStatus', { default: '状态' })}</div>
			<div>{$_('user.keys.colCreated', { default: '创建时间' })}</div>
			<div class="text-right">{$_('user.keys.colActions', { default: '操作' })}</div>
		</div>
		<div class="h-[60vh]">
			<VirtualTable rows={keys} rowHeight={56} getRowKey={(r) => r.id}>
				{#snippet row({ row: k })}
					<div
						data-testid="keys-row"
						data-key-id={k.id}
						class="grid h-full grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_1fr_0.7fr_0.9fr_0.8fr] items-center gap-3 border-b border-border px-4 text-sm"
					>
						<div class="truncate font-medium text-foreground" title={k.name}>{k.name}</div>
						<div><code class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{maskKey(k)}</code></div>
						<div>
							{#if k.group}
								<span class="truncate text-sm text-foreground">{k.group.name}</span>
							{:else}
								<span class="text-sm text-muted-foreground">-</span>
							{/if}
						</div>
						<div class="text-xs text-muted-foreground space-y-0.5">
							<div>{$_('user.keys.today', { default: '今天' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageToday ?? 0).toFixed(4)}</span></div>
							<div>{$_('user.keys.total', { default: '总计' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageTotal ?? 0).toFixed(4)}</span></div>
						</div>
						<div class="text-muted-foreground">{fmtQuota(k)}</div>
						<div><Badge class={statusBadgeClass(k.status)}>{statusLabel(k.status)}</Badge></div>
						<div class="truncate text-muted-foreground">{fmtDate(k.createdAt)}</div>
						<div class="flex justify-end gap-1">
							{@render actionButtons(k)}
						</div>
					</div>
				{/snippet}
			</VirtualTable>
		</div>
	</div>
{:else}
	<!-- Native table path -->
	<div class="overflow-hidden rounded-lg border border-border bg-card" data-testid="keys-table-wrap">
		<table class="w-full text-sm" data-testid="keys-table">
			<thead>
				<tr class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colName', { default: '名称' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colKey', { default: '密钥' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colGroup', { default: '分组' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colUsage', { default: '用量' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colQuota', { default: '配额' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colStatus', { default: '状态' })}</th>
					<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colCreated', { default: '创建时间' })}</th>
					<th class="px-4 py-2 text-right font-medium">{$_('user.keys.colActions', { default: '操作' })}</th>
				</tr>
			</thead>
			<tbody>
				{#each keys as k (k.id)}
					<tr
						data-testid="keys-row"
						data-key-id={k.id}
						class="border-b border-border last:border-b-0 hover:bg-accent/40"
					>
						<td class="px-4 py-3 font-medium text-foreground">
							<span class="block max-w-[180px] truncate" title={k.name}>{k.name}</span>
						</td>
						<td class="px-4 py-3">
							<code class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{maskKey(k)}</code>
						</td>
						<td class="px-4 py-3">
							{#if k.group}
								<span class="text-sm text-foreground">{k.group.name}</span>
							{:else}
								<span class="text-sm text-muted-foreground">-</span>
							{/if}
						</td>
						<td class="px-4 py-3">
							<div class="text-xs text-muted-foreground space-y-0.5">
								<div>{$_('user.keys.today', { default: '今天' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageToday ?? 0).toFixed(4)}</span></div>
								<div>{$_('user.keys.total', { default: '总计' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageTotal ?? 0).toFixed(4)}</span></div>
							</div>
						</td>
						<td class="px-4 py-3 text-muted-foreground">{fmtQuota(k)}</td>
						<td class="px-4 py-3">
							<Badge class={statusBadgeClass(k.status)}>{statusLabel(k.status)}</Badge>
						</td>
						<td class="px-4 py-3 text-muted-foreground">{fmtDate(k.createdAt)}</td>
						<td class="px-4 py-3 text-right">
							<div class="flex justify-end gap-1">
								{@render actionButtons(k)}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
