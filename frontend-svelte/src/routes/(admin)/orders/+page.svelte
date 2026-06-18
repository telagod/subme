<script lang="ts">
	import { _ } from 'svelte-i18n';
</script>

<svelte:head>
	<title>{$_('nav.quench.orders', { default: 'Orders' })} · sub2api admin</title>
</svelte:head>

<section class="space-y-3">
	<h1 class="text-2xl font-semibold tracking-tight">
		{$_('nav.quench.orders', { default: 'Orders' })}
	</h1>
	<p class="text-muted-foreground">Admin orders placeholder.</p>
</section>
