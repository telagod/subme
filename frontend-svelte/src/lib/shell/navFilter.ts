/**
 * navFilter · 导航过滤纯函数集合（Svelte 端口）
 *
 * 端口自 frontend/src/components/shell/useNavFiltered.ts —— 纯函数部分原样保留，
 * Vue composable 包装（useNavFiltered）替换为调用方处的 `$derived` rune
 * （Svelte 5 runes 习惯，比单独导出一个 hook 更直观）。
 *
 * 宽容语义：featureFlag() === false 才隐藏；undefined / true 都视为显示。
 * 用于避免 public settings 未加载完成时菜单短暂消失。
 *
 * isSimpleMode 时再剔除 hideInSimpleMode 项；剩余 items 为空的 group 整组移除。
 */

import type { NavGroup, NavItem } from './nav';

/** 单层 NavItem 过滤：featureFlag 显式 false 才剔除。 */
export function applyFeatureFlags(items: NavItem[]): NavItem[] {
	const out: NavItem[] = [];
	for (const item of items) {
		if (item.featureFlag && item.featureFlag() === false) continue;
		out.push(item);
	}
	return out;
}

/** 对一组 NavGroup 应用 featureFlag + isSimpleMode 过滤，剔除空 group。 */
export function filterNavGroups(groups: NavGroup[], isSimpleMode: boolean): NavGroup[] {
	const out: NavGroup[] = [];
	for (const group of groups) {
		let items = applyFeatureFlags(group.items);
		if (isSimpleMode) items = items.filter((item) => !item.hideInSimpleMode);
		if (items.length === 0) continue;
		out.push({ ...group, items });
	}
	return out;
}
