<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { cn } from './class';

	type Option = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	type Props = Omit<HTMLSelectAttributes, 'children'> & {
		value: string;
		options?: Option[];
		children?: Snippet;
	};

	let { value = $bindable(), options = [], class: className = '', children, ...rest }: Props = $props();

	$effect(() => {
		if (value === '' || value == null) {
			throw new Error(
				`[NativeSelect sentinel] value must be a non-empty string; received ${JSON.stringify(value)}. ` +
					`Use a sentinel like '__all__' or '__none__' instead of empty string.`
			);
		}
	});
</script>

<select
	bind:value
	class={cn(
		'h-[var(--input-h,2.5rem)] rounded-md border border-input bg-background px-3 text-sm',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		{#each options as option}
			<option value={option.value} disabled={option.disabled}>{option.label}</option>
		{/each}
	{/if}
</select>
