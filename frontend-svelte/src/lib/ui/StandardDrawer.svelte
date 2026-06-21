<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { cn } from './class';

	type Side = 'right' | 'left';
	type Width = 'sm' | 'md' | 'lg';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		side?: Side;
		width?: Width;
		showHeader?: boolean;
		class?: string;
		'data-testid'?: string;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description = '',
		side = 'right',
		width = 'md',
		showHeader = true,
		class: className = '',
		children,
		'data-testid': testId
	}: Props = $props();

	const widthClass: Record<Width, string> = {
		sm: 'max-w-md',
		md: 'max-w-xl',
		lg: 'max-w-2xl'
	};

	const sideClass: Record<Side, string> = {
		right: 'right-0 border-l',
		left: 'left-0 border-r'
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid={testId}
			class={cn(
				'fixed top-0 z-50 flex h-full w-[calc(100vw-2rem)] flex-col border-border bg-card p-5 text-card-foreground shadow-xl outline-none',
				widthClass[width],
				sideClass[side],
				className
			)}
		>
			{#if showHeader}
				<Dialog.Title class="text-lg font-semibold text-foreground">{title}</Dialog.Title>
				{#if description}
					<Dialog.Description class="mt-1 text-sm text-muted-foreground">
						{description}
					</Dialog.Description>
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
