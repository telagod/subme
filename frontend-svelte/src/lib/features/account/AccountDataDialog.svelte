<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		batchCreateAccounts, batchUpdateAccountCredentials, bulkUpdateAccounts,
		exportAccountData, importAccountData
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = { open: boolean; selectedIds: Set<number>; exportJson?: string; onRefresh: () => void; onClose: () => void };
	let { open = $bindable(false), selectedIds, exportJson = '', onRefresh, onClose }: Props = $props();

	let busy = $state(false);
	let batchJson = $state('[\n  { "name": "new-account", "platform": "openai", "type": "api_key", "status": "active" }\n]');
	let bulkJson = $state('{ "status": "inactive" }');
	let credField = $state('api_key');
	let credValue = $state('');
	let dataJson = $state('');

	$effect(() => { if (exportJson) dataJson = exportJson; });

	function ids(): number[] { return [...selectedIds]; }

	async function run(label: string, fn: () => Promise<void>) { busy = true; try { await fn(); showSuccess(label); onRefresh(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	async function createBatch() { await run('Batch created', async () => { const p = JSON.parse(batchJson); const accounts = Array.isArray(p) ? p : p.accounts; if (!Array.isArray(accounts)) throw new Error('Must be array or { accounts: [] }'); await batchCreateAccounts(accounts); }); }
	async function applyBulk() { if (ids().length === 0) return; await run('Accounts updated', async () => { await bulkUpdateAccounts({ ids: ids(), updates: JSON.parse(bulkJson) }); }); }
	async function updateCred() { if (ids().length === 0 || !credField.trim()) return; await run('Credentials updated', async () => { let v: unknown = credValue; try { v = JSON.parse(credValue); } catch {} await batchUpdateAccountCredentials({ account_ids: ids(), field: credField.trim(), value: v }); }); }
	async function exportSel() { if (ids().length === 0) return; busy = true; try { const payload = await exportAccountData({ ids: ids(), includeProxies: true }); dataJson = JSON.stringify(payload, null, 2); showSuccess('Exported'); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function importDataFn() { await run('Imported', async () => { await importAccountData({ data: JSON.parse(dataJson) }); }); }
</script>

<StandardDialog bind:open title={$_('admin.accountsQuench.dataTitle', { default: 'Account data tools' })} width="lg" data-testid="account-data-dialog">
	<div class="mt-4 grid gap-4">
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Batch create</h2><p class="text-xs text-muted-foreground">Paste an array of account payloads.</p>
			<Textarea rows={6} bind:value={batchJson} data-testid="account-batch-json" /><div class="flex justify-end"><Button disabled={busy} onclick={createBatch}>Create batch</Button></div></Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Selected updates</h2><p class="text-xs text-muted-foreground">Apply JSON updates or one credential field to selected accounts.</p>
			<Textarea rows={4} bind:value={bulkJson} data-testid="account-bulk-json" />
			<div class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><Input placeholder="Credential field" bind:value={credField} data-testid="account-credential-field" /><Input placeholder="Credential value or JSON" bind:value={credValue} data-testid="account-credential-value" /><Button variant="outline" disabled={busy || selectedIds.size === 0 || !credField.trim()} onclick={updateCred}>Update credential</Button></div>
			<div class="flex justify-end"><Button variant="outline" disabled={busy || selectedIds.size === 0 || !bulkJson.trim()} onclick={applyBulk}>Apply update</Button></div></Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Import / export data</h2><p class="text-xs text-muted-foreground">Export selected accounts to JSON, or paste data to import.</p>
			<Textarea rows={8} bind:value={dataJson} data-testid="account-data-json" />
			<div class="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || selectedIds.size === 0} onclick={exportSel}>Export selected</Button><Button disabled={busy || !dataJson.trim()} onclick={importDataFn}>Import data</Button></div></Card>
	</div>
	<div class="mt-5 flex justify-end"><Button variant="outline" onclick={() => { open = false; onClose(); }}>Close</Button></div>
</StandardDialog>
