<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import type { Proxy, ProxyAccountSummary } from '$lib/api/admin/proxies';

	interface Props {
		open: boolean;
		subject: Proxy | null;
		accounts: ProxyAccountSummary[];
		loading: boolean;
		onClose: () => void;
	}

	let { open = $bindable(), subject, accounts, loading, onClose }: Props = $props();
</script>

<StandardDialog bind:open title={`${subject?.name ?? 'Proxy'} accounts`} width="sm" data-testid="proxy-accounts-dialog">
	<div class="mt-4 max-h-80 overflow-auto rounded-md border">
		{#if loading}
			<p class="p-4 text-sm text-muted-foreground">Loading...</p>
		{:else if accounts.length === 0}
			<p class="p-4 text-sm text-muted-foreground">No accounts use this proxy.</p>
		{:else}
			{#each accounts as account}
				<div class="border-b p-3 text-sm last:border-b-0">
					<p class="font-medium">{account.name}</p>
					<p class="text-xs text-muted-foreground">{account.platform} · {account.type} · {account.status}</p>
				</div>
			{/each}
		{/if}
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>Close</Button>
	</div>
</StandardDialog>
