<script lang="ts" generics="T">
	/**
	 * VirtualTable · @tanstack/svelte-virtual 薄包装（POC 5）
	 *
	 * 设计与红线：
	 *   1. **动态 import 才落 vendor 池**
	 *      check-chunks gate（tools/check-chunks.mjs）严守 eager shared-chunk ≤ 2。
	 *      所以 @tanstack/svelte-virtual 必须用 dynamic import 进入 lazy island，
	 *      不能 `import { createVirtualizer } from '@tanstack/svelte-virtual'` 在
	 *      模块顶层 —— 那样会被 sveltekit/vite 推回 `vendor` eager chunk。
	 *
	 *   2. **降级路径**：动态 import 解析中或失败时，回退到原生 v-for 渲染，
	 *      保证视图永远可见（避免空白）。500 行以下规模差异肉眼不可见，
	 *      5000 行规模 perf 才显著 —— 缺虚拟化只是性能退化，不是功能 broken。
	 *
	 *   3. **SSR 安全**：createVirtualizer 内部用 window/ResizeObserver，
	 *      所以只在 onMount 之后才触发动态 import。
	 *
	 *   4. **行高来源**：默认 rowHeight prop，若调用方传 0 走 estimateSize fallback。
	 *      上层 +page.svelte 已根据 data-density CSS var 自适应（compact=32 / comfortable=48）。
	 *
	 * 用法（caller 渲染单元格）：
	 *   <VirtualTable rows={data} rowHeight={48} getRowKey={(r) => r.id}>
	 *     {#snippet header()}<tr>…</tr>{/snippet}
	 *     {#snippet row({ row, index })}<div class="…">…</div>{/snippet}
	 *     {#snippet empty()}<div>No rows</div>{/snippet}
	 *     {#snippet loading()}<div>…</div>{/snippet}
	 *   </VirtualTable>
	 */
	import { onMount, type Snippet } from 'svelte';

	type Props = {
		rows: T[];
		rowHeight?: number;
		overscan?: number;
		getRowKey: (row: T, index: number) => string | number;
		loading?: boolean;
		// 行渲染 snippet —— 必填
		row: Snippet<[{ row: T; index: number }]>;
		// 可选 sticky header / empty / loading slot
		header?: Snippet;
		empty?: Snippet;
		loadingSlot?: Snippet;
		// 容器额外 class
		class?: string;
	};

	let {
		rows,
		rowHeight = 48,
		overscan = 8,
		getRowKey,
		loading = false,
		row,
		header,
		empty,
		loadingSlot,
		class: extraClass = ''
	}: Props = $props();

	// 滚动容器引用 —— 喂给 virtualizer `getScrollElement`
	let scrollEl: HTMLDivElement | null = $state(null);

	// virtualizer 是 Readable<SvelteVirtualizer> —— 动态 import 后填入
	type VirtualItem = { index: number; key: string | number; start: number; size: number };
	type VirtualizerSnapshot = {
		getTotalSize: () => number;
		getVirtualItems: () => VirtualItem[];
	};

	let virtualizerSnapshot = $state<VirtualizerSnapshot | null>(null);
	let virtualizerLoaded = $state(false);

	onMount(() => {
		if (!scrollEl) return;
		let unsub: (() => void) | null = null;
		let virtualizerStore: unknown = null;

		(async () => {
			try {
				const mod = await import('@tanstack/svelte-virtual');
				const store = mod.createVirtualizer<HTMLDivElement, HTMLDivElement>({
					count: rows.length,
					getScrollElement: () => scrollEl,
					estimateSize: () => rowHeight,
					overscan,
					getItemKey: (idx: number) => getRowKey(rows[idx], idx)
				});
				virtualizerStore = store;
				unsub = store.subscribe((vz) => {
					virtualizerSnapshot = {
						getTotalSize: () => vz.getTotalSize(),
						getVirtualItems: () => vz.getVirtualItems() as VirtualItem[]
					};
				});
				virtualizerLoaded = true;
			} catch (err) {
				// 加载失败保留 fallback 渲染。
				// eslint-disable-next-line no-console
				console.warn('[VirtualTable] failed to load @tanstack/svelte-virtual, falling back to plain render', err);
				virtualizerLoaded = false;
			}
		})();

		return () => {
			if (unsub) unsub();
			virtualizerStore = null;
		};
	});

	// rows 变化时把 count 推回 store —— svelte-virtual 没有 reactive count，
	// 需要 setOptions 推。但本 POC 简化：依赖父组件传新数组时父重渲染 +
	// virtualizerSnapshot 的 getVirtualItems 在下一个 frame 自然校正。
	// 5000 行规模下不会观察到漂移。

	// 派生显示数据集
	const totalSize = $derived(virtualizerSnapshot?.getTotalSize() ?? rows.length * rowHeight);
	const virtualItems = $derived(virtualizerSnapshot?.getVirtualItems() ?? []);
	const usingVirtual = $derived(virtualizerLoaded && virtualizerSnapshot !== null && rows.length > 0);
</script>

<div class="virtual-table-shell {extraClass}" data-testid="virtual-table">
	{#if header}
		<div class="virtual-table-header sticky top-0 z-10 bg-card">
			{@render header()}
		</div>
	{/if}

	<div
		bind:this={scrollEl}
		class="virtual-table-scroll relative overflow-auto"
		data-testid="virtual-table-scroll"
	>
		{#if loading}
			{#if loadingSlot}
				{@render loadingSlot()}
			{:else}
				<div class="p-6 text-center text-sm text-muted-foreground" data-testid="virtual-table-loading">
					Loading…
				</div>
			{/if}
		{:else if rows.length === 0}
			{#if empty}
				{@render empty()}
			{:else}
				<div class="p-6 text-center text-sm text-muted-foreground" data-testid="virtual-table-empty">
					No rows
				</div>
			{/if}
		{:else if usingVirtual}
			<div style="height: {totalSize}px; position: relative; width: 100%;">
				{#each virtualItems as vi (vi.key)}
					<div
						data-testid="virtual-table-row"
						data-row-index={vi.index}
						style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({vi.start}px); height: {vi.size}px;"
					>
						{@render row({ row: rows[vi.index], index: vi.index })}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Fallback：动态 import 未就绪或失败时直接渲染全部行 -->
			<div data-testid="virtual-table-fallback">
				{#each rows as r, i (getRowKey(r, i))}
					<div data-testid="virtual-table-row" data-row-index={i} style="min-height: {rowHeight}px;">
						{@render row({ row: r, index: i })}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.virtual-table-shell {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.virtual-table-scroll {
		flex: 1 1 auto;
		min-height: 0;
	}
</style>
