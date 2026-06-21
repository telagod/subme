<script lang="ts">
	/**
	 * (admin) route group · 管理后台布局
	 *
	 * 设计：
	 *   - 直接消费 adminNavGroups（管理员视角不做 flag 裁剪 —— Vue tree 同语义）。
	 *   - density='compact'，与用户端 comfortable 形成密度对比。
	 *   - 类型桥接：admin 配置没有 featureFlag 字段，icon 是 LucideIcon（兼容 Component）。
	 *     Svelte 端口仍走 unknown 转换保险，避免 .d.ts 子类型分歧时打喷嚏。
	 */
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import AppShell from '$lib/shell/AppShell.svelte';
	import { adminNavGroups } from '$lib/nav/admin.config';
	import { enforceAdminRoute, logoutFromAdmin } from '$lib/routing/adminGuard';
	import type { NavGroup as ShellNavGroup } from '$lib/shell/nav';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { children }: { children?: Snippet } = $props();

	const navGroups = $derived(adminNavGroups as unknown as ShellNavGroup[]);
	const activePath = $derived(page?.url?.pathname ?? '/');

	onMount(() => {
		void enforceAdminRoute(auth, goto, page.url.pathname, page.url.search);
	});

	async function handleLogout() {
		await logoutFromAdmin(auth, goto);
	}

	function handleToggleTheme() {
		theme.toggle();
	}
</script>

<AppShell
	{navGroups}
	variant="admin"
	density="compact"
	brandLabel="ADMIN"
	{activePath}
	isDark={theme.isDark}
	onToggleTheme={handleToggleTheme}
	onLogout={handleLogout}
>
	{@render children?.()}
</AppShell>
