<script lang="ts">
	/**
	 * PlanDeleteConfirmDialog — lightweight delete confirmation dialog.
	 * Extracted from +page.svelte for thin-orchestrator pattern.
	 */
	import { _ } from 'svelte-i18n';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';

	type Props = {
		open: boolean;
		deleting: boolean;
		onConfirm: () => void;
		onClose: () => void;
	};

	let { open = $bindable(false), deleting, onConfirm, onClose }: Props = $props();
</script>

<ConfirmDialog
	bind:open
	title={$_('payment.admin.deletePlan', { default: '删除方案' })}
	description={$_('payment.admin.deletePlanConfirm', {
		default: '确定要删除此方案吗？'
	})}
	confirmLabel={deleting
		? $_('common.submitting', { default: '提交中...' })
		: $_('common.delete', { default: '删除' })}
	loading={deleting}
	onConfirm={onConfirm}
	onCancel={onClose}
	data-testid="plans-delete-confirm"
	confirmTestId="plans-delete-confirm-btn"
	cancelTestId="plans-delete-cancel"
/>
