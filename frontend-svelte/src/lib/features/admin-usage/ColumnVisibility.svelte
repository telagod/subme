<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Columns3, Check } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';

	export interface ColumnDef {
		key: string;
		label: string;
		alwaysVisible?: boolean;
	}

	type Props = {
		columns: ColumnDef[];
		hiddenColumns: Set<string>;
		onToggle: (key: string) => void;
	};

	let { columns, hiddenColumns, onToggle }: Props = $props();

	let open = $state(false);

	const toggleableColumns = $derived(columns.filter((c) => !c.alwaysVisible));

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('[data-column-dropdown]')) {
			open = false;
		}
	}

	function toggle() {
		open = !open;
		if (open) {
			setTimeout(() => document.addEventListener('click', handleClickOutside, { once: true }), 0);
		}
	}
</script>

<div class="relative" data-column-dropdown>
	<Button variant="outline" size="sm" class="px-2" onclick={toggle} title={$_('admin.usage.columnSettings', { default: '列设置' })}>
		<Columns3 size={16} />
		<span class="hidden md:inline ml-1.5">{$_('admin.usage.columnSettings', { default: '列设置' })}</span>
	</Button>

	{#if open}
		<div class="absolute right-0 top-full z-50 mt-1 max-h-80 w-48 overflow-y-auto rounded-md border bg-popover py-1 shadow-md" data-column-dropdown>
			{#each toggleableColumns as col (col.key)}
				{@const visible = !hiddenColumns.has(col.key)}
				<button
					type="button"
					class="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-accent"
					onclick={() => onToggle(col.key)}
				>
					<span>{col.label}</span>
					{#if visible}
						<Check size={14} class="text-primary" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
