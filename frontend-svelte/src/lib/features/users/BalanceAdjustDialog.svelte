<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { updateUserBalance } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		userId: number;
		currentBalance: number;
		onClose: () => void;
		onUpdated: () => void;
	};

	let { open = $bindable(false), userId, currentBalance, onClose, onUpdated }: Props = $props();

	let amount = $state(0);
	let operation = $state<'add' | 'subtract' | 'set'>('add');
	let notes = $state('');
	let submitting = $state(false);

	const preview = $derived(
		operation === 'add' ? currentBalance + (amount || 0) :
		operation === 'subtract' ? currentBalance - (amount || 0) :
		amount || 0
	);

	function fmtBal(v: number): string {
		const s = v.toFixed(8).replace(/\.?0+$/, '');
		const parts = s.split('.');
		if (parts.length === 1) return s + '.00';
		if (parts[1].length < 2) return s + '0';
		return s;
	}

	function reset() {
		amount = 0; operation = 'add'; notes = '';
	}

	async function submit() {
		if (!amount || amount <= 0) {
			showError($_('admin.users.balanceInvalidAmount', { default: 'Amount must be greater than 0' }));
			return;
		}
		submitting = true;
		try {
			await updateUserBalance(userId, amount, operation, notes);
			showSuccess($_('admin.users.balanceAdjusted', { default: 'Balance adjusted' }));
			reset();
			onUpdated();
			onClose();
		} catch (e: unknown) {
			showError((e as Error)?.message || $_('admin.users.balanceFailed', { default: 'Failed to adjust balance' }));
		} finally {
			submitting = false;
		}
	}

	$effect(() => { if (open) reset(); });
</script>

<StandardDialog {open} onOpenChange={(v) => { if (!v) onClose(); }} title={$_('admin.users.adjustBalance', { default: 'Adjust Balance' })}
	data-testid="balance-adjust-dialog">
	<div class="flex flex-col gap-4">
		<div class="text-sm text-muted-foreground">
			{$_('admin.users.currentBalance', { default: 'Current balance' })}:
			<span class="font-mono font-semibold text-foreground">${fmtBal(currentBalance)}</span>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.operation', { default: 'Operation' })}
			</span>
			<div class="flex gap-1.5">
				{#each [
					{ value: 'add', label: $_('admin.users.opAdd', { default: 'Add' }) },
					{ value: 'subtract', label: $_('admin.users.opSubtract', { default: 'Subtract' }) },
					{ value: 'set', label: $_('admin.users.opSet', { default: 'Set' }) }
				] as op}
					<Button type="button" size="sm"
						variant={operation === op.value ? 'default' : 'outline'}
						class="flex-1 text-xs"
						onclick={() => { operation = op.value as 'add' | 'subtract' | 'set'; }}>
						{op.label}
					</Button>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.amount', { default: 'Amount' })}
			</span>
			<div class="relative">
				<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">$</span>
				<Input type="number" step="any" min="0" class="pl-7 font-mono"
					placeholder="0.00" bind:value={amount} data-testid="balance-amount" />
			</div>
		</div>

		{#if operation !== 'set'}
			<div class="text-sm text-muted-foreground">
				→ <span class="font-mono font-semibold text-foreground">${fmtBal(preview)}</span>
			</div>
		{/if}

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{$_('admin.users.notes', { default: 'Notes' })}
			</span>
			<Textarea rows={2} class="resize-none text-sm" bind:value={notes}
				placeholder={$_('admin.users.notesPlaceholder', { default: 'Optional notes' })} />
		</div>
	</div>

	<div class="flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" size="sm" onclick={onClose}>
			{$_('common.cancel', { default: 'Cancel' })}
		</Button>
		<Button size="sm" disabled={submitting || !amount} onclick={submit}
			data-testid="balance-confirm">
			{submitting ? $_('common.submitting', { default: 'Submitting...' }) : $_('common.confirm', { default: 'Confirm' })}
		</Button>
	</div>
</StandardDialog>
