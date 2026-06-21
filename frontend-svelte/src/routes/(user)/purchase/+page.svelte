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
	import { ShoppingBag, RotateCw, CreditCard, Wallet } from '@lucide/svelte';
	import { listPlans, type Plan } from '$lib/api/user/subscriptions';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import {
		type PaymentConfig,
		type PaymentMethod,
		getPaymentConfig,
		listPaymentMethods
	} from '$lib/api/user/payment';
	import {
		buildCreateOrderPayload,
		decidePaymentLaunch,
		writePaymentRecoverySnapshot,
		PAYMENT_RECOVERY_STORAGE_KEY,
		type CreateOrderFlowResult,
		type OrderType
	} from '$lib/features/payment-flow/payment-flow';
	import PlanCard from '$lib/features/subscriptions/PlanCard.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	// ── state ───────────────────────────────────────────────────────────
	let plans = $state<Plan[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Payment config + methods from backend
	let paymentConfig = $state<PaymentConfig | null>(null);
	let paymentMethods = $state<PaymentMethod[]>([]);

	// Provider 切换面板
	let providerOpen = $state(false);
	let selectedPlan = $state<Plan | null>(null);
	let selectedProvider = $state<string | null>(null);
	let checkoutSubmitting = $state(false);

	// Promo code
	let promoCode = $state('');
	let promoApplied = $state(false);

	// Derive available providers from backend methods; fallback to static list
	const availableProviders = $derived.by(() => {
		if (paymentMethods.length > 0) {
			return paymentMethods.filter(m => m.available);
		}
		// Fallback: show stripe + balance always, airwallex if config hints at it
		return [
			{ id: 'stripe', kind: 'stripe' as const, label: 'Stripe', available: true },
			{ id: 'airwallex', kind: 'airwallex' as const, label: 'Airwallex', available: true },
			{ id: 'balance', kind: 'balance' as const, label: 'Balance', available: !(paymentConfig?.balance_disabled) }
		].filter(m => m.available);
	});

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadPlans() {
		loading = true;
		loadError = null;
		try {
			const [plansResult] = await Promise.all([
				listPlans(),
				loadPaymentConfig()
			]);
			plans = plansResult;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			loadError = msg || 'load failed';
			showError($_('user.purchase.failedToLoad', { default: 'Failed to load plans' }));
		} finally {
			loading = false;
		}
	}

	async function loadPaymentConfig() {
		try {
			const [config, methods] = await Promise.all([
				getPaymentConfig(),
				listPaymentMethods()
			]);
			paymentConfig = config;
			paymentMethods = methods;
		} catch {
			// Non-fatal: provider buttons fall back to static list
		}
	}

	onMount(() => {
		loadPlans();
	});

	// ── helpers ──────────────────────────────────────────────────────────

	function isMobile(): boolean {
		if (typeof navigator === 'undefined') return false;
		return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	}

	function isWechat(): boolean {
		if (typeof navigator === 'undefined') return false;
		return /MicroMessenger/i.test(navigator.userAgent);
	}

	function providerIcon(kind: string) {
		return kind === 'balance' ? Wallet : CreditCard;
	}

	function providerLabel(kind: string): string {
		switch (kind) {
			case 'stripe':
				return $_('user.purchase.providerStripe', { default: 'Stripe (Card / Alipay / WeChat)' });
			case 'airwallex':
				return $_('user.purchase.providerAirwallex', { default: 'Airwallex' });
			case 'balance':
				return $_('user.purchase.providerBalance', { default: 'Pay with balance' });
			default:
				return kind;
		}
	}

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
			// SDK warm-up (non-blocking, just ensures lazy chunks are reachable)
			if (selectedProvider === 'stripe') {
				try { await import('$lib/payments/stripe'); } catch { /* non-fatal */ }
			} else if (selectedProvider === 'airwallex') {
				try { await import('$lib/payments/airwallex'); } catch { /* non-fatal */ }
			}

			// Build order payload using the payment flow engine
			const origin = typeof window !== 'undefined' ? window.location.origin : '';
			const payload = buildCreateOrderPayload({
				amount: selectedPlan.price,
				paymentType: selectedProvider,
				orderType: 'subscription' as OrderType,
				planId: selectedPlan.id,
				origin,
				isMobile: isMobile(),
				isWechatBrowser: isWechat()
			});
			if (promoApplied && promoCode.trim()) {
				payload.promo_code = promoCode.trim();
			}

			// Create order via backend
			const { apiClient } = await import('$lib/api/client');
			const result = await apiClient.post<CreateOrderFlowResult>(
				'/api/v1/payment/orders',
				payload
			);

			// Balance deduction: backend handles it server-side, just show success
			if (selectedProvider === 'balance') {
				showSuccess($_('user.purchase.balanceSuccess', { default: 'Payment completed via balance' }));
				closeProvider();
				return;
			}

			// Build router URLs for Stripe/Airwallex landing pages
			const stripeRouteUrl = result.client_secret
				? `/payment/stripe?order_id=${result.order_id}&client_secret=${encodeURIComponent(result.client_secret)}${result.resume_token ? `&resume_token=${encodeURIComponent(result.resume_token)}` : ''}`
				: '';
			const airwallexRouteUrl = result.client_secret && result.intent_id
				? `/payment/airwallex?order_id=${result.order_id}${result.out_trade_no ? `&out_trade_no=${encodeURIComponent(result.out_trade_no)}` : ''}${result.resume_token ? `&resume_token=${encodeURIComponent(result.resume_token)}` : ''}`
				: '';

			// Decide launch strategy
			const decision = decidePaymentLaunch(result, {
				visibleMethod: selectedProvider,
				orderType: 'subscription',
				isMobile: isMobile(),
				isWechatBrowser: isWechat(),
				stripePopupUrl: stripeRouteUrl,
				stripeRouteUrl,
				airwallexRouteUrl
			});

			// Persist recovery snapshot
			if (typeof window !== 'undefined') {
				writePaymentRecoverySnapshot(window.localStorage, decision.recovery, PAYMENT_RECOVERY_STORAGE_KEY);
			}

			// Execute launch decision
			if (decision.kind === 'unhandled') {
				showError($_('user.purchase.checkoutError', { default: 'Payment method not supported for this order' }));
				return;
			}

			if (
				decision.kind === 'stripe_route' ||
				decision.kind === 'airwallex_route' ||
				decision.kind === 'redirect_waiting'
			) {
				if (typeof window !== 'undefined' && decision.paymentState.payUrl) {
					window.location.href = decision.paymentState.payUrl;
				}
				return;
			}

			if (decision.kind === 'stripe_popup' && decision.paymentState.payUrl) {
				if (typeof window !== 'undefined') {
					const win = window.open(decision.paymentState.payUrl, 'paymentPopup', 'width=500,height=700');
					if (!win || win.closed) {
						window.location.href = decision.paymentState.payUrl;
					}
				}
				return;
			}

			if (decision.kind === 'qr_waiting' && decision.paymentState.qrCode) {
				// Navigate to QR code display page
				if (typeof window !== 'undefined') {
					const params = new URLSearchParams();
					params.set('order_id', String(decision.paymentState.orderId));
					if (decision.paymentState.resumeToken) params.set('resume_token', decision.paymentState.resumeToken);
					window.location.href = `/payment/qrcode?${params.toString()}`;
				}
				return;
			}

			// Fallback: if pay_url exists, redirect
			if (decision.paymentState.payUrl && typeof window !== 'undefined') {
				window.location.href = decision.paymentState.payUrl;
				return;
			}

			// Navigate to payment result page for polling
			if (typeof window !== 'undefined') {
				const params = new URLSearchParams();
				if (decision.paymentState.orderId) params.set('order_id', String(decision.paymentState.orderId));
				if (decision.paymentState.outTradeNo) params.set('out_trade_no', decision.paymentState.outTradeNo);
				if (decision.paymentState.resumeToken) params.set('resume_token', decision.paymentState.resumeToken);
				window.location.href = `/payment/result?${params.toString()}`;
			}
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
			{#each availableProviders as provider (provider.id)}
				{@const Icon = providerIcon(provider.kind)}
				<Button
					variant="outline"
					role="radio"
					aria-checked={selectedProvider === provider.kind}
					data-testid="provider-{provider.kind}"
					onclick={() => (selectedProvider = provider.kind)}
					class="h-auto w-full justify-between px-4 py-3 {selectedProvider ===
						provider.kind
						? 'border-primary ring-2 ring-primary/30'
						: 'border-border'}"
				>
					<span class="flex items-center gap-2">
						<Icon class="h-4 w-4 text-muted-foreground" />
						{providerLabel(provider.kind)}
					</span>
				</Button>
			{/each}
			{#if availableProviders.length === 0}
				<p class="py-4 text-center text-sm text-muted-foreground">
					{$_('user.purchase.noPaymentMethods', { default: 'No payment methods available.' })}
				</p>
			{/if}
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
