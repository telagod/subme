<script lang="ts">
	/**
	 * /(user)/purchase · M6 plan picker + checkout entry
	 *
	 * 设计：
	 *   - Plans grid（3 cols lg, 2 cols md, 1 col mobile）。每张 PlanCard 含 Subscribe 按钮。
	 *   - Subscribe 触发 → 显示 provider 切换面板（Stripe / Airwallex / Balance）。
	 *     · 支付 SDK 由 $lib/api/user/payment.ts facade 提供；本页只调 facade.startCheckout()，
	 *       不直接 import Stripe / Airwallex（lazy import 保留在 facade 内部）。
	 *     · facade 当前为 stub —— payment agent 后续接入真实流程；不影响 plan picker。
	 *   - Promo code 输入（可选，subme 增量）：仅 UI 层；apply 按钮 → facade.validatePromoCode()。
	 *   - 错误兜底：loadPlans 失败 → 显示 retry；checkout 失败 → toast。
	 *   - NO QUENCH 皮肤 —— Zinc neutral only。
	 *
	 * RED LINE：
	 *   - 不在此层 import Stripe / Airwallex SDK；遵守 vendor-chunk-tdz-trap memory。
	 *   - 不在此层处理 401（apiClient 已统一）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ShoppingBag, RotateCw, CreditCard } from '@lucide/svelte';
	import { listPlans, type Plan } from '$lib/api/user/subscriptions';
	import { showError, showInfo } from '$lib/stores/toast.svelte';
	import PlanCard from '$lib/features/subscriptions/PlanCard.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	// ── state ───────────────────────────────────────────────────────────
	let plans = $state<Plan[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Provider 切换面板
	let providerOpen = $state(false);
	let selectedPlan = $state<Plan | null>(null);
	let selectedProvider = $state<'stripe' | 'airwallex' | 'balance' | null>(null);
	let checkoutSubmitting = $state(false);

	// Promo code
	let promoCode = $state('');
	let promoApplied = $state(false);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadPlans() {
		loading = true;
		loadError = null;
		try {
			plans = await listPlans();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			loadError = msg || 'load failed';
			showError($_('user.purchase.failedToLoad', { default: 'Failed to load plans' }));
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadPlans();
	});

	// ── handlers ────────────────────────────────────────────────────────

	function handleSubscribe(plan: Plan) {
		selectedPlan = plan;
		selectedProvider = null;
		providerOpen = true;
	}

	function closeProvider() {
		providerOpen = false;
		selectedPlan = null;
		selectedProvider = null;
		checkoutSubmitting = false;
	}

	async function handleCheckout() {
		if (!selectedPlan || !selectedProvider || checkoutSubmitting) return;
		checkoutSubmitting = true;
		try {
			// 预热 SDK lazy facade —— 让 vendor-stripe / vendor-airwallex chunk
			// 能在 Rollup 静态分析里被「可达」，从而被切成独立 lazy chunk。
			// 真正的 SDK 调用由后续 payment agent 在 success/cancel 页或弹窗中
			// 接管；这里 await 但不抛错，失败也不阻塞主流程。
			if (selectedProvider === 'stripe') {
				try {
					await import('$lib/payments/stripe');
				} catch {
					/* warm-up failure is non-fatal */
				}
			} else if (selectedProvider === 'airwallex') {
				try {
					await import('$lib/payments/airwallex');
				} catch {
					/* warm-up failure is non-fatal */
				}
			}

			// Lazy facade —— 真实支付路径由 payment agent 实装。这里走 dynamic import
			// 让本路由的 eager bundle 不背 Stripe / Airwallex 的体积。
			const mod = await import('$lib/api/user/payment');
			await mod.startCheckout({
				planId: selectedPlan.id,
				provider: selectedProvider,
				promoCode: promoApplied ? promoCode.trim() : undefined
			});
			// 成功路径通常会 redirect 或 polling；本页只收口 UI 状态。
		} catch (err) {
			const e = err as Error;
			showError(
				$_('user.purchase.checkoutError', {
					default: 'Failed to start checkout',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			checkoutSubmitting = false;
		}
	}

	function handleApplyPromo() {
		if (!promoCode.trim()) return;
		promoApplied = true;
		showInfo(
			$_('user.purchase.promoApplied', {
				default: 'Promo code applied: {code}',
				values: { code: promoCode.trim() }
			})
		);
	}

	function handleClearPromo() {
		promoCode = '';
		promoApplied = false;
	}
</script>

<svelte:head>
	<title>{$_('nav.buySubscription', { default: 'Buy Subscription' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="purchase-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.purchase.pageTitle', { default: 'Choose a plan' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.purchase.pageSubtitle', {
					default: 'Subscribe to unlock higher quota and dedicated channels.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				aria-label={$_('user.purchase.refresh', { default: 'Refresh' })}
				data-testid="purchase-refresh-btn"
				onclick={loadPlans}
				class="h-9 w-9 text-muted-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<!-- Promo code row -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3"
		data-testid="purchase-promo"
	>
		<label for="promo-code" class="text-sm font-medium text-foreground">
			{$_('user.purchase.promoLabel', { default: 'Promo code' })}
		</label>
		<Input
			id="promo-code"
			data-testid="purchase-promo-input"
			type="text"
			autocomplete="off"
			placeholder={$_('user.purchase.promoPlaceholder', { default: 'Enter code (optional)' })}
			bind:value={promoCode}
			disabled={promoApplied}
			class="h-9 min-w-[12rem] flex-1"
		/>
		{#if promoApplied}
			<Button
				variant="outline"
				data-testid="purchase-promo-clear"
				onclick={handleClearPromo}
				class="h-9 px-3"
			>
				{$_('user.purchase.promoClear', { default: 'Clear' })}
			</Button>
		{:else}
			<Button
				data-testid="purchase-promo-apply"
				disabled={!promoCode.trim()}
				onclick={handleApplyPromo}
				class="h-9 px-3"
			>
				{$_('user.purchase.promoApply', { default: 'Apply' })}
			</Button>
		{/if}
	</div>

	<!-- Plans grid / loading / error / empty -->
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
				{$_('user.purchase.failedToLoad', { default: 'Failed to load plans' })}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">{loadError}</p>
			<Button
				variant="outline"
				size="sm"
				onclick={loadPlans}
				class="mt-4"
			>
				{$_('user.purchase.retry', { default: 'Retry' })}
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
					{$_('user.purchase.emptyTitle', { default: 'No plans available' })}
				</h2>
				<p class="max-w-sm text-sm text-muted-foreground">
					{$_('user.purchase.emptyDescription', {
						default: 'Check back later or contact support if you expect plans to be here.'
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
				<PlanCard {plan} onSubscribe={handleSubscribe} />
			{/each}
		</div>
	{/if}
</section>

<StandardDialog
	open={providerOpen && Boolean(selectedPlan)}
	width="sm"
	title={$_('user.purchase.providerTitle', { default: 'Choose a payment method' })}
	data-testid="purchase-provider-panel"
>
	{#if selectedPlan}
		<p class="mt-2 text-xs text-muted-foreground" data-testid="purchase-provider-plan">
			{selectedPlan.name} · ${selectedPlan.price.toFixed(2)}
		</p>

		<div
			class="mt-5 space-y-2"
			role="radiogroup"
			aria-label={$_('user.purchase.providerTitle', { default: 'Choose a payment method' })}
		>
			<Button
				variant="outline"
				role="radio"
				aria-checked={selectedProvider === 'stripe'}
				data-testid="provider-stripe"
				onclick={() => (selectedProvider = 'stripe')}
				class="h-auto w-full justify-between px-4 py-3 {selectedProvider ===
					'stripe'
					? 'border-primary ring-2 ring-primary/30'
					: 'border-border'}"
			>
				<span class="flex items-center gap-2">
					<CreditCard class="h-4 w-4 text-muted-foreground" />
					{$_('user.purchase.providerStripe', { default: 'Stripe (Card / Alipay / WeChat)' })}
				</span>
			</Button>
			<Button
				variant="outline"
				role="radio"
				aria-checked={selectedProvider === 'airwallex'}
				data-testid="provider-airwallex"
				onclick={() => (selectedProvider = 'airwallex')}
				class="h-auto w-full justify-between px-4 py-3 {selectedProvider ===
					'airwallex'
					? 'border-primary ring-2 ring-primary/30'
					: 'border-border'}"
			>
				<span class="flex items-center gap-2">
					<CreditCard class="h-4 w-4 text-muted-foreground" />
					{$_('user.purchase.providerAirwallex', { default: 'Airwallex' })}
				</span>
			</Button>
			<Button
				variant="outline"
				role="radio"
				aria-checked={selectedProvider === 'balance'}
				data-testid="provider-balance"
				onclick={() => (selectedProvider = 'balance')}
				class="h-auto w-full justify-between px-4 py-3 {selectedProvider ===
					'balance'
					? 'border-primary ring-2 ring-primary/30'
					: 'border-border'}"
			>
				<span class="flex items-center gap-2">
					<CreditCard class="h-4 w-4 text-muted-foreground" />
					{$_('user.purchase.providerBalance', { default: 'Pay with balance' })}
				</span>
			</Button>
		</div>

		<div class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
			<Button
				variant="outline"
				data-testid="purchase-provider-cancel"
				disabled={checkoutSubmitting}
				onclick={closeProvider}
				class="h-9"
			>
				{$_('user.purchase.cancel', { default: 'Cancel' })}
			</Button>
			<Button
				data-testid="purchase-provider-confirm"
				disabled={!selectedProvider || checkoutSubmitting}
				onclick={handleCheckout}
				class="h-9"
			>
				{checkoutSubmitting
					? $_('user.purchase.processing', { default: 'Processing...' })
					: $_('user.purchase.continueToPayment', { default: 'Continue to payment' })}
			</Button>
		</div>
	{/if}
</StandardDialog>
