<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Network, Wifi } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { updateProxyStatus, type Proxy } from '$lib/api/admin/proxies';
	import { formatProxyLabel, proxyAccountCount, statusTone } from '$lib/features/supply/supply';

	interface Props {
		rows: Proxy[];
		loading: boolean;
		saving: boolean;
		selectedIds: Set<number>;
		allPageSelected: boolean;
		onToggleOne: (id: number) => void;
		onTogglePageSelection: () => void;
		onTest: (proxy: Proxy) => void;
		onQualityCheck: (proxy: Proxy) => void;
		onEdit: (proxy: Proxy) => void;
		onDelete: (proxy: Proxy) => void;
		onOpenAccounts: (proxy: Proxy) => void;
		onReload: () => void;
	}

	let {
		rows,
		loading,
		saving,
		selectedIds,
		allPageSelected,
		onToggleOne,
		onTogglePageSelection,
		onTest,
		onQualityCheck,
		onEdit,
		onDelete,
		onOpenAccounts,
		onReload
	}: Props = $props();
</script>

<Card padded={false} class="overflow-hidden" data-testid="proxies-page">
	<VirtualTable {rows} rowHeight={64} {loading} getRowKey={(row) => row.id} class="max-h-[680px]">
		{#snippet header()}
			<div class="grid grid-cols-[44px_1.4fr_1.3fr_1fr_1fr_1fr_230px] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
				<label class="flex items-center">
					<Checkbox checked={allPageSelected} onchange={onTogglePageSelection} aria-label="Select page" />
				</label>
				<span>{$_('admin.proxies.proxy', { default: 'Proxy' })}</span><span>{$_('admin.proxies.endpoint', { default: 'Endpoint' })}</span><span>{$_('common.status', { default: 'Status' })}</span><span>{$_('admin.proxies.accounts', { default: 'Accounts' })}</span><span>{$_('admin.proxies.expiry', { default: 'Expiry' })}</span><span>{$_('common.actions', { default: 'Actions' })}</span>
			</div>
		{/snippet}
		{#snippet row({ row })}
			<div class="grid grid-cols-[44px_1.4fr_1.3fr_1fr_1fr_1fr_230px] items-center gap-3 border-b px-4 py-3 text-sm" data-testid="proxy-row">
				<Checkbox checked={selectedIds.has(row.id)} onchange={() => onToggleOne(row.id)} aria-label="Select proxy" />
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<Network size={15} class="text-muted-foreground" />
						<p class="truncate font-medium">{row.name}</p>
					</div>
					<p class="truncate text-xs text-muted-foreground">ID {row.id}</p>
				</div>
				<p class="truncate text-xs" title={formatProxyLabel(row)}>{row.protocol}://{row.host}:{row.port}</p>
				<Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge>
				<Button variant="ghost" size="sm" class="h-auto w-fit p-0 text-left text-xs underline hover:bg-transparent" onclick={() => onOpenAccounts(row)}>{proxyAccountCount(row)} accounts</Button>
				<p class="text-xs text-muted-foreground">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'None'}</p>
				<div class="flex flex-wrap gap-1.5">
					<Button variant="outline" size="sm" disabled={saving} onclick={() => onTest(row)}><Wifi class="mr-1 inline" size={13} />{$_('common.test', { default: 'Test' })}</Button>
					<Button variant="outline" size="sm" disabled={saving} onclick={() => onQualityCheck(row)}>{$_('admin.proxies.quality', { default: 'Quality' })}</Button>
					<Button variant="outline" size="sm" onclick={() => onEdit(row)}>{$_('common.edit', { default: 'Edit' })}</Button>
					<Button variant="outline" size="sm" disabled={saving} onclick={() => updateProxyStatus(row.id, row.status === 'active' ? 'inactive' : 'active').then(onReload)}>
						{row.status === 'active' ? 'Disable' : 'Enable'}
					</Button>
					<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => onDelete(row)}>{$_('common.delete', { default: 'Delete' })}</Button>
				</div>
			</div>
		{/snippet}
		{#snippet empty()}
			<div class="p-10 text-center text-sm text-muted-foreground">No proxies match the current filters.</div>
		{/snippet}
	</VirtualTable>
</Card>
