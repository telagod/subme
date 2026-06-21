<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import type { AdminPlan } from '$lib/api/admin/plans';

	const STATUS_ALL = '__all__';
	const PLAN_ALL = '__all__';

	type Props = {
		statusFilter: string;
		planFilter: string;
		searchInput: string;
		expiresAfter: string;
		expiresBefore: string;
		plans: AdminPlan[];
		onStatusChange: (v: string) => void;
		onPlanChange: (v: string) => void;
		onSearchChange: (v: string) => void;
		onExpiresAfterChange: (v: string) => void;
		onExpiresBeforeChange: (v: string) => void;
		onSearch: () => void;
	};

	let {
		statusFilter,
		planFilter,
		searchInput,
		expiresAfter,
		expiresBefore,
		plans,
		onStatusChange,
		onPlanChange,
		onSearchChange,
		onExpiresAfterChange,
		onExpiresBeforeChange,
		onSearch
	}: Props = $props();

	const statusOptions = $derived([
		{ value: STATUS_ALL, label: $_('admin.subscriptions.statusAll', { default: 'All statuses' }) },
		{ value: 'active', label: $_('admin.subscriptions.statusActive', { default: 'Active' }) },
		{ value: 'cancelled', label: $_('admin.subscriptions.statusCancelled', { default: 'Cancelled' }) },
		{ value: 'expired', label: $_('admin.subscriptions.statusExpired', { default: 'Expired' }) }
	]);

	const planOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		return [
			{ value: PLAN_ALL, label: $_('admin.subscriptions.planAll', { default: 'All plans' }) },
			...plans.map((p) => ({ value: String(p.id), label: p.name }))
		];
	});

</script>

<Card class="flex flex-wrap items-center gap-2 p-2" data-testid="admin-subs-filters">
	<div class="relative">
		<Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
		<Input
			type="search"
			class="h-8 w-56 pl-7 pr-2"
			placeholder={$_('admin.subscriptions.searchPlaceholder', {
				default: 'Search user email or ID…'
			})}
			value={searchInput}
			oninput={(e) => {
				onSearchChange((e.currentTarget as HTMLInputElement).value);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					onSearch();
				}
			}}
			data-testid="admin-subs-search"
		/>
	</div>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-status-filter">
		{$_('common.status', { default: 'Status' })}
	</label>
	<NativeSelect
		id="admin-subs-status-filter"
		class="h-8 px-2"
		value={statusFilter}
		options={statusOptions}
		onchange={(e) => onStatusChange((e.currentTarget as HTMLSelectElement).value)}
		data-testid="admin-subs-status-filter"
	/>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-plan-filter">
		{$_('admin.subscriptions.planLabel', { default: 'Plan' })}
	</label>
	<NativeSelect
		id="admin-subs-plan-filter"
		class="h-8 px-2"
		value={planFilter}
		options={planOptions}
		onchange={(e) => onPlanChange((e.currentTarget as HTMLSelectElement).value)}
		data-testid="admin-subs-plan-filter"
	/>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-after">
		{$_('admin.subscriptions.expiresAfter', { default: 'Expires after' })}
	</label>
	<Input
		id="admin-subs-expires-after"
		type="date"
		class="h-8 px-2"
		value={expiresAfter}
		onchange={(e) => onExpiresAfterChange((e.currentTarget as HTMLInputElement).value)}
		data-testid="admin-subs-expires-after"
	/>
	<label class="ml-1 text-xs text-muted-foreground" for="admin-subs-expires-before">
		{$_('admin.subscriptions.expiresBefore', { default: 'Expires before' })}
	</label>
	<Input
		id="admin-subs-expires-before"
		type="date"
		class="h-8 px-2"
		value={expiresBefore}
		onchange={(e) => onExpiresBeforeChange((e.currentTarget as HTMLInputElement).value)}
		data-testid="admin-subs-expires-before"
	/>
</Card>
