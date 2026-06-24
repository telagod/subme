<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Props = HTMLAttributes<HTMLDivElement> & {
		padded?: boolean;
		children?: Snippet;
	};

	let { padded = true, class: className = '', children, ...rest }: Props = $props();
</script>

<div
	class={cn('rounded-lg border bg-card text-card-foreground shadow-sm', padded && 'p-4', className)}
	{...rest}
>
	{@render children?.()}
</div>
