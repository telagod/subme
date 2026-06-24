<script lang="ts">
	/**
	 * Root redirect
	 *
	 * Vue router maps "/" to "/home". Keep the public landing page as the
	 * default entry point; auth-aware dashboard routing stays on the CTA.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/home', { replaceState: true });
	});
</script>

<svelte:head>
	<meta http-equiv="refresh" content="0;url=/home" />
	<title>sub2api</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background text-foreground">
	<div class="text-center">
		<p class="text-sm text-muted-foreground">Redirecting…</p>
			<noscript>
				<p class="mt-2 text-sm">
					<a class="underline" href="/home">Continue to home</a>
				</p>
			</noscript>
	</div>
</main>
