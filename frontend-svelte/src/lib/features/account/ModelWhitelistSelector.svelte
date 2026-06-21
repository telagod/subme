<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { X, ChevronDown, Check, RefreshCw } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import { syncAccountModels, previewSyncUpstreamModels } from '$lib/api/admin/accounts';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import { getModelsForPlatforms, type ModelOption } from './models';

	type Props = {
		selected: string[];
		platform?: string;
		platforms?: string[];
		accountId?: number;
		syncCredentials?: { platform: string; type: string; base_url?: string; api_key: string };
		onUpdate: (models: string[]) => void;
	};
	let { selected = $bindable([]), platform = '', platforms = [], accountId, syncCredentials, onUpdate }: Props = $props();

	let dropdownOpen = $state(false);
	let searchQuery = $state('');
	let customModel = $state('');
	let syncing = $state(false);

	function getNormalizedPlatforms(): string[] {
		const raw = platforms.length > 0 ? platforms : platform ? [platform] : [];
		return [...new Set(raw.map(p => p.trim()).filter(Boolean))];
	}

	const normalizedPlatforms = $derived(getNormalizedPlatforms());
	const availableOptions = $derived(getModelsForPlatforms(normalizedPlatforms));

	const filteredOptions = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return availableOptions;
		return availableOptions.filter(m => m.value.toLowerCase().includes(q) || m.label.toLowerCase().includes(q));
	});

	const upstreamSyncPlatforms = new Set(['anthropic', 'claude', 'openai', 'gemini', 'antigravity']);
	const canSyncUpstream = $derived(
		(accountId != null) ||
		(syncCredentials != null && upstreamSyncPlatforms.has(syncCredentials.platform.toLowerCase()))
	);

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
		if (!dropdownOpen) searchQuery = '';
	}

	function removeModel(model: string) {
		const next = selected.filter(m => m !== model);
		selected = next;
		onUpdate(next);
	}

	function toggleModel(model: string) {
		if (selected.includes(model)) {
			removeModel(model);
		} else {
			const next = [...selected, model];
			selected = next;
			onUpdate(next);
		}
	}

	function addCustom() {
		const model = customModel.trim();
		if (!model) return;
		if (selected.includes(model)) {
			showInfo('Model already added');
			return;
		}
		const next = [...selected, model];
		selected = next;
		onUpdate(next);
		customModel = '';
	}

	function fillRelated() {
		const newModels = [...selected];
		for (const p of normalizedPlatforms) {
			const pModels = getModelsForPlatforms([p]);
			for (const m of pModels) {
				if (!newModels.includes(m.value)) newModels.push(m.value);
			}
		}
		selected = newModels;
		onUpdate(newModels);
	}

	async function syncUpstream() {
		if (syncing) return;
		syncing = true;
		try {
			let result: { models: string[] };
			if (accountId != null) {
				result = await syncAccountModels(accountId);
			} else if (syncCredentials) {
				result = await previewSyncUpstreamModels(syncCredentials);
			} else {
				return;
			}
			const upstream = result.models.map(m => m.trim()).filter(Boolean);
			if (upstream.length === 0) {
				showInfo('No upstream models found');
				return;
			}
			const newModels = [...selected];
			let added = 0;
			for (const m of upstream) {
				if (!newModels.includes(m)) { newModels.push(m); added++; }
			}
			selected = newModels;
			onUpdate(newModels);
			if (added > 0) showSuccess(`Added ${added} models from upstream (${upstream.length} total)`);
			else showInfo(`All ${upstream.length} upstream models already present`);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			syncing = false;
		}
	}

	function clearAll() {
		selected = [];
		onUpdate([]);
	}
</script>

<div data-testid="model-whitelist-selector">
	<!-- Selected models display -->
	<button type="button" class="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-left" onclick={toggleDropdown} data-testid="model-whitelist-trigger">
		{#if selected.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each selected as model (model)}
					<Badge variant="secondary" class="inline-flex items-center gap-1 px-2 py-1 text-xs">
						<span class="truncate">{model}</span>
						<button type="button" class="ml-0.5 rounded-full hover:bg-muted" onclick={(e) => { e.stopPropagation(); removeModel(model); }} aria-label="Remove {model}">
							<X size={12} />
						</button>
					</Badge>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No models selected</p>
		{/if}
		<div class="mt-2 flex items-center justify-between border-t border-border pt-2">
			<span class="text-xs text-muted-foreground">{selected.length} model{selected.length !== 1 ? 's' : ''}</span>
			<ChevronDown size={16} class="text-muted-foreground" />
		</div>
	</button>

	<!-- Dropdown -->
	{#if dropdownOpen}
		<div class="relative z-50 mt-1 rounded-md border border-border bg-background shadow-md" data-testid="model-whitelist-dropdown">
			<div class="sticky top-0 border-b border-border bg-background p-2">
				<Input bind:value={searchQuery} placeholder="Search models..." class="text-sm" onclick={(e) => e.stopPropagation()} data-testid="model-whitelist-search" />
			</div>
			<div class="max-h-52 overflow-auto">
				{#each filteredOptions as model (model.value)}
					<button type="button"
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
						onclick={() => toggleModel(model.value)}>
						<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border {selected.includes(model.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}">
							{#if selected.includes(model.value)}<Check size={12} />{/if}
						</span>
						<span class="truncate">{model.value}</span>
					</button>
				{:else}
					<p class="px-3 py-4 text-center text-sm text-muted-foreground">No matching models</p>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Quick actions -->
	<div class="mt-3 flex flex-wrap gap-2">
		<Button type="button" variant="outline" size="sm" onclick={fillRelated}>Fill related models</Button>
		{#if canSyncUpstream}
			<Button type="button" variant="outline" size="sm" disabled={syncing} onclick={syncUpstream} class="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10">
				<RefreshCw size={14} class={syncing ? 'animate-spin' : ''} />
				{syncing ? 'Syncing...' : 'Sync upstream'}
			</Button>
		{/if}
		<Button type="button" variant="outline" size="sm" onclick={clearAll} class="border-destructive/30 text-destructive hover:bg-destructive/10">Clear all</Button>
	</div>

	<!-- Custom model input -->
	<div class="mt-3">
		<p class="mb-1 text-xs font-medium">Custom model</p>
		<div class="flex gap-2">
			<Input bind:value={customModel} placeholder="Enter model name" class="flex-1" onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} data-testid="model-whitelist-custom" />
			<Button type="button" onclick={addCustom}>Add</Button>
		</div>
	</div>
</div>
