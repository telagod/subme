<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import type { AdminUsageLog } from '$lib/api/admin/usage';
	import {
		accountBilled,
		formatDateTime,
		formatDuration,
		formatInteger,
		formatMoney,
		formatTokens,
		requestTypeLabel,
		statusLabel,
		statusTone,
		totalTokens,
		usageAccountLabel,
		usageApiKeyLabel,
		usageEndpointLabel,
		usageGroupLabel,
		usageModelLabel,
		usageUserLabel
	} from '$lib/features/admin-usage/admin-usage';

	interface Props {
		rows: AdminUsageLog[];
		loading: boolean;
		total: number;
		page: number;
		totalPages: number;
		visibleColumnKeys: Set<string>;
		onPageChange: (page: number) => void;
	}

	let {
		rows,
		loading,
		total,
		page,
		totalPages,
		visibleColumnKeys,
		onPageChange
	}: Props = $props();
</script>

<Card padded={false} class="overflow-hidden">
	<VirtualTable {rows} rowHeight={74} getRowKey={(row) => row.id} {loading}>
		{#snippet header()}
			<div class="flex min-w-[1320px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
				{#if visibleColumnKeys.has('created_at')}<div class="w-[170px] shrink-0">Time</div>{/if}
				{#if visibleColumnKeys.has('user')}<div class="min-w-[220px] flex-[1.2]">User / key</div>{/if}
				{#if visibleColumnKeys.has('model')}<div class="min-w-[220px] flex-[1.2]">Model / endpoint</div>{/if}
				{#if visibleColumnKeys.has('account')}<div class="w-[150px] shrink-0">Account</div>{/if}
				{#if visibleColumnKeys.has('group')}<div class="w-[150px] shrink-0">Group</div>{/if}
				{#if visibleColumnKeys.has('tokens')}<div class="w-[110px] shrink-0">Tokens</div>{/if}
				{#if visibleColumnKeys.has('cost')}<div class="w-[120px] shrink-0">User billed</div>{/if}
				{#if visibleColumnKeys.has('duration')}<div class="w-[120px] shrink-0">Duration</div>{/if}
				{#if visibleColumnKeys.has('status')}<div class="w-[100px] shrink-0">Status</div>{/if}
				{#if visibleColumnKeys.has('ip_address')}<div class="w-[130px] shrink-0">IP</div>{/if}
				{#if visibleColumnKeys.has('user_agent')}<div class="w-[180px] shrink-0">User Agent</div>{/if}
			</div>
		{/snippet}
		{#snippet row({ row })}
			<div class="flex min-w-[1320px] items-center border-b px-3 py-3 text-sm" data-testid="admin-usage-row" data-usage-id={row.id}>
				{#if visibleColumnKeys.has('created_at')}<div class="w-[170px] shrink-0 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>{/if}
				{#if visibleColumnKeys.has('user')}
					<div class="min-w-[220px] flex-[1.2] min-w-0">
						<div class="truncate font-medium">{usageUserLabel(row)}</div>
						<div class="truncate text-xs text-muted-foreground">{usageApiKeyLabel(row)} · {row.request_id || `#${row.id}`}</div>
					</div>
				{/if}
				{#if visibleColumnKeys.has('model')}
					<div class="min-w-[220px] flex-[1.2] min-w-0">
						<div class="truncate font-medium" title={usageModelLabel(row)}>{usageModelLabel(row)}</div>
						<div class="truncate text-xs text-muted-foreground" title={usageEndpointLabel(row)}>{usageEndpointLabel(row)}</div>
					</div>
				{/if}
				{#if visibleColumnKeys.has('account')}<div class="w-[150px] shrink-0 truncate text-xs text-muted-foreground" title={usageAccountLabel(row)}>{usageAccountLabel(row)}</div>{/if}
				{#if visibleColumnKeys.has('group')}<div class="w-[150px] shrink-0 truncate text-xs text-muted-foreground" title={usageGroupLabel(row)}>{usageGroupLabel(row)}</div>{/if}
				{#if visibleColumnKeys.has('tokens')}<div class="w-[110px] shrink-0 font-mono text-xs">{formatTokens(totalTokens(row))}</div>{/if}
				{#if visibleColumnKeys.has('cost')}
					<div class="w-[120px] shrink-0">
						<div class="font-mono text-xs">{formatMoney(row.actual_cost ?? row.total_cost, 6)}</div>
						<div class="font-mono text-[11px] text-muted-foreground">{formatMoney(accountBilled(row), 6)}</div>
					</div>
				{/if}
				{#if visibleColumnKeys.has('duration')}
					<div class="w-[120px] shrink-0">
						<div class="font-mono text-xs">{formatDuration(row.duration_ms)}</div>
						<div class="text-[11px] text-muted-foreground">{requestTypeLabel(row)}</div>
					</div>
				{/if}
				{#if visibleColumnKeys.has('status')}<div class="w-[100px] shrink-0"><Badge variant="outline" class={statusTone(row)}>{statusLabel(row)}</Badge></div>{/if}
				{#if visibleColumnKeys.has('ip_address')}<div class="w-[130px] shrink-0 truncate text-xs text-muted-foreground">{row.ip_address ?? '—'}</div>{/if}
				{#if visibleColumnKeys.has('user_agent')}<div class="w-[180px] shrink-0 truncate text-xs text-muted-foreground" title={row.user_agent ?? ''}>{row.user_agent ?? '—'}</div>{/if}
			</div>
		{/snippet}
		{#snippet empty()}
			<div class="p-6 text-center text-sm text-muted-foreground">
				{$_('admin.usage.empty', { default: 'No usage records found' })}
			</div>
		{/snippet}
		{#snippet loadingSlot()}
			<div class="space-y-2 p-3">
				{#each Array(7) as _}
					<div class="h-12 animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{/snippet}
	</VirtualTable>
	<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
		<span>{formatInteger(total)} {$_('admin.usage.records', { default: 'records' })} · page {page} / {totalPages}</span>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => onPageChange(page - 1)} aria-label="Previous page">
				<ChevronLeft size={16} />
			</Button>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => onPageChange(page + 1)} aria-label="Next page">
				<ChevronRight size={16} />
			</Button>
		</div>
	</div>
</Card>
