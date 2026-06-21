<script lang="ts">
	/**
	 * TransferDialog（文件名沿用 WithdrawalDialog 以减少改动面）
	 * · StandardDialog quota → balance 转账确认入口
	 *
	 * GROUND TRUTH：后端唯一可用动作是 POST /api/v1/user/aff/transfer，
	 * 不接收 amount/destination —— 一次性把"全部可用 quota"转入账户余额。
	 * 因此本对话框退化为一个确认框：展示可转金额 → 确认 → transferAffiliateQuota()。
	 *
	 * 历史的 amount / destination / details 表单全部移除（它们打的是不存在的
	 * withdraw 幻影子路由）。
	 *
	 * RED LINE：
	 *   - 不顶层 import payment SDK / qrcode；本对话框不触发 SDK。
	 *   - 不在 vendor-chunk 红线集合内；不需要 dynamic import。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { transferAffiliateQuota, type TransferResult } from '$lib/api/user/affiliates';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		/** 可转返利余额（全部一并转出）。 */
		availableRebate: number;
		/** 后端规定的最小可转额（默认 0；availableRebate 低于此则禁用）。 */
		minAmount?: number;
		/** 货币标签（仅用于显示，本端口锁 USD）。 */
		currency?: string;
		onTransferred?: (resp: TransferResult) => void;
	};

	let {
		open = $bindable(false),
		availableRebate,
		minAmount = 0,
		currency = 'USD',
		onTransferred
	}: Props = $props();

	let submitting = $state(false);
	let formError = $state<string>('');

	const canTransfer = $derived(availableRebate > 0 && availableRebate >= minAmount);

	// open=false 时清空瞬态状态（避免上次状态泄漏）。
	$effect(() => {
		if (!open) {
			formError = '';
			submitting = false;
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (submitting) return;

		if (!canTransfer) {
			formError = $_('affiliate.transfer.empty', { default: 'No available rebate quota' });
			return;
		}

		formError = '';
		submitting = true;
		try {
			const resp = await transferAffiliateQuota();
			showSuccess(
				$_('affiliate.transfer.success', {
					default: '{amount} has been transferred to your balance',
					values: { amount: `$${resp.transferredQuota.toFixed(2)}` }
				})
			);
			onTransferred?.(resp);
			open = false;
		} catch (err) {
			const e = err as Error;
			const msg =
				e?.message ??
				$_('affiliate.transferFailed', { default: 'Failed to transfer affiliate quota' });
			if (msg === 'unauthorized') {
				// apiClient 已统一 401 钩子；这里不再二次提示。
				return;
			}
			formError = $_('affiliate.transferFailed', {
				default: 'Failed to transfer affiliate quota'
			});
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
	title={$_('affiliate.transfer.title', { default: 'Transfer Rebate Quota' })}
	description={$_('affiliate.transfer.description', {
		default: 'Move available rebate quota into your account balance'
	})}
	data-testid="withdrawal-dialog"
>
	<form class="mt-5 space-y-4" data-testid="withdrawal-form" onsubmit={handleSubmit}>
		<!-- Available / transferable amount -->
		<div
			class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
			data-testid="withdrawal-available"
		>
			<span class="text-muted-foreground">
				{$_('user.affiliates.stats.available', { default: 'Available' })}
			</span>
			<span class="font-medium tabular-nums text-foreground" data-testid="transfer-amount">
				${availableRebate.toFixed(2)} {currency}
			</span>
		</div>

		{#if !canTransfer}
			<p class="text-xs text-muted-foreground" data-testid="transfer-empty-hint">
				{$_('affiliate.transfer.empty', { default: 'No available rebate quota' })}
			</p>
		{/if}

		<!-- Inline form error -->
		{#if formError}
			<Alert
				variant="destructive"
				class="flex items-start gap-2 px-3 py-2 text-xs"
				data-testid="withdrawal-form-error"
				role="alert"
			>
				<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
				<span>{formError}</span>
			</Alert>
		{/if}

		<div class="flex items-center justify-end gap-2 pt-2">
			<Button
				variant="outline"
				data-testid="withdrawal-cancel-btn"
				disabled={submitting}
				onclick={handleClose}
				class="h-9"
			>
				{$_('user.withdrawal.cancel', { default: 'Cancel' })}
			</Button>
			<Button
				type="submit"
				data-testid="withdrawal-submit-btn"
				disabled={submitting || !canTransfer}
				class="h-9"
			>
				{submitting
					? $_('affiliate.transfer.transferring', { default: 'Transferring...' })
					: $_('affiliate.transfer.button', { default: 'Transfer to Balance' })}
			</Button>
		</div>
	</form>
</StandardDialog>
