<script lang="ts">
	import { BarChart3, Clock3, Server, WalletCards } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';

	type Props = { summary: { label: string; value: string }[] };
	let { summary }: Props = $props();
</script>

<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
	{#each summary as item}
		<Card class="p-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
					<p class="mt-1 text-2xl font-semibold">{item.value}</p>
				</div>
				{#if item.label === 'Requests'}
					<BarChart3 class="h-5 w-5 text-muted-foreground" />
				{:else if item.label === 'Tokens'}
					<Server class="h-5 w-5 text-muted-foreground" />
				{:else if item.label === 'User billed'}
					<WalletCards class="h-5 w-5 text-muted-foreground" />
				{:else}
					<Clock3 class="h-5 w-5 text-muted-foreground" />
				{/if}
			</div>
		</Card>
	{/each}
</section>
