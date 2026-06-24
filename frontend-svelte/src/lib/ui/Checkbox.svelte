<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = Omit<HTMLInputAttributes, 'type'> & {
		checked?: boolean;
	};

	let { checked = $bindable(false), class: className = '', ...rest }: Props = $props();
</script>

<input
	type="checkbox"
	bind:checked
	class={cn(
		'h-4 w-4 shrink-0 rounded border border-input accent-primary',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
