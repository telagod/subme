<script lang="ts">
	import { _ } from 'svelte-i18n';
</script>

<svelte:head>
	<title>{$_('nav.dashboard', { default: 'Dashboard' })} · sub2api</title>
</svelte:head>

<section class="space-y-3">
	<h1 class="text-2xl font-semibold tracking-tight">
		{$_('nav.dashboard', { default: 'Dashboard' })}
	</h1>
	<p class="text-muted-foreground">User dashboard route group works.</p>
</section>
