/**
 * useColumnVisibility · 通用表格列可见性 + localStorage 持久化
 *
 * 设计契约:
 * - hiddenColumns: 反应式 Set<string>，仅存"被隐藏"的列 key
 * - 首次加载: 若 localStorage 无值，则用 defaultHidden 作为初始隐藏集
 * - toggleColumn(key): 切换 + 持久化；返回切换后是否可见（便于上层"重新拉数据"决策）
 * - isVisible(key): 反应式判定
 * - resetToDefault(): 回到 defaultHidden 并持久化
 *
 * 注意: 表头的 select / actions / name 等强制列由调用方自己白名单豁免，
 * 本 composable 不内建白名单——保持通用。
 */
import { reactive, computed, type ComputedRef } from 'vue'

export interface UseColumnVisibilityReturn {
  /** 当前隐藏的列 key 集合（响应式） */
  hiddenColumns: Set<string>
  /** key 是否可见（响应式 computed） */
  isVisible: (key: string) => boolean
  /** 切换并持久化，返回切换后是否可见 */
  toggleColumn: (key: string) => boolean
  /** 直接设置可见性 */
  setVisible: (key: string, visible: boolean) => void
  /** 重置为 defaultHidden 集合 */
  resetToDefault: () => void
  /** 隐藏列数（用于 badge） */
  hiddenCount: ComputedRef<number>
}

export function useColumnVisibility(
  storageKey: string,
  defaultHidden: readonly string[] = []
): UseColumnVisibilityReturn {
  const hiddenColumns = reactive<Set<string>>(new Set())

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          for (const k of parsed) {
            if (typeof k === 'string') hiddenColumns.add(k)
          }
          return
        }
      }
    } catch { /* ignore corrupt JSON */ }
    for (const k of defaultHidden) hiddenColumns.add(k)
  }

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hiddenColumns]))
    } catch { /* ignore quota */ }
  }

  const isVisible = (key: string): boolean => !hiddenColumns.has(key)

  const toggleColumn = (key: string): boolean => {
    if (hiddenColumns.has(key)) hiddenColumns.delete(key)
    else hiddenColumns.add(key)
    save()
    return !hiddenColumns.has(key)
  }

  const setVisible = (key: string, visible: boolean) => {
    if (visible) hiddenColumns.delete(key)
    else hiddenColumns.add(key)
    save()
  }

  const resetToDefault = () => {
    hiddenColumns.clear()
    for (const k of defaultHidden) hiddenColumns.add(k)
    save()
  }

  const hiddenCount = computed(() => hiddenColumns.size)

  if (typeof window !== 'undefined') load()

  return {
    hiddenColumns,
    isVisible,
    toggleColumn,
    setVisible,
    resetToDefault,
    hiddenCount,
  }
}
