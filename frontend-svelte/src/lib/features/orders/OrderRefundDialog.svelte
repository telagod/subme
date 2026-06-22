<script lang="ts">
	/**
	 * OrderRefundDialog · 管理员订单退款（feature-native）
	 *
	 * 取代旧的「订单退款复用 subscriptions RefundDialog + id-aliasing adapter」桥接：
	 * 订单退款的唯一正确端点是
	 *   POST /api/v1/admin/payment/orders/:id/refund  (PaymentHandler.ProcessRefund)
	 * :id 是订单 id（subscription / topup / balance 订单通用）。本对话框直接绑定
	 * payment.refundOrder，不再经 AdminSubscription 形变，也不再命中不存在的
	 * /admin/subscriptions/:id/refund。
	 *
	 * 表单（对齐 AdminProcessRefundRequest { amount, reason }）：
	 *   - amount input —— 数字必填，> 0；不超过可退余额（pay_amount − actually_refunded）
	 *   - reason textarea —— trim 后 ≥ 4 字符
	 *   - 提交 → refundOrder(order.id, { amount, reason })
	 *
	 * 红线（orders surface）：
	 *   - 不引用计费核心服务、渠道定价端点、价格查询函数。
	 *   - StandardDialog 提供 focus trap + ESC 关闭。
	 *   - 校验失败不调 API；errorAmount / errorReason 在表单内显示。
	 *   - i18n 复用既有 admin.refund.* keys，不新增 key。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { refundOrder } from '$lib/api/admin/payment';
	import type { AdminOrder } from '$lib/api/admin/orders';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	type Props = {
		open: boolean;
		order: AdminOrder | null;
		onRefunded?: (id: number | string) => void;
	};

	let { open = $bindable(false), order, onRefunded }: Props = $props();

	let amountStr = $state('');
	let reason = $state('');
	let submitting = $state(false);
	let errorAmount = $state<string | null>(null);
	let errorReason = $state<string | null>(null);

	// 可退余额：已付金额 − 已退金额。
	const maxAmount = $derived.by<number>(() => {
		if (!order) return Number.POSITIVE_INFINITY;
		const remaining = (order.pay_amount ?? 0) - (order.actually_refunded ?? 0);
		return remaining > 0 ? remaining : 0;
	});

	// 重新打开时按可退余额初始化。
	$effect(() => {
		if (open && order) {
			amountStr = maxAmount > 0 && Number.isFinite(maxAmount) ? maxAmount.toFixed(2) : '';
			reason = '';
			errorAmount = null;
			errorReason = null;
		}
	});

	function validate(): boolean {
		errorAmount = null;
		errorReason = null;
		const amt = parseFloat(amountStr);
		if (!Number.isFinite(amt) || amt <= 0) {
			errorAmount = $_('admin.refund.errorAmountInvalid', {
				default: '金额必须大于 0'
			});
			return false;
		}
		if (Number.isFinite(maxAmount) && amt > maxAmount) {
			errorAmount = $_('admin.refund.errorAmountExceeds', {
				default: '金额超过可退余额',
				values: { max: maxAmount.toFixed(2) }
			});
			return false;
		}
		const trimmed = reason.trim();
		if (trimmed.length < 4) {
			errorReason = $_('admin.refund.errorReasonRequired', {
				default: '原因必填（至少 4 个字符）'
			});
			return false;
		}
		return true;
	}

	async function handleSubmit() {
		if (!order || submitting) return;
		if (!validate()) return;
		submitting = true;
		try {
			await refundOrder(order.id, {
				amount: parseFloat(amountStr),
				reason: reason.trim()
			});
			showSuccess($_('admin.refund.success', { default: '退款已发放' }));
			onRefunded?.(order.id);
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refund.error', {
					default: '退款失败：{error}',
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

<StandardDialog
	bind:open
	width="md"
	title={$_('admin.refund.title', { default: '发起退款' })}
	description={$_('admin.refund.description', {
		default: '退款将通过原支付渠道处理。'
	})}
	data-testid="order-refund-dialog"
>
	<div class="mt-4">
		<div class="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
			>
				<AlertTriangle class="h-4 w-4" />
			</div>
			<p class="m-0 text-sm text-amber-700 dark:text-amber-300">
				{$_('admin.refund.warning', {
					default: '在发起退款前请确认金额和原因。'
				})}
			</p>
		</div>

		<div class="mt-4 flex flex-col gap-4">
			<!-- Amount -->
			<div class="flex flex-col gap-1.5">
				<label
					for="order-refund-amount"
					class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{$_('admin.refund.amount', { default: '金额' })}
				</label>
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">$</span>
					<Input
						id="order-refund-amount"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						class="h-9 flex-1 px-2"
						bind:value={amountStr}
						data-testid="order-refund-amount-input"
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
					<p class="m-0 text-xs text-destructive" data-testid="order-refund-amount-error">
						{errorAmount}
					</p>
				{/if}
			</div>

			<!-- Reason -->
			<div class="flex flex-col gap-1.5">
				<label
					for="order-refund-reason"
					class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{$_('admin.refund.reason', { default: '原因' })}
				</label>
				<Textarea
					id="order-refund-reason"
					rows={3}
					maxlength={500}
					class="px-2 py-1.5"
					placeholder={$_('admin.refund.reasonPlaceholder', {
						default: '为什么要发起此退款？'
					})}
					bind:value={reason}
					data-testid="order-refund-reason-input"
					disabled={submitting}
				/>
				{#if errorReason}
					<p class="m-0 text-xs text-destructive" data-testid="order-refund-reason-error">
						{errorReason}
					</p>
				{/if}
			</div>
		</div>

		<div class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
			<Button
				variant="outline"
				data-testid="order-refund-cancel-btn"
				disabled={submitting}
				onclick={handleCancel}
			>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button
				data-testid="order-refund-confirm-btn"
				disabled={submitting || !order}
				onclick={handleSubmit}
			>
				{submitting
					? $_('admin.refund.submitting', { default: '退款中…' })
					: $_('admin.refund.confirm', { default: '退款' })}
			</Button>
		</div>
	</div>
</StandardDialog>
