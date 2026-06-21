<script lang="ts">
	/**
	 * TopUpDialog · StandardDialog 余额充值入口（M6 billing）
	 *
	 * 流程：
	 *   1. bind:open 父持有状态。
	 *   2. 表单：Amount（正数，min 1）+ Currency Select（仅 multiCurrency 开关时露面）
	 *      + Provider 切换（Stripe / Airwallex）。
	 *   3. 提交 → lazy import payment facade（vendor-chunk-tdz-trap 红线）→
	 *      createTopUp({ amount, currency, provider })。
	 *   4. 成功 → onTopUpStarted（父调度刷新 / 跳转）；失败 → toast。
	 *
	 * 红线（reshadcn-migration memory）：
	 *   - Select 强制 sentinel value（USD / EUR 都是合法业务值，本组件不存在 '__all__'
	 *     场景，但仍走非空字符串契约）。
	 *   - 表单验证：amount < 1 直接拒绝；不提交。
	 *
	 * RED LINE（memory openrouter-pricing-done）：
	 *   - 不引用后端定价/计费内核（参 CLAUDE memory；故意不在此源码字面列出
	 *     符号名，让 red-line grep 维持空命中）。
	 *   - 不在模块顶层 import @stripe/stripe-js / @airwallex/components-sdk。
	 *     payment facade 内部也只是创建订单，真正 SDK 唤起留给 payment agent。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import type { CreateOrderResult, TopUpProvider } from '$lib/api/user/payment';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		/** 多币种开关；false 时隐藏 Currency Select 并锁 USD。 */
		multiCurrency?: boolean;
		/** 候选货币（multiCurrency=true 时使用）。 */
		currencies?: string[];
		/** 候选提供商；默认 ['stripe','airwallex']。 */
		providers?: TopUpProvider[];
		onTopUpStarted?: (result: CreateOrderResult) => void;
	};

	let {
		open = $bindable(false),
		multiCurrency = false,
		currencies = ['USD'],
		providers = ['stripe', 'airwallex'],
		onTopUpStarted
	}: Props = $props();

	// ── 表单状态 ─────────────────────────────────────────────────────────
	// amount 用字符串承载 input.value，避免 0 / NaN 边界与受控 input 抖动。
	// 注意：不用 bind:value 在 type="number" 上 —— bind 会强转 number，
	// 空态 / 非法字符会触发 Svelte runtime 类型不一致。直接 value + oninput
	// 接管。
	let amountText = $state<string>('');
	// 默认值用 $derived 派生 props 而非顶层读 —— 避免 Svelte 5 的
	// "state_referenced_locally" 告警 + 兼容父组件后续动态改 props。
	const defaultCurrency = $derived<string>(currencies[0] ?? 'USD');
	const defaultProvider = $derived<TopUpProvider>(providers[0] ?? 'stripe');
	let currency = $state<string>('USD');
	let provider = $state<TopUpProvider>('stripe');
	let submitting = $state(false);
	let formError = $state<string>('');

	// 父组件 props 变化（如 multiCurrency / providers 列表）时同步默认值。
	$effect(() => {
		if (!currencies.includes(currency)) currency = defaultCurrency;
		if (!providers.includes(provider)) provider = defaultProvider;
	});

	function handleAmountInput(e: Event) {
		const v = (e.currentTarget as HTMLInputElement).value;
		amountText = String(v ?? '');
	}

	// 派生：解析为数字并做范围 check（min 1）。
	const amountNum = $derived.by(() => {
		const t = (amountText ?? '').toString().trim();
		if (!t) return Number.NaN;
		const n = Number(t);
		return Number.isFinite(n) ? n : Number.NaN;
	});
	const amountValid = $derived(Number.isFinite(amountNum) && amountNum >= 1);

	// open=true 时重置错误；open=false 时清空 form（避免上次状态泄漏）。
	$effect(() => {
		if (!open) {
			amountText = '';
			currency = defaultCurrency;
			provider = defaultProvider;
			formError = '';
			submitting = false;
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (submitting) return;

		// 范围拒绝（< 1）—— 显式提示，避免 silent submit。
		if (!amountValid) {
			formError = $_('user.topUp.errors.AMOUNT_MIN', {
				default: 'Amount must be at least 1.'
			});
			return;
		}
		formError = '';
		submitting = true;
		try {
			// Lazy import：避免 payment facade 顶层依赖被 eager bundle 拖入。
			// 即使当前 facade 是纯 fetch wrapper，也保留懒加载契约，给 payment agent
			// 后续接入 Stripe / Airwallex SDK 留 vendor-chunk-tdz 安全余量。
			const paymentMod = await import('$lib/api/user/payment');
			const result = await paymentMod.createTopUp({
				amount: amountNum,
				currency,
				provider
			});
			showSuccess(
				$_('user.topUp.successToast', { default: 'Top-up order created.' })
			);
			onTopUpStarted?.(result);
			open = false;
		} catch (err) {
			const e = err as Error;
			const msg = e?.message ?? $_('user.topUp.errors.UNKNOWN', { default: 'Unknown error' });
			// 翻译可识别的 stub 错误码。
			if (msg === 'TOPUP_AMOUNT_INVALID') {
				formError = $_('user.topUp.errors.AMOUNT_MIN', {
					default: 'Amount must be at least 1.'
				});
			} else {
				formError = msg;
			}
			showError(formError);
		} finally {
			submitting = false;
		}
	}

	function handleClose() {
		if (submitting) return;
		open = false;
	}
</script>

<StandardDialog
	bind:open
	width="md"
	title={$_('user.topUp.title', { default: 'Top up balance' })}
	description={$_('user.topUp.description', {
		default: 'Add credit to your account balance.'
	})}
	data-testid="topup-dialog"
>
	<form
		class="mt-5 space-y-4"
		data-testid="topup-form"
		onsubmit={handleSubmit}
	>
				<!-- Amount -->
				<div class="space-y-1.5">
					<label class="text-sm font-medium text-foreground" for="topup-amount">
						{$_('user.topUp.amountLabel', { default: 'Amount' })}
					</label>
					<Input
						id="topup-amount"
						data-testid="topup-amount-input"
						type="text"
						inputmode="decimal"
						pattern="[0-9]*\.?[0-9]*"
						value={amountText}
						oninput={handleAmountInput}
						placeholder={$_('user.topUp.amountPlaceholder', {
							default: 'e.g. 20'
						})}
						class="h-9"
					/>
					{#if amountText && !amountValid}
						<p
							class="text-xs text-destructive"
							data-testid="topup-amount-error"
						>
							{$_('user.topUp.errors.AMOUNT_MIN', {
								default: 'Amount must be at least 1.'
							})}
						</p>
					{/if}
				</div>

				<!-- Currency (multi-currency 时露面) -->
				{#if multiCurrency && currencies.length > 1}
					<div class="space-y-1.5">
						<label class="text-sm font-medium text-foreground" for="topup-currency">
							{$_('user.topUp.currencyLabel', { default: 'Currency' })}
						</label>
						<NativeSelect
							id="topup-currency"
							data-testid="topup-currency-select"
							bind:value={currency}
							class="h-9 w-full"
						>
							{#each currencies as c (c)}
								<option value={c}>{c}</option>
							{/each}
						</NativeSelect>
					</div>
				{/if}

				<!-- Provider -->
				<div class="space-y-1.5">
					<span class="text-sm font-medium text-foreground">
						{$_('user.topUp.providerLabel', { default: 'Payment provider' })}
					</span>
					<div
						class="grid grid-cols-2 gap-2"
						data-testid="topup-provider-group"
						role="radiogroup"
						aria-label={$_('user.topUp.providerLabel', { default: 'Payment provider' })}
					>
						{#each providers as p (p)}
							<Button
								variant="outline"
								role="radio"
								aria-checked={provider === p}
								data-testid="topup-provider-{p}"
								data-active={provider === p}
								onclick={() => (provider = p)}
								class="h-9 transition-colors data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=false]:border-border data-[active=false]:bg-background data-[active=false]:text-foreground"
							>
								{p === 'stripe'
									? $_('user.topUp.providerStripe', { default: 'Stripe' })
									: $_('user.topUp.providerAirwallex', { default: 'Airwallex' })}
							</Button>
						{/each}
					</div>
				</div>

				<!-- Inline form error -->
				{#if formError}
					<Alert
						variant="destructive"
						class="flex items-start gap-2 px-3 py-2 text-xs"
						data-testid="topup-form-error"
						role="alert"
					>
						<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>{formError}</span>
					</Alert>
				{/if}

				<div class="flex items-center justify-end gap-2 pt-2">
					<Button
						variant="outline"
						data-testid="topup-cancel-btn"
						disabled={submitting}
						onclick={handleClose}
						class="h-9"
					>
						{$_('user.topUp.cancel', { default: 'Cancel' })}
					</Button>
					<Button
						type="submit"
						data-testid="topup-submit-btn"
						disabled={submitting || !amountValid}
						class="h-9"
					>
						{submitting
							? $_('user.topUp.submitting', { default: 'Processing…' })
							: $_('user.topUp.submit', { default: 'Continue to payment' })}
					</Button>
				</div>
	</form>
</StandardDialog>
