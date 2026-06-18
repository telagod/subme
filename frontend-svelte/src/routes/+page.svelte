<script lang="ts">
	/**
	 * Landing redirect (seed)
	 *
	 * 设计：
	 *   - 真正的 auth-aware 跳转在后续 PR 里走 auth store + goto()。
	 *   - 当前阶段用 <meta http-equiv="refresh"> 提供一个保守 fallback：
	 *     未登录用户也是命中 /dashboard，再由 (user)/+layout 做兜底重定向到 /login。
	 *   - 同时附带客户端 goto，避免静态 meta refresh 的 0.x 秒延迟可见。
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/dashboard', { replaceState: true });
	});
</script>

<svelte:head>
	<meta http-equiv="refresh" content="0;url=/dashboard" />
	<title>sub2api</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background text-foreground">
	<div class="text-center">
		<p class="text-sm text-muted-foreground">Redirecting…</p>
		<noscript>
			<p class="mt-2 text-sm">
				<a class="underline" href="/dashboard">Continue to dashboard</a>
			</p>
		</noscript>
	</div>
</main>
