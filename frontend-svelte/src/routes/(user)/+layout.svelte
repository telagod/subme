<script lang="ts">
	/**
	 * (user) route group · 用户端布局
	 *
	 * 设计：
	 *   - 取 buildUserNavGroups() (string featureFlag 模型) → filterNavGroups()
	 *     按 layout 注入的 flag Set + simple-mode 裁剪 → 投喂给 AppShell。
	 *   - flag Set 暂时硬编码全开（public-settings 接入是后续 PR 的事）；
	 *     这样既不闪烁也不丢菜单。
	 *   - density='comfortable'（brief 指定，与 admin 区分）。
	 *   - AppShell 的 NavGroup 类型源自 $lib/shell/nav（icon: Component，
	 *     featureFlag: getter）；这里过滤后 featureFlag 字段已无意义，但
	 *     字符串类型与 shell 的 getter 类型不兼容 → 用 `unknown as` 桥接。
	 *     运行时无影响：AppSidebar 不读 featureFlag（filter 已完成）。
	 */
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import AppShell from '$lib/shell/AppShell.svelte';
	import { buildUserNavGroups } from '$lib/nav/user.config';
	import { filterNavGroups } from '$lib/nav/filter';
	import type { NavGroup as ShellNavGroup } from '$lib/shell/nav';

	let { children }: { children?: Snippet } = $props();

	// 全 flag 开启（public-settings 接入前的保守默认）。
	const featureFlags = new Set<string>([
		'availableChannels',
		'channelMonitor',
		'payment',
		'affiliate'
	]);

	// 简易模式开关（auth store 接入后再读真值）。
	const isSimpleMode = false;

	const userGroupsRaw = $derived(buildUserNavGroups());
	const userGroupsFiltered = $derived(
		filterNavGroups(userGroupsRaw, { featureFlags, isSimpleMode })
	);
	// 跨模型桥接：filter 已剔除 flag-fail 项，featureFlag 字段无需保留。
	const navGroups = $derived(userGroupsFiltered as unknown as ShellNavGroup[]);

	const activePath = $derived(page?.url?.pathname ?? '/');

	onMount(() => {
		// TODO(POC auth): 未登录跳 /login —— 当前 seed 阶段无 auth store，先不拦。
	});

	function handleLogout() {
		// TODO(POC auth): 调 auth store logout，再 goto('/login')。
		goto('/login', { replaceState: true });
	}
</script>

<AppShell
	{navGroups}
	variant="user"
	density="comfortable"
	{activePath}
	onLogout={handleLogout}
>
	{@render children?.()}
</AppShell>
