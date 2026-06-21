<script lang="ts">
	/**
	 * RefundFilterBar — filter controls for the refund queue.
	 *
	 * Owns the filter UI; fires onApply when the user changes a filter.
	 * Bind values are two-way so the page can read current filter state.
	 */
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import type { RefundRequestStatus } from '$lib/api/admin/refunds';

	const ALL = '__all__';

	const REFUND_STATUSES: RefundRequestStatus[] = [
		'pending',
		'approved',
		'rejected',
		'completed',
		'failed'
	];

	interface Props {
		searchInput: string;
		statusFilter: string;
		startDate: string;
		endDate: string;
		onApply: () => void;
	}

	let {
		searchInput = $bindable(),
		statusFilter = $bindable(),
		startDate = $bindable(),
		endDate = $bindable(),
		onApply
	}: Props = $props();

	const statusOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		const all = {
			value: ALL,
			label: $_('admin.refunds.statusAll', { default: 'All statuses' })
		};
		return [
			all,
			...REFUND_STATUSES.map((s) => ({
				value: s,
				label: $_(`admin.refunds.status.${s}`, { default: s })
			}))
		];
	});

	function handleKeywordKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onApply();
		}
	}
</script>

<Card class="flex flex-wrap items-center gap-2 p-2" data-testid="admin-refunds-filters">
	<Input
		type="search"
		class="h-8 w-56 px-2"
		placeholder={$_('admin.refunds.searchPlaceholder', {
			default: 'Search order / user…'
		})}
		bind:value={searchInput}
		onkeydown={handleKeywordKey}
		data-testid="admin-refunds-search"
	/>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-status-filter">
		{$_('common.status', { default: 'Status' })}
	</label>
	<NativeSelect
		id="admin-refunds-status-filter"
		class="h-8 px-2"
		bind:value={statusFilter}
		options={statusOptions}
		onchange={onApply}
		data-testid="admin-refunds-status-filter"
	/>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-start-date">
		{$_('admin.refunds.startDate', { default: 'From' })}
	</label>
	<Input
		id="admin-refunds-start-date"
		type="date"
		class="h-8 px-2"
		bind:value={startDate}
		onchange={onApply}
		data-testid="admin-refunds-start-date"
	/>
	<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-end-date">
		{$_('admin.refunds.endDate', { default: 'To' })}
	</label>
	<Input
		id="admin-refunds-end-date"
		type="date"
		class="h-8 px-2"
		bind:value={endDate}
		onchange={onApply}
		data-testid="admin-refunds-end-date"
	/>
</Card>
