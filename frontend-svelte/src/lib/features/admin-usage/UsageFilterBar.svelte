<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Button from '$lib/ui/Button.svelte';
	import {
		searchAdminUsageUsers,
		searchAdminUsageApiKeys,
		type SimpleUsageUser,
		type SimpleUsageApiKey
	} from '$lib/api/admin/usage';
	import {
		ALL,
		REQUEST_TYPE_OPTIONS,
		BILLING_MODE_OPTIONS,
		SORT_OPTIONS as USAGE_SORT_OPTIONS
	} from '$lib/features/admin-usage/admin-usage';

	interface Props {
		searchInput: string;
		startDate: string;
		endDate: string;
		granularity: 'day' | 'hour';
		requestTypeFilter: string;
		billingModeFilter: string;
		sortChoice: string;
		exactTotal: boolean;
		onSearchChange: (value: string) => void;
		onDateChange: () => void;
		onFilterChange: () => void;
	}

	let {
		searchInput = $bindable(),
		startDate = $bindable(),
		endDate = $bindable(),
		granularity = $bindable(),
		requestTypeFilter = $bindable(),
		billingModeFilter = $bindable(),
		sortChoice = $bindable(),
		exactTotal = $bindable(),
		onSearchChange,
		onDateChange,
		onFilterChange
	}: Props = $props();

	const requestTypeOptions = REQUEST_TYPE_OPTIONS;
	const billingModeOptions = BILLING_MODE_OPTIONS;
	const sortOptions = USAGE_SORT_OPTIONS;

	// Typeahead state
	let userSuggestions = $state<SimpleUsageUser[]>([]);
	let apiKeySuggestions = $state<SimpleUsageApiKey[]>([]);
	let showSuggestions = $state(false);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function onSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		const val = searchInput.trim();
		if (val.length < 2) {
			userSuggestions = [];
			apiKeySuggestions = [];
			showSuggestions = false;
			return;
		}
		searchDebounceTimer = setTimeout(async () => {
			try {
				const [users, keys] = await Promise.all([
					searchAdminUsageUsers(val),
					searchAdminUsageApiKeys(undefined, val)
				]);
				userSuggestions = users.slice(0, 6);
				apiKeySuggestions = keys.slice(0, 4);
				showSuggestions = userSuggestions.length > 0 || apiKeySuggestions.length > 0;
			} catch {
				showSuggestions = false;
			}
		}, 300);
	}

	function pickUser(user: SimpleUsageUser) {
		searchInput = String(user.id);
		showSuggestions = false;
		onSearchChange(searchInput);
	}

	function pickApiKey(key: SimpleUsageApiKey) {
		searchInput = String(key.user_id);
		showSuggestions = false;
		onSearchChange(searchInput);
	}
</script>

<Card class="p-3">
	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
		<!-- Search with typeahead -->
		<div class="relative md:col-span-2">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				class="pl-9"
				placeholder={$_('admin.usage.searchPlaceholder', { default: 'User ID, email, or model' })}
				bind:value={searchInput}
				oninput={onSearchInput}
				onkeydown={(event) => {
					if (event.key === 'Enter') { showSuggestions = false; onSearchChange(searchInput); }
					if (event.key === 'Escape') showSuggestions = false;
				}}
				onfocusout={() => setTimeout(() => { showSuggestions = false; }, 200)}
			/>
			{#if showSuggestions}
				<div class="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-md">
					{#if userSuggestions.length > 0}
						<p class="px-3 py-1 text-[10px] uppercase text-muted-foreground">Users</p>
						{#each userSuggestions as u (u.id)}
							<button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent" onmousedown={() => pickUser(u)}>
								<span class="font-medium">#{u.id}</span>
								<span class="truncate text-muted-foreground">{u.email}</span>
								{#if u.deleted}<Badge variant="outline" class="text-[10px]">deleted</Badge>{/if}
							</button>
						{/each}
					{/if}
					{#if apiKeySuggestions.length > 0}
						<p class="px-3 py-1 text-[10px] uppercase text-muted-foreground">API Keys</p>
						{#each apiKeySuggestions as k (k.id)}
							<button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent" onmousedown={() => pickApiKey(k)}>
								<span class="font-medium">#{k.id}</span>
								<span class="truncate text-muted-foreground">{k.name}</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
		<Input type="date" bind:value={startDate} onchange={onDateChange} aria-label="Start date" />
		<Input type="date" bind:value={endDate} onchange={onDateChange} aria-label="End date" />
		<NativeSelect bind:value={granularity} options={[{ value: 'day', label: 'Day' }, { value: 'hour', label: 'Hour' }]} onchange={onFilterChange} />
		<NativeSelect bind:value={requestTypeFilter} options={requestTypeOptions} onchange={onFilterChange} data-testid="admin-usage-request-type-filter" />
		<NativeSelect bind:value={billingModeFilter} options={billingModeOptions} onchange={onFilterChange} data-testid="admin-usage-billing-mode-filter" />
		<NativeSelect bind:value={sortChoice} options={sortOptions} onchange={onFilterChange} data-testid="admin-usage-sort" />
		<label class="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
			<Checkbox bind:checked={exactTotal} onchange={onFilterChange} />
			{$_('admin.usage.exactTotal', { default: 'Exact total' })}
		</label>
		<Button onclick={onFilterChange}>
			{$_('common.search', { default: 'Search' })}
		</Button>
	</div>
</Card>
