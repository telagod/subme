<script lang="ts">
	/**
	 * UserFilterBar -- advanced filter bar + quick-view chips for admin users page.
	 *
	 * Features:
	 *   - Quick-view chips: All / Admin / Disabled (mutually exclusive, drive statusFilter + roleFilter)
	 *   - Search input with Enter-to-commit
	 *   - Collapsible advanced filters: group, balance range, date ranges, subscription status
	 *   - All filter state managed externally via bindable props
	 */
	import { _ } from 'svelte-i18n';
	import { listAllGroups, type AdminGroup } from '$lib/api/admin/groups';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ALL } from './users';

	type Props = {
		search: string;
		statusFilter: string;
		roleFilter: string;
		groupFilter: string;
		balanceMin: string;
		balanceMax: string;
		createdAfter: string;
		createdBefore: string;
		lastActiveAfter: string;
		lastActiveBefore: string;
		subscriptionStatus: string;
		onCommitSearch: () => void;
		onFiltersChanged: () => void;
	};

	let {
		search = $bindable(''),
		statusFilter = $bindable(ALL),
		roleFilter = $bindable(ALL),
		groupFilter = $bindable(ALL),
		balanceMin = $bindable(''),
		balanceMax = $bindable(''),
		createdAfter = $bindable(''),
		createdBefore = $bindable(''),
		lastActiveAfter = $bindable(''),
		lastActiveBefore = $bindable(''),
		subscriptionStatus = $bindable(ALL),
		onCommitSearch,
		onFiltersChanged
	}: Props = $props();

	let showAdvanced = $state(false);
	let groups = $state<AdminGroup[]>([]);
	let groupsLoaded = $state(false);

	type ChipKey = 'all' | 'admin' | 'disabled';

	const activeChip = $derived<ChipKey>(
		statusFilter === 'disabled' ? 'disabled' :
		roleFilter === 'admin' ? 'admin' :
		'all'
	);

	function selectChip(chip: ChipKey) {
		statusFilter = ALL;
		roleFilter = ALL;
		if (chip === 'admin') roleFilter = 'admin';
		else if (chip === 'disabled') statusFilter = 'disabled';
		onFiltersChanged();
	}

	const hasAdvancedFilters = $derived(
		groupFilter !== ALL ||
		balanceMin !== '' ||
		balanceMax !== '' ||
		createdAfter !== '' ||
		createdBefore !== '' ||
		lastActiveAfter !== '' ||
		lastActiveBefore !== '' ||
		subscriptionStatus !== ALL
	);

	function clearAdvanced() {
		groupFilter = ALL;
		balanceMin = '';
		balanceMax = '';
		createdAfter = '';
		createdBefore = '';
		lastActiveAfter = '';
		lastActiveBefore = '';
		subscriptionStatus = ALL;
		onFiltersChanged();
	}

	async function loadGroups() {
		if (groupsLoaded) return;
		try {
			groups = await listAllGroups();
			groupsLoaded = true;
		} catch { /* ignore */ }
	}

	$effect(() => { if (showAdvanced) loadGroups(); });
</script>

<div class="space-y-2.5" data-testid="user-filter-bar">
	<!-- Quick-view chips + search row -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Quick-view chips -->
		<div class="flex gap-1" role="group" aria-label={$_('admin.users.quickFilters', { default: 'Quick filters' })}>
			{#each [
				{ key: 'all', label: $_('admin.users.chipAll', { default: 'All' }) },
				{ key: 'admin', label: $_('admin.users.chipAdmin', { default: 'Admins' }) },
				{ key: 'disabled', label: $_('admin.users.chipDisabled', { default: 'Disabled' }) }
			] as chip}
				<button type="button"
					class="rounded-full border px-3 py-1 text-xs font-medium transition-colors
						{activeChip === chip.key
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border bg-background text-muted-foreground hover:bg-muted/60'}"
					data-testid="user-chip-{chip.key}"
					onclick={() => selectChip(chip.key as ChipKey)}>
					{chip.label}
				</button>
			{/each}
		</div>

		<!-- Search -->
		<div class="flex-1">
			<Input type="search" placeholder={$_('admin.users.searchPlaceholder', { default: 'Search email, username, ID...' })}
				bind:value={search} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') onCommitSearch(); }}
				data-testid="users-search" />
		</div>

		<!-- Status + Role selects -->
		<NativeSelect bind:value={statusFilter} data-testid="users-status-filter"
			onchange={() => onFiltersChanged()}>
			<option value={ALL}>{$_('admin.users.allStatuses', { default: 'All Statuses' })}</option>
			<option value="active">{$_('admin.users.statusActive', { default: 'Active' })}</option>
			<option value="disabled">{$_('admin.users.statusDisabled', { default: 'Disabled' })}</option>
		</NativeSelect>
		<NativeSelect bind:value={roleFilter} data-testid="users-role-filter"
			onchange={() => onFiltersChanged()}>
			<option value={ALL}>{$_('admin.users.allRoles', { default: 'All Roles' })}</option>
			<option value="admin">{$_('admin.users.roleAdmin', { default: 'Admin' })}</option>
			<option value="user">{$_('admin.users.roleUser', { default: 'User' })}</option>
		</NativeSelect>

		<!-- Advanced toggle -->
		<Button variant="ghost" size="sm" class="text-xs {hasAdvancedFilters ? 'text-primary' : ''}"
			onclick={() => { showAdvanced = !showAdvanced; }}
			data-testid="users-advanced-toggle">
			{showAdvanced
				? $_('admin.users.hideAdvanced', { default: 'Hide filters' })
				: $_('admin.users.showAdvanced', { default: 'Advanced' })}
			{#if hasAdvancedFilters}
				<span class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">!</span>
			{/if}
		</Button>
	</div>

	<!-- Advanced filter panel -->
	{#if showAdvanced}
		<div class="rounded-lg border border-border bg-muted/30 p-3" data-testid="users-advanced-panel">
			<div class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
				<!-- Group -->
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterGroup', { default: 'Group' })}</span>
					<NativeSelect bind:value={groupFilter} onchange={() => onFiltersChanged()}
						data-testid="users-group-filter">
						<option value={ALL}>{$_('admin.users.allGroups', { default: 'All Groups' })}</option>
						{#each groups as g}
							<option value={g.name}>{g.name}</option>
						{/each}
					</NativeSelect>
				</label>

				<!-- Balance range -->
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterBalanceMin', { default: 'Balance Min ($)' })}</span>
					<Input type="number" step="0.01" min="0" class="h-8 text-xs" placeholder="0.00"
						bind:value={balanceMin}
						onchange={() => onFiltersChanged()}
						data-testid="users-balance-min" />
				</label>
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterBalanceMax', { default: 'Balance Max ($)' })}</span>
					<Input type="number" step="0.01" min="0" class="h-8 text-xs" placeholder="999.99"
						bind:value={balanceMax}
						onchange={() => onFiltersChanged()}
						data-testid="users-balance-max" />
				</label>

				<!-- Subscription status -->
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterSubscription', { default: 'Subscription' })}</span>
					<NativeSelect bind:value={subscriptionStatus} onchange={() => onFiltersChanged()}
						data-testid="users-sub-filter">
						<option value={ALL}>{$_('admin.users.subAll', { default: 'Any' })}</option>
						<option value="active">{$_('admin.users.subActive', { default: 'Active' })}</option>
						<option value="expired">{$_('admin.users.subExpired', { default: 'Expired' })}</option>
						<option value="none">{$_('admin.users.subNone', { default: 'None' })}</option>
					</NativeSelect>
				</label>

				<!-- Created date range -->
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterCreatedAfter', { default: 'Created After' })}</span>
					<Input type="date" class="h-8 text-xs"
						bind:value={createdAfter}
						onchange={() => onFiltersChanged()}
						data-testid="users-created-after" />
				</label>
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterCreatedBefore', { default: 'Created Before' })}</span>
					<Input type="date" class="h-8 text-xs"
						bind:value={createdBefore}
						onchange={() => onFiltersChanged()}
						data-testid="users-created-before" />
				</label>

				<!-- Last active date range -->
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterActiveAfter', { default: 'Active After' })}</span>
					<Input type="date" class="h-8 text-xs"
						bind:value={lastActiveAfter}
						onchange={() => onFiltersChanged()}
						data-testid="users-active-after" />
				</label>
				<label class="flex flex-col gap-1 text-xs">
					<span class="font-medium text-muted-foreground">{$_('admin.users.filterActiveBefore', { default: 'Active Before' })}</span>
					<Input type="date" class="h-8 text-xs"
						bind:value={lastActiveBefore}
						onchange={() => onFiltersChanged()}
						data-testid="users-active-before" />
				</label>
			</div>

			{#if hasAdvancedFilters}
				<div class="mt-3 flex justify-end">
					<Button variant="ghost" size="sm" class="text-xs text-muted-foreground" onclick={clearAdvanced}
						data-testid="users-clear-filters">
						{$_('admin.users.clearFilters', { default: 'Clear all filters' })}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>
