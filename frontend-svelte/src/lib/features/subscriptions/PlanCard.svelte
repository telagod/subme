<script lang="ts">
	/**
	 * PlanCard · 计划卡 primitive（M6）
	 *
	 * 设计：
	 *   - 接受一个 Plan，渲染：name、price + period、features 列表、Subscribe 按钮。
	 *   - 平台 tint 通过 `platform` 字段读取一份内置 Zinc-中性 + 强调色映射；
	 *     不复用 Vue tree 的 platformColors.ts（依赖较深，下游 import 嫌噪）。
	 *   - 不挂任何支付 SDK —— 仅 emit subscribe 事件，由父页驱动 provider 切换。
	 *   - NO QUENCH 皮肤 —— 仅 Zinc neutral + 强调色 dot/边框。
	 */
	import { _ } from 'svelte-i18n';
	import { Check } from '@lucide/svelte';
	import type { Plan } from '$lib/api/user/subscriptions';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		plan: Plan;
		onSubscribe?: (plan: Plan) => void;
		disabled?: boolean;
	};

	let { plan, onSubscribe, disabled = false }: Props = $props();

	// Zinc-base + 平台强调色 dot/border 映射。NOT QUENCH gradients.
	const PLATFORM_DOT: Record<string, string> = {
		anthropic: 'bg-amber-500',
		openai: 'bg-emerald-500',
		antigravity: 'bg-violet-500',
		gemini: 'bg-sky-500',
		default: 'bg-zinc-400'
	};

	function dotClass(p: string): string {
		return PLATFORM_DOT[p] ?? PLATFORM_DOT.default;
	}

	function periodLabel(unit: Plan['periodUnit'], value: number): string {
		const v = String(value);
		switch (unit) {
			case 'day':
				return $_('user.purchase.period.day', { values: { count: v }, default: `/ ${v} day` });
			case 'year':
				return $_('user.purchase.period.year', { values: { count: v }, default: `/ ${v} year` });
			case 'month':
			default:
				return $_('user.purchase.period.month', { values: { count: v }, default: `/ ${v} month` });
		}
	}

	function fmtPrice(v: number): string {
		if (!Number.isFinite(v)) return '--';
		return `$${v.toFixed(2)}`;
	}

	function handleClick() {
		if (disabled) return;
		onSubscribe?.(plan);
	}
</script>

<article
	data-testid="plan-card"
	data-plan-id={plan.id}
	class="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-zinc-400/60 dark:hover:border-zinc-500/60"
>
	<header class="flex items-start gap-2.5">
		<span
			aria-hidden="true"
			class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full {dotClass(plan.platform)}"
		></span>
		<div class="space-y-0.5">
			<h3 class="text-base font-semibold leading-tight text-foreground" data-testid="plan-name">
				{plan.name}
			</h3>
			{#if plan.description}
				<p class="text-xs text-muted-foreground">{plan.description}</p>
			{/if}
		</div>
	</header>

	<div class="mt-4 flex items-baseline gap-2">
		<span class="text-3xl font-semibold tabular-nums text-foreground" data-testid="plan-price">
			{fmtPrice(plan.price)}
		</span>
		{#if plan.originalPrice !== undefined && plan.originalPrice > plan.price}
			<span
				class="text-sm text-muted-foreground line-through tabular-nums"
				data-testid="plan-original-price"
			>
				{fmtPrice(plan.originalPrice)}
			</span>
		{/if}
		<span class="text-xs text-muted-foreground">
			{periodLabel(plan.periodUnit, plan.periodValue)}
		</span>
	</div>

	{#if plan.features.length > 0}
		<ul class="mt-4 space-y-1.5" data-testid="plan-features">
			{#each plan.features as feat (feat)}
				<li class="flex items-start gap-2 text-sm text-foreground">
					<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
					<span>{feat}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-auto pt-5">
		<Button
			data-testid="plan-subscribe-btn"
			data-plan-id={plan.id}
			{disabled}
			onclick={handleClick}
			class="h-9 w-full px-3"
		>
			{$_('user.purchase.subscribe', { default: 'Subscribe' })}
		</Button>
	</div>
</article>
