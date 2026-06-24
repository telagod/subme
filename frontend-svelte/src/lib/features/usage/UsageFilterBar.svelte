<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronDown, Search, X } from '@lucide/svelte';
	import type { UsageGranularity } from '$lib/api/user/usage';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	const MODELS_ALL = '__all__' as const;
	const ENDPOINT_ALL = '__all__' as const;

	let {
		startDate, endDate, modelsFilter, endpointFilter, groupBy,
		knownModels, knownEndpoints,
		onStartDateChange, onEndDateChange, onModelsChange, onEndpointChange, onGroupByChange
	}: {
		startDate: string;
		endDate: string;
		modelsFilter: string[] | typeof MODELS_ALL;
		endpointFilter: string | typeof ENDPOINT_ALL;
		groupBy: UsageGranularity;
		knownModels: string[];
		knownEndpoints: string[];
		onStartDateChange: (e: Event) => void;
		onEndDateChange: (e: Event) => void;
		onModelsChange: (e: Event) => void;
		onEndpointChange: (e: Event) => void;
		onGroupByChange: (e: Event) => void;
	} = $props();

	const isAllModels = $derived(modelsFilter === MODELS_ALL);
	const selectedCount = $derived(isAllModels ? knownModels.length : (modelsFilter as string[]).length);

	let modelDropdownOpen = $state(false);
	let modelSearch = $state('');

	const filteredModels = $derived(
		modelSearch.trim()
			? knownModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
			: knownModels
	);

	function fireModelsChange(selected: string[]) {
		const fakeEvent = {
			currentTarget: { value: '', selectedOptions: [] as unknown as HTMLCollectionOf<HTMLOptionElement> }
		};
		if (selected.length === 0 || selected.length === knownModels.length) {
			fakeEvent.currentTarget.value = MODELS_ALL;
		} else {
			fakeEvent.currentTarget.value = selected.join(',');
			fakeEvent.currentTarget.selectedOptions = selected.map(v => ({ value: v, selected: true })) as unknown as HTMLCollectionOf<HTMLOptionElement>;
		}
		onModelsChange(fakeEvent as unknown as Event);
	}

	function toggleModel(model: string) {
		const current = isAllModels ? [] : [...(modelsFilter as string[])];
		const idx = current.indexOf(model);
		if (idx >= 0) current.splice(idx, 1); else current.push(model);
		fireModelsChange(current);
	}

	function selectAll() { fireModelsChange([]); }
	function clearAll() { fireModelsChange([]); }

	function isModelSelected(model: string): boolean {
		if (isAllModels) return true;
		return (modelsFilter as string[]).includes(model);
	}

	function modelButtonLabel(): string {
		if (isAllModels) return $_('user.usage.allModels', { default: 'All models' });
		const sel = modelsFilter as string[];
		if (sel.length === 1) return sel[0];
		return `${sel.length} ${$_('user.usage.modelsSelected', { default: 'models' })}`;
	}
</script>

<section class="space-y-3" data-testid="usage-filters">
	<div class="flex flex-wrap items-end gap-3">
		<div class="space-y-1">
			<label class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" for="usage-start-date">
				{$_('user.usage.startDate', { default: 'From' })}
			</label>
			<Input id="usage-start-date" data-testid="usage-start-date" type="date" value={startDate} onchange={onStartDateChange} class="h-9 w-auto" />
		</div>
		<div class="space-y-1">
			<label class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" for="usage-end-date">
				{$_('user.usage.endDate', { default: 'To' })}
			</label>
			<Input id="usage-end-date" data-testid="usage-end-date" type="date" value={endDate} onchange={onEndDateChange} class="h-9 w-auto" />
		</div>

		<!-- Model multi-select dropdown -->
		<div class="relative space-y-1" data-testid="usage-models-filter">
			<label class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{$_('user.usage.modelsFilter', { default: 'Models' })}
			</label>
			<button
				type="button"
				class="flex h-9 min-w-[180px] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-muted/50"
				onclick={() => { modelDropdownOpen = !modelDropdownOpen; modelSearch = ''; }}
			>
				<span class="truncate {isAllModels ? 'text-muted-foreground' : 'text-foreground'}">
					{modelButtonLabel()}
				</span>
				<ChevronDown size={14} class="shrink-0 text-muted-foreground" />
			</button>

			{#if modelDropdownOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute left-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
					onkeydown={(e) => { if (e.key === 'Escape') modelDropdownOpen = false; }}
				>
					<!-- Search -->
					<div class="border-b border-border px-3 py-2">
						<div class="relative">
							<Search size={13} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								class="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
								placeholder={$_('user.usage.searchModels', { default: 'Search models...' })}
								bind:value={modelSearch}
							/>
						</div>
					</div>

					<!-- Quick actions -->
					<div class="flex items-center justify-between border-b border-border px-3 py-1.5">
						<button type="button" class="text-xs text-primary hover:underline" onclick={selectAll}>
							{$_('user.usage.selectAll', { default: 'Select all' })}
						</button>
						{#if !isAllModels}
							<button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={clearAll}>
								{$_('user.usage.clearSelection', { default: 'Clear' })}
							</button>
						{/if}
					</div>

					<!-- Model list -->
					<div class="max-h-[240px] overflow-y-auto py-1">
						{#if filteredModels.length === 0}
							<p class="px-3 py-3 text-center text-xs text-muted-foreground">{$_('user.usage.noModelsMatch', { default: 'No models match' })}</p>
						{:else}
							{#each filteredModels as m (m)}
								{@const checked = isModelSelected(m)}
								<label class="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
									<input type="checkbox" {checked} class="rounded" onchange={() => toggleModel(m)} />
									<span class="truncate">{m}</span>
								</label>
							{/each}
						{/if}
					</div>

					<!-- Footer -->
					<div class="border-t border-border px-3 py-2">
						<Button size="sm" class="w-full" onclick={() => (modelDropdownOpen = false)}>
							{$_('common.confirm', { default: 'Confirm' })}
						</Button>
					</div>
				</div>

				<!-- Backdrop to close -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => (modelDropdownOpen = false)} onkeydown={() => {}}></div>
			{/if}
		</div>

		<div class="space-y-1">
			<label class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" for="usage-endpoint-filter">
				{$_('user.usage.endpointFilter', { default: 'Endpoint' })}
			</label>
			<NativeSelect id="usage-endpoint-filter" data-testid="usage-endpoint-filter" value={endpointFilter} onchange={onEndpointChange}
				options={[
					{ value: ENDPOINT_ALL, label: $_('user.usage.allEndpoints', { default: 'All endpoints' }) },
					...knownEndpoints.map(ep => ({ value: ep, label: ep }))
				]}
				class="h-9"
			/>
		</div>
		<div class="space-y-1">
			<label class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" for="usage-groupby">
				{$_('user.usage.groupBy', { default: 'Group by' })}
			</label>
			<NativeSelect id="usage-groupby" data-testid="usage-groupby" value={groupBy} onchange={onGroupByChange}
				options={[
					{ value: 'day', label: $_('user.usage.groupDay', { default: 'Day' }) },
					{ value: 'hour', label: $_('user.usage.groupHour', { default: 'Hour' }) },
					{ value: 'model', label: $_('user.usage.groupModel', { default: 'Model' }) },
					{ value: 'endpoint', label: $_('user.usage.groupEndpoint', { default: 'Endpoint' }) }
				]}
				class="h-9"
			/>
		</div>
	</div>

	<!-- Selected model tags (when not "all") -->
	{#if !isAllModels && (modelsFilter as string[]).length > 0}
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-[11px] text-muted-foreground">{$_('user.usage.activeFilters', { default: 'Filters:' })}</span>
			{#each modelsFilter as m (m)}
				<span class="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary">
					{m}
					<button type="button" class="hover:text-destructive" onclick={() => toggleModel(m)}>
						<X size={12} />
					</button>
				</span>
			{/each}
			<button type="button" class="text-xs text-muted-foreground hover:text-destructive" onclick={clearAll}>
				{$_('user.usage.clearAll', { default: 'Clear all' })}
			</button>
		</div>
	{/if}
</section>
