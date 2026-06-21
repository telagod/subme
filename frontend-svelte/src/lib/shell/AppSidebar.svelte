<script lang="ts">
	/**
	 * AppSidebar · 左侧导航栏（Svelte 端口）
	 *
	 * 设计：
	 *   - 256px 固定宽度（折叠态 64px），bg-card + border-r
	 *   - 单层嵌套：item.children 存在时整组以 collapsible 展开/收起；
	 *     任一 child active 时父项默认展开
	 *   - active 高亮：bg-primary/10 + text-primary + inset ring
	 *   - 通过 props.activePath 取当前 route，避免组件内部直接耦合 $app/state，
	 *     方便测试时注入任意 path
	 *
	 * 端口自 frontend/src/components/shell/AppSidebarShell.vue:1-92。
	 */
	import { _ } from 'svelte-i18n';
	import type { NavGroup, NavItem } from './nav';
	import { isItemActive } from './nav';

	type Props = {
		navGroups: NavGroup[];
		activePath: string;
		collapsed?: boolean;
		brandLabel?: string;
		siteName?: string;
	};

	const { navGroups, activePath, collapsed = false, brandLabel = '', siteName = 'sub2api' }: Props =
		$props();

	/** 判定 item 自身或任一子项是否 active —— 用于父项高亮 + 默认展开。 */
	function isActiveOrChildActive(item: NavItem): boolean {
		if (isItemActive(activePath, item.path)) return true;
		if (item.children) {
			return item.children.some((c) => isItemActive(activePath, c.path));
		}
		return false;
	}
</script>

<aside
	class="hidden flex-col border-r bg-card lg:flex"
	style="height:100vh; position:sticky; top:0; overflow:hidden; width: {collapsed
		? '64px'
		: '256px'};"
	data-collapsed={collapsed}
	aria-label="Primary navigation"
>
	<!-- 品牌块 -->
	<div class="flex items-center gap-2 border-b px-3 py-3" style="min-height: 64px;">
		<img src="/logo.svg" alt={siteName} class="h-[30px] w-[30px] rounded-md" />
		{#if !collapsed}
			<div class="flex min-w-0 flex-col">
				<span class="truncate text-sm font-semibold tracking-[0.02em]">{siteName}</span>
				{#if brandLabel}
					<span
						class="font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground"
					>
						{brandLabel}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- 滚动导航 -->
	<div class="flex-1 overflow-y-auto p-2.5" data-tour="nav-root">
		{#each navGroups as group (group.key)}
			<div class="mb-3" data-tour="nav-group-{group.key}">
				{#if !collapsed}
					<div
						class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
					>
						{$_(group.labelKey)}
					</div>
				{/if}
				<ul class="flex flex-col gap-0.5">
					{#each group.items as item (item.key)}
						{@const active = isActiveOrChildActive(item)}
						{@const hasChildren = !!item.children && item.children.length > 0}
						<li>
							<a
								href={item.path}
								data-tour="nav-{item.key}"
								data-active={active || undefined}
								aria-current={isItemActive(activePath, item.path) ? 'page' : undefined}
								class="relative flex items-center gap-[9px] rounded-[8px] text-[13px] font-medium transition-colors"
								class:active
								style="height: var(--row-h); padding-left: var(--px); padding-right: var(--px);"
							>
								<item.icon class="h-[15px] w-[15px] shrink-0 opacity-90" />
								{#if !collapsed}
									<span class="truncate">{$_(item.labelKey)}</span>
								{/if}
							</a>
							{#if hasChildren && !collapsed && active}
								<ul class="ml-4 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
									{#each item.children ?? [] as child (child.key)}
										{@const childActive = isItemActive(activePath, child.path)}
										<li>
											<a
												href={child.path}
												data-tour="nav-{child.key}"
												data-active={childActive || undefined}
												aria-current={childActive ? 'page' : undefined}
												class="relative flex items-center gap-[9px] rounded-[8px] text-[12px] font-medium transition-colors"
												class:active={childActive}
												style="height: calc(var(--row-h) - 0.25rem); padding-left: var(--px); padding-right: var(--px);"
											>
												<child.icon class="h-[13px] w-[13px] shrink-0 opacity-80" />
												<span class="truncate">{$_(child.labelKey)}</span>
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</aside>

<style>
	/* active 态：用 :global + class selector 而不是依赖 tailwind 的 group-has-[data-active] —— 简单可移植 */
	a.active {
		background-color: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.14);
	}
	a.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 7px;
		bottom: 7px;
		width: 2px;
		border-radius: 2px;
		background: hsl(var(--primary));
		box-shadow: 0 0 8px hsl(var(--primary) / 0.6);
	}
	a:not(.active) {
		color: hsl(var(--muted-foreground));
	}
	a:not(.active):hover {
		background-color: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	a:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px hsl(var(--ring)),
			inset 0 0 0 1px hsl(var(--ring));
	}
</style>
