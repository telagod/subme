<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, CheckCircle2, Loader2, XCircle } from '@lucide/svelte';
	import {
		getMyOrder,
		resolvePublicOrderByResumeToken,
		verifyPublicOrderByOutTradeNo,
		type UserPaymentOrder
	} from '$lib/api/user/payment';
	import {
		baseAmount,
		feeAmount,
		formatGatewayAmount,
		paymentMethodLabel,
		paymentPhase
	} from '$lib/features/payment-flow/payment-flow';
	import Button from '$lib/ui/Button.svelte';

	const STATUS_REFRESH_INTERVAL_MS = 2_000;
	const STATUS_REFRESH_MAX_ATTEMPTS = 15;

	type ReturnInfo = {
		outTradeNo: string;
		money: string;
		type: string;
		tradeStatus: string;
	};

	let order = $state<UserPaymentOrder | null>(null);
	let returnInfo = $state<ReturnInfo | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const phase = $derived(order ? paymentPhase(order.status) : paymentPhase(returnInfo?.tradeStatus));
	const currency = $derived(order?.currency ?? 'USD');

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	function readReturnInfo(): ReturnInfo | null {
		const outTradeNo = q('out_trade_no') || q('trade_no') || q('order_no');
		const money = q('money') || q('amount');
		const type = q('type') || q('payment_type');
		const tradeStatus = q('trade_status') || q('status');
		if (!outTradeNo && !money && !type && !tradeStatus) return null;
		return { outTradeNo, money, type, tradeStatus };
	}

	async function resolveOrder(): Promise<UserPaymentOrder | null> {
		const orderId = Number(q('order_id') || q('orderId') || 0);
		if (orderId > 0) {
			try {
				return await getMyOrder(orderId);
			} catch {
				// Third-party callbacks can land without an authenticated session.
			}
		}

		const resumeToken = q('resume_token') || q('session_id');
		if (resumeToken) {
			try {
				return await resolvePublicOrderByResumeToken(resumeToken);
			} catch {
				// Fall through to out_trade_no compatibility path.
			}
		}

		const outTradeNo = q('out_trade_no') || q('trade_no') || q('order_no');
		if (outTradeNo) {
			return verifyPublicOrderByOutTradeNo(outTradeNo);
		}
		return null;
	}

	async function load(): Promise<void> {
		loading = true;
		loadError = null;
		try {
			const next = await resolveOrder();
			order = next;
			returnInfo = next ? null : readReturnInfo();
			if (!next && !returnInfo) {
				loadError = 'MISSING_PAYMENT_REFERENCE';
			}
		} catch (err) {
			loadError = (err as Error)?.message ?? 'PAYMENT_RESULT_LOAD_FAILED';
			returnInfo = readReturnInfo();
		} finally {
			loading = false;
		}
	}

	function scheduleRefresh(): void {
		if (timer) clearTimeout(timer);
		if (phase !== 'pending' || attempts >= STATUS_REFRESH_MAX_ATTEMPTS) return;
		timer = setTimeout(() => {
			attempts += 1;
			void load().then(scheduleRefresh);
		}, STATUS_REFRESH_INTERVAL_MS);
	}

	function goPurchase() {
		void goto('/purchase');
	}

	function goOrders() {
		void goto('/orders');
	}

	onMount(() => {
		void load().then(scheduleRefresh);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		timer = null;
	});
</script>

<svelte:head>
	<title>{$_('payment.result.success', { default: 'Payment result' })} · sub2api</title>
</svelte:head>

<section class="mx-auto max-w-xl space-y-6 py-8" data-testid="payment-result-page">
	{#if loading}
		<div class="flex items-center justify-center rounded-lg border border-border bg-card py-16" data-testid="payment-result-loading">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-card p-8 text-center">
			{#if phase === 'success'}
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
					<CheckCircle2 class="h-8 w-8" />
				</div>
				<h1 class="mt-4 text-xl font-semibold text-foreground">
					{$_('payment.result.success', { default: 'Payment Successful' })}
				</h1>
			{:else if phase === 'pending'}
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
					<Loader2 class="h-8 w-8 animate-spin" />
				</div>
				<h1 class="mt-4 text-xl font-semibold text-foreground">
					{$_('payment.result.processing', { default: 'Payment Processing' })}
				</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					{$_('payment.result.processingHint', {
						default: 'Payment confirmation is still pending. This page will refresh automatically.'
					})}
				</p>
			{:else}
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
					{#if loadError}
						<AlertTriangle class="h-8 w-8" />
					{:else}
						<XCircle class="h-8 w-8" />
					{/if}
				</div>
				<h1 class="mt-4 text-xl font-semibold text-foreground">
					{$_('payment.result.failed', { default: 'Payment Failed' })}
				</h1>
				{#if loadError}
					<p class="mt-2 text-xs text-muted-foreground">{loadError}</p>
				{/if}
			{/if}
		</div>

		{#if order}
			<div class="rounded-lg border border-border bg-card p-5" data-testid="payment-result-order">
				<div class="space-y-3 text-sm">
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.orderId', { default: 'Order ID' })}</span>
						<span class="font-medium text-foreground">#{order.id}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.orderNo', { default: 'Order No.' })}</span>
						<span class="font-medium text-foreground">{order.out_trade_no}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.baseAmount', { default: 'Base Amount' })}</span>
						<span class="font-medium text-foreground">{formatGatewayAmount(baseAmount(order), currency)}</span>
					</div>
					{#if order.fee_rate > 0}
						<div class="flex justify-between gap-4">
							<span class="text-muted-foreground">{$_('payment.orders.fee', { default: 'Fee' })} ({order.fee_rate}%)</span>
							<span class="font-medium text-foreground">{formatGatewayAmount(feeAmount(order), currency)}</span>
						</div>
					{/if}
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.payAmount', { default: 'Paid' })}</span>
						<span class="font-semibold text-primary">{formatGatewayAmount(order.pay_amount, currency)}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.paymentMethod', { default: 'Payment Method' })}</span>
						<span class="font-medium text-foreground">{paymentMethodLabel(order.payment_type)}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-muted-foreground">{$_('payment.orders.status', { default: 'Status' })}</span>
						<span class="font-medium text-foreground">{order.status}</span>
					</div>
				</div>
			</div>
		{:else if returnInfo}
			<div class="rounded-lg border border-border bg-card p-5" data-testid="payment-result-return-info">
				<div class="space-y-3 text-sm">
					{#if returnInfo.outTradeNo}
						<div class="flex justify-between gap-4">
							<span class="text-muted-foreground">{$_('payment.orders.orderNo', { default: 'Order No.' })}</span>
							<span class="font-medium text-foreground">{returnInfo.outTradeNo}</span>
						</div>
					{/if}
					{#if returnInfo.money}
						<div class="flex justify-between gap-4">
							<span class="text-muted-foreground">{$_('payment.orders.payAmount', { default: 'Paid' })}</span>
							<span class="font-medium text-foreground">{formatGatewayAmount(Number(returnInfo.money) || 0)}</span>
						</div>
					{/if}
					{#if returnInfo.type}
						<div class="flex justify-between gap-4">
							<span class="text-muted-foreground">{$_('payment.orders.paymentMethod', { default: 'Payment Method' })}</span>
							<span class="font-medium text-foreground">{paymentMethodLabel(returnInfo.type)}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="flex gap-3">
			<Button variant="outline" class="h-10 flex-1" onclick={goPurchase}>
				{$_('payment.result.backToRecharge', { default: 'Back to Recharge' })}
			</Button>
			<Button class="h-10 flex-1" onclick={goOrders}>
				{$_('payment.result.viewOrders', { default: 'View Orders' })}
			</Button>
		</div>
	{/if}
</section>
