<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { UsageGranularity } from '$lib/api/user/usage';
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

	function toggleModel(model: string) {
		const fakeEvent = {
			currentTarget: { value: '', selectedOptions: [] as unknown as HTMLCollectionOf<HTMLOptionElement> }
		};

		if (model === MODELS_ALL) {
			fakeEvent.currentTarget.value = MODELS_ALL;
			onModelsChange(fakeEvent as unknown as Event);
			return;
		}

		const current = isAllModels ? [] : [...(modelsFilter as string[])];
		const idx = current.indexOf(model);
		if (idx >= 0) current.splice(idx, 1);
		else current.push(model);

		if (current.length === 0 || current.length === knownModels.length) {
			fakeEvent.currentTarget.value = MODELS_ALL;
		} else {
			fakeEvent.currentTarget.value = current.join(',');
			const opts = current.map(v => ({ value: v, selected: true }));
			fakeEvent.currentTarget.selectedOptions = opts as unknown as HTMLCollectionOf<HTMLOptionElement>;
		}
		onModelsChange(fakeEvent as unknown as Event);
	}

	function isModelSelected(model: string): boolean {
		if (isAllModels) return false;
		return (modelsFilter as string[]).includes(model);
	}
</script>

<section class="space-y-3" data-testid="usage-filters">
	<!-- Row 1: date range + endpoint + groupBy -->
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

	<!-- Row 2: model filter chips -->
		<div class="space-y-1.5" data-testid="usage-models-filter">
	{#if knownModels.length > 0}
			<span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{$_('user.usage.modelsFilter', { default: 'Models' })}
			</span>
			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					class="rounded-md border px-2.5 py-1 text-xs font-medium transition-all {isAllModels
						? 'border-primary bg-primary/10 text-primary'
						: 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}"
					onclick={() => toggleModel(MODELS_ALL)}
				>
					{$_('user.usage.allModels', { default: 'All' })}
					{#if knownModels.length > 0}
						<span class="ml-1 opacity-60">{knownModels.length}</span>
					{/if}
				</button>
				{#each knownModels as m (m)}
					<button
						type="button"
						class="rounded-md border px-2.5 py-1 text-xs font-medium transition-all {isModelSelected(m)
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}"
						onclick={() => toggleModel(m)}
					>
						{m}
					</button>
				{/each}
			</div>
	{/if}
		</div>
</section>
