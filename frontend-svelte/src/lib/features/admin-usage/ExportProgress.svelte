<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { FileSpreadsheet, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		show: boolean;
		progress: number;
		current: number;
		total: number;
		onCancel?: () => void;
	};

	let { show, progress, current, total, onCancel }: Props = $props();

	const pct = $derived(Math.min(100, Math.max(0, progress)));
</script>

{#if show}
	<div class="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4" data-testid="export-progress">
		<div class="flex w-full max-w-md items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
			<FileSpreadsheet size={20} class="shrink-0 text-primary animate-pulse" />
			<div class="flex-1 min-w-0">
				<div class="flex items-center justify-between text-sm">
					<span class="font-medium">
						{$_('admin.usage.exporting', { default: 'Exporting' })}
					</span>
					<span class="text-xs text-muted-foreground">
						{current.toLocaleString()} / {total.toLocaleString()}
					</span>
				</div>
				<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-primary transition-all duration-300"
						style="width: {pct}%"
					></div>
				</div>
			</div>
			{#if onCancel}
				<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={onCancel} aria-label="Cancel export">
					<X size={14} />
				</Button>
			{/if}
		</div>
	</div>
{/if}
