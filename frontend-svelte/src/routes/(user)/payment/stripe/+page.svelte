<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, CheckCircle2, Loader2 } from '@lucide/svelte';
	import { getMyOrder, getPaymentConfig, type UserPaymentOrder } from '$lib/api/user/payment';
	import { getStripe } from '$lib/payments/stripe';
	import {
		formatGatewayAmount,
		paymentPhase
	} from '$lib/features/payment-flow/payment-flow';
	import Button from '$lib/ui/Button.svelte';

	type StripeElement = {
		mount: (selector: string) => void;
		on?: (event: 'ready', handler: () => void) => void;
	};
	type StripeElements = unknown;
	type StripeLike = {
		elements: (options: Record<string, unknown>) => {
			create: (type: 'payment', options?: Record<string, unknown>) => StripeElement;
		};
		confirmPayment: (options: Record<string, unknown>) => Promise<{ error?: { message?: string } }>;
		confirmAlipayPayment?: (
			clientSecret: string,
			options: Record<string, unknown>
		) => Promise<{ error?: { message?: string } }>;
		confirmWechatPayPayment?: (
			clientSecret: string,
			options: Record<string, unknown>
		) => Promise<{
			paymentIntent?: {
				status: string;
				next_action?: { wechat_pay_display_qr_code?: { image_data_url?: string } };
			};
			error?: { message?: string };
		}>;
	};

	let loading = $state(true);
	let initError = $state('');
	let stripeError = $state('');
	let stripeSubmitting = $state(false);
	let stripeSuccess = $state(false);
	let stripeReady = $state(false);
	let order = $state<UserPaymentOrder | null>(null);
	let wechatQrUrl = $state('');
	let redirecting = $state(false);
	let showPaymentElement = $state(false);
	let stripeInstance: StripeLike | null = null;
	let elementsInstance: StripeElements | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let redirectTimer: ReturnType<typeof setTimeout> | null = null;

	const currency = $derived(order?.currency ?? 'USD');

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	function successUrl(orderId: number): string {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		return `${origin}/payment/result?order_id=${orderId}&status=success`;
	}

	async function confirmAlipay(stripe: StripeLike, clientSecret: string, orderId: number) {
		redirecting = true;
		const fn = stripe.confirmAlipayPayment;
		if (!fn) {
			stripeError = $_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' });
			redirecting = false;
			return;
		}
		const { error } = await fn(clientSecret, { return_url: successUrl(orderId) });
		if (error) {
			redirecting = false;
			stripeError = error.message || $_('payment.result.failed', { default: '支付失败' });
		}
	}

	async function confirmWechatPay(stripe: StripeLike, clientSecret: string) {
		const fn = stripe.confirmWechatPayPayment;
		if (!fn) {
			stripeError = $_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' });
			return;
		}
		const { paymentIntent, error } = await fn(clientSecret, {
			payment_method_options: { wechat_pay: { client: 'web' } }
		});
		if (error) {
			stripeError = error.message || $_('payment.result.failed', { default: '支付失败' });
			return;
		}
		const qrData = paymentIntent?.next_action?.wechat_pay_display_qr_code?.image_data_url;
		if (qrData) {
			wechatQrUrl = qrData;
			startPolling();
		} else if (paymentIntent?.status === 'succeeded') {
			stripeSuccess = true;
			scheduleClose();
		} else {
			stripeError = $_('payment.result.failed', { default: '支付失败' });
		}
	}

	async function mountPaymentElement(stripe: StripeLike, clientSecret: string) {
		await tick();
		const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
		const elements = stripe.elements({
			clientSecret,
			appearance: { theme: isDark ? 'night' : 'stripe', variables: { borderRadius: '8px' } }
		});
		elementsInstance = elements;
		const paymentElement = elements.create('payment', {
			layout: 'tabs',
			paymentMethodOrder: ['alipay', 'wechat_pay', 'card', 'link']
		});
		paymentElement.mount('#stripe-payment-element');
		paymentElement.on?.('ready', () => {
			stripeReady = true;
		});
	}

	async function handleGenericPay() {
		if (!stripeInstance || !elementsInstance || stripeSubmitting) return;
		stripeSubmitting = true;
		stripeError = '';
		try {
			const { error } = await stripeInstance.confirmPayment({
				elements: elementsInstance,
				confirmParams: { return_url: successUrl(Number(q('order_id'))) },
				redirect: 'if_required'
			});
			if (error) {
				stripeError = error.message || $_('payment.result.failed', { default: '支付失败' });
			} else {
				stripeSuccess = true;
				scheduleClose();
			}
		} catch (err) {
			stripeError = (err as Error)?.message || $_('payment.result.failed', { default: '支付失败' });
		} finally {
			stripeSubmitting = false;
		}
	}

	function startPolling() {
		const orderId = Number(q('order_id'));
		if (!orderId) return;
		pollTimer = setInterval(async () => {
			const next = await getMyOrder(orderId);
			if (paymentPhase(next?.status) === 'success') {
				if (pollTimer) clearInterval(pollTimer);
				pollTimer = null;
				stripeSuccess = true;
				wechatQrUrl = '';
				scheduleClose();
			}
		}, 3_000);
	}

	function scheduleClose() {
		redirectTimer = setTimeout(() => {
			if (typeof window !== 'undefined' && window.opener) window.close();
			else void goto(`/payment/result?order_id=${q('order_id')}&status=success`);
		}, 2_000);
	}

	function goPurchase() {
		void goto('/purchase');
	}

	onMount(async () => {
		const orderId = Number(q('order_id'));
		const clientSecret = q('client_secret');
		const method = q('method');
		if (!orderId || !clientSecret) {
			loading = false;
			initError = $_('payment.stripeMissingParams', { default: '缺少订单 ID 或客户端密钥' });
			return;
		}
		try {
			order = await getMyOrder(orderId);
			const cfg = await getPaymentConfig();
			const publishableKey = cfg.stripe_publishable_key ?? '';
			if (!publishableKey) {
				initError = $_('payment.stripeNotConfigured', { default: 'Stripe 未配置' });
				return;
			}
			stripeInstance = (await getStripe(publishableKey)) as unknown as StripeLike;
			loading = false;
			if (method === 'alipay') {
				await confirmAlipay(stripeInstance, clientSecret, orderId);
			} else if (method === 'wechat_pay') {
				await confirmWechatPay(stripeInstance, clientSecret);
			} else {
				showPaymentElement = true;
				await mountPaymentElement(stripeInstance, clientSecret);
			}
		} catch (err) {
			initError =
				(err as Error)?.message ||
				$_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' });
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (redirectTimer) clearTimeout(redirectTimer);
	});
</script>

<svelte:head>
	<title>{$_('payment.methods.stripe', { default: 'Stripe' })} · sub2api</title>
</svelte:head>

<section class="mx-auto max-w-lg space-y-6 py-8" data-testid="payment-stripe-page">
	{#if loading}
		<div class="flex items-center justify-center rounded-lg border border-border bg-card py-20" data-testid="payment-stripe-loading">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if initError}
		<div class="rounded-lg border border-border bg-card p-8 text-center" data-testid="payment-stripe-error">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
				<AlertTriangle class="h-8 w-8" />
			</div>
			<h1 class="text-lg font-semibold text-foreground">
				{$_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">{initError}</p>
			<Button class="mt-6" onclick={goPurchase}>
				{$_('payment.result.backToRecharge', { default: '返回充值' })}
			</Button>
		</div>
	{:else}
		{#if order}
			<div class="overflow-hidden rounded-lg border border-border bg-card">
				<div class="border-b border-border bg-secondary px-6 py-6 text-center">
					<p class="text-sm font-medium text-muted-foreground">{$_('payment.actualPay', { default: '实际支付' })}</p>
					<p class="mt-1 text-3xl font-bold text-foreground">{formatGatewayAmount(order.pay_amount, currency)}</p>
				</div>
			</div>
		{/if}

		{#if wechatQrUrl}
			<div class="rounded-lg border border-border bg-card p-6" data-testid="payment-stripe-wechat">
				<div class="flex flex-col items-center space-y-4">
					<p class="text-lg font-semibold text-foreground">{$_('payment.qr.scanWxpay', { default: '微信扫码支付' })}</p>
					<img src={wechatQrUrl} alt="WeChat Pay QR" class="h-56 w-56 rounded border border-emerald-500/70 bg-muted p-3" />
					<p class="text-center text-sm text-muted-foreground">{$_('payment.qr.scanWxpayHint', { default: '打开手机微信扫描二维码支付' })}</p>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4 text-center">
				<p class="text-sm text-muted-foreground">{$_('payment.qr.waitingPayment', { default: '等待支付中...' })}</p>
			</div>
		{:else if redirecting}
			<div class="rounded-lg border border-border bg-card p-6" data-testid="payment-stripe-redirecting">
				<div class="flex flex-col items-center space-y-4 py-4">
					<Loader2 class="h-10 w-10 animate-spin text-primary" />
					<p class="text-sm text-muted-foreground">{$_('payment.qr.payInNewWindowHint', { default: '支付页面已在新窗口中打开，请在新窗口完成支付后返回此页面。' })}</p>
				</div>
			</div>
		{:else if stripeSuccess}
			<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center" data-testid="payment-stripe-success">
				<CheckCircle2 class="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
				<p class="mt-3 text-lg font-bold text-foreground">{$_('payment.result.success', { default: '支付成功' })}</p>
				<p class="mt-1 text-sm text-muted-foreground">{$_('payment.stripeSuccessProcessing', { default: '支付成功，正在处理您的订单...' })}</p>
			</div>
		{:else if showPaymentElement}
			<div class="rounded-lg border border-border bg-card p-6" data-testid="payment-stripe-element-card">
				<div id="stripe-payment-element" class="min-h-[200px]"></div>
				{#if stripeError}
					<p class="mt-4 text-sm text-destructive">{stripeError}</p>
				{/if}
				<Button class="mt-6 h-11 w-full text-base" disabled={stripeSubmitting || !stripeReady} onclick={handleGenericPay} data-testid="payment-stripe-pay">
					{#if stripeSubmitting}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{$_('common.processing', { default: '处理中' })}
					{:else}
						{$_('payment.stripePay', { default: '立即支付' })}
					{/if}
				</Button>
			</div>
			<div class="text-center">
				<Button variant="outline" onclick={goPurchase}>
					{$_('payment.result.backToRecharge', { default: '返回充值' })}
				</Button>
			</div>
		{/if}

		{#if stripeError && !showPaymentElement}
			<div class="rounded-lg border border-border bg-card p-4" data-testid="payment-stripe-action-error">
				<p class="text-sm text-destructive">{stripeError}</p>
				<Button variant="outline" class="mt-3 w-full" onclick={goPurchase}>
					{$_('payment.result.backToRecharge', { default: '返回充值' })}
				</Button>
			</div>
		{/if}
	{/if}
</section>
