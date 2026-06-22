<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ALL } from '$lib/features/supply/supply';

	interface Props {
		searchInput: string;
		platformFilter: string;
		statusFilter: string;
		onApply: () => void;
	}

	let { searchInput = $bindable(), platformFilter = $bindable(), statusFilter = $bindable(), onApply }: Props = $props();

	const PLATFORM_OPTIONS = ['anthropic', 'openai', 'gemini', 'antigravity'];
	const platformOptions = $derived([
		{ value: ALL, label: 'All platforms' },
		...PLATFORM_OPTIONS.map((value) => ({ value, label: value }))
	]);
	const statusOptions = [
		{ value: ALL, label: 'All statuses' },
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];
</script>

<Card class="p-3">
	<div class="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
		<label class="relative">
			<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
			<Input class="pl-9" placeholder="Search groups" bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && onApply()} />
		</label>
		<NativeSelect bind:value={platformFilter} options={platformOptions} onchange={onApply} data-testid="groups-platform-filter" />
		<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={onApply} data-testid="groups-status-filter" />
		<Button onclick={onApply}>{$_('common.apply', { default: 'Apply' })}</Button>
	</div>
</Card>
