/**
 * useNavFiltered · AppShell 导航过滤复用层
 *
 * 端口自 AppSidebar.applyFeatureFlags + finalizeNav 的语义，包成纯函数 + composable，
 * 给 admin / user 两侧的 AppShell 共用。
 *
 * 宽容语义：featureFlag() === false 才隐藏；undefined / true 都视为显示。
 * （避免 public settings 未加载完成时菜单短暂消失。）
 *
 * isSimpleMode 时再剔除 hideInSimpleMode 项。
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { NavGroup, NavItem } from './nav'

/** 单层 NavItem 过滤：featureFlag 显式 false 才剔除。 */
export function applyFeatureFlags(items: NavItem[]): NavItem[] {
  const out: NavItem[] = []
  for (const item of items) {
    if (item.featureFlag && item.featureFlag() === false) continue
    out.push(item)
  }
  return out
}

/**
 * 对一组 NavGroup 应用 featureFlag + isSimpleMode 过滤，剔除空 group。
 */
export function filterNavGroups(groups: NavGroup[], isSimpleMode: boolean): NavGroup[] {
  const out: NavGroup[] = []
  for (const group of groups) {
    let items = applyFeatureFlags(group.items)
    if (isSimpleMode) items = items.filter((item) => !item.hideInSimpleMode)
    if (items.length === 0) continue
    out.push({ ...group, items })
  }
  return out
}

/**
 * Composable 包装：响应式 groups + isSimpleMode → 过滤后 groups
 */
export function useNavFiltered(
  groups: ComputedRef<NavGroup[]> | Ref<NavGroup[]>,
  isSimpleMode: ComputedRef<boolean> | Ref<boolean>
): ComputedRef<NavGroup[]> {
  return computed(() => filterNavGroups(groups.value, isSimpleMode.value))
}
