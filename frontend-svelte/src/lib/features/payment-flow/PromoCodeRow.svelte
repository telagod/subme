<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { showInfo } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		promoCode: string;
		promoApplied: boolean;
		onCodeChange: (code: string) => void;
		onApply: () => void;
		onClear: () => void;
	}

	let {
		promoCode,
		promoApplied,
		onCodeChange,
		onApply,
		onClear
	}: Props = $props();
</script>

<div
	class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3"
	data-testid="purchase-promo"
>
	<label for="promo-code" class="text-sm font-medium text-foreground">
		{$_('user.purchase.promoLabel', { default: '优惠码' })}
	</label>
	<Input
		id="promo-code"
		data-testid="purchase-promo-input"
		type="text"
		autocomplete="off"
		placeholder={$_('user.purchase.promoPlaceholder', { default: '输入代码（可选）' })}
		value={promoCode}
		oninput={(e) => onCodeChange((e.currentTarget as HTMLInputElement).value)}
		disabled={promoApplied}
		class="h-9 min-w-[12rem] flex-1"
	/>
	{#if promoApplied}
		<Button
			variant="outline"
			data-testid="purchase-promo-clear"
			onclick={onClear}
			class="h-9 px-3"
		>
			{$_('user.purchase.promoClear', { default: '清除' })}
		</Button>
	{:else}
		<Button
			data-testid="purchase-promo-apply"
			disabled={!promoCode.trim()}
			onclick={onApply}
			class="h-9 px-3"
		>
			{$_('user.purchase.promoApply', { default: '应用' })}
		</Button>
	{/if}
</div>
