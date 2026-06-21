<script lang="ts">
	import { ChevronLeft, ChevronRight, Layers, SlidersHorizontal } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { updateGroupStatus, type AdminGroup, type GroupCapacitySummary, type GroupUsageSummary } from '$lib/api/admin/groups';
	import { groupAccountCount, statusTone } from '$lib/features/supply/supply';

	interface Props {
		rows: AdminGroup[];
		total: number;
		loading: boolean;
		saving: boolean;
		page: number;
		totalPages: number;
		sortDrafts: Record<number, string>;
		usageSummary: GroupUsageSummary[];
		capacitySummary: GroupCapacitySummary[];
		controlsLoading: boolean;
		onPageChange: (newPage: number) => void;
		onSortDraftChange: (id: number, value: string) => void;
		onOpenControls: (group: AdminGroup) => void;
		onOpenEdit: (group: AdminGroup) => void;
		onRemove: (group: AdminGroup) => void;
		onReload: () => void;
	}

	let {
		rows,
		total,
		loading,
		saving,
		page,
		totalPages,
		sortDrafts,
		usageSummary,
		capacitySummary,
		controlsLoading,
		onPageChange,
		onSortDraftChange,
		onOpenControls,
		onOpenEdit,
		onRemove,
		onReload
	}: Props = $props();

	function formatCost(value: number | null | undefined) {
		return `$${Number(value ?? 0).toFixed(2)}`;
	}

	function capacityText(used: number | null | undefined, max: number | null | undefined) {
		return `${used ?? 0} / ${max && max > 0 ? max : '-'}`;
	}

	function usageForGroup(groupId: number): GroupUsageSummary | undefined {
		return usageSummary.find((item) => Number(item.group_id) === groupId);
	}

	function capacityForGroup(groupId: number): GroupCapacitySummary | undefined {
		return capacitySummary.find((item) => Number(item.group_id) === groupId);
	}
</script>

<Card padded={false} class="overflow-hidden" data-testid="groups-page">
	<VirtualTable {rows} rowHeight={72} {loading} getRowKey={(row) => row.id} class="max-h-[680px]">
		{#snippet header()}
			<div class="grid grid-cols-[72px_1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_260px] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
				<span>Sort</span><span>Group</span><span>Platform</span><span>Status</span><span>Usage</span><span>Capacity</span><span>Channel</span><span>Actions</span>
			</div>
		{/snippet}
		{#snippet row({ row })}
			<div class="grid grid-cols-[72px_1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_260px] items-center gap-3 border-b px-4 py-3 text-sm" data-testid="group-row">
				<Input
					type="number"
					min="0"
					value={sortDrafts[row.id] ?? ''}
					oninput={(event) => onSortDraftChange(row.id, event.currentTarget.value)}
					aria-label={`Sort order for ${row.name}`}
					data-testid="group-sort-input"
				/>
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<Layers size={15} class="text-muted-foreground" />
						<p class="truncate font-medium">{row.name}</p>
					</div>
					<p class="truncate text-xs text-muted-foreground">{row.description ?? `ID ${row.id}`}</p>
				</div>
				<p class="text-xs">{row.platform}</p>
				<div>
					<Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge>
					{#if row.is_exclusive}<Badge variant="outline" class="ml-1 bg-indigo-500/10 text-indigo-700 ring-indigo-500/20">exclusive</Badge>{/if}
				</div>
				<div class="text-xs" data-testid="group-usage-summary">
					<p>today {formatCost(usageForGroup(row.id)?.today_cost)}</p>
					<p class="text-muted-foreground">total {formatCost(usageForGroup(row.id)?.total_cost)}</p>
				</div>
				<div class="text-xs" data-testid="group-capacity-summary">
					<p>{groupAccountCount(row)} accounts</p>
					<p class="text-muted-foreground">rpm {capacityText(capacityForGroup(row.id)?.rpm_used, capacityForGroup(row.id)?.rpm_max)}</p>
				</div>
				<p class="truncate text-xs text-muted-foreground">{row.channel_name ?? (row.channel_id ? `#${row.channel_id}` : 'None')}</p>
				<div class="flex flex-wrap gap-1.5">
					<Button variant="outline" size="sm" disabled={controlsLoading} onclick={() => onOpenControls(row)}>
						<SlidersHorizontal size={14} /> Controls
					</Button>
					<Button variant="outline" size="sm" onclick={() => onOpenEdit(row)}>Edit</Button>
					<Button variant="outline" size="sm" disabled={saving} onclick={() => updateGroupStatus(row.id, row.status === 'active' ? 'inactive' : 'active').then(onReload)}>
						{row.status === 'active' ? 'Disable' : 'Enable'}
					</Button>
					<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => onRemove(row)}>Delete</Button>
				</div>
			</div>
		{/snippet}
		{#snippet empty()}
			<div class="p-10 text-center text-sm text-muted-foreground">No groups match the current filters.</div>
		{/snippet}
	</VirtualTable>
</Card>

<div class="flex items-center justify-between">
	<p class="text-sm text-muted-foreground">{total} total</p>
	<div class="flex items-center gap-2">
		<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => onPageChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
		<span class="text-sm">{page} / {totalPages}</span>
		<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => onPageChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
	</div>
</div>
