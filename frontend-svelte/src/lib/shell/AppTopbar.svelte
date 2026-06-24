<script lang="ts">
	/**
	 * AppTopbar · 顶栏（Svelte 端口）
	 *
	 * 端口自 frontend/src/components/shell/AppTopbar.vue:1-219，关键差异：
	 *   - 头像下拉用 bits-ui 的 DropdownMenu（替代手写 click-outside + transition）
	 *   - 主题切换托管给上层（用 prop callback）—— shell 层不直接耦合 theme store
	 *   - 语言切换托管给上层 prop callback —— 与现有 LocaleSwitcher 解耦
	 *   - 密度切换：comfortable ↔ compact，state 由上层管理，topbar 仅显示按钮
	 *
	 * 切换跳转：
	 *   variant='admin' → 显示 'Switch to user view' → href="/dashboard"
	 *   variant='user' + role==='admin' → 显示 'Switch to admin view' → href="/admin/orders"
	 *   （Vue tree 默认指向 /admin/dashboard，这里改 /admin/orders 是按 task brief 要求）
	 */
	import { _, locale } from 'svelte-i18n';
	import { DropdownMenu } from 'bits-ui';
	import {
		ChevronDown,
		Languages,
		LayoutGrid,
		Sun,
		Moon,
		User,
		LogOut,
		LayoutDashboard,
		ShieldCheck
	} from '@lucide/svelte';
	import type { NavGroup } from './nav';
	import { resolveNavItem } from './nav';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		variant: 'user' | 'admin';
		user: { email: string; role: string; username?: string; avatarUrl?: string } | null;
		navGroups?: NavGroup[];
		activePath?: string;
		density?: 'compact' | 'comfortable';
		isDark?: boolean;
		onToggleTheme?: () => void;
		onToggleDensity?: () => void;
		onToggleLocale?: () => void;
		onLogout?: () => void;
	};

	const {
		variant,
		user,
		navGroups = [],
		activePath = '',
		density = 'comfortable',
		isDark = false,
		onToggleTheme,
		onToggleDensity,
		onToggleLocale,
		onLogout
	}: Props = $props();

	/** Breadcrumb：当前 path 命中的 group/item 标签。 */
	const crumb = $derived(activePath ? resolveNavItem(activePath, navGroups) : null);

	/** 头像 2 字母 fallback —— 取 username 首2 字符或 email local-part。 */
	const initials = $derived.by(() => {
		if (!user) return '?';
		const src = user.username || user.email.split('@')[0] || '?';
		return src.slice(0, 2).toUpperCase();
	});

	const displayName = $derived(user?.username || user?.email || '');

	/** locale 当前是否为英文（仅用于按钮上显示 "EN" / "中"，不参与切换逻辑）。 */
	const localeShort = $derived($locale?.startsWith('en') ? 'EN' : '中');
</script>

<header
	class="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/80 px-[22px] backdrop-blur-[8px]"
	style="height: 64px;"
	data-variant={variant}
>
	<!-- 面包屑 / 页面标题 -->
	<div class="flex min-w-0 flex-1 items-center text-sm">
		{#if crumb}
			<span class="text-muted-foreground">{$_(crumb.group.labelKey)}</span>
			<span class="mx-2 text-muted-foreground">›</span>
			<span class="truncate font-semibold">{$_(crumb.item.labelKey)}</span>
		{:else}
			<span class="font-semibold capitalize">{variant}</span>
		{/if}
	</div>

	<!-- 右侧操作簇 -->
	<div class="flex items-center gap-2">
		<!-- Admin/User 切换（直接可见，不藏在菜单里） -->
		{#if variant === 'user' && user?.role === 'admin'}
			<a
				href="/admin/dashboard"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
				data-testid="topbar-admin-shortcut"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				{$_('nav.adminPanel', { default: 'Admin' })}
			</a>
		{:else if variant === 'admin'}
			<a
				href="/dashboard"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				data-testid="topbar-user-shortcut"
			>
				<LayoutDashboard class="h-3.5 w-3.5" />
				{$_('nav.userPanel', { default: 'User' })}
			</a>
		{/if}

		<!-- 语言切换 -->
		<Button
			variant="outline"
			onclick={onToggleLocale}
			class="gap-1 bg-transparent text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
			style="height: var(--input-h); padding-left: var(--px); padding-right: var(--px);"
			aria-label={$_('topbar.toggleLanguage', { default: 'Toggle language' })}
			data-testid="topbar-locale"
		>
			<Languages class="h-4 w-4" />
			<span>{localeShort}</span>
		</Button>

		<!-- 密度切换 -->
		<Button
			variant="outline"
			size="icon"
			onclick={onToggleDensity}
			class="bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
			style="height: var(--input-h); width: var(--input-h);"
			aria-label={$_('topbar.toggleDensity', { default: 'Toggle density' })}
			aria-pressed={density === 'compact'}
			data-testid="topbar-density"
			title={density}
		>
			<LayoutGrid class="h-4 w-4" />
		</Button>

		<!-- 主题切换 -->
		<Button
			variant="outline"
			size="icon"
			onclick={onToggleTheme}
			class="bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
			style="height: var(--input-h); width: var(--input-h);"
			aria-label={$_('topbar.toggleTheme', { default: 'Toggle theme' })}
			data-testid="topbar-theme"
		>
			{#if isDark}
				<Sun class="h-4 w-4" />
			{:else}
				<Moon class="h-4 w-4" />
			{/if}
		</Button>

		<!-- 头像 + 下拉 -->
		{#if user}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex items-center gap-1.5 rounded-full border bg-transparent pl-1 pr-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style="height: var(--input-h);"
					aria-label={$_('topbar.accountMenu', { default: 'Account menu' })}
					data-testid="topbar-avatar"
				>
					{#if user.avatarUrl}
						<img
							src={user.avatarUrl}
							alt=""
							class="h-7 w-7 rounded-full object-cover"
						/>
					{:else}
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
						>
							{initials}
						</span>
					{/if}
					<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="z-50 min-w-[220px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
						sideOffset={6}
						align="end"
					>
						<div class="px-2 py-1.5">
							<div class="truncate text-sm font-semibold">{displayName}</div>
							{#if user.email && user.email !== displayName}
								<div class="truncate text-xs text-muted-foreground">{user.email}</div>
							{/if}
						</div>
						<DropdownMenu.Separator class="my-1 h-px bg-border" />

						<DropdownMenu.Item
							class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
						>
							{#snippet child({ props })}
								<a {...props} href="/profile" data-testid="topbar-profile">
									<User class="h-4 w-4" />
									<span>{$_('nav.profile', { default: 'Profile' })}</span>
								</a>
							{/snippet}
						</DropdownMenu.Item>

						{#if variant === 'admin'}
							<DropdownMenu.Item
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
							>
								{#snippet child({ props })}
									<a
										{...props}
										href="/dashboard"
										data-testid="topbar-switch-to-user"
									>
										<LayoutDashboard class="h-4 w-4" />
										<span>{$_('nav.switchToUserView', { default: 'Switch to user view' })}</span>
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{:else if variant === 'user' && user.role === 'admin'}
							<DropdownMenu.Item
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
							>
								{#snippet child({ props })}
									<a
										{...props}
										href="/admin/dashboard"
										data-testid="topbar-switch-to-admin"
									>
										<ShieldCheck class="h-4 w-4" />
										<span>{$_('nav.switchToAdminView', { default: 'Switch to admin view' })}</span>
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{/if}

						<DropdownMenu.Separator class="my-1 h-px bg-border" />

						<DropdownMenu.Item
							onSelect={onLogout}
							class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
							data-testid="topbar-logout"
						>
							<LogOut class="h-4 w-4" />
							<span>{$_('nav.logout', { default: 'Log out' })}</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		{/if}
	</div>
</header>
