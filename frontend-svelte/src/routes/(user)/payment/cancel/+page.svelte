<script lang="ts">
	/**
	 * /(user)/payment/cancel · Stripe / Airwallex 取消返回页
	 *
	 * 简单告知用户支付已取消 + 提供回 /billing / /purchase 的入口。
	 * 不轮询 / 不调任何后端：取消本身在 provider 那边已经收尾。
	 *
	 * RED LINE：
	 *   - 不在此页 import 任何支付 SDK。
	 */
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { XCircle } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';

	function goBilling() {
		void goto('/billing');
	}

	function goPurchase() {
		void goto('/purchase');
	}
</script>

<svelte:head>
	<title>
		{$_('user.payment.cancel.pageTitle', { default: '支付已取消' })} · sub2api
	</title>
</svelte:head>

<section class="mx-auto max-w-xl space-y-6 py-12" data-testid="payment-cancel-page">
	<div class="rounded-lg border border-border bg-card p-8 text-center">
		<div
			class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			<XCircle class="h-6 w-6" />
		</div>
		<h1 class="mt-4 text-lg font-semibold text-foreground">
			{$_('user.payment.cancel.title', { default: '支付已取消' })}
		</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			{$_('user.payment.cancel.description', {
				default: '您已取消支付，未产生任何费用。'
			})}
		</p>
		<div class="mt-6 flex items-center justify-center gap-2">
			<Button
				data-testid="payment-cancel-back-billing"
				onclick={goBilling}
				class="h-9"
			>
				{$_('user.payment.cancel.backToBilling', { default: '返回计费' })}
			</Button>
			<Button
				variant="outline"
				data-testid="payment-cancel-back-purchase"
				onclick={goPurchase}
				class="h-9"
			>
				{$_('user.payment.cancel.backToPurchase', { default: '返回购买' })}
			</Button>
		</div>
	</div>
</section>
