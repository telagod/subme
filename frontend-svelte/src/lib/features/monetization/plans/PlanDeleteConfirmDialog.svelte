<script lang="ts">
	/**
	 * PlanDeleteConfirmDialog — lightweight delete confirmation dialog.
	 * Extracted from +page.svelte for thin-orchestrator pattern.
	 */
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		deleting: boolean;
		onConfirm: () => void;
		onClose: () => void;
	};

	let { open = $bindable(false), deleting, onConfirm, onClose }: Props = $props();
</script>

<StandardDialog
	bind:open
	width="sm"
	title={$_('payment.admin.deletePlan', { default: 'Delete Plan' })}
	description={$_('payment.admin.deletePlanConfirm', {
		default: 'Are you sure you want to delete this plan?'
	})}
	data-testid="plans-delete-confirm"
>
	<div class="mt-5 flex items-center justify-end gap-2">
		<Button
			variant="outline"
			disabled={deleting}
			onclick={onClose}
			data-testid="plans-delete-cancel"
		>
			{$_('common.cancel', { default: 'Cancel' })}
		</Button>
		<Button
			variant="destructive"
			disabled={deleting}
			onclick={onConfirm}
			data-testid="plans-delete-confirm-btn"
		>
			{deleting
				? $_('common.submitting', { default: 'Submitting...' })
				: $_('common.delete', { default: 'Delete' })}
		</Button>
	</div>
</StandardDialog>
