<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = HTMLInputAttributes & {
		value?: HTMLInputAttributes['value'];
	};

	let { value = $bindable(), class: className = '', ...rest }: Props = $props();
</script>

<input
	bind:value
	class={cn(
		'h-[var(--input-h,2.5rem)] w-full rounded-md border border-input bg-background px-3 text-sm',
		'placeholder:text-muted-foreground',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
