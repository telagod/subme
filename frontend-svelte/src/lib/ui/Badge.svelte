<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Variant = 'default' | 'secondary' | 'outline' | 'destructive';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		variant?: Variant;
		children?: Snippet;
	};

	let { variant = 'secondary', class: className = '', children, ...rest }: Props = $props();

	const variantClass: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground',
		secondary: 'bg-secondary text-secondary-foreground',
		outline: 'border border-border bg-background text-foreground',
		destructive: 'bg-destructive text-destructive-foreground'
	};
</script>

<span
	class={cn(
		'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium',
		variantClass[variant],
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
