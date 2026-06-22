<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { CreditCard, Wallet } from '@lucide/svelte';
	import type { Plan } from '$lib/api/user/subscriptions';
	import type { PaymentMethod } from '$lib/api/user/payment';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	interface Props {
		open: boolean;
		selectedPlan: Plan | null;
		selectedProvider: string | null;
		checkoutSubmitting: boolean;
		availableProviders: PaymentMethod[];
		onProviderSelect: (kind: string) => void;
		onCheckout: () => void;
		onClose: () => void;
	}

	let {
		open,
		selectedPlan,
		selectedProvider,
		checkoutSubmitting,
		availableProviders,
		onProviderSelect,
		onCheckout,
		onClose
	}: Props = $props();

	function providerIcon(kind: string) {
		return kind === 'balance' ? Wallet : CreditCard;
	}

	function providerLabel(kind: string): string {
		switch (kind) {
			case 'stripe':
				return $_('user.purchase.providerStripe', { default: 'Stripe（银行卡 / 支付宝 / 微信）' });
			case 'airwallex':
				return $_('user.purchase.providerAirwallex', { default: 'Airwallex' });
			case 'balance':
				return $_('user.purchase.providerBalance', { default: '余额支付' });
			default:
				return kind;
		}
	}
</script>

<StandardDialog
	open={open && Boolean(selectedPlan)}
	width="sm"
	title={$_('user.purchase.providerTitle', { default: '选择支付方式' })}
	data-testid="purchase-provider-panel"
>
	{#if selectedPlan}
		<p class="mt-2 text-xs text-muted-foreground" data-testid="purchase-provider-plan">
			{selectedPlan.name} · ${selectedPlan.price.toFixed(2)}
		</p>

		<div
			class="mt-5 space-y-2"
			role="radiogroup"
			aria-label={$_('user.purchase.providerTitle', { default: '选择支付方式' })}
		>
			{#each availableProviders as provider (provider.id)}
				{@const Icon = providerIcon(provider.kind)}
				<Button
					variant="outline"
					role="radio"
					aria-checked={selectedProvider === provider.kind}
					data-testid="provider-{provider.kind}"
					onclick={() => onProviderSelect(provider.kind)}
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
					{$_('user.purchase.noPaymentMethods', { default: '暂无可用支付方式。' })}
				</p>
			{/if}
		</div>

		<div class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
			<Button
				variant="outline"
				data-testid="purchase-provider-cancel"
				disabled={checkoutSubmitting}
				onclick={onClose}
				class="h-9"
			>
				{$_('user.purchase.cancel', { default: '取消' })}
			</Button>
			<Button
				data-testid="purchase-provider-confirm"
				disabled={!selectedProvider || checkoutSubmitting}
				onclick={onCheckout}
				class="h-9"
			>
				{checkoutSubmitting
					? $_('user.purchase.processing', { default: '处理中...' })
					: $_('user.purchase.continueToPayment', { default: '继续支付' })}
			</Button>
		</div>
	{/if}
</StandardDialog>
