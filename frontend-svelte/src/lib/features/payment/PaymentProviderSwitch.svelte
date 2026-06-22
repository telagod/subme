<script lang="ts">
	/**
	 * PaymentProviderSwitch · 支付通道切换（bits-ui RadioGroup 形态）
	 *
	 * 设计：
	 *   - 受控组件：父组件用 bind:value 持有 `value`。
	 *   - 候选项由 enabledProviders 控制；未列入的 provider 不渲染。
	 *   - balance 用 Wallet 图标，stripe / airwallex 都用 CreditCard
	 *     （task spec 显式要求），不引入第三方 logo SVG，避免 license / 体积负担。
	 *   - i18n：所有按钮文字走 user.payment.providers.* 键空间。
	 *
	 * 红线（vendor-chunk-tdz-trap）：
	 *   - 不在此组件 import Stripe / Airwallex SDK。SDK 唤起放在
	 *     /payment/* 路由的 onMount 里、走 $lib/payments/*.ts facade。
	 */
	import { CreditCard, Wallet } from '@lucide/svelte';
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';

	export type PaymentProviderKind = 'stripe' | 'airwallex' | 'balance';

	type Props = {
		enabledProviders: PaymentProviderKind[];
		/** 双向绑定值；父组件用 bind:value 持有当前选择。 */
		value: PaymentProviderKind | null;
		disabled?: boolean;
		'aria-label'?: string;
	};

	let {
		enabledProviders,
		value = $bindable(null),
		disabled = false,
		'aria-label': ariaLabel
	}: Props = $props();

	function labelFor(p: PaymentProviderKind): string {
		switch (p) {
			case 'stripe':
				return $_('user.payment.providers.stripe', { default: 'Stripe' });
			case 'airwallex':
				return $_('user.payment.providers.airwallex', { default: 'Airwallex' });
			case 'balance':
				return $_('user.payment.providers.balance', { default: '账户余额' });
		}
	}

	function descriptionFor(p: PaymentProviderKind): string {
		switch (p) {
			case 'stripe':
				return $_('user.payment.providers.stripeHint', {
					default: 'Stripe 银行卡 / 支付宝 / 微信'
				});
			case 'airwallex':
				return $_('user.payment.providers.airwallexHint', {
					default: 'Airwallex 银行卡支付'
				});
			case 'balance':
				return $_('user.payment.providers.balanceHint', {
					default: '使用账户余额支付'
				});
		}
	}

	function iconFor(p: PaymentProviderKind) {
		return p === 'balance' ? Wallet : CreditCard;
	}

	function select(p: PaymentProviderKind) {
		if (disabled) return;
		value = p;
	}
</script>

<div
	role="radiogroup"
	aria-label={ariaLabel ?? $_('user.payment.providers.groupLabel', { default: '支付供应商' })}
	data-testid="payment-provider-switch"
	class="space-y-2"
>
	{#each enabledProviders as p (p)}
		{@const Icon = iconFor(p)}
		<Button
			variant="outline"
			role="radio"
			aria-checked={value === p}
			data-testid="payment-provider-{p}"
			data-active={value === p}
			disabled={disabled}
			onclick={() => select(p)}
			class="h-auto w-full items-start justify-start px-4 py-3 text-left data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/30 data-[active=false]:border-border"
		>
			<span
				class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<Icon class="h-4 w-4" />
			</span>
			<span class="flex-1 space-y-0.5">
				<span class="block text-sm font-medium text-foreground">{labelFor(p)}</span>
				<span class="block text-xs text-muted-foreground">{descriptionFor(p)}</span>
			</span>
		</Button>
	{/each}
</div>
