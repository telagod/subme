<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
	};

	let { children, class: className = '', tabindex = 0, ...rest }: Props = $props();
</script>

<div
	role="button"
	{tabindex}
	class={cn(
		'cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
