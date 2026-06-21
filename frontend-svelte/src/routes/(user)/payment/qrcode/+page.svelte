<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { ExternalLink, Loader2, QrCode, XCircle } from '@lucide/svelte';
	import QRCode from 'qrcode';
	import { cancelMyOrder, getMyOrder, type UserPaymentOrder } from '$lib/api/user/payment';
	import {
		countdownDisplay,
		isTerminalFailure,
		paymentPhase,
		secondsUntil
	} from '$lib/features/payment-flow/payment-flow';
	import { showError } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let qrUrl = $state('');
	let payUrl = $state('');
	let orderId = $state(0);
	let paymentType = $state('');
	let remainingSeconds = $state(0);
	let expired = $state(false);
	let cancelling = $state(false);
	let order = $state<UserPaymentOrder | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	const displayCountdown = $derived(countdownDisplay(remainingSeconds));
	const isAlipay = $derived(paymentType.toLowerCase().includes('alipay'));
	const isWxpay = $derived(paymentType.toLowerCase().includes('wxpay'));
	const scanTitle = $derived(
		isAlipay
			? $_('payment.qr.scanAlipay', { default: 'Alipay QR Payment' })
			: isWxpay
				? $_('payment.qr.scanWxpay', { default: 'WeChat QR Payment' })
				: $_('payment.qr.scanToPay', { default: 'Scan to Pay' })
	);
	const scanHint = $derived(
		isAlipay
			? $_('payment.qr.scanAlipayHint', {
					default: 'Open Alipay on your phone and scan the QR code to pay'
				})
			: isWxpay
				? $_('payment.qr.scanWxpayHint', {
						default: 'Open WeChat on your phone and scan the QR code to pay'
					})
				: ''
	);

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	async function renderQR(): Promise<void> {
		await tick();
		if (!canvas || !qrUrl) return;
		await QRCode.toCanvas(canvas, qrUrl, {
			width: 256,
			margin: 2,
			errorCorrectionLevel: 'M'
		});
	}

	function cleanup(): void {
		if (pollTimer) clearInterval(pollTimer);
		if (countdownTimer) clearInterval(countdownTimer);
		pollTimer = null;
		countdownTimer = null;
	}

	async function pollStatus(): Promise<void> {
		if (!orderId) return;
		try {
			order = await getMyOrder(orderId);
			const phase = paymentPhase(order?.status);
			if (phase === 'success') {
				cleanup();
				void goto(`/payment/result?order_id=${orderId}&status=success`);
			} else if (isTerminalFailure(order?.status)) {
				expired = true;
				cleanup();
			}
		} catch {
			// Keep polling; transient auth/network failures should not blank the QR page.
		}
	}

	function startCountdown(seconds: number): void {
		remainingSeconds = Math.max(0, seconds);
		if (remainingSeconds <= 0) {
			expired = true;
			return;
		}
		countdownTimer = setInterval(() => {
			remainingSeconds = Math.max(0, remainingSeconds - 1);
			if (remainingSeconds <= 0) {
				expired = true;
				cleanup();
			}
		}, 1_000);
	}

	async function handleCancel(): Promise<void> {
		if (!orderId || cancelling) return;
		cancelling = true;
		try {
			await cancelMyOrder(orderId);
			cleanup();
			void goto('/purchase');
		} catch (err) {
			showError((err as Error)?.message ?? 'Failed to cancel order');
		} finally {
			cancelling = false;
		}
	}

	function goPurchase(): void {
		void goto('/purchase');
	}

	onMount(() => {
		orderId = Number(q('order_id') || q('orderId') || 0);
		qrUrl = q('qr') || q('qr_code') || q('code_url');
		payUrl = q('pay_url') || q('url');
		paymentType = q('payment_type') || q('type');
		startCountdown(secondsUntil(q('expires_at') || q('expiresAt')));
		if (orderId) {
			pollTimer = setInterval(() => void pollStatus(), 3_000);
		}
		void renderQR();
	});

	onDestroy(cleanup);
</script>

<svelte:head>
	<title>{$_('payment.qr.scanToPay', { default: 'Scan to Pay' })} · sub2api</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col items-center space-y-6 py-8" data-testid="payment-qrcode-page">
	<h1 class="text-center text-xl font-semibold text-foreground">
		{qrUrl ? scanTitle : $_('payment.qr.payInNewWindow', { default: 'Complete Payment in New Window' })}
	</h1>

	{#if qrUrl}
		<div class="rounded-lg border border-border bg-card p-6" data-testid="payment-qrcode-canvas-wrap">
			<canvas bind:this={canvas} class="mx-auto" data-testid="payment-qrcode-canvas"></canvas>
		</div>
	{:else}
		<div class="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-border bg-card text-muted-foreground" data-testid="payment-qrcode-fallback">
			<QrCode class="h-12 w-12" />
		</div>
	{/if}

	{#if qrUrl && !expired && scanHint}
		<p class="text-center text-sm text-muted-foreground">{scanHint}</p>
	{/if}

	{#if expired}
		<div class="text-center" data-testid="payment-qrcode-expired">
			<XCircle class="mx-auto h-8 w-8 text-destructive" />
			<p class="mt-2 text-lg font-medium text-destructive">
				{$_('payment.qr.expired', { default: 'Order Expired' })}
			</p>
			<Button class="mt-4" onclick={goPurchase}>
				{$_('payment.result.backToRecharge', { default: 'Back to Recharge' })}
			</Button>
		</div>
	{:else}
		<div class="text-center">
			<p class="text-sm text-muted-foreground">
				{qrUrl
					? $_('payment.qr.expiresIn', { default: 'Expires in' })
					: $_('payment.qr.payInNewWindowHint', {
							default:
								'The payment page has opened in a new window. Please complete the payment there and return to this page.'
						})}
			</p>
			<p class="mt-1 text-2xl font-bold tabular-nums text-foreground">{displayCountdown}</p>
			<p class="mt-2 text-sm text-muted-foreground">
				{$_('payment.qr.waitingPayment', { default: 'Waiting for payment...' })}
			</p>
		</div>
	{/if}

	{#if payUrl && !qrUrl && !expired}
		<Button href={payUrl} target="_blank" rel="noopener noreferrer" class="w-full gap-2" data-testid="payment-qrcode-open-window">
			<ExternalLink class="h-4 w-4" />
			{$_('payment.qr.openPayWindow', { default: 'Reopen Payment Page' })}
		</Button>
	{/if}

	{#if !expired && orderId}
		<Button variant="outline" class="w-full gap-2" disabled={cancelling} onclick={handleCancel} data-testid="payment-qrcode-cancel">
			{#if cancelling}
				<Loader2 class="h-4 w-4 animate-spin" />
				{$_('common.processing', { default: 'Processing' })}
			{:else}
				{$_('payment.qr.cancelOrder', { default: 'Cancel Order' })}
			{/if}
		</Button>
	{/if}
</section>
