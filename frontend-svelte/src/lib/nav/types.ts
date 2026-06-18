/**
 * Nav model · Svelte rewrite
 *
 * 与 Vue tree (frontend/src/components/shell/nav.ts) 的 NavItem / NavGroup 契约对齐，
 * 但 featureFlag 模型简化：
 *   - Vue 端：`featureFlag?: () => boolean | undefined` 宽容 getter，由调用方求值
 *   - Svelte 端：`featureFlag?: string` 单一字符串，filter 拿 `Set<string>` 判断
 *
 * 简化动机：
 *   - Svelte 路由 / 布局层用 `$derived` + store 装配 flag Set 比 getter 闭包更自然
 *   - NavGroup 可序列化 → 测试 / SSR / fixture 友好
 *   - 仍保留 hideInSimpleMode 简易模式过滤
 *   - children 字段预留嵌套结构；filter 已递归处理
 */

import type { LucideIcon } from '@lucide/svelte';

/**
 * 单个导航项。
 *
 * @property key              稳定 id，列表渲染 + data-tour 用
 * @property labelKey         i18n 键，调用方用 `$t(labelKey)` 解析
 * @property path             SvelteKit 路径；激活态匹配遵循 `===` 或 `path + '/'` 前缀
 * @property icon             `@lucide/svelte` 组件，最终渲染为 `<svelte:component this={icon} />`
 * @property hideInSimpleMode 简易模式下隐藏（auth.isSimpleMode === true 时）
 * @property featureFlag      可选 flag 名；filter 时只有 `featureFlags.has(name) === true` 才显示
 * @property children         可选子项（暂不渲染嵌套，但 filter 已递归处理）
 */
export interface NavItem {
	key: string;
	labelKey: string;
	path: string;
	icon: LucideIcon;
	hideInSimpleMode?: boolean;
	featureFlag?: string;
	children?: NavItem[];
}

/**
 * 一组导航项（侧边栏分区）。
 */
export interface NavGroup {
	key: string;
	labelKey: string;
	items: NavItem[];
}

/**
 * 展平后的导航项（CommandPalette 用），携带所属组的元信息。
 */
export type FlatNavItem = NavItem & {
	groupKey: string;
	groupLabelKey: string;
};
