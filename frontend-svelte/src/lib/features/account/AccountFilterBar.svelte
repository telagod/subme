<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ALL } from '$lib/features/supply/supply';

	type Props = {
		search: string;
		platform: string;
		type: string;
		status: string;
		group: string;
		privacy: string;
		schedulable: string;
		hasProxy: string;
		onApply: () => void;
	};
	let {
		search = $bindable(''),
		platform = $bindable(ALL),
		type = $bindable(ALL),
		status = $bindable(ALL),
		group = $bindable(''),
		privacy = $bindable(ALL),
		schedulable = $bindable(ALL),
		hasProxy = $bindable(ALL),
		onApply
	}: Props = $props();

	const PLATFORMS = ['claude', 'openai', 'gemini', 'sora', 'codex', 'antigravity'];
	const STATUS_OPTIONS = ['active', 'inactive', 'error', 'rate_limited'];

	const platformOptions = $derived([{ value: ALL, label: 'All platforms' }, ...PLATFORMS.map(v => ({ value: v, label: v }))]);
	const typeOptions = [
		{ value: ALL, label: 'All types' },
		{ value: 'api_key', label: 'API key' },
		{ value: 'apikey', label: 'apikey' },
		{ value: 'oauth', label: 'OAuth' },
		{ value: 'setup-token', label: 'Setup token' },
		{ value: 'bedrock', label: 'AWS Bedrock' }
	];
	const statusOptions = $derived([
		{ value: ALL, label: 'All statuses' },
		...STATUS_OPTIONS.map(v => ({ value: v, label: v })),
		{ value: 'temp_unschedulable', label: 'temp_unschedulable' },
		{ value: 'unschedulable', label: 'unschedulable' }
	]);
	const privacyModeOptions = [
		{ value: ALL, label: 'Any privacy' },
		{ value: '__unset__', label: 'Not set' },
		{ value: 'training_off', label: 'Training off' },
		{ value: 'training_set_cf_blocked', label: 'CF blocked' },
		{ value: 'training_set_failed', label: 'Set failed' }
	];
	const boolOpts = [{ value: ALL, label: 'Any' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

	const activeFilterCount = $derived(
		[search.trim(), platform !== ALL, type !== ALL, status !== ALL, group.trim(), privacy !== ALL, schedulable !== ALL, hasProxy !== ALL]
			.filter(Boolean).length
	);

	const hasActiveFilters = $derived(activeFilterCount > 0);
	const filterLabel = $derived(hasActiveFilters ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}` : '');
</script>

<Card class="p-3" data-testid="account-filter-bar">
	<div class="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_150px_150px_150px_160px_150px_150px_150px_auto]">
		<label class="relative">
			<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
			<Input class="pl-9" placeholder={$_('admin.accountsQuench.searchPlaceholder', { default: 'Search name, email, note' })} bind:value={search} onkeydown={(e) => e.key === 'Enter' && onApply()} />
		</label>
		<NativeSelect bind:value={platform} options={platformOptions} onchange={onApply} data-testid="accounts-platform-filter" />
		<NativeSelect bind:value={type} options={typeOptions} onchange={onApply} data-testid="accounts-type-filter" />
		<NativeSelect bind:value={status} options={statusOptions} onchange={onApply} data-testid="accounts-status-filter" />
		<Input placeholder="Group ID" bind:value={group} onkeydown={(e) => e.key === 'Enter' && onApply()} data-testid="accounts-group-filter" />
		<NativeSelect bind:value={privacy} options={privacyModeOptions} onchange={onApply} data-testid="accounts-privacy-filter" />
		<NativeSelect bind:value={schedulable} options={boolOpts} onchange={onApply} data-testid="accounts-schedulable-filter" />
		<NativeSelect bind:value={hasProxy} options={boolOpts} onchange={onApply} data-testid="accounts-has-proxy-filter" />
		<Button onclick={onApply}>Apply</Button>
	</div>
</Card>

{#if hasActiveFilters}
	<p class="text-sm text-muted-foreground">{filterLabel}</p>
{/if}
