<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
	type Size = 'sm' | 'md' | 'icon';

	type BaseProps = {
		variant?: Variant;
		size?: Size;
		children?: Snippet;
	};

	type Props = BaseProps &
		HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			href?: string;
		};

	let {
		variant = 'default',
		size = 'md',
		href,
		type = 'button',
		disabled = false,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variantClass: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		ghost: 'hover:bg-accent hover:text-accent-foreground',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
	};

	const sizeClass: Record<Size, string> = {
		sm: 'h-8 px-3 text-xs',
		md: 'h-[var(--input-h,2.5rem)] px-4 text-sm',
		icon: 'h-8 w-8 p-0'
	};

	const classes = $derived(
		cn(
			'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
			'disabled:pointer-events-none disabled:opacity-50',
			disabled && 'pointer-events-none opacity-50',
			variantClass[variant],
			sizeClass[size],
			className
		)
	);
</script>

{#if href}
	<a {href} class={classes} aria-disabled={disabled || undefined} {...rest}>
		{@render children?.()}
	</a>
{:else}
	<button {type} {disabled} class={classes} {...rest}>
		{@render children?.()}
	</button>
{/if}
