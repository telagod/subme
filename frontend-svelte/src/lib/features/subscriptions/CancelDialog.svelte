<script lang="ts">
	/**
	 * CancelDialog · bits-ui Dialog 确认取消订阅（M6）
	 *
	 * 流程：
	 *   - bind:open 父持有状态；subscription = 待取消 UserSubscription | null。
	 *   - 确认 → POST /api/v1/subscriptions/cancel。成功 toast + onCancelCompleted。
	 *   - 失败 → toast 错误，dialog 不关，保留 Cancel 路径。
	 *
	 * a11y：
	 *   - bits-ui Dialog 自带 focus trap + ESC 关闭。
	 *   - destructive 按钮 aria-label 走 i18n。
	 *
	 * 红线（reshadcn-migration memory）：
	 *   - 内不含任何 Select；不会触发 sentinel 限制。
	 *   - NO QUENCH 皮肤。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { cancel as cancelSubscription, type UserSubscription } from '$lib/api/user/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

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

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="cancel-sub-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div class="space-y-1.5">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{$_('user.subscriptions.cancelTitle', { default: 'Cancel subscription?' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('user.subscriptions.cancelDescription', {
							default:
								'You will keep access to {planName} until the end of the current billing period. This action cannot be undone.',
							values: {
								planName: subscription?.planName ?? ''
							}
						})}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="cancel-sub-keep-btn"
					disabled={submitting}
					onclick={handleCancel}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('user.subscriptions.keepSubscription', { default: 'Keep subscription' })}
				</button>
				<button
					type="button"
					data-testid="cancel-sub-confirm-btn"
					disabled={submitting || !subscription}
					onclick={handleConfirm}
					class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{submitting
						? $_('user.subscriptions.cancelling', { default: 'Cancelling...' })
						: $_('user.subscriptions.confirmCancel', { default: 'Cancel subscription' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
