<script lang="ts">
	/**
	 * PlansFilterBar — search input + platform select + status select + counter.
	 * Extracted from +page.svelte for thin-orchestrator pattern.
	 */
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	type Props = {
		searchInput: string;
		platformFilter: string;
		statusFilter: string;
		platformOptions: Array<{ value: string; label: string }>;
		statusOptions: Array<{ value: string; label: string }>;
		filteredCount: number;
		totalCount: number;
	};

	let {
		searchInput = $bindable(),
		platformFilter = $bindable(),
		statusFilter = $bindable(),
		platformOptions,
		statusOptions,
		filteredCount,
		totalCount
	}: Props = $props();
</script>

<Card class="flex flex-wrap items-center gap-2 p-2" data-testid="plans-filters">
	<div class="relative">
		<Search
			class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			type="search"
			class="h-8 w-56 pl-7 pr-2"
			placeholder={$_('admin.plansCatalog.searchPlaceholder', {
				default: '搜索方案名称…'
			})}
			bind:value={searchInput}
			data-testid="plans-search"
		/>
	</div>

	<label class="ml-1 text-xs text-muted-foreground" for="plans-platform-filter">
		{$_('payment.admin.platform', { default: '平台' })}
	</label>
	<NativeSelect
		id="plans-platform-filter"
		class="h-8 px-2"
		bind:value={platformFilter}
		options={platformOptions}
		data-testid="plans-platform-filter"
	/>

	<label class="ml-1 text-xs text-muted-foreground" for="plans-status-filter">
		{$_('common.status', { default: '状态' })}
	</label>
	<NativeSelect
		id="plans-status-filter"
		class="h-8 px-2"
		bind:value={statusFilter}
		options={statusOptions}
		data-testid="plans-status-filter"
	/>

	<div class="ml-auto text-xs text-muted-foreground tabular-nums">
		{filteredCount} / {totalCount}
	</div>
</Card>
