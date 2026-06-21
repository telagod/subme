<script lang="ts">
	/**
	 * UsageFilterBar · usage page filter controls
	 *
	 * Renders date range inputs, models multi-select, endpoint select, and groupBy select.
	 * All Select controls use sentinel values ('__all__') per reshadcn-migration contract.
	 */
	import { _ } from 'svelte-i18n';
	import type { UsageGranularity } from '$lib/api/user/usage';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	const MODELS_ALL = '__all__' as const;
	const ENDPOINT_ALL = '__all__' as const;

	let {
		startDate,
		endDate,
		modelsFilter,
		endpointFilter,
		groupBy,
		knownModels,
		knownEndpoints,
		onStartDateChange,
		onEndDateChange,
		onModelsChange,
		onEndpointChange,
		onGroupByChange
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
</script>

<section class="flex flex-wrap items-end gap-3" data-testid="usage-filters">
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="usage-start-date"
		>
			{$_('user.usage.startDate', { default: 'From' })}
		</label>
		<Input
			id="usage-start-date"
			data-testid="usage-start-date"
			type="date"
			value={startDate}
			onchange={onStartDateChange}
			class="h-9 w-auto"
		/>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="usage-end-date"
		>
			{$_('user.usage.endDate', { default: 'To' })}
		</label>
		<Input
			id="usage-end-date"
			data-testid="usage-end-date"
			type="date"
			value={endDate}
			onchange={onEndDateChange}
			class="h-9 w-auto"
		/>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="usage-models-filter"
		>
			{$_('user.usage.modelsFilter', { default: 'Models' })}
		</label>
		<NativeSelect
			id="usage-models-filter"
			data-testid="usage-models-filter"
			value={MODELS_ALL}
			multiple
			size={3}
			onchange={onModelsChange}
			class="min-w-[180px] rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
		>
			<option
				value={MODELS_ALL}
				selected={modelsFilter === MODELS_ALL}
			>
				{$_('user.usage.allModels', { default: 'All models' })}
			</option>
			{#each knownModels as m (m)}
				<option
					value={m}
					selected={modelsFilter !== MODELS_ALL && modelsFilter.includes(m)}
				>
					{m}
				</option>
			{/each}
		</NativeSelect>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="usage-endpoint-filter"
		>
			{$_('user.usage.endpointFilter', { default: 'Endpoint' })}
		</label>
		<NativeSelect
			id="usage-endpoint-filter"
			data-testid="usage-endpoint-filter"
			value={endpointFilter}
			onchange={onEndpointChange}
			class="h-9"
		>
			<option value={ENDPOINT_ALL}>
				{$_('user.usage.allEndpoints', { default: 'All endpoints' })}
			</option>
			{#each knownEndpoints as ep (ep)}
				<option value={ep}>{ep}</option>
			{/each}
		</NativeSelect>
	</div>
	<div class="space-y-1.5">
		<label
			class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			for="usage-groupby"
		>
			{$_('user.usage.groupBy', { default: 'Group by' })}
		</label>
		<NativeSelect
			id="usage-groupby"
			data-testid="usage-groupby"
			value={groupBy}
			onchange={onGroupByChange}
			class="h-9"
		>
			<option value="day">{$_('user.usage.groupDay', { default: 'Day' })}</option>
			<option value="hour">{$_('user.usage.groupHour', { default: 'Hour' })}</option>
			<option value="model">{$_('user.usage.groupModel', { default: 'Model' })}</option>
			<option value="endpoint">
				{$_('user.usage.groupEndpoint', { default: 'Endpoint' })}
			</option>
		</NativeSelect>
	</div>
</section>
