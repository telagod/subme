<script lang="ts">
	import { Search, Check } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import type { ContentModerationConfig, ContentModerationModelFilterType } from '$lib/api/admin/riskControl';
	import type { AdminGroup } from '$lib/api/admin/groups';
	import { modelFilterSummary } from './risk-control';

	type Props = {
		config: ContentModerationConfig;
		groups: AdminGroup[];
		modelFilterText: string;
	};

	let { config = $bindable(), groups, modelFilterText = $bindable() }: Props = $props();

	let groupSearch = $state('');

	const filteredGroups = $derived.by(() => {
		const kw = groupSearch.trim().toLowerCase();
		if (!kw) return groups;
		return groups.filter(
			(g) => g.name.toLowerCase().includes(kw) || String(g.platform).toLowerCase().includes(kw)
		);
	});

	const selectedCount = $derived(config.group_ids.length);
	const modelCount = $derived(
		modelFilterText
			.split(/[\n,]/)
			.map((s) => s.trim())
			.filter(Boolean).length
	);

	function toggleGroup(id: number) {
		const idx = config.group_ids.indexOf(id);
		if (idx >= 0) {
			config.group_ids = config.group_ids.filter((gid) => gid !== id);
		} else {
			config.group_ids = [...config.group_ids, id];
		}
	}

	function isGroupSelected(id: number): boolean {
		return config.group_ids.includes(id);
	}

	function setFilterType(type: ContentModerationModelFilterType) {
		config.model_filter = { ...config.model_filter, type };
		if (type === 'all') modelFilterText = '';
	}

	const FILTER_OPTIONS: Array<{ value: ContentModerationModelFilterType; label: string; desc: string }> = [
		{ value: 'all', label: 'All models', desc: 'Apply risk control to all models' },
		{ value: 'include', label: 'Include only', desc: 'Only check listed models' },
		{ value: 'exclude', label: 'Exclude', desc: 'Skip listed models from checks' }
	];
</script>

<div class="space-y-6">
	<!-- Group scope -->
	<div class="space-y-4">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<h3 class="text-sm font-semibold text-foreground">Group Scope</h3>
				<p class="mt-1 text-xs text-muted-foreground">
					Choose which groups are subject to risk control.
				</p>
			</div>
			<div class="inline-flex rounded-md border bg-muted p-0.5">
				<Button
					variant="ghost"
					size="sm"
					class="h-7 rounded px-3 text-xs {config.all_groups ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
					onclick={() => { config.all_groups = true; }}
				>
					All groups
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 rounded px-3 text-xs {!config.all_groups ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
					onclick={() => { config.all_groups = false; }}
				>
					Selected ({selectedCount})
				</Button>
			</div>
		</div>

		{#if !config.all_groups}
			<div class="space-y-3">
				<div class="relative">
					<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<Input bind:value={groupSearch} placeholder="Search groups..." class="pl-9" />
				</div>
				<div class="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
					{#each filteredGroups as group (group.id)}
						<button
							type="button"
							class="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors
								{isGroupSelected(group.id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50'}"
							onclick={() => toggleGroup(group.id)}
						>
							<span class="min-w-0">
								<span class="block truncate text-xs font-medium text-foreground">{group.name}</span>
								<Badge variant="outline" class="mt-0.5 px-1.5 py-0 text-[10px]">{group.platform}</Badge>
							</span>
							<span
								class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border
									{isGroupSelected(group.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}"
							>
								{#if isGroupSelected(group.id)}<Check size={10} strokeWidth={3} />{/if}
							</span>
						</button>
					{/each}
					{#if filteredGroups.length === 0}
						<p class="col-span-full py-4 text-center text-sm text-muted-foreground">No groups found</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Model filter -->
	<div class="space-y-4 rounded-md border p-4">
		<div class="flex items-center justify-between gap-3">
			<div>
				<h3 class="text-sm font-semibold text-foreground">Model Filter</h3>
				<p class="mt-1 text-xs text-muted-foreground">
					Restrict which models are checked by risk control.
				</p>
			</div>
			<Badge variant="outline" class="px-2 py-0.5 text-[11px]">
				{modelFilterSummary(config.model_filter.type, modelCount)}
			</Badge>
		</div>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
			{#each FILTER_OPTIONS as opt (opt.value)}
				<button
					type="button"
					class="flex flex-col rounded-md border px-3 py-2.5 text-left text-sm transition-colors
						{config.model_filter.type === opt.value
							? 'border-primary/40 bg-primary/5'
							: 'border-border hover:bg-muted/50'}"
					onclick={() => setFilterType(opt.value)}
				>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs font-medium">{opt.label}</span>
						<span
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border
								{config.model_filter.type === opt.value
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-input'}"
						>
							{#if config.model_filter.type === opt.value}<Check size={8} strokeWidth={3} />{/if}
						</span>
					</div>
					<span class="mt-1 text-[11px] text-muted-foreground">{opt.desc}</span>
				</button>
			{/each}
		</div>

		{#if config.model_filter.type !== 'all'}
			<label class="block space-y-1.5 text-sm">
				<span class="text-xs text-muted-foreground">Model names (one per line)</span>
				<Textarea class="min-h-24 font-mono text-xs" bind:value={modelFilterText} placeholder="gpt-4o&#10;claude-3-opus&#10;..." />
				<span class="text-[11px] text-muted-foreground">{modelCount} model{modelCount === 1 ? '' : 's'} configured</span>
			</label>
		{/if}
	</div>
</div>
