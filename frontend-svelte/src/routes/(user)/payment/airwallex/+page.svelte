<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, Loader2 } from '@lucide/svelte';
	import { getAirwallex } from '$lib/payments/airwallex';
	import {
		PAYMENT_RECOVERY_STORAGE_KEY,
		readPaymentRecoverySnapshot,
		successUrlFromSnapshot,
		type PaymentRecoverySnapshot
	} from '$lib/features/payment-flow/payment-flow';
	import Button from '$lib/ui/Button.svelte';

	let loading = $state(true);
	let errorMessage = $state('');

	function q(key: string): string {
		try {
			return page?.url?.searchParams.get(key) ?? '';
		} catch {
			return '';
		}
	}

	function restoreSnapshot(): PaymentRecoverySnapshot | null {
		if (typeof window === 'undefined') return null;
		const orderId = Number(q('order_id')) || 0;
		const outTradeNo = q('out_trade_no');
		const resumeToken = q('resume_token');
		const snapshot = readPaymentRecoverySnapshot(
			window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
			resumeToken ? { resumeToken } : {}
		);
		if (!snapshot || snapshot.paymentType !== 'airwallex') return null;
		if (orderId > 0 && snapshot.orderId !== orderId) return null;
		if (outTradeNo && snapshot.outTradeNo !== outTradeNo) return null;
		if (!snapshot.intentId || !snapshot.clientSecret) return null;
		return snapshot;
	}

	function goPurchase() {
		void goto('/purchase');
	}

	onMount(async () => {
		const snapshot = restoreSnapshot();
		if (!snapshot) {
			loading = false;
			errorMessage = $_('payment.airwallexMissingParams', { default: 'Missing Airwallex payment parameters' });
			return;
		}
		try {
			const env = snapshot.paymentEnv === 'prod' ? 'prod' : 'demo';
			const airwallex = await getAirwallex(env);
			loading = false;
			const redirect = airwallex.redirectToCheckout({
				intent_id: snapshot.intentId,
				client_secret: snapshot.clientSecret,
				currency: snapshot.currency || 'CNY',
				country_code: snapshot.countryCode || 'CN',
				successUrl: successUrlFromSnapshot(snapshot, window.location.origin)
			});
			if (typeof redirect === 'string' && redirect) {
				window.location.assign(redirect);
			}
		} catch (err) {
			loading = false;
			errorMessage =
				(err as Error)?.message ||
				$_('payment.airwallexLoadFailed', {
					default: 'Failed to load Airwallex payment component. Please refresh and try again.'
				});
		}
	});
</script>

<svelte:head>
	<title>{$_('payment.airwallexPay', { default: 'Airwallex Payment' })} · sub2api</title>
</svelte:head>

<section class="mx-auto max-w-lg space-y-6 py-8" data-testid="payment-airwallex-page">
	{#if loading}
		<div class="flex items-center justify-center rounded-lg border border-border bg-card py-20" data-testid="payment-airwallex-loading">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if errorMessage}
		<div class="rounded-lg border border-border bg-card p-8 text-center" data-testid="payment-airwallex-error">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
				<AlertTriangle class="h-8 w-8" />
			</div>
			<h1 class="text-lg font-semibold text-foreground">
				{$_('payment.airwallexLoadFailed', { default: 'Failed to load Airwallex payment component. Please refresh and try again.' })}
			</h1>
			<p class="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
			<Button class="mt-6" onclick={goPurchase}>
				{$_('payment.result.backToRecharge', { default: 'Back to Recharge' })}
			</Button>
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-card p-6" data-testid="payment-airwallex-redirecting">
			<div class="flex flex-col items-center space-y-4 py-4">
				<Loader2 class="h-10 w-10 animate-spin text-primary" />
				<p class="text-sm text-muted-foreground">{$_('payment.qr.payInNewWindowHint', { default: 'The payment page has opened in a new window. Please complete the payment there and return to this page.' })}</p>
			</div>
		</div>
	{/if}
</section>
