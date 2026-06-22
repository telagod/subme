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
				'fixed top-0 z-50 flex h-full w-[calc(100vw-2rem)] flex-col border-border bg-card text-card-foreground shadow-xl outline-none transition-transform duration-200',
				widthClass[width],
				sideClass[side],
				className
			)}
		>
			{#if showHeader}
				<div class="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
					<div>
						<Dialog.Title class="text-lg font-semibold text-foreground">{title}</Dialog.Title>
						{#if description}
							<Dialog.Description class="mt-0.5 text-sm text-muted-foreground">{description}</Dialog.Description>
						{/if}
					</div>
					<button onclick={() => (open = false)} class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</div>
			{:else}
				<Dialog.Title class="sr-only">{title}</Dialog.Title>
				{#if description}<Dialog.Description class="sr-only">{description}</Dialog.Description>{/if}
			{/if}
			<div class="flex-1 overflow-y-auto px-5 py-4">
				{@render children?.()}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
