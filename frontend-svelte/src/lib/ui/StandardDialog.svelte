<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { cn } from './class';

	type Width = 'sm' | 'md' | 'lg';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		width?: Width;
		showHeader?: boolean;
		onOpenChange?: (open: boolean) => void;
		class?: string;
		'data-testid'?: string;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description = '',
		width = 'md',
		showHeader = true,
		onOpenChange,
		class: className = '',
		children,
		'data-testid': testId
	}: Props = $props();

	const widthClass: Record<Width, string> = {
		sm: 'max-w-[440px]',
		md: 'max-w-xl',
		lg: 'max-w-2xl'
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid={testId}
			class={cn(
				'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg outline-none',
				widthClass[width],
				className
			)}
		>
			{#if showHeader}
				<Dialog.Title class="text-lg font-semibold text-foreground">{title}</Dialog.Title>
				{#if description}
					<Dialog.Description class="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
				{/if}
			{:else}
				<Dialog.Title class="sr-only">{title}</Dialog.Title>
				{#if description}
					<Dialog.Description class="sr-only">{description}</Dialog.Description>
				{/if}
			{/if}
			{@render children?.()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
