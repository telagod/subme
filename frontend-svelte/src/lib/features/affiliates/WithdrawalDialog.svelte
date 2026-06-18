<script lang="ts">
	/**
	 * WithdrawalDialog · bits-ui Dialog 申请提现入口
	 *
	 * 流程：
	 *   1. bind:open 父持有状态；availableRebate / minAmount 父注入。
	 *   2. 表单：
	 *        - Amount（正数；min = minAmount（后端规则），max = availableRebate）
	 *        - Destination Select（paypal / alipay / wxpay / bank；'__all__' 不
	 *          适用——destination 永远有具体业务值，沿用 reshadcn-migration 红线）
	 *        - Destination-specific 明细字段
	 *            paypal → email
	 *            alipay → account
	 *            wxpay  → openid
	 *            bank   → name, bankName, account
	 *   3. 提交 → POST /api/v1/user/aff/withdraw → toast + close + onWithdrawalCreated。
	 *   4. 失败 → inline + toast；amount > available 客户端直接拒绝。
	 *
	 * RED LINE：
	 *   - Select 必须 sentinel value；本组件 destination 是真实业务值，无需 '__all__'。
	 *   - 不顶层 import payment SDK / qrcode；本对话框不触发 SDK。
	 *   - 不在 vendor-chunk 红线集合内；不需要 dynamic import。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { Banknote, AlertTriangle } from '@lucide/svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		requestWithdrawal,
		type WithdrawalDestination,
		type WithdrawalResponse
	} from '$lib/api/user/affiliates';

	type Props = {
		open: boolean;
		/** 可用返利余额（上限）。 */
		availableRebate: number;
		/** 后端规定的最小提现额（默认 10）。 */
		minAmount?: number;
		/** 货币标签（仅用于显示，本端口锁 USD）。 */
		currency?: string;
		onWithdrawalCreated?: (resp: WithdrawalResponse) => void;
	};

	let {
		open = $bindable(false),
		availableRebate,
		minAmount = 10,
		currency = 'USD',
		onWithdrawalCreated
	}: Props = $props();

	// ── 表单状态 ─────────────────────────────────────────────────────────
	// amount 用字符串承载 input.value，避免 number-input 受控边界。
	let amountText = $state<string>('');
	let destination = $state<WithdrawalDestination>('paypal');
	let detailPaypalEmail = $state<string>('');
	let detailAlipayAccount = $state<string>('');
	let detailWxOpenid = $state<string>('');
	let detailBankName = $state<string>('');
	let detailBankBank = $state<string>('');
	let detailBankAccount = $state<string>('');
	let submitting = $state(false);
	let formError = $state<string>('');

	const amountNum = $derived.by(() => {
		const t = (amountText ?? '').toString().trim();
		if (!t) return Number.NaN;
		const n = Number(t);
		return Number.isFinite(n) ? n : Number.NaN;
	});

	const amountValid = $derived(
		Number.isFinite(amountNum) && amountNum >= minAmount && amountNum <= availableRebate
	);

	const detailsValid = $derived.by(() => {
		switch (destination) {
			case 'paypal':
				return /\S+@\S+\.\S+/.test(detailPaypalEmail.trim());
			case 'alipay':
				return detailAlipayAccount.trim().length > 0;
			case 'wxpay':
				return detailWxOpenid.trim().length > 0;
			case 'bank':
				return (
					detailBankName.trim().length > 0 &&
					detailBankBank.trim().length > 0 &&
					detailBankAccount.trim().length > 0
				);
			default:
				return false;
		}
	});

	const formValid = $derived(amountValid && detailsValid);

	// open=false 时清空 form（避免上次状态泄漏）。
	$effect(() => {
		if (!open) {
			amountText = '';
			destination = 'paypal';
			detailPaypalEmail = '';
			detailAlipayAccount = '';
			detailWxOpenid = '';
			detailBankName = '';
			detailBankBank = '';
			detailBankAccount = '';
			formError = '';
			submitting = false;
		}
	});

	function handleAmountInput(e: Event) {
		amountText = String((e.currentTarget as HTMLInputElement).value ?? '');
	}

	function handleDestinationChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		// 严守 sentinel 契约：destination 必有具体值。
		if (v === 'paypal' || v === 'alipay' || v === 'wxpay' || v === 'bank') {
			destination = v;
		}
	}

	function collectDetails(): Record<string, string> {
		switch (destination) {
			case 'paypal':
				return { email: detailPaypalEmail.trim() };
			case 'alipay':
				return { account: detailAlipayAccount.trim() };
			case 'wxpay':
				return { openid: detailWxOpenid.trim() };
			case 'bank':
				return {
					name: detailBankName.trim(),
					bank: detailBankBank.trim(),
					account: detailBankAccount.trim()
				};
		}
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (submitting) return;

		if (!Number.isFinite(amountNum)) {
			formError = $_('user.withdrawal.errors.AMOUNT_REQUIRED', {
				default: 'Amount is required.'
			});
			return;
		}
		if (amountNum < minAmount) {
			formError = $_('user.withdrawal.errors.AMOUNT_MIN', {
				default: 'Amount must be at least {min}.',
				values: { min: minAmount }
			});
			return;
		}
		if (amountNum > availableRebate) {
			formError = $_('user.withdrawal.errors.AMOUNT_MAX', {
				default: 'Amount cannot exceed available rebate ({max}).',
				values: { max: availableRebate.toFixed(2) }
			});
			return;
		}
		if (!detailsValid) {
			formError = $_('user.withdrawal.errors.DETAILS_REQUIRED', {
				default: 'Please fill in the destination details.'
			});
			return;
		}

		formError = '';
		submitting = true;
		try {
			const resp = await requestWithdrawal({
				amount: amountNum,
				destination,
				details: collectDetails()
			});
			showSuccess(
				$_('user.withdrawal.success', { default: 'Withdrawal request submitted.' })
			);
			onWithdrawalCreated?.(resp);
			open = false;
		} catch (err) {
			const e = err as Error;
			const msg = e?.message ?? $_('user.withdrawal.errors.UNKNOWN', { default: 'Unknown error' });
			if (msg === 'unauthorized') {
				// apiClient 已统一 401 钩子；这里不再二次提示。
				return;
			}
			formError = msg;
			showError(msg);
		} finally {
			submitting = false;
		}
	}

	function handleClose() {
		if (submitting) return;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="withdrawal-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<Banknote class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{$_('user.withdrawal.title', { default: 'Request withdrawal' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('user.withdrawal.description', {
							default: 'Withdraw your available rebate to a payout destination.'
						})}
					</Dialog.Description>
				</div>
			</div>

			<form
				class="mt-5 space-y-4"
				data-testid="withdrawal-form"
				onsubmit={handleSubmit}
			>
				<!-- Available hint -->
				<div
					class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
					data-testid="withdrawal-available"
				>
					<span class="text-muted-foreground">
						{$_('user.withdrawal.availableLabel', { default: 'Available rebate' })}
					</span>
					<span class="font-medium tabular-nums text-foreground">
						${availableRebate.toFixed(2)} {currency}
					</span>
				</div>

				<!-- Amount -->
				<div class="space-y-1.5">
					<label class="text-sm font-medium text-foreground" for="wd-amount">
						{$_('user.withdrawal.amountLabel', { default: 'Amount' })}
					</label>
					<input
						id="wd-amount"
						data-testid="withdrawal-amount-input"
						type="text"
						inputmode="decimal"
						pattern="[0-9]*\.?[0-9]*"
						value={amountText}
						oninput={handleAmountInput}
						placeholder={$_('user.withdrawal.amountPlaceholder', {
							default: 'e.g. 50'
						})}
						class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					{#if amountText && !amountValid}
						<p
							class="text-xs text-destructive"
							data-testid="withdrawal-amount-error"
						>
							{#if Number.isFinite(amountNum) && amountNum > availableRebate}
								{$_('user.withdrawal.errors.AMOUNT_MAX', {
									default: 'Amount cannot exceed available rebate ({max}).',
									values: { max: availableRebate.toFixed(2) }
								})}
							{:else}
								{$_('user.withdrawal.errors.AMOUNT_MIN', {
									default: 'Amount must be at least {min}.',
									values: { min: minAmount }
								})}
							{/if}
						</p>
					{/if}
				</div>

				<!-- Destination Select -->
				<div class="space-y-1.5">
					<label class="text-sm font-medium text-foreground" for="wd-destination">
						{$_('user.withdrawal.destinationLabel', { default: 'Destination' })}
					</label>
					<select
						id="wd-destination"
						data-testid="withdrawal-destination-select"
						value={destination}
						onchange={handleDestinationChange}
						class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<option value="paypal">
							{$_('user.withdrawal.destinations.paypal', { default: 'PayPal' })}
						</option>
						<option value="alipay">
							{$_('user.withdrawal.destinations.alipay', { default: 'Alipay' })}
						</option>
						<option value="wxpay">
							{$_('user.withdrawal.destinations.wxpay', { default: 'WeChat Pay' })}
						</option>
						<option value="bank">
							{$_('user.withdrawal.destinations.bank', { default: 'Bank transfer' })}
						</option>
					</select>
				</div>

				<!-- Destination-specific details -->
				<div class="space-y-1.5" data-testid="withdrawal-details">
					{#if destination === 'paypal'}
						<label class="text-sm font-medium text-foreground" for="wd-paypal-email">
							{$_('user.withdrawal.details.paypalEmail', { default: 'PayPal email' })}
						</label>
						<input
							id="wd-paypal-email"
							data-testid="withdrawal-detail-paypal-email"
							type="email"
							bind:value={detailPaypalEmail}
							placeholder="name@example.com"
							class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					{:else if destination === 'alipay'}
						<label class="text-sm font-medium text-foreground" for="wd-alipay-account">
							{$_('user.withdrawal.details.alipayAccount', { default: 'Alipay account' })}
						</label>
						<input
							id="wd-alipay-account"
							data-testid="withdrawal-detail-alipay-account"
							type="text"
							bind:value={detailAlipayAccount}
							class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					{:else if destination === 'wxpay'}
						<label class="text-sm font-medium text-foreground" for="wd-wx-openid">
							{$_('user.withdrawal.details.wxpayOpenid', { default: 'WeChat OpenID' })}
						</label>
						<input
							id="wd-wx-openid"
							data-testid="withdrawal-detail-wx-openid"
							type="text"
							bind:value={detailWxOpenid}
							class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					{:else if destination === 'bank'}
						<div class="space-y-3">
							<div class="space-y-1.5">
								<label class="text-sm font-medium text-foreground" for="wd-bank-name">
									{$_('user.withdrawal.details.bankAccountName', {
										default: 'Account holder name'
									})}
								</label>
								<input
									id="wd-bank-name"
									data-testid="withdrawal-detail-bank-name"
									type="text"
									bind:value={detailBankName}
									class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								/>
							</div>
							<div class="space-y-1.5">
								<label class="text-sm font-medium text-foreground" for="wd-bank-bank">
									{$_('user.withdrawal.details.bankName', { default: 'Bank name' })}
								</label>
								<input
									id="wd-bank-bank"
									data-testid="withdrawal-detail-bank-bank"
									type="text"
									bind:value={detailBankBank}
									class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								/>
							</div>
							<div class="space-y-1.5">
								<label class="text-sm font-medium text-foreground" for="wd-bank-account">
									{$_('user.withdrawal.details.bankAccount', { default: 'Account number' })}
								</label>
								<input
									id="wd-bank-account"
									data-testid="withdrawal-detail-bank-account"
									type="text"
									bind:value={detailBankAccount}
									class="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								/>
							</div>
						</div>
					{/if}
				</div>

				<!-- Inline form error -->
				{#if formError}
					<div
						class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
						data-testid="withdrawal-form-error"
						role="alert"
					>
						<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>{formError}</span>
					</div>
				{/if}

				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						data-testid="withdrawal-cancel-btn"
						disabled={submitting}
						onclick={handleClose}
						class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
					>
						{$_('user.withdrawal.cancel', { default: 'Cancel' })}
					</button>
					<button
						type="submit"
						data-testid="withdrawal-submit-btn"
						disabled={submitting || !formValid}
						class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{submitting
							? $_('user.withdrawal.submitting', { default: 'Submitting…' })
							: $_('user.withdrawal.submit', { default: 'Request withdrawal' })}
					</button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
