<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = HTMLTextareaAttributes & {
		value?: HTMLTextareaAttributes['value'];
	};

	let { value = $bindable(), class: className = '', ...rest }: Props = $props();
</script>

<textarea
	bind:value
	class={cn(
		'min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
		'placeholder:text-muted-foreground',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
></textarea>
