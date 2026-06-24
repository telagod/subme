<script lang="ts">
	/**
	 * ConfirmDialog — shared destructive-action confirmation primitive.
	 *
	 * Wraps StandardDialog with a two-button footer (cancel + confirm).
	 * Danger variant renders a red confirm button; warning renders amber.
	 */
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import StandardDialog from './StandardDialog.svelte';

	type Variant = 'danger' | 'warning' | 'default';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: Variant;
		loading?: boolean;
		onConfirm?: () => void;
		onCancel?: () => void;
		'data-testid'?: string;
		confirmTestId?: string;
		cancelTestId?: string;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description = '',
		confirmLabel,
		cancelLabel,
		variant = 'danger',
		loading = false,
		onConfirm,
		onCancel,
		'data-testid': testId,
		confirmTestId,
		cancelTestId,
		children
	}: Props = $props();

	const confirmVariant = $derived(
		variant === 'danger' ? 'destructive' as const : 'default' as const
	);
	const confirmClass = $derived(
		variant === 'warning' ? 'bg-amber-600 text-white hover:bg-amber-700' : ''
	);

	function handleCancel() {
		if (loading) return;
		onCancel?.();
		open = false;
	}
</script>

<StandardDialog bind:open width="sm" {title} {description} data-testid={testId}>
	{@render children?.()}
	<div class="mt-5 flex items-center justify-end gap-2">
		<Button variant="outline" disabled={loading} onclick={handleCancel} data-testid={cancelTestId}>
			{cancelLabel ?? 'Cancel'}
		</Button>
		<Button
			variant={confirmVariant}
			class={confirmClass}
			disabled={loading}
			onclick={() => onConfirm?.()}
			data-testid={confirmTestId}
		>
			{confirmLabel ?? 'Delete'}
		</Button>
	</div>
</StandardDialog>
