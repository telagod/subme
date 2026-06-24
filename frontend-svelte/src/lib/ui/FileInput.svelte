<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = Omit<HTMLInputAttributes, 'class' | 'type'> & {
		id: string;
		children?: Snippet;
		class?: string;
		inputClass?: string;
	};

	let {
		id,
		children,
		class: className = '',
		inputClass = '',
		disabled = false,
		...rest
	}: Props = $props();
</script>

<label
	for={id}
	aria-disabled={disabled || undefined}
	class={cn(
		'inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors',
		'hover:bg-accent hover:text-accent-foreground',
		'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
		disabled && 'pointer-events-none cursor-not-allowed opacity-50',
		className
	)}
>
	{@render children?.()}
</label>
<input {...rest} {id} type="file" {disabled} class={cn('sr-only', inputClass)} />
