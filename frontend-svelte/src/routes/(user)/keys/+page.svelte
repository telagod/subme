<script lang="ts">
	import { _ } from 'svelte-i18n';
</script>

<svelte:head>
	<title>{$_('nav.apiKeys', { default: 'API Keys' })} · sub2api</title>
</svelte:head>

<section class="space-y-3">
	<h1 class="text-2xl font-semibold tracking-tight">
		{$_('nav.apiKeys', { default: 'API Keys' })}
	</h1>
	<p class="text-muted-foreground">API Keys placeholder.</p>
</section>
