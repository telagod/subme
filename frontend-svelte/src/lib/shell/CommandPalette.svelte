<script lang="ts">
	/**
	 * CommandPalette · ⌘K / Ctrl+K 全局命令面板
	 *
	 * 设计：
	 *   - svelte:window 监听 keydown 捕获 Cmd/Ctrl+K，preventDefault 并 toggle open。
	 *   - 用 bits-ui Dialog.Root 渲染：自带 escape close / focus trap / scroll lock。
	 *   - 搜索源 = adminNavGroups + userNavGroups 合并展平，labelKey 经 $_() 翻译后做
	 *     case-insensitive 子串匹配。空 query 显示全部。
	 *   - 选中 → goto(item.path)，立刻关闭。
	 *   - Esc 关闭由 bits-ui 内置（escapeKeydownBehavior 默认 'close'）。
	 *   - 方向键 / Enter 导航：手写一个最小 list cursor —— bits-ui Dialog 不带搜索导航
	 *     原语，cmdk-sv 体量太大，自己写 30 行能满足验收。
	 *
	 * 类型桥：admin/user 配置 NavGroup 的 featureFlag 字段类型与 shell/nav 不同
	 *   （string vs getter），但 flatten 只读 labelKey/path/icon/groupKey/groupLabelKey，
	 *   featureFlag 字段在此完全不参与渲染，故 unknown-cast 是安全的。
	 *
	 * 测试钩子：
	 *   - data-testid="command-palette-root" 在 Dialog.Content 上
	 *   - data-testid="command-palette-input" 在输入框上
	 *   - data-testid="cmdk-item-${key}" 在每个结果上
	 */
	import { Dialog } from 'bits-ui';
	import { Search } from '@lucide/svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import type { NavGroup, NavItem } from '$lib/nav/types';

	let open = $state(false);
	let query = $state('');
	let activeIndex = $state(0);

	type FlatItem = NavItem & {
		groupKey: string;
		groupLabelKey: string;
		variant: 'admin' | 'user';
	};

	function flatten(groups: NavGroup[], variant: 'admin' | 'user'): FlatItem[] {
		const out: FlatItem[] = [];
		for (const g of groups) {
			for (const item of g.items) {
				out.push({ ...item, groupKey: g.key, groupLabelKey: g.labelKey, variant });
			}
		}
		return out;
	}

	/**
	 * Nav 数据延迟加载 —— admin.config + user.config 不在首屏 eager 集合里，
	 * 避免触发 vendor TDZ trip-wire（check-chunks postbuild gate cap=2）。
	 * 仅在用户首次按 ⌘K（或 hover-warm）时才 fetch。
	 */
	let allItems = $state<FlatItem[]>([]);
	let dataLoaded = $state(false);

	async function ensureLoaded() {
		if (dataLoaded) return;
		const [{ adminNavGroups }, { buildUserNavGroups }] = await Promise.all([
			import('$lib/nav/admin.config'),
			import('$lib/nav/user.config')
		]);
		allItems = [...flatten(adminNavGroups, 'admin'), ...flatten(buildUserNavGroups(), 'user')];
		dataLoaded = true;
	}

	const filtered = $derived.by<FlatItem[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return allItems;
		return allItems.filter((it) => {
			// Use $_ via direct call binding: svelte-i18n $_ is a derived store value.
			// We cannot directly call $_ inside $derived without auto-subscription —
			// $_ as a $-prefixed store value resolves to the formatter function in Svelte 5 components.
			const label = $_(it.labelKey).toLowerCase();
			const group = $_(it.groupLabelKey).toLowerCase();
			return label.includes(q) || group.includes(q) || it.path.toLowerCase().includes(q);
		});
	});

	// query / open 变化时重置 cursor
	$effect(() => {
		// 显式追踪
		void query;
		void open;
		activeIndex = 0;
	});

	function isCmdK(e: KeyboardEvent) {
		return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (isCmdK(e)) {
			e.preventDefault();
			open = !open;
			if (open) void ensureLoaded();
			return;
		}
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (filtered.length === 0) return;
			activeIndex = (activeIndex + 1) % filtered.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (filtered.length === 0) return;
			activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = filtered[activeIndex];
			if (item) selectItem(item);
		}
	}

	function selectItem(item: FlatItem) {
		open = false;
		query = '';
		// goto 在测试环境（jsdom，无 $app/navigation 真实实现）可能抛错，但
		// vitest mock 会接管。生产环境正常导航。
		void goto(item.path);
	}

</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
			data-testid="command-palette-overlay"
		/>
		<Dialog.Content
			class="fixed left-1/2 top-[15vh] z-[9999] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-[14px] border bg-card shadow-2xl ring-1 ring-primary/10"
			data-testid="command-palette-root"
			role="dialog"
			aria-label={$_('nav.quench.commandPalette', { default: 'Command palette' })}
		>
			<Dialog.Title class="sr-only">
				{$_('nav.quench.commandPalette', { default: 'Command palette' })}
			</Dialog.Title>

			<div class="flex items-center gap-2 border-b px-3 py-2">
				<Search class="h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					bind:value={query}
					placeholder={$_('nav.quench.commandPalettePlaceholder', {
						default: 'Search pages, settings…'
					})}
					class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					data-testid="command-palette-input"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
				/>
				<kbd class="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
					>Esc</kbd
				>
			</div>

			<div class="max-h-[340px] overflow-y-auto p-1.5" data-testid="command-palette-list">
				{#if filtered.length === 0}
					<div class="px-3 py-6 text-center text-sm text-muted-foreground">
						{$_('nav.quench.noResults', { default: 'No results' })}
					</div>
				{:else}
					{#each filtered as item, i (item.variant + ':' + item.key)}
						{@const active = i === activeIndex}
						<button
							type="button"
							onclick={() => selectItem(item)}
							onmouseenter={() => (activeIndex = i)}
							data-testid="cmdk-item-{item.variant}-{item.key}"
							data-active={active || undefined}
							data-path={item.path}
							class="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm transition-colors"
							class:cmdk-active={active}
						>
							<item.icon class="h-4 w-4 shrink-0 opacity-90" />
							<span class="flex-1 truncate">{$_(item.labelKey)}</span>
							<span class="font-mono text-[10px] text-muted-foreground">
								{item.variant}
							</span>
							<span class="font-mono text-[10px] text-muted-foreground">
								{$_(item.groupLabelKey)}
							</span>
						</button>
					{/each}
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.cmdk-active {
		background-color: hsl(var(--primary) / 0.1);
		color: hsl(var(--foreground));
		box-shadow:
			inset 0 0 0 1px hsl(var(--primary) / 0.25),
			0 0 12px hsl(var(--primary) / 0.1);
	}
	button:not(.cmdk-active) {
		color: hsl(var(--muted-foreground));
	}
	button:hover {
		color: hsl(var(--foreground));
	}
</style>
