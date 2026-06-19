<script lang="ts">
	/**
	 * RefundDialog · 管理员订阅退款（M22）
	 *
	 * 表单：
	 *   - amount input（默认 remaining_value）—— 数字必填，> 0；不超过 maxAmount
	 *   - reason textarea —— 非空必填，trim 后 ≥ 4 字符
	 *   - notify_user checkbox —— 默认 true
	 *   - 提交 → POST /api/v1/admin/subscriptions/:id/refund
	 *
	 * 红线（subscription surface only）：
	 *   - 严禁引用计费核心服务、渠道定价端点、价格查询函数。
	 *   - bits-ui Dialog 提供 focus trap + ESC 关闭。
	 *   - 校验失败时不调 API；errorAmount / errorReason 在表单内显示。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { refundSub, type AdminSubscription, type RefundPayload } from '$lib/api/admin/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		subscription: AdminSubscription | null;
		onRefunded?: (id: number | string) => void;
	};

	let { open = $bindable(false), subscription, onRefunded }: Props = $props();

	let amountStr = $state('');
	let reason = $state('');
	let notifyUser = $state(true);
	let submitting = $state(false);
	let errorAmount = $state<string | null>(null);
	let errorReason = $state<string | null>(null);

	// 重新打开时按 subscription.remaining_value 初始化。
	$effect(() => {
		if (open && subscription) {
			const remaining = subscription.remaining_value ?? subscription.price_paid ?? 0;
			amountStr = remaining > 0 ? remaining.toFixed(2) : '';
			reason = '';
			notifyUser = true;
			errorAmount = null;
			errorReason = null;
		}
	});

	const maxAmount = $derived(
		subscription?.remaining_value ?? subscription?.price_paid ?? Number.POSITIVE_INFINITY
	);

	function validate(): boolean {
		errorAmount = null;
		errorReason = null;
		const amt = parseFloat(amountStr);
		if (!Number.isFinite(amt) || amt <= 0) {
			errorAmount = $_('admin.refund.errorAmountInvalid', {
				default: 'Amount must be greater than 0'
			});
			return false;
		}
		if (Number.isFinite(maxAmount) && amt > maxAmount) {
			errorAmount = $_('admin.refund.errorAmountExceeds', {
				default: 'Amount exceeds refundable balance',
				values: { max: maxAmount.toFixed(2) }
			});
			return false;
		}
		const trimmed = reason.trim();
		if (trimmed.length < 4) {
			errorReason = $_('admin.refund.errorReasonRequired', {
				default: 'Reason is required (≥ 4 characters)'
			});
			return false;
		}
		return true;
	}

	async function handleSubmit() {
		if (!subscription || submitting) return;
		if (!validate()) return;
		submitting = true;
		try {
			const payload: RefundPayload = {
				amount: parseFloat(amountStr),
				reason: reason.trim(),
				notify_user: notifyUser
			};
			await refundSub(subscription.id, payload);
			showSuccess($_('admin.refund.success', { default: 'Refund issued' }));
			onRefunded?.(subscription.id);
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refund.error', {
					default: 'Refund failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
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
			data-testid="refund-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div class="space-y-1.5">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{$_('admin.refund.title', { default: 'Issue refund' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('admin.refund.description', {
							default: 'Refund will be processed via the original payment channel.'
						})}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-5 flex flex-col gap-4">
				<!-- Amount -->
				<div class="flex flex-col gap-1.5">
					<label
						for="refund-amount"
						class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						{$_('admin.refund.amount', { default: 'Amount' })}
					</label>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground">$</span>
						<input
							id="refund-amount"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							class="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
							bind:value={amountStr}
							data-testid="refund-amount-input"
							disabled={submitting}
						/>
						{#if Number.isFinite(maxAmount)}
							<span class="whitespace-nowrap text-[11px] text-muted-foreground">
								{$_('admin.refund.maxHint', {
									default: 'max ${max}',
									values: { max: maxAmount.toFixed(2) }
								})}
							</span>
						{/if}
					</div>
					{#if errorAmount}
						<p class="m-0 text-xs text-destructive" data-testid="refund-amount-error">
							{errorAmount}
						</p>
					{/if}
				</div>

				<!-- Reason -->
				<div class="flex flex-col gap-1.5">
					<label
						for="refund-reason"
						class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						{$_('admin.refund.reason', { default: 'Reason' })}
					</label>
					<textarea
						id="refund-reason"
						rows="3"
						maxlength="500"
						class="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
						placeholder={$_('admin.refund.reasonPlaceholder', {
							default: 'Why is this refund being issued?'
						})}
						bind:value={reason}
						data-testid="refund-reason-input"
						disabled={submitting}
					></textarea>
					{#if errorReason}
						<p class="m-0 text-xs text-destructive" data-testid="refund-reason-error">
							{errorReason}
						</p>
					{/if}
				</div>

				<!-- Notify -->
				<label class="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						class="h-4 w-4 accent-primary"
						bind:checked={notifyUser}
						data-testid="refund-notify-input"
						disabled={submitting}
					/>
					<span>
						{$_('admin.refund.notifyUser', { default: 'Notify user by email' })}
					</span>
				</label>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="refund-cancel-btn"
					disabled={submitting}
					onclick={handleCancel}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('common.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					data-testid="refund-confirm-btn"
					disabled={submitting || !subscription}
					onclick={handleSubmit}
					class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{submitting
						? $_('admin.refund.submitting', { default: 'Refunding…' })
						: $_('admin.refund.confirm', { default: 'Refund' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
