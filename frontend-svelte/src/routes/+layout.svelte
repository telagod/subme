<script lang="ts">
	/**
	 * 顶层布局：全局 CSS + CommandPalette 全局挂载点。
	 *
	 * CommandPalette 在此挂载一次：⌘K / Ctrl+K 在任意路由都可用，无需各 layout 自行接线。
	 */
	import '../app.css';
	import '$lib/i18n';
	import { beforeNavigate, goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import CommandPalette from '$lib/shell/CommandPalette.svelte';
	import { showError } from '$lib/stores/toast.svelte';
	import { waitInitialLocale } from '$lib/i18n';

	let { children } = $props();
	let i18nReady = $state(false);

	const protectedPrefixes = [
		'/dashboard',
		'/keys',
		'/usage',
		'/profile',
		'/redeem',
		'/orders',
		'/subscriptions',
		'/purchase',
		'/affiliate',
		'/affiliates',
		'/billing',
		'/available-channels',
		'/custom',
		'/monitor',
		'/admin'
	];

	function matchesPrefix(pathname: string, prefixes: string[]): boolean {
		return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
	}

	beforeNavigate(({ to, cancel }) => {
		if (!to) return;
		const path = to.url.pathname;

		if (!matchesPrefix(path, protectedPrefixes)) return;

		if (!auth.isAuthenticated) {
			cancel();
			const next = encodeURIComponent(path + to.url.search);
			void goto(`/login?next=${next}`, { replaceState: true });
			return;
		}

		if (matchesPrefix(path, ['/admin']) && !auth.isAdmin) {
			cancel();
			showError('Admin access required.');
			void goto('/dashboard', { replaceState: true });
		}
	});

	void waitInitialLocale().finally(() => {
		i18nReady = true;
	});
</script>

{#if i18nReady}
	{@render children()}
	<CommandPalette />
{/if}
