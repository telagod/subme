/**
 * useAccountAutoRefresh · 账号池专用自动刷新（ETag 增量 + silent window + modal 暂停）
 *
 * 状态机（每秒 tick）:
 *   未启用 → return
 *   document.hidden → return（背景标签不刷）
 *   isModalOpen?.() === true → return
 *   shouldPause?.() === true → return（额外暂停信号，如 dropdown 展开）
 *   loading.value === true → return
 *   fetching.value === true → return（防重入）
 *   在 silent window 内 → countdown 拉回剩余秒数后 return
 *   countdown <= 0 → countdown=intervalSeconds，发起 listWithEtag → mergeAccountsIncrementally
 *   else → countdown -= 1
 *
 * mergeAccountsIncrementally:
 *   - 用 id 配 map，按服务端返回的次序构造新行
 *   - 已有行: shouldReplaceAutoRefreshRow 判定才替换（避免覆盖本地 patch）
 *   - 新行追加，整体长度/次序变化才触发 accounts.value 重赋值
 *
 * 用户操作后（如 modal 提交）调 enterSilentWindow()，
 *   silent window 内 tick 不刷，但 countdown 跟随剩余秒数显示。
 *
 * patch 回调 patchFn: 由调用方传入（用于刷新后同步 today stats）。
 * accountsRef: 直接持有 accounts ref，merge 时原地替换。
 */
import { ref, onBeforeUnmount, type Ref } from 'vue'
import { adminAPI } from '@/api/admin'
import type { Account } from '@/types'
import { buildOpenAIUsageRefreshKey } from '@/utils/accountUsageRefresh'

export const AUTO_REFRESH_INTERVALS = [5, 10, 15, 30] as const
export type AutoRefreshInterval = (typeof AUTO_REFRESH_INTERVALS)[number]

const STORAGE_KEY = 'account-pool-auto-refresh'
const SILENT_WINDOW_MS = 15000

export interface UseAccountAutoRefreshOptions {
  /** 反应式 accounts 列表 */
  accountsRef: Ref<Account[]>
  /** 反应式当前查询参数（params from useTableLoader） */
  params: Record<string, unknown>
  /** 反应式分页（用于 page/page_size + 服务端 total 回填） */
  pagination: { page: number; page_size: number; total: number; pages?: number }
  /** 反应式 loading（全量刷新进行时不抢） */
  loading: Ref<boolean>
  /** 任意 modal 打开时返回 true，tick 跳过 */
  isModalOpen?: () => boolean
  /** 任意其它暂停信号（dropdown 展开、actionMenu 等） */
  shouldPause?: () => boolean
  /** 增量刷新成功后回调（如 refreshTodayStats） */
  onAfterRefresh?: () => Promise<void> | void
  /** 增量 merge 后回调（用于上层同步 ref，例如 edit modal 当前账号） */
  onAccountReplaced?: (next: Account) => void
}

export interface UseAccountAutoRefreshReturn {
  enabled: Ref<boolean>
  intervalSeconds: Ref<AutoRefreshInterval>
  countdown: Ref<number>
  fetching: Ref<boolean>
  intervals: typeof AUTO_REFRESH_INTERVALS
  /** 是否在 silent window 内（响应式） */
  hasPendingListSync: Ref<boolean>
  setEnabled: (value: boolean) => void
  setIntervalSeconds: (seconds: AutoRefreshInterval) => void
  enterSilentWindow: () => void
  /** 立即触发一次增量刷新（手动按钮可调） */
  refreshNow: () => Promise<void>
  /** 提供给上层标记"有新变更但被本地过滤丢弃了" */
  markPendingListSync: () => void
  clearPendingListSync: () => void
}

/**
 * 判定服务端返回的 next 行是否"运行态字段"发生变化——
 * 仅这些字段变才覆盖本地 row，避免覆盖刚刚 patchInList 写入的乐观状态。
 */
function shouldReplaceAutoRefreshRow(current: Account, next: Account): boolean {
  return (
    current.updated_at !== next.updated_at ||
    current.current_concurrency !== next.current_concurrency ||
    current.current_window_cost !== next.current_window_cost ||
    current.active_sessions !== next.active_sessions ||
    current.schedulable !== next.schedulable ||
    current.status !== next.status ||
    current.rate_limit_reset_at !== next.rate_limit_reset_at ||
    current.overload_until !== next.overload_until ||
    current.temp_unschedulable_until !== next.temp_unschedulable_until ||
    buildOpenAIUsageRefreshKey(current) !== buildOpenAIUsageRefreshKey(next)
  )
}

export function useAccountAutoRefresh(
  options: UseAccountAutoRefreshOptions
): UseAccountAutoRefreshReturn {
  const {
    accountsRef, params, pagination, loading,
    isModalOpen, shouldPause, onAfterRefresh, onAccountReplaced,
  } = options

  const enabled = ref(false)
  const intervalSeconds = ref<AutoRefreshInterval>(30)
  const countdown = ref(0)
  const fetching = ref(false)
  const hasPendingListSync = ref(false)
  const etag = ref<string | null>(null)
  const silentUntil = ref(0)

  let timerId: number | undefined

  // ── localStorage ────────────────────────────────────────────────────
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { enabled?: boolean; interval_seconds?: number }
      enabled.value = parsed.enabled === true
      const iv = Number(parsed.interval_seconds)
      if (AUTO_REFRESH_INTERVALS.includes(iv as AutoRefreshInterval)) {
        intervalSeconds.value = iv as AutoRefreshInterval
      }
    } catch { /* ignore */ }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: enabled.value,
        interval_seconds: intervalSeconds.value,
      }))
    } catch { /* ignore */ }
  }

  // ── 增量 merge ──────────────────────────────────────────────────────
  function mergeAccountsIncrementally(nextRows: Account[]) {
    const currentRows = accountsRef.value
    const currentByID = new Map(currentRows.map(row => [row.id, row]))
    let changed = nextRows.length !== currentRows.length

    const mergedRows = nextRows.map((nextRow) => {
      const currentRow = currentByID.get(nextRow.id)
      if (!currentRow) {
        changed = true
        return nextRow
      }
      if (shouldReplaceAutoRefreshRow(currentRow, nextRow)) {
        changed = true
        onAccountReplaced?.(nextRow)
        return nextRow
      }
      return currentRow
    })

    // 长度相同但顺序变了也算 changed
    if (!changed) {
      for (let i = 0; i < mergedRows.length; i++) {
        if (mergedRows[i].id !== currentRows[i]?.id) {
          changed = true
          break
        }
      }
    }

    if (changed) accountsRef.value = mergedRows
  }

  // ── 单次增量刷新 ────────────────────────────────────────────────────
  async function refreshNow() {
    if (fetching.value) return
    fetching.value = true
    try {
      const filters = {
        platform:     (params as any).platform     || undefined,
        type:         (params as any).type         || undefined,
        status:       (params as any).status       || undefined,
        privacy_mode: (params as any).privacy_mode || undefined,
        group:        (params as any).group        || undefined,
        search:       (params as any).search       || undefined,
        sort_by:      (params as any).sort_by      || undefined,
        sort_order:   (params as any).sort_order   || undefined,
      }
      const result = await adminAPI.accounts.listWithEtag(
        pagination.page,
        pagination.page_size,
        filters,
        { etag: etag.value }
      )

      if (result.etag) etag.value = result.etag

      if (!result.notModified && result.data) {
        pagination.total = result.data.total || 0
        if ('pages' in pagination) pagination.pages = result.data.pages || 0
        mergeAccountsIncrementally(result.data.items || [])
        hasPendingListSync.value = false
      }

      if (onAfterRefresh) await onAfterRefresh()
    } catch (e) {
      console.error('Auto refresh failed:', e)
    } finally {
      fetching.value = false
    }
  }

  // ── silent window ───────────────────────────────────────────────────
  function enterSilentWindow() {
    silentUntil.value = Date.now() + SILENT_WINDOW_MS
    countdown.value = intervalSeconds.value
  }

  function inSilentWindow(): boolean {
    return Date.now() < silentUntil.value
  }

  // ── tick ────────────────────────────────────────────────────────────
  async function tick() {
    if (!enabled.value) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (isModalOpen?.()) return
    if (shouldPause?.()) return
    if (loading.value || fetching.value) return

    if (inSilentWindow()) {
      countdown.value = Math.max(
        0,
        Math.ceil((silentUntil.value - Date.now()) / 1000)
      )
      return
    }

    if (countdown.value <= 0) {
      countdown.value = intervalSeconds.value
      await refreshNow()
      return
    }

    countdown.value -= 1
  }

  function start() {
    if (timerId !== undefined) return
    timerId = setInterval(tick, 1000) as unknown as number
  }

  function stop() {
    if (timerId !== undefined) {
      clearInterval(timerId)
      timerId = undefined
    }
  }

  // ── 对外 setter ─────────────────────────────────────────────────────
  function setEnabled(value: boolean) {
    enabled.value = value
    saveToStorage()
    if (value) {
      countdown.value = intervalSeconds.value
      start()
    } else {
      stop()
      countdown.value = 0
    }
  }

  function setIntervalSeconds(seconds: AutoRefreshInterval) {
    intervalSeconds.value = seconds
    saveToStorage()
    if (enabled.value) countdown.value = seconds
  }

  function markPendingListSync() { hasPendingListSync.value = true }
  function clearPendingListSync() { hasPendingListSync.value = false }

  // ── 生命周期 ────────────────────────────────────────────────────────
  loadFromStorage()
  // 始终启动计时器；tick 内自己判断 enabled，避免 enable 切换时 race
  start()
  onBeforeUnmount(stop)

  return {
    enabled,
    intervalSeconds,
    countdown,
    fetching,
    intervals: AUTO_REFRESH_INTERVALS,
    hasPendingListSync,
    setEnabled,
    setIntervalSeconds,
    enterSilentWindow,
    refreshNow,
    markPendingListSync,
    clearPendingListSync,
  }
}
