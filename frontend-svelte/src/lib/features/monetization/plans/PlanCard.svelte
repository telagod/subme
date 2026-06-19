<script lang="ts">
	/**
	 * PlanCard · admin variant（M22）
	 *
	 * 设计：
	 *   - 与 user-side $lib/features/subscriptions/PlanCard.svelte 共享 Zinc 中性
	 *     基座 + 平台强调 dot 模式 —— NOT QUENCH metallic gradient（铁律见
	 *     memory: reshadcn-migration / ui-design-preference）。
	 *   - 接收完整 AdminPlan + 关联 AdminGroupLite，渲染：
	 *       name + on/off-sale badge | move-up / move-down 隐式按钮
	 *       price + original-price 划线 + period chip
	 *       description (line-clamp-2)
	 *       group badge with rate_multiplier + daily/weekly/monthly limit chip
	 *       features bullet list（top 3 + overflow count）
	 *       footer: for_sale switch | Edit / Duplicate / Delete cluster
	 *   - 不直接吃 API —— 全部动作通过 callback props 派发，父页统一编排。
	 *     这样 lazy-load PlanEditDialog 时不会跟着拽进卡片树。
	 */
	import { _ } from 'svelte-i18n';
	import {
		ChevronUp,
		ChevronDown,
		Pencil,
		Trash2,
		Copy
	} from '@lucide/svelte';
	import type { AdminPlan, AdminGroupLite } from '$lib/api/admin/plans';

	type Props = {
		plan: AdminPlan;
		group?: AdminGroupLite;
		groupMissing?: boolean;
		isFirst: boolean;
		isLast: boolean;
		onToggleSale?: () => void;
		onEdit?: () => void;
		onDuplicate?: () => void;
		onDelete?: () => void;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
	};

	let {
		plan,
		group,
		groupMissing = false,
		isFirst,
		isLast,
		onToggleSale,
		onEdit,
		onDuplicate,
		onDelete,
		onMoveUp,
		onMoveDown
	}: Props = $props();

	// Platform → accent-dot color (same map as user PlanCard so visual language stays consistent).
	const PLATFORM_DOT: Record<string, string> = {
		anthropic: 'bg-amber-500',
		openai: 'bg-emerald-500',
		antigravity: 'bg-violet-500',
		gemini: 'bg-sky-500',
		default: 'bg-zinc-400'
	};

	function dotClass(p?: string): string {
		if (!p) return PLATFORM_DOT.default;
		return PLATFORM_DOT[p] ?? PLATFORM_DOT.default;
	}

	const periodLabel = $derived.by<string>(() => {
		const unit = plan.validity_unit || 'days';
		const n = plan.validity_days;
		if (unit === 'months') {
			return $_('admin.plansCatalog.periodMonths', {
				values: { n },
				default: `${n} month(s)`
			});
		}
		if (unit === 'weeks') {
			return $_('admin.plansCatalog.periodWeeks', {
				values: { n },
				default: `${n} week(s)`
			});
		}
		return $_('admin.plansCatalog.periodDays', {
			values: { n },
			default: `${n} day(s)`
		});
	});

	const fmtPrice = (v: number | undefined): string => {
		if (v == null || !Number.isFinite(v)) return '$0.00';
		return `$${v.toFixed(2)}`;
	};

	const showOriginal = $derived(
		plan.original_price != null &&
			plan.original_price > 0 &&
			plan.original_price > plan.price
	);
</script>

<article
	data-testid="admin-plan-card"
	data-plan-id={plan.id}
	data-for-sale={plan.for_sale ? 'true' : 'false'}
	class="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-card px-4 pb-3.5 pt-[18px] shadow-sm transition-colors duration-150 hover:border-zinc-400/60 dark:hover:border-zinc-500/60"
	class:opacity-60={!plan.for_sale}
	class:grayscale-30={!plan.for_sale}
	class:!border-destructive={groupMissing}
>
	<!-- Accent bar: top stripe in platform tint (or muted when no group) -->
	<div
		aria-hidden="true"
		class="absolute left-0 right-0 top-0 h-[3px] rounded-t-xl"
		class:bg-zinc-200={!group}
		class:dark:bg-zinc-700={!group}
		class:bg-gradient-to-r={!!group}
		class:from-primary={!!group}
		class:to-primary={!!group}
	></div>

	<!-- Order tag -->
	{#if plan.sort_order != null}
		<div
			aria-hidden="true"
			class="absolute left-2.5 top-2.5 rounded border border-border bg-muted px-[5px] py-px text-[9.5px] font-bold tabular-nums tracking-[0.03em] text-muted-foreground"
			style="pointer-events:none;line-height:1.4"
			data-testid="plan-sort-tag"
		>
			#{plan.sort_order + 1}
		</div>
	{/if}

	<!-- Header row -->
	<header
		class="mt-1 flex items-start justify-between gap-2"
		class:pl-[30px]={plan.sort_order != null}
	>
		<div class="flex min-w-0 flex-1 items-center gap-1.5">
			<span
				aria-hidden="true"
				class="inline-block h-2 w-2 shrink-0 rounded-full {dotClass(group?.platform)}"
			></span>
			<span class="truncate text-sm font-bold text-foreground" data-testid="plan-name">
				{plan.name}
			</span>
			<span
				class="flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium"
				class:border-primary={plan.for_sale}
				class:bg-primary={plan.for_sale}
				class:text-primary-foreground={plan.for_sale}
				class:border-border={!plan.for_sale}
				class:text-muted-foreground={!plan.for_sale}
				data-testid="plan-sale-badge"
			>
				{plan.for_sale
					? $_('admin.plansCatalog.onSale', { default: 'On Sale' })
					: $_('admin.plansCatalog.offSale', { default: 'Archived' })}
			</span>
		</div>
		<div class="flex flex-shrink-0 flex-col gap-0.5">
			<button
				type="button"
				class="inline-flex h-[18px] w-[22px] items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				disabled={isFirst}
				onclick={onMoveUp}
				title={$_('admin.plansCatalog.moveUp', { default: 'Move Up' })}
				aria-label={$_('admin.plansCatalog.moveUp', { default: 'Move Up' })}
				data-testid="plan-move-up"
			>
				<ChevronUp class="h-3 w-3" />
			</button>
			<button
				type="button"
				class="inline-flex h-[18px] w-[22px] items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				disabled={isLast}
				onclick={onMoveDown}
				title={$_('admin.plansCatalog.moveDown', { default: 'Move Down' })}
				aria-label={$_('admin.plansCatalog.moveDown', { default: 'Move Down' })}
				data-testid="plan-move-down"
			>
				<ChevronDown class="h-3 w-3" />
			</button>
		</div>
	</header>

	<!-- Price block -->
	<div class="flex items-baseline gap-2">
		<span class="text-[26px] font-bold text-foreground tabular-nums" data-testid="plan-price">
			{fmtPrice(plan.price)}
		</span>
		{#if showOriginal}
			<span
				class="font-mono text-xs tabular-nums text-muted-foreground line-through"
				data-testid="plan-original-price"
			>
				{fmtPrice(plan.original_price)}
			</span>
		{/if}
		<span
			class="ml-auto whitespace-nowrap rounded border border-transparent bg-zinc-100 px-1.5 py-0.5 text-[11px] text-foreground dark:bg-zinc-800 dark:text-zinc-100"
			data-testid="plan-period"
		>
			{periodLabel}
		</span>
	</div>

	<!-- Description -->
	{#if plan.description}
		<p
			class="m-0 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground"
			data-testid="plan-description"
		>
			{plan.description}
		</p>
	{/if}

	<!-- Key config chips: group badge + limit + rate_multiplier -->
	<div class="flex flex-wrap gap-[5px]" data-testid="plan-chips">
		{#if groupMissing}
			<span
				class="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive"
				data-testid="plan-group-missing"
			>
				{$_('admin.plansCatalog.groupMissingFmt', {
					values: { id: plan.group_id },
					default: `Group #${plan.group_id} missing`
				})}
			</span>
		{:else if group}
			<span
				class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
				data-testid="plan-group-badge"
			>
				<span
					aria-hidden="true"
					class="inline-block h-1.5 w-1.5 rounded-full {dotClass(group.platform)}"
				></span>
				<span class="truncate">{group.name}</span>
				<span class="text-muted-foreground">·</span>
				<span class="tabular-nums">{group.rate_multiplier}x</span>
			</span>
		{/if}

		{#if group?.daily_limit_usd != null}
			<span
				class="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
				data-testid="plan-daily-limit"
			>
				{$_('admin.plansCatalog.dailyLimitFmt', {
					values: { v: group.daily_limit_usd },
					default: `Daily limit $${group.daily_limit_usd}`
				})}
			</span>
		{:else if group}
			<span
				class="rounded border border-emerald-500/20 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400"
				data-testid="plan-unlimited"
			>
				{$_('admin.plansCatalog.unlimited', { default: 'Unlimited' })}
			</span>
		{/if}
	</div>

	<!-- Features list (top 3 + overflow count) -->
	{#if plan.features && plan.features.length > 0}
		<ul class="m-0 flex flex-col gap-1 p-0 list-none" data-testid="plan-features">
			{#each plan.features.slice(0, 3) as f, i (i)}
				<li class="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
					<span
						aria-hidden="true"
						class="mt-[5px] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/50"
					></span>
					<span class="truncate">{f}</span>
				</li>
			{/each}
			{#if plan.features.length > 3}
				<li class="pl-2.5 text-[10.5px] text-muted-foreground/70">
					{$_('admin.plansCatalog.moreFeaturesFmt', {
						values: { n: plan.features.length - 3 },
						default: `+${plan.features.length - 3} more`
					})}
				</li>
			{/if}
		</ul>
	{/if}

	<!-- Footer: on-sale switch | Edit / Duplicate / Delete cluster -->
	<footer class="mt-auto flex items-center gap-2.5 border-t border-border pt-2.5">
		<label
			class="inline-flex cursor-pointer items-center gap-1.5"
			title={plan.for_sale
				? $_('admin.plansCatalog.toggleOnTitle', { default: 'Click to archive' })
				: $_('admin.plansCatalog.toggleOffTitle', { default: 'Click to publish' })}
		>
			<input
				type="checkbox"
				class="h-3.5 w-3.5 accent-primary"
				checked={plan.for_sale}
				onchange={onToggleSale}
				data-testid="plan-toggle-sale"
				aria-label={plan.for_sale
					? $_('admin.plansCatalog.toggleOnTitle', { default: 'Click to archive' })
					: $_('admin.plansCatalog.toggleOffTitle', { default: 'Click to publish' })}
			/>
			<span class="whitespace-nowrap text-[11px] text-muted-foreground">
				{plan.for_sale
					? $_('admin.plansCatalog.onSale', { default: 'On Sale' })
					: $_('admin.plansCatalog.offSale', { default: 'Archived' })}
			</span>
		</label>

		<span class="h-4 w-px flex-shrink-0 bg-border" aria-hidden="true"></span>

		<div class="ml-auto flex items-center gap-0.5">
			<button
				type="button"
				class="inline-flex h-auto items-center gap-1 whitespace-nowrap rounded px-[9px] py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={onEdit}
				title={$_('common.edit', { default: 'Edit' })}
				data-testid="plan-edit-btn"
			>
				<Pencil class="h-3 w-3" />
				<span>{$_('common.edit', { default: 'Edit' })}</span>
			</button>
			<button
				type="button"
				class="inline-flex h-auto items-center gap-1 whitespace-nowrap rounded px-[9px] py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={onDuplicate}
				title={$_('admin.plansCatalog.duplicate', { default: 'Duplicate' })}
				data-testid="plan-duplicate-btn"
			>
				<Copy class="h-3 w-3" />
				<span>{$_('admin.plansCatalog.duplicate', { default: 'Duplicate' })}</span>
			</button>
			<button
				type="button"
				class="inline-flex h-auto items-center gap-1 whitespace-nowrap rounded px-[9px] py-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				onclick={onDelete}
				title={$_('common.delete', { default: 'Delete' })}
				data-testid="plan-delete-btn"
			>
				<Trash2 class="h-3 w-3" />
				<span>{$_('common.delete', { default: 'Delete' })}</span>
			</button>
		</div>
	</footer>
</article>

<style>
	.grayscale-30 {
		filter: grayscale(30%);
	}
</style>
