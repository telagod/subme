<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ShoppingBag } from '@lucide/svelte';
	import type { Plan } from '$lib/api/user/subscriptions';
	import PlanCard from '$lib/features/subscriptions/PlanCard.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Props {
		plans: Plan[];
		loading: boolean;
		loadError: string | null;
		onSubscribe: (plan: Plan) => void;
		onRetry: () => void;
	}

	let { plans, loading, loadError, onSubscribe, onRetry }: Props = $props();
</script>

{#if loading}
	<div
		class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
		data-testid="purchase-loading"
	>
		{#each Array.from({ length: 3 }) as _placeholder, i (i)}
			<div class="rounded-lg border border-border bg-card p-5">
				<div class="h-5 w-32 animate-pulse rounded bg-muted"></div>
				<div class="mt-4 h-9 w-24 animate-pulse rounded bg-muted"></div>
				<div class="mt-5 space-y-2">
					<div class="h-3 w-full animate-pulse rounded bg-muted"></div>
					<div class="h-3 w-5/6 animate-pulse rounded bg-muted"></div>
					<div class="h-3 w-4/6 animate-pulse rounded bg-muted"></div>
				</div>
				<div class="mt-6 h-9 w-full animate-pulse rounded bg-muted"></div>
			</div>
		{/each}
	</div>
{:else if loadError && plans.length === 0}
	<Alert
		variant="destructive"
		class="p-8 text-center"
		data-testid="purchase-error"
	>
		<p class="text-sm font-medium text-destructive">
			{$_('user.purchase.failedToLoad', { default: '加载方案失败' })}
		</p>
		<p class="mt-1 text-xs text-muted-foreground">{loadError}</p>
		<Button
			variant="outline"
			size="sm"
			onclick={onRetry}
			class="mt-4"
		>
			{$_('user.purchase.retry', { default: '重试' })}
		</Button>
	</Alert>
{:else if plans.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
		data-testid="purchase-empty-state"
	>
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
			<ShoppingBag class="h-6 w-6" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.purchase.emptyTitle', { default: '暂无可用方案' })}
			</h2>
			<p class="max-w-sm text-sm text-muted-foreground">
				{$_('user.purchase.emptyDescription', {
					default: '请稍后查看，如果预期应有方案请联系客服。'
				})}
			</p>
		</div>
	</div>
{:else}
	<div
		class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
		data-testid="purchase-plans-grid"
	>
		{#each plans as plan (plan.id)}
			<PlanCard {plan} {onSubscribe} />
		{/each}
	</div>
{/if}
