<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		batchCreateProxies,
		exportProxyData,
		importProxyData,
		type ProxyFilters
	} from '$lib/api/admin/proxies';
	import { showError, showSuccess, showInfo } from '$lib/stores/toast.svelte';
	import {
		downloadJson,
		readFileAsText,
		importResultSummary,
		importResultErrors,
		parseProxyBatch,
		type ProxyBatchParseResult
	} from './proxy-helpers';

	interface Props {
		open: boolean;
		selectedIds: Set<number>;
		currentFilters: () => ProxyFilters;
		initialJson?: string;
		onClose: () => void;
		onDataChanged: () => void;
	}

	let { open = $bindable(), selectedIds, currentFilters, initialJson = '', onClose, onDataChanged }: Props = $props();

	let dataJson = $state('');
	let dataFileName = $state('');
	let dataImportResult = $state<Record<string, unknown> | null>(null);
	let batchJson = $state('socks5://127.0.0.1:1080\nhttp://user:pass@192.0.2.10:8080');
	let batchParse = $state<ProxyBatchParseResult>({
		mode: 'empty',
		total: 0,
		valid: 0,
		invalid: 0,
		duplicate: 0,
		proxies: []
	});
	let dataBusy = $state(false);

	$effect(() => {
		if (open) {
			if (initialJson) dataJson = initialJson;
			refreshBatchParse();
			dataImportResult = null;
		}
	});

	function refreshBatchParse() {
		batchParse = parseProxyBatch(batchJson);
	}

	function selectedArray(): number[] {
		return [...selectedIds];
	}

	async function exportSelected() {
		dataBusy = true;
		try {
			const payload = await exportProxyData({ ids: selectedArray() });
			dataJson = JSON.stringify(payload, null, 2);
			showSuccess('Proxy data exported');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			dataBusy = false;
		}
	}

	async function exportFiltered() {
		dataBusy = true;
		try {
			const payload = await exportProxyData({ filters: currentFilters() });
			dataJson = JSON.stringify(payload, null, 2);
			showSuccess('Filtered proxy data exported');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			dataBusy = false;
		}
	}

	function downloadDataJson() {
		if (!dataJson.trim()) return;
		downloadJson(`proxies-${new Date().toISOString().slice(0, 10)}.json`, dataJson);
		showInfo('Proxy data download started');
	}

	async function importData() {
		dataBusy = true;
		try {
			const parsed = JSON.parse(dataJson);
			dataImportResult = await importProxyData({ data: parsed });
			const failed = Number(dataImportResult.proxy_failed ?? dataImportResult.failed ?? 0);
			if (failed > 0) showError(`Proxy data imported with ${failed} failure${failed === 1 ? '' : 's'}`);
			else showSuccess('Proxy data imported');
			onDataChanged();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			dataBusy = false;
		}
	}

	async function importDataFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		dataBusy = true;
		dataFileName = file.name;
		try {
			dataJson = await readFileAsText(file);
			const parsed = JSON.parse(dataJson);
			dataImportResult = await importProxyData({ data: parsed });
			const failed = Number(dataImportResult.proxy_failed ?? dataImportResult.failed ?? 0);
			if (failed > 0) showError(`Proxy data imported with ${failed} failure${failed === 1 ? '' : 's'}`);
			else showSuccess('Proxy data imported');
			onDataChanged();
		} catch (err) {
			showError(err instanceof SyntaxError ? 'Proxy data file is not valid JSON' : err instanceof Error ? err.message : String(err));
		} finally {
			dataBusy = false;
			input.value = '';
		}
	}

	async function createBatch() {
		refreshBatchParse();
		if (batchParse.valid === 0) {
			showError(batchParse.error || 'No valid proxies to create');
			return;
		}
		dataBusy = true;
		try {
			await batchCreateProxies(batchParse.proxies);
			const skipped = batchParse.invalid + batchParse.duplicate;
			showSuccess(skipped > 0 ? `Proxy batch created · skipped ${skipped}` : 'Proxy batch created');
			onDataChanged();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			dataBusy = false;
		}
	}
</script>

<StandardDialog bind:open title="Proxy data tools" width="lg" data-testid="proxy-data-dialog">
	<div class="mt-4 grid gap-4">
		<Card class="space-y-3">
			<div>
				<h2 class="text-sm font-semibold">Batch create</h2>
				<p class="text-xs text-muted-foreground">Paste one proxy URL per line, or a JSON array / {`{ "proxies": [] }`} payload.</p>
			</div>
			<Textarea rows={7} bind:value={batchJson} oninput={refreshBatchParse} data-testid="proxy-batch-json" />
			{#if batchParse.total > 0 || batchParse.error}
				<div class="flex flex-wrap gap-3 rounded-md bg-muted p-3 text-sm" data-testid="proxy-batch-parse-summary">
					<span>Valid {batchParse.valid}</span>
					<span class={batchParse.invalid > 0 ? 'text-amber-600' : 'text-muted-foreground'}>Invalid {batchParse.invalid}</span>
					<span class={batchParse.duplicate > 0 ? 'text-muted-foreground' : 'text-muted-foreground'}>Duplicate {batchParse.duplicate}</span>
					<span class="text-muted-foreground">Mode {batchParse.mode}</span>
					{#if batchParse.error}
						<span class="text-destructive">{batchParse.error}</span>
					{/if}
				</div>
			{/if}
			<div class="flex justify-end">
				<Button disabled={dataBusy || batchParse.valid === 0} onclick={createBatch}>Create batch</Button>
			</div>
		</Card>

		<Card class="space-y-3">
			<div>
				<h2 class="text-sm font-semibold">Import / export data</h2>
				<p class="text-xs text-muted-foreground">Export selected or filtered proxies into JSON, then paste or upload exported data to import.</p>
			</div>
			<label class="grid gap-1 text-sm">
				Import JSON file
				<Input type="file" accept="application/json,.json" disabled={dataBusy} onchange={importDataFile} data-testid="proxy-data-file" />
			</label>
			{#if dataFileName}
				<p class="text-xs text-muted-foreground" data-testid="proxy-data-file-name">{dataFileName}</p>
			{/if}
			<Textarea rows={8} bind:value={dataJson} data-testid="proxy-data-json" />
			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="outline" disabled={dataBusy || selectedIds.size === 0} onclick={exportSelected}>Export selected</Button>
				<Button variant="outline" disabled={dataBusy} onclick={exportFiltered}>Export filtered</Button>
				<Button variant="outline" disabled={dataBusy || !dataJson.trim()} onclick={downloadDataJson}>Download JSON</Button>
				<Button disabled={dataBusy || !dataJson.trim()} onclick={importData}>Import data</Button>
			</div>
			{#if dataImportResult}
				<div class="rounded-md border border-border bg-muted/20 p-3 text-sm" data-testid="proxy-data-import-result">
					<p class="font-medium">{importResultSummary(dataImportResult)}</p>
					{#if importResultErrors(dataImportResult).length > 0}
						<ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive" data-testid="proxy-data-import-errors">
							{#each importResultErrors(dataImportResult) as error}
								<li>{error}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</Card>
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>{$_('common.close', { default: 'Close' })}</Button>
	</div>
</StandardDialog>
