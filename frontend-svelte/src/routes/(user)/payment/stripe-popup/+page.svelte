<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { CheckCircle2, Loader2 } from '@lucide/svelte';
	import { getMyOrder } from '$lib/api/user/payment';
	import { getStripe } from '$lib/payments/stripe';
	import { formatGatewayAmount, paymentPhase } from '$lib/features/payment-flow/payment-flow';
	import Button from '$lib/ui/Button.svelte';

	type StripeLike = {
		confirmAlipayPayment?: (
			clientSecret: string,
			options: Record<string, unknown>
		) => Promise<{ error?: { message?: string } }>;
		confirmWechatPayPayment?: (
			clientSecret: string,
			options: Record<string, unknown>
		) => Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
	};

	const METHOD_COLORS: Record<string, string> = {
		alipay: '#00AEEF',
		wechat_pay: '#07C160'
	};
	const DEFAULT_METHOD_COLOR = '#635bff';

	let error = $state('');
	let success = $state(false);
	let hint = $state('');
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

	const orderId = $derived(q('order_id'));
	const method = $derived(q('method') || 'alipay');
	const amount = $derived(q('amount'));
	const methodColor = $derived(METHOD_COLORS[method] || DEFAULT_METHOD_COLOR);

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	function closeWindow() {
		if (typeof window !== 'undefined') window.close();
	}

	function successUrl(): string {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		return `${origin}/payment/result?order_id=${orderId}&status=success`;
	}

	async function initStripe(clientSecret: string, publishableKey: string) {
		if (!clientSecret || !publishableKey) {
			error = $_('payment.stripeMissingParams', { default: '缺少订单 ID 或客户端密钥' });
			return;
		}
		try {
			const stripe = (await getStripe(publishableKey)) as unknown as StripeLike;
			if (method === 'alipay') {
				const fn = stripe.confirmAlipayPayment;
				if (!fn) throw new Error($_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' }));
				const { error: err } = await fn(clientSecret, { return_url: successUrl() });
				if (err) error = err.message || $_('payment.result.failed', { default: '支付失败' });
			} else if (method === 'wechat_pay') {
				hint = $_('payment.stripePopup.loadingQr', { default: '加载微信支付二维码中...' });
				const fn = stripe.confirmWechatPayPayment;
				if (!fn) throw new Error($_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' }));
				const result = await fn(clientSecret, {
					payment_method_options: { wechat_pay: { client: 'web' } }
				});
				if (result.error) {
					error = result.error.message || $_('payment.result.failed', { default: '支付失败' });
				} else if (result.paymentIntent?.status === 'succeeded') {
					success = true;
					setTimeout(closeWindow, 2_000);
				} else {
					startPolling();
				}
			}
		} catch (err) {
			error =
				(err as Error)?.message ||
				$_('payment.stripeLoadFailed', { default: '加载支付组件失败，请刷新后重试。' });
		}
	}

	function startPolling() {
		const numericOrderId = Number(orderId);
		if (!numericOrderId) return;
		pollTimer = setInterval(async () => {
			try {
				const order = await getMyOrder(numericOrderId);
				if (paymentPhase(order?.status) === 'success') {
					if (pollTimer) clearInterval(pollTimer);
					pollTimer = null;
					success = true;
					setTimeout(closeWindow, 2_000);
				}
			} catch {
				// Keep the popup alive; parent window owns user-facing recovery.
			}
		}, 3_000);
	}

	onMount(() => {
		hint = $_('payment.stripePopup.redirecting', { default: '跳转到支付页面中...' });
		const handler = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			if (event.data?.type !== 'STRIPE_POPUP_INIT') return;
			window.removeEventListener('message', handler);
			void initStripe(String(event.data.clientSecret || ''), String(event.data.publishableKey || ''));
		};
		window.addEventListener('message', handler);
		if (window.opener) {
			window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin);
		}
		timeoutTimer = setTimeout(() => {
			if (!error && !success) {
				error = $_('payment.stripePopup.timeout', {
					default: '等待支付凭证超时，请重试'
				});
			}
		}, 15_000);
		return () => window.removeEventListener('message', handler);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (timeoutTimer) clearTimeout(timeoutTimer);
	});
</script>

<svelte:head>
	<title>{$_('payment.methods.stripe', { default: 'Stripe' })} · sub2api</title>
</svelte:head>

<section class="flex min-h-screen items-center justify-center bg-background p-4" data-testid="payment-stripe-popup-page">
	<div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
		{#if amount}
			<div class="text-center">
				<p class="text-3xl font-bold" style:color={methodColor}>{formatGatewayAmount(Number(amount) || 0, 'CNY')}</p>
				{#if orderId}
					<p class="mt-1 text-sm text-muted-foreground">
						{$_('payment.orders.orderId', { default: '订单号' })}: {orderId}
					</p>
				{/if}
			</div>
		{/if}

		{#if error}
			<div class="mt-4 space-y-3" data-testid="payment-stripe-popup-error">
				<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
				<Button variant="ghost" class="w-full text-sm hover:underline" style={`color: ${methodColor}`} onclick={closeWindow}>
					{$_('common.close', { default: '关闭' })}
				</Button>
			</div>
		{:else if success}
			<div class="space-y-3 py-4 text-center" data-testid="payment-stripe-popup-success">
				<CheckCircle2 class="mx-auto h-12 w-12 text-emerald-500" />
				<p class="text-sm text-muted-foreground">{$_('payment.result.success', { default: '支付成功' })}</p>
				<Button variant="ghost" class="text-sm hover:underline" style={`color: ${methodColor}`} onclick={closeWindow}>
					{$_('common.close', { default: '关闭' })}
				</Button>
			</div>
		{:else}
			<div class="flex items-center justify-center py-8" data-testid="payment-stripe-popup-waiting">
				<Loader2 class="h-8 w-8 animate-spin" style={`color: ${methodColor}`} />
				<span class="ml-3 text-sm text-muted-foreground">{hint}</span>
			</div>
		{/if}
	</div>
</section>
