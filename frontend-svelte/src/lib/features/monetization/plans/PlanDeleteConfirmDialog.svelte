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
	title={$_('payment.admin.deletePlan', { default: 'Delete Plan' })}
	description={$_('payment.admin.deletePlanConfirm', {
		default: 'Are you sure you want to delete this plan?'
	})}
	confirmLabel={deleting
		? $_('common.submitting', { default: 'Submitting...' })
		: $_('common.delete', { default: 'Delete' })}
	loading={deleting}
	onConfirm={onConfirm}
	onCancel={onClose}
	data-testid="plans-delete-confirm"
	confirmTestId="plans-delete-confirm-btn"
	cancelTestId="plans-delete-cancel"
/>
