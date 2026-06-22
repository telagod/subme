<script lang="ts">
	/**
	 * RefundRejectDialog — confirmation dialog for rejecting a refund request.
	 *
	 * Requires a non-empty reason (>= 4 chars). Calls rejectRefund API and
	 * fires onRejected on success so the page can reload.
	 */
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import { rejectRefund, type AdminRefundRequest } from '$lib/api/admin/refunds';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	interface Props {
		open: boolean;
		target: AdminRefundRequest | null;
		onRejected: () => void;
	}

	let { open = $bindable(), target, onRejected }: Props = $props();

	let reason = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	// Reset form state when the dialog opens with a new target
	$effect(() => {
		if (open && target) {
			reason = '';
			error = null;
		}
	});

	async function confirmReject() {
		if (!target || submitting) return;
		const trimmed = reason.trim();
		if (trimmed.length < 4) {
			error = $_('admin.refunds.rejectReasonRequired', {
				default: '原因必填（至少 4 个字符）'
			});
			return;
		}
		submitting = true;
		try {
			await rejectRefund(target.id, trimmed);
			showSuccess(
				$_('admin.refunds.rejectSuccess', { default: '退款已拒绝' })
			);
			open = false;
			onRejected();
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refunds.rejectError', {
					default: '拒绝失败：{error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog
	bind:open
	width="sm"
	title={$_('admin.refunds.rejectTitle', { default: '拒绝退款请求' })}
	description={$_('admin.refunds.rejectDescription', {
		default: '用户将在订单历史中看到此原因。'
	})}
	data-testid="admin-refunds-reject-dialog"
>
	<div class="mt-5 flex flex-col gap-1.5">
		<label
			for="admin-refunds-reject-reason"
			class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			{$_('admin.refunds.rejectReason', { default: '原因' })}
		</label>
		<Textarea
			id="admin-refunds-reject-reason"
			rows={3}
			maxlength={500}
			class="min-h-24"
			placeholder={$_('admin.refunds.rejectReasonPlaceholder', {
				default: '为什么要拒绝此退款？'
			})}
			bind:value={reason}
			data-testid="admin-refunds-reject-reason-input"
			disabled={submitting}
		/>
		{#if error}
			<p
				class="m-0 text-xs text-destructive"
				data-testid="admin-refunds-reject-error"
			>
				{error}
			</p>
		{/if}
	</div>

	<div class="mt-6 flex items-center justify-end gap-2">
		<Button
			variant="outline"
			data-testid="admin-refunds-reject-cancel"
			disabled={submitting}
			onclick={() => (open = false)}
		>
			{$_('common.cancel', { default: '取消' })}
		</Button>
		<Button
			variant="destructive"
			data-testid="admin-refunds-reject-confirm"
			disabled={submitting || !target}
			onclick={confirmReject}
		>
			{submitting
				? $_('admin.refunds.rejectSubmitting', { default: '拒绝中…' })
				: $_('admin.refunds.reject', { default: '拒绝' })}
		</Button>
	</div>
</StandardDialog>
