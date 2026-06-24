<script lang="ts">
	/**
	 * AppShell · 顶层布局壳（Svelte 端口）
	 *
	 * 端口自 frontend/src/components/shell/AppShell.vue:1-94。结构：
	 *   ┌────────────────────────────────────┐
	 *   │ AppSidebar (256px / 64px collapsed)│ AppTopbar (64px sticky) │
	 *   │                                    │─────────────────────────│
	 *   │                                    │ main content (overflow) │
	 *   └────────────────────────────────────┴─────────────────────────┘
	 *
	 * 设计要点：
	 *   - density 通过 data-density 属性挂在根节点，下游组件用 CSS var 取尺寸
	 *     （--row-h / --input-h / --px，见 app.css）
	 *   - variant 决定子组件细节（admin/user 切换链路、主题颜色基调）
	 *   - activePath 默认从 $app/state 取，便于 SvelteKit 路由集成；
	 *     测试时可用 activePath prop 强制注入，避免 mock $app/state
	 *   - 主题/语言/登出/密度回调全部上抛 —— shell 不持有这些全局状态
	 */
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import AppSidebar from './AppSidebar.svelte';
	import AppTopbar from './AppTopbar.svelte';
	import type { NavGroup } from './nav';

	type Props = {
		navGroups: NavGroup[];
		variant: 'user' | 'admin';
		user?: { email: string; role: string; username?: string; avatarUrl?: string } | null;
		density?: 'compact' | 'comfortable';
		isDark?: boolean;
		collapsed?: boolean;
		brandLabel?: string;
		siteName?: string;
		/** 默认从 $app/state.page.url.pathname 取；显式传入时 prop 优先（测试友好）。 */
		activePath?: string;
		onToggleTheme?: () => void;
		onToggleDensity?: () => void;
		onToggleLocale?: () => void;
		onLogout?: () => void;
		children?: Snippet;
	};

	const {
		navGroups,
		variant,
		user = null,
		density = 'comfortable',
		isDark = false,
		collapsed = false,
		brandLabel = '',
		siteName,
		activePath,
		onToggleTheme,
		onToggleDensity,
		onToggleLocale,
		onLogout,
		children
	}: Props = $props();

	/**
	 * 取 active path：
	 *   - 显式 activePath 优先（测试场景 / 父组件强制指定）
	 *   - 否则从 $app/state 的 page.url.pathname 取（SvelteKit 运行时）
	 *   - 最后 fallback 到 '/'，避免 SSR/build 阶段崩
	 */
	const resolvedPath = $derived.by(() => {
		if (activePath !== undefined) return activePath;
		try {
			return page?.url?.pathname ?? '/';
		} catch {
			// $app/state 在某些纯 SSR-disabled 构建阶段可能未就绪
			return '/';
		}
	});

	const resolvedSiteName = $derived(siteName ?? (variant === 'admin' ? 'sub2api · admin' : 'sub2api'));

	// 暗色主题：把 'dark' 类挂到 documentElement
	// 仅在 isDark 变化时同步 —— 不主动 onMount 读取（由上层 prop 全权决定）
	$effect(() => {
		if (typeof document === 'undefined') return;
		if (isDark) document.documentElement.classList.add('dark');
		else document.documentElement.classList.remove('dark');
	});

	onMount(() => {
		// 占位：onboarding tour / cmd-k 全局快捷键可在后续 PR 接入
	});
</script>

<div
	class="flex h-screen w-full overflow-hidden bg-background text-foreground"
	data-density={density}
	data-variant={variant}
>
	<AppSidebar
		{navGroups}
		activePath={resolvedPath}
		{collapsed}
		{brandLabel}
		siteName={resolvedSiteName}
	/>

	<div class="relative z-[1] flex min-w-0 flex-1 flex-col">
		<AppTopbar
			{variant}
			{user}
			{navGroups}
			activePath={resolvedPath}
			{density}
			{isDark}
			{onToggleTheme}
			{onToggleDensity}
			{onToggleLocale}
			{onLogout}
		/>

		<main class="flex-1 overflow-y-auto" style="padding: 24px 26px 80px;">
			{@render children?.()}
		</main>
	</div>
</div>
