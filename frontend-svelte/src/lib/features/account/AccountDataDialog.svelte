<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		batchCreateAccounts, batchUpdateAccountCredentials, bulkUpdateAccounts
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = { open: boolean; selectedIds: Set<number>; exportJson?: string; onRefresh: () => void; onClose: () => void };
	let { open = $bindable(false), selectedIds, onRefresh, onClose }: Props = $props();

	let busy = $state(false);
	let batchJson = $state('[\n  { "name": "new-account", "platform": "openai", "type": "api_key", "status": "active" }\n]');
	let bulkJson = $state('{ "status": "inactive" }');
	let credField = $state('api_key');
	let credValue = $state('');

	function ids(): number[] { return [...selectedIds]; }

	async function run(label: string, fn: () => Promise<void>) {
		busy = true;
		try { await fn(); showSuccess(label); onRefresh(); }
		catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { busy = false; }
	}

	async function createBatch() {
		await run($_('admin.accounts.data.batchCreated', { default: 'Batch created' }), async () => {
			const p = JSON.parse(batchJson);
			const accounts = Array.isArray(p) ? p : p.accounts;
			if (!Array.isArray(accounts)) throw new Error($_('admin.accounts.data.mustBeArray', { default: 'Must be array or { accounts: [] }' }));
			await batchCreateAccounts(accounts);
		});
	}

	async function applyBulk() {
		if (ids().length === 0) return;
		await run($_('admin.accounts.data.updated', { default: 'Accounts updated' }), async () => {
			await bulkUpdateAccounts({ ids: ids(), updates: JSON.parse(bulkJson) });
		});
	}

	async function updateCred() {
		if (ids().length === 0 || !credField.trim()) return;
		await run($_('admin.accounts.data.credUpdated', { default: 'Credentials updated' }), async () => {
			let v: unknown = credValue;
			try { v = JSON.parse(credValue); } catch { /* use raw string */ }
			await batchUpdateAccountCredentials({ account_ids: ids(), field: credField.trim(), value: v });
		});
	}
</script>

<StandardDrawer side="right" width="lg" bind:open title={$_('admin.accounts.data.title', { default: 'Batch operations' })} data-testid="account-data-dialog">
	<div class="grid gap-5">
		<!-- Batch create -->
		<Card class="space-y-3 p-4">
			<div>
				<h3 class="text-sm font-semibold">{$_('admin.accounts.data.batchCreate', { default: 'Batch create' })}</h3>
				<p class="mt-0.5 text-xs text-muted-foreground">{$_('admin.accounts.data.batchCreateHint', { default: 'Paste a JSON array of account objects.' })}</p>
			</div>
			<Textarea rows={6} bind:value={batchJson} class="font-mono text-xs" data-testid="account-batch-json" />
			<div class="flex justify-end">
				<Button disabled={busy} onclick={createBatch}>{$_('admin.accounts.data.createBatchBtn', { default: 'Create batch' })}</Button>
			</div>
		</Card>

		<!-- Bulk update selected -->
		<Card class="space-y-3 p-4">
			<div>
				<h3 class="text-sm font-semibold">{$_('admin.accounts.data.selectedUpdates', { default: 'Bulk update' })}</h3>
				<p class="mt-0.5 text-xs text-muted-foreground">
					{$_('admin.accounts.data.selectedUpdatesHint', { default: 'Apply JSON field updates to {count} selected accounts.', values: { count: selectedIds.size } })}
				</p>
			</div>
			<Textarea rows={4} bind:value={bulkJson} class="font-mono text-xs" data-testid="account-bulk-json" />
			<div class="flex justify-end">
				<Button variant="outline" disabled={busy || selectedIds.size === 0 || !bulkJson.trim()} onclick={applyBulk}>
					{$_('admin.accounts.data.applyUpdateBtn', { default: 'Apply update' })}
				</Button>
			</div>
		</Card>

		<!-- Update credential field -->
		<Card class="space-y-3 p-4">
			<div>
				<h3 class="text-sm font-semibold">{$_('admin.accounts.data.credTitle', { default: 'Update credential' })}</h3>
				<p class="mt-0.5 text-xs text-muted-foreground">{$_('admin.accounts.data.credHint', { default: 'Set one credential field on selected accounts.' })}</p>
			</div>
			<div class="grid gap-2 sm:grid-cols-[1fr_2fr]">
				<Input placeholder={$_('admin.accounts.data.credFieldPlaceholder', { default: 'Field name (e.g. api_key)' })} bind:value={credField} data-testid="account-credential-field" />
				<Input placeholder={$_('admin.accounts.data.credValuePlaceholder', { default: 'Value or JSON' })} bind:value={credValue} data-testid="account-credential-value" />
			</div>
			<div class="flex justify-end">
				<Button variant="outline" disabled={busy || selectedIds.size === 0 || !credField.trim()} onclick={updateCred}>
					{$_('admin.accounts.data.updateCredBtn', { default: 'Update credential' })}
				</Button>
			</div>
		</Card>
	</div>

	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>{$_('common.close', { default: 'Close' })}</Button>
	</div>
</StandardDrawer>
