<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Variant = 'default' | 'warning' | 'destructive';

	type Props = HTMLAttributes<HTMLDivElement> & {
		variant?: Variant;
		children?: Snippet;
	};

	let { variant = 'default', class: className = '', children, ...rest }: Props = $props();

	const variantClass: Record<Variant, string> = {
		default: 'border-border bg-card text-card-foreground',
		warning: 'border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-300',
		destructive: 'border-destructive/30 bg-destructive/5 text-destructive'
	};
</script>

<div class={cn('rounded-md border p-3 text-sm', variantClass[variant], className)} {...rest}>
	{@render children?.()}
</div>
