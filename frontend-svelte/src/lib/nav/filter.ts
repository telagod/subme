/**
 * Nav filter · Svelte rewrite
 *
 * 纯函数管线 (无 svelte runes，无 store)：
 *   1) 按 featureFlag 裁剪：item.featureFlag 在 opts.featureFlags 内才保留
 *      未声明 featureFlag 视为"无需开关"，永远显示。
 *   2) 按简易模式裁剪：opts.isSimpleMode === true 时，hideInSimpleMode === true 的项被丢弃。
 *   3) 递归处理 children（虽然 admin/user.config 暂未用嵌套）：
 *      a) 子树全部被过滤 → 整个父项也作废（避免出现"空可展开节点"）。
 *      b) 子树非空但根 item 不满足 flag → 父项作废（flag 是不可绕过的硬条件）。
 *   4) Group.items 全空 → 整组从结果里移除。
 *
 * 输出语义：返回新数组（不就地变更），保留分组顺序，items 顺序与输入一致。
 *
 * 与 Vue tree (frontend/src/components/shell/useNavFiltered.ts) 的关系：
 *   - Vue 端 featureFlag 是宽容 getter (=== false 才隐藏)；Svelte 端改为白名单 Set，
 *     调用方负责把 public-settings 翻译成 Set<string> — flicker 治理移到 layout 层。
 *   - 空组移除、简易模式逻辑 与 Vue 端一致。
 */

import type { NavGroup, NavItem } from './types';

export interface FilterNavOptions {
	/** 允许显示的 featureFlag 名集合；item.featureFlag 不在内则隐藏。 */
	featureFlags: Set<string>;
	/** 简易模式开关：true → 丢弃 hideInSimpleMode 项。 */
	isSimpleMode: boolean;
}

/**
 * 判断单个 NavItem 是否通过 flag / simple-mode 闸门（不考虑 children）。
 */
function passesGate(item: NavItem, opts: FilterNavOptions): boolean {
	if (item.featureFlag !== undefined && !opts.featureFlags.has(item.featureFlag)) {
		return false;
	}
	if (opts.isSimpleMode && item.hideInSimpleMode === true) {
		return false;
	}
	return true;
}

/**
 * 递归过滤单个 NavItem 及其 children。
 * 返回 null 表示该项整体被丢弃。
 */
function filterItem(item: NavItem, opts: FilterNavOptions): NavItem | null {
	if (!passesGate(item, opts)) {
		return null;
	}

	if (item.children && item.children.length > 0) {
		const filteredChildren = item.children
			.map((child) => filterItem(child, opts))
			.filter((c): c is NavItem => c !== null);

		// 子树原本非空但全部被过滤 → 整个父项作废（避免空可展开节点）。
		if (filteredChildren.length === 0) {
			return null;
		}

		return { ...item, children: filteredChildren };
	}

	// 无 children 的叶子节点：通过即原样返回（保留引用稳定性）。
	return item;
}

/**
 * 过滤 NavGroup 列表。纯函数。
 *
 * @param groups 原始分组（来自 admin.config 或 buildUserNavGroups()）
 * @param opts   过滤条件
 * @returns      新数组：空组已剔除；items / children 已按 flag + simple-mode 裁剪
 */
export function filterNavGroups(groups: NavGroup[], opts: FilterNavOptions): NavGroup[] {
	const result: NavGroup[] = [];

	for (const group of groups) {
		const filteredItems = group.items
			.map((item) => filterItem(item, opts))
			.filter((i): i is NavItem => i !== null);

		if (filteredItems.length === 0) {
			continue;
		}

		result.push({ ...group, items: filteredItems });
	}

	return result;
}
