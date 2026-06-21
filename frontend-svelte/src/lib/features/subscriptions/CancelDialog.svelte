<script lang="ts">
	/**
	 * CancelDialog · StandardDialog 确认取消订阅（M6）
	 *
	 * 流程：
	 *   - bind:open 父持有状态；subscription = 待取消 UserSubscription | null。
	 *   - 确认 → POST /api/v1/subscriptions/cancel。成功 toast + onCancelCompleted。
	 *   - 失败 → toast 错误，dialog 不关，保留 Cancel 路径。
	 *
	 * a11y：StandardDialog 统一承接 focus trap / ESC 关闭。
	 *
	 * 红线（reshadcn-migration memory）：
	 *   - 内不含任何 Select；不会触发 sentinel 限制。
	 *   - NO QUENCH 皮肤。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { cancel as cancelSubscription, type UserSubscription } from '$lib/api/user/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		subscription: UserSubscription | null;
		onCancelCompleted?: (id: string) => void;
	};

	let { open = $bindable(false), subscription, onCancelCompleted }: Props = $props();

	let submitting = $state(false);

	async function handleConfirm() {
		if (!subscription || submitting) return;
		submitting = true;
		try {
			await cancelSubscription(subscription.id);
			showSuccess(
				$_('user.subscriptions.cancelSuccess', {
					default: 'Subscription cancelled successfully'
				})
			);
			onCancelCompleted?.(subscription.id);
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(
				$_('user.subscriptions.cancelError', {
					default: 'Failed to cancel subscription',
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
	width="sm"
	title={$_('user.subscriptions.cancelTitle', { default: 'Cancel subscription?' })}
	description={$_('user.subscriptions.cancelDescription', {
		default:
			'You will keep access to {planName} until the end of the current billing period. This action cannot be undone.',
		values: {
			planName: subscription?.planName ?? ''
		}
	})}
	data-testid="cancel-sub-dialog"
>
	<div class="mt-4">
		<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<p class="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{subscription?.planName ?? ''}
				</p>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
				<Button
					variant="outline"
					data-testid="cancel-sub-keep-btn"
					disabled={submitting}
					onclick={handleCancel}
					class="h-9"
				>
					{$_('user.subscriptions.keepSubscription', { default: 'Keep subscription' })}
				</Button>
				<Button
					variant="destructive"
					data-testid="cancel-sub-confirm-btn"
					disabled={submitting || !subscription}
					onclick={handleConfirm}
					class="h-9"
				>
					{submitting
						? $_('user.subscriptions.cancelling', { default: 'Cancelling...' })
						: $_('user.subscriptions.confirmCancel', { default: 'Cancel subscription' })}
				</Button>
			</div>
	</div>
</StandardDialog>
