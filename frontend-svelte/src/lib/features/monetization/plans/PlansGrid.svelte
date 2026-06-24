<script lang="ts">
	/**
	 * PlansGrid — card grid with loading skeleton, empty state, and pagination.
	 * Extracted from +page.svelte for thin-orchestrator pattern.
	 */
	import { _ } from 'svelte-i18n';
	import { PackageOpen, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import PlanCard from '$lib/features/monetization/plans/PlanCard.svelte';
	import type { AdminPlan, AdminGroupLite } from '$lib/api/admin/plans';

	type Props = {
		loading: boolean;
		pagedPlans: AdminPlan[];
		allPlansCount: number;
		page: number;
		totalPages: number;
		sortLoading: boolean;
		findGroup: (id: number) => AdminGroupLite | undefined;
		isGroupMissing: (id: number) => boolean;
		globalIndexOf: (plan: AdminPlan) => number;
		onToggleSale: (plan: AdminPlan) => void;
		onEdit: (plan: AdminPlan) => void;
		onDuplicate: (plan: AdminPlan) => void;
		onDelete: (plan: AdminPlan) => void;
		onMoveUp: (globalIdx: number) => void;
		onMoveDown: (globalIdx: number) => void;
		onPageChange: (page: number) => void;
	};

	let {
		loading,
		pagedPlans,
		allPlansCount,
		page,
		totalPages,
		sortLoading,
		findGroup,
		isGroupMissing,
		globalIndexOf,
		onToggleSale,
		onEdit,
		onDuplicate,
		onDelete,
		onMoveUp,
		onMoveDown,
		onPageChange
	}: Props = $props();
</script>

<!-- Loading skeleton -->
{#if loading && allPlansCount === 0}
	<div
		class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]"
		data-testid="plans-loading"
	>
		{#each Array(6) as _, i (i)}
			<div
				class="flex min-h-[220px] animate-pulse flex-col gap-3 rounded-xl border border-border bg-card p-5"
			>
				<div class="h-4 w-[70%] rounded-md bg-muted"></div>
				<div class="mt-1 h-7 w-[40%] rounded-md bg-muted"></div>
				<div class="h-3 w-[55%] rounded-md bg-muted"></div>
				<div class="h-3 w-[35%] rounded-md bg-muted"></div>
			</div>
		{/each}
	</div>
{:else if pagedPlans.length > 0}
	<!-- Card grid -->
	<div
		class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]"
		data-testid="plans-grid"
	>
		{#each pagedPlans as plan (plan.id)}
			{@const gidx = globalIndexOf(plan)}
			<PlanCard
				{plan}
				group={findGroup(plan.group_id)}
				groupMissing={isGroupMissing(plan.group_id)}
				isFirst={gidx === 0 || sortLoading}
				isLast={gidx === allPlansCount - 1 || sortLoading}
				onToggleSale={() => onToggleSale(plan)}
				onEdit={() => onEdit(plan)}
				onDuplicate={() => onDuplicate(plan)}
				onDelete={() => onDelete(plan)}
				onMoveUp={() => onMoveUp(gidx)}
				onMoveDown={() => onMoveDown(gidx)}
			/>
		{/each}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div
			class="flex items-center justify-center gap-2 pt-2"
			data-testid="plans-pagination"
		>
			<Button
				variant="outline"
				size="icon"
				disabled={page === 1}
				onclick={() => onPageChange(Math.max(1, page - 1))}
				aria-label={$_('common.back', { default: '上一页' })}
			>
				<ChevronLeft class="h-3 w-3" />
			</Button>
			<span class="text-xs tabular-nums text-muted-foreground">
				{page} / {totalPages}
			</span>
			<Button
				variant="outline"
				size="icon"
				disabled={page === totalPages}
				onclick={() => onPageChange(Math.min(totalPages, page + 1))}
				aria-label={$_('common.next', { default: '下一步' })}
			>
				<ChevronRight class="h-3 w-3" />
			</Button>
		</div>
	{/if}
{:else if !loading}
	<!-- Empty state -->
	<div
		class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
		data-testid="plans-empty"
	>
		<PackageOpen class="h-10 w-10 opacity-40" />
		<p class="m-0 text-[13px]">
			{$_('admin.plansCatalog.emptyText', {
				default: '暂无方案，点击「新建方案」开始。'
			})}
		</p>
	</div>
{/if}
