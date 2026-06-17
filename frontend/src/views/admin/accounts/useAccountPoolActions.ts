/**
 * AccountsPoolView 操作逻辑 composable
 * 涵盖：单账号 CRUD、批量操作、今日统计、调度、导出
 * + patchAccountInList: 过滤面感知行级 patch（移植自 legacy）
 */
import { ref, reactive, triggerRef, type Ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api/admin'
import type { Account, AccountPlatform, AccountType, WindowStats } from '@/types'

export type BulkEditFilters = {
  platform?: string
  type?: string
  status?: string
  group?: string
  search?: string
  privacy_mode?: string
  schedulable?: string
  has_proxy?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export type BulkEditTarget =
  | {
      mode: 'selected'
      accountIds: number[]
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }
  | {
      mode: 'filtered'
      filters: BulkEditFilters
      previewCount: number
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }

// 与 legacy AccountsView 保持一致的"未分组" / "未设置 privacy_mode"哨兵值
export const ACCOUNT_UNGROUPED_GROUP_QUERY_VALUE = 'ungrouped'
export const ACCOUNT_PRIVACY_MODE_UNSET_QUERY_VALUE = '__unset__'

/**
 * 行级过滤判定（复制自 legacy patchAccountInList 链路）
 * 命中条件 = 当前 params 下该账号仍应留在列表中
 * 务必逐条对照 legacy，不要重新推导业务规则。
 */
export function accountMatchesCurrentFilters(
  account: Account,
  params: Record<string, unknown>
): boolean {
  const platform     = (params.platform     as string | undefined) || ''
  const type         = (params.type         as string | undefined) || ''
  const status       = (params.status       as string | undefined) || ''
  const group        = (params.group        as string | undefined) || ''
  const privacy_mode = (params.privacy_mode as string | undefined) || ''
  const schedulable  = (params.schedulable  as string | undefined) || ''
  const has_proxy    = (params.has_proxy    as string | undefined) || ''
  const search       = String((params.search as string | undefined) || '').trim().toLowerCase()

  if (platform && account.platform !== platform) return false
  if (type && account.type !== type) return false

  if (status) {
    const now = Date.now()
    const rateLimitResetAt = account.rate_limit_reset_at
      ? new Date(account.rate_limit_reset_at).getTime()
      : Number.NaN
    const isRateLimited = Number.isFinite(rateLimitResetAt) && rateLimitResetAt > now
    const tempUnschedUntil = account.temp_unschedulable_until
      ? new Date(account.temp_unschedulable_until).getTime()
      : Number.NaN
    const isTempUnschedulable = Number.isFinite(tempUnschedUntil) && tempUnschedUntil > now

    if (status === 'active') {
      if (account.status !== 'active' || isRateLimited || isTempUnschedulable || !account.schedulable) return false
    } else if (status === 'rate_limited') {
      if (account.status !== 'active' || !isRateLimited || isTempUnschedulable) return false
    } else if (status === 'temp_unschedulable') {
      if (account.status !== 'active' || !isTempUnschedulable) return false
    } else if (status === 'unschedulable') {
      if (account.status !== 'active' || account.schedulable || isRateLimited || isTempUnschedulable) return false
    } else if (account.status !== status) {
      return false
    }
  }

  if (group) {
    const groupIds =
      (account as any).group_ids
      ?? (account.groups?.map((g) => g.id) ?? [])
    if (group === ACCOUNT_UNGROUPED_GROUP_QUERY_VALUE) {
      if (groupIds.length > 0) return false
    } else if (!groupIds.includes(Number(group))) {
      return false
    }
  }

  if (privacy_mode) {
    const accPrivacy = typeof account.extra?.privacy_mode === 'string'
      ? account.extra.privacy_mode
      : ''
    if (privacy_mode === ACCOUNT_PRIVACY_MODE_UNSET_QUERY_VALUE) {
      if (accPrivacy.trim() !== '') return false
    } else if (privacy_mode === '1') {
      // sub2api 当前用 '1'/'0' 表示开/未开（来自 boolean 过滤）
      if (accPrivacy.trim() === '') return false
    } else if (privacy_mode === '0') {
      if (accPrivacy.trim() !== '') return false
    } else if (accPrivacy !== privacy_mode) {
      return false
    }
  }

  if (schedulable === 'true' || schedulable === '1') {
    if (!account.schedulable) return false
  } else if (schedulable === 'false' || schedulable === '0') {
    if (account.schedulable) return false
  }

  if (has_proxy === 'true' || has_proxy === '1') {
    if (!account.proxy_id && !account.proxy) return false
  } else if (has_proxy === 'false' || has_proxy === '0') {
    if (account.proxy_id || account.proxy) return false
  }

  if (search && !account.name.toLowerCase().includes(search)) return false
  return true
}

/**
 * 合并运行态字段：服务端返回 null 时保留本地已有值
 * （避免乐观更新被 null 清掉）
 */
export function mergeRuntimeFields(oldAccount: Account, updatedAccount: Account): Account {
  return {
    ...updatedAccount,
    current_concurrency: updatedAccount.current_concurrency ?? oldAccount.current_concurrency,
    current_window_cost: updatedAccount.current_window_cost ?? oldAccount.current_window_cost,
    active_sessions: updatedAccount.active_sessions ?? oldAccount.active_sessions,
  }
}

export interface UseAccountPoolActionsOptions {
  /** 反应式查询参数（用于 patch 时判定行是否仍匹配） */
  params?: Record<string, unknown>
  /** 反应式分页（用于本地移除后修正） */
  pagination?: { page: number; page_size: number; total: number; pages?: number }
  /** 行被本地移除时回调（如标记 hasPendingListSync = true） */
  onLocalListMutation?: () => void
}

export function useAccountPoolActions(
  accounts: Ref<Account[]> | { value: Account[] },
  options: UseAccountPoolActionsOptions = {}
) {
  const appStore = useAppStore()
  const { params, pagination, onLocalListMutation } = options

  // ── BulkEdit 状态（直接挂模态，不再 router.push 旧页）──────────────────
  const showBulkEdit    = ref(false)
  const bulkEditTarget  = ref<BulkEditTarget | null>(null)

  // ── 操作中的账号 ID 集合 ──────────────────────────────────────────────
  const operatingSet    = reactive<Set<number>>(new Set())
  const togglingSchedulable = ref<number | null>(null)

  // ── 今日统计 ─────────────────────────────────────────────────────────
  const todayStatsByAccountId = ref<Record<string, WindowStats>>({})
  const todayStatsLoading     = ref(false)
  const manualRefreshToken    = ref(0)

  const refreshTodayStats = async () => {
    const ids = accounts.value.map(a => a.id)
    if (ids.length === 0) { todayStatsByAccountId.value = {}; return }
    todayStatsLoading.value = true
    try {
      const res = await adminAPI.accounts.getBatchTodayStats(ids)
      const next: Record<string, WindowStats> = {}
      for (const id of ids) {
        next[String(id)] = (res.stats ?? {})[String(id)]
          ?? { requests: 0, tokens: 0, cost: 0, standard_cost: 0, user_cost: 0 }
      }
      todayStatsByAccountId.value = next
    } catch { /* 静默 */ } finally {
      todayStatsLoading.value = false
    }
  }

  // ── 批量删除进度 ──────────────────────────────────────────────────────
  const bulkDeleteProgress = ref<{ current: number; total: number } | null>(null)

  // ── 行内 patch（过滤面感知） ──────────────────────────────────────────
  /**
   * 当 row 被本地删除（如 delete account / patch 后过滤不匹配）后，
   * 自动同步分页 total，并标记 hasPendingListSync 让上层显示提示条。
   * 注意: 当前页空了→自动跳上一页 由上层调用方根据 page 变化决定 reload。
   */
  const syncPaginationAfterLocalRemoval = () => {
    if (!pagination) return
    const nextTotal = Math.max(0, pagination.total - 1)
    pagination.total = nextTotal
    if ('pages' in pagination) {
      pagination.pages = nextTotal > 0
        ? Math.ceil(nextTotal / pagination.page_size)
        : 0
    }
    const maxPage = Math.max(1, pagination.pages || 1)
    if (pagination.page > maxPage) pagination.page = maxPage
    // 行被本地移除但 total 还有 → 提示用户手动同步而非全量重拉
    if (nextTotal > 0 && onLocalListMutation) onLocalListMutation()
  }

  /**
   * 过滤面感知的行级 patch（移植自 legacy patchAccountInList）
   * - 若 params 未提供，退化为 legacy patchInList（纯 index 替换）
   * - 行不满足当前 filter → 本地移除 + 同步分页 + 触发 onLocalListMutation
   * - 行仍匹配 → mergeRuntimeFields 后原地替换 + triggerRef
   */
  const patchAccountInList = (
    updated: Account,
    opts?: { syncPagination?: boolean }
  ) => {
    const idx = accounts.value.findIndex(a => a.id === updated.id)
    if (idx === -1) return
    const merged = mergeRuntimeFields(accounts.value[idx], updated)

    if (params && !accountMatchesCurrentFilters(merged, params)) {
      accounts.value = accounts.value.filter(a => a.id !== merged.id)
      if (opts?.syncPagination !== false) syncPaginationAfterLocalRemoval()
      return
    }

    accounts.value[idx] = merged
    triggerRef(accounts as Ref<Account[]>)
  }

  // 兼容别名 (legacy 命名)
  const patchInList = patchAccountInList

  // ── 单账号操作 ───────────────────────────────────────────────────────
  const handleToggleStatus = async (a: Account) => {
    if (operatingSet.has(a.id)) return
    operatingSet.add(a.id)
    try {
      const next = a.status === 'active' ? 'inactive' : 'active'
      const updated = await adminAPI.accounts.toggleStatus(a.id, next)
      patchInList(updated)
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    } finally {
      operatingSet.delete(a.id)
    }
  }

  const handleRefreshOne = async (a: Account) => {
    if (operatingSet.has(a.id)) return
    operatingSet.add(a.id)
    try {
      const updated = await adminAPI.accounts.refreshCredentials(a.id)
      patchInList(updated)
      appStore.showSuccess('刷新成功')
    } catch (err: any) {
      appStore.showError(err?.message || '刷新失败')
    } finally {
      operatingSet.delete(a.id)
    }
  }

  const handleRecoverState = async (a: Account) => {
    try {
      const updated = await adminAPI.accounts.recoverState(a.id)
      patchInList(updated)
      appStore.showSuccess('状态已恢复')
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    }
  }

  const handleResetQuota = async (a: Account) => {
    try {
      const updated = await adminAPI.accounts.resetAccountQuota(a.id)
      patchInList(updated)
      appStore.showSuccess('配额已重置')
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    }
  }

  const handleSetPrivacy = async (a: Account) => {
    try {
      const updated = await adminAPI.accounts.setPrivacy(a.id)
      patchInList(updated)
      appStore.showSuccess('隐私设置已更新')
    } catch (err: any) {
      appStore.showError(err?.response?.data?.message || '操作失败')
    }
  }

  const handleToggleSchedulable = async (a: Account) => {
    if (togglingSchedulable.value === a.id) return
    togglingSchedulable.value = a.id
    try {
      const updated = await adminAPI.accounts.setSchedulable(a.id, !a.schedulable)
      patchInList(updated)
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    } finally {
      togglingSchedulable.value = null
    }
  }

  /**
   * 本地行级 patch：批量调度切换成功后，原地刷新 schedulable 字段
   * (避免对每条触发 mergeRuntimeFields / 过滤判定)
   */
  const updateSchedulableInList = (accountIds: number[], schedulable: boolean) => {
    if (accountIds.length === 0) return
    const idSet = new Set(accountIds)
    const next = accounts.value.map(a => idSet.has(a.id) ? { ...a, schedulable } : a)
    accounts.value = next
    triggerRef(accounts as Ref<Account[]>)
  }

  /**
   * 兼容后端三种返回 shape（来自 legacy AccountsView）:
   *   A: { success_ids:[], failed_ids:[] } —— 显式 id 清单（最高优先级）
   *   B: { results:[{account_id, success}] } —— 行级结果（次优）
   *   C: { success_count, failed_count } —— 仅计数（兜底；若 failed=0 且 success=accountIds.length 则可推断 ids）
   * 判定顺序: 显式 ids → results → counts（与 legacy 完全一致）
   */
  const normalizeBulkSchedulableResult = (
    result: {
      success?: number
      failed?: number
      success_ids?: number[]
      failed_ids?: number[]
      results?: Array<{ account_id: number; success: boolean }>
    },
    accountIds: number[]
  ) => {
    const responseSuccessIds = Array.isArray(result.success_ids) ? result.success_ids : []
    const responseFailedIds  = Array.isArray(result.failed_ids)  ? result.failed_ids  : []
    if (responseSuccessIds.length > 0 || responseFailedIds.length > 0) {
      return {
        successIds: responseSuccessIds,
        failedIds:  responseFailedIds,
        successCount: typeof result.success === 'number' ? result.success : responseSuccessIds.length,
        failedCount:  typeof result.failed  === 'number' ? result.failed  : responseFailedIds.length,
        hasIds: true,
        hasCounts: true,
      }
    }

    const results = Array.isArray(result.results) ? result.results : []
    if (results.length > 0) {
      const successIds = results.filter(item => item.success).map(item => item.account_id)
      const failedIds  = results.filter(item => !item.success).map(item => item.account_id)
      return {
        successIds,
        failedIds,
        successCount: typeof result.success === 'number' ? result.success : successIds.length,
        failedCount:  typeof result.failed  === 'number' ? result.failed  : failedIds.length,
        hasIds: true,
        hasCounts: true,
      }
    }

    const hasExplicitCounts = typeof result.success === 'number' || typeof result.failed === 'number'
    const successCount = typeof result.success === 'number' ? result.success : 0
    const failedCount  = typeof result.failed  === 'number' ? result.failed  : 0
    if (hasExplicitCounts && failedCount === 0 && successCount === accountIds.length && accountIds.length > 0) {
      return {
        successIds: accountIds,
        failedIds: [],
        successCount,
        failedCount,
        hasIds: true,
        hasCounts: true,
      }
    }

    return {
      successIds: [],
      failedIds: [],
      successCount,
      failedCount,
      hasIds: false,
      hasCounts: hasExplicitCounts,
    }
  }

  // ── 批量操作 ─────────────────────────────────────────────────────────
  const handleBulkDelete = async (
    selectedIds: number[],
    onDone: () => void
  ) => {
    if (!confirm(`确认删除已选 ${selectedIds.length} 个账号？`)) return
    const ids = [...selectedIds]
    const batchSize = 50
    bulkDeleteProgress.value = { current: 0, total: ids.length }
    let totalSuccess = 0, totalFailed = 0
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize)
        const res = await adminAPI.accounts.batchDelete(chunk)
        totalSuccess += res.success ?? 0
        totalFailed  += res.failed  ?? 0
        bulkDeleteProgress.value = {
          current: Math.min(i + batchSize, ids.length),
          total: ids.length
        }
      }
      if (totalFailed > 0) {
        appStore.showError(`部分失败：成功 ${totalSuccess}，失败 ${totalFailed}`)
      } else {
        appStore.showSuccess(`已删除 ${totalSuccess} 个账号`)
        onDone()
      }
    } catch (err: any) {
      appStore.showError(err?.message || '批量删除失败')
    } finally {
      bulkDeleteProgress.value = null
    }
  }

  const handleBulkResetStatus = async (selectedIds: number[], onDone: () => void) => {
    if (!confirm('确认重置已选账号的错误状态？')) return
    try {
      const res = await adminAPI.accounts.batchClearError(selectedIds)
      if (res.failed > 0) {
        appStore.showError(`部分失败：成功 ${res.success}，失败 ${res.failed}`)
      } else {
        appStore.showSuccess(`已重置 ${res.success} 个账号`)
        onDone()
      }
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    }
  }

  const handleBulkRefreshToken = async (selectedIds: number[], onDone: () => void) => {
    if (!confirm('确认批量刷新已选账号凭证？')) return
    try {
      const res = await adminAPI.accounts.batchRefresh(selectedIds)
      if (res.failed > 0) {
        appStore.showError(`部分失败：成功 ${res.success}，失败 ${res.failed}`)
      } else {
        appStore.showSuccess(`已刷新 ${res.success} 个账号`)
        onDone()
      }
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    }
  }

  /**
   * 批量调度切换：用 normalizeBulkSchedulableResult 处理三种 shape
   * 成功 ids → updateSchedulableInList 行级 patch（不走 patchInList 的过滤判定）
   * 失败 ids → toast + setSelectedIds(failedIds) 保留 selection（legacy 行为）
   * shape 全部失败时 toast + reload（call onDone 之后让上层 reload）
   *
   * @param onUpdateSelection 上层提供的 selection 更新器（成功全清 / 失败保留 failedIds）
   * @param onReloadOnUnknown shape 无法识别时上层应触发 reload
   */
  const handleBulkToggleSchedulable = async (
    selectedIds: number[],
    schedulable: boolean,
    onDone: () => void,
    onUpdateSelection?: (ids: number[]) => void,
    onReloadOnUnknown?: () => void,
  ) => {
    if (selectedIds.length === 0) return
    if (!confirm(`确认${schedulable ? '启用' : '禁用'}已选账号的调度？`)) return
    const accountIds = [...selectedIds]
    try {
      const result = await adminAPI.accounts.bulkUpdate(accountIds, { schedulable })
      const { successIds, failedIds, successCount, failedCount, hasIds, hasCounts } =
        normalizeBulkSchedulableResult(result, accountIds)

      if (!hasIds && !hasCounts) {
        appStore.showError('批量结果格式无法识别，已重新加载列表。')
        onUpdateSelection?.(accountIds)
        onReloadOnUnknown?.()
        return
      }

      if (successIds.length > 0) updateSchedulableInList(successIds, schedulable)

      if (successCount > 0 && failedCount === 0) {
        appStore.showSuccess(
          schedulable
            ? `已启用 ${successCount} 个账号调度。`
            : `已禁用 ${successCount} 个账号调度。`
        )
      }
      if (failedCount > 0) {
        appStore.showError(`调度切换部分失败：成功 ${successCount}，失败 ${failedCount}。`)
        onUpdateSelection?.(failedIds.length > 0 ? failedIds : accountIds)
      } else {
        if (hasIds) {
          onDone()
        } else {
          onUpdateSelection?.(accountIds)
        }
      }
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
    }
  }

  // ── 批量编辑 / 删除：filtered 模式 ───────────────────────────────────────
  /**
   * 拉取当前 filter 命中的所有 account ids。
   * 1. preview = list(1, 1) 拿 total
   * 2. 分页 list(p, 500) 累加 ids
   */
  const fetchFilteredAccountIds = async (
    filters: BulkEditFilters,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ ids: number[]; total: number }> => {
    const preview = await adminAPI.accounts.list(1, 1, filters as any)
    const totalCount = preview.total
    if (totalCount === 0) return { ids: [], total: 0 }
    const allIds: number[] = []
    const fetchPageSize = 500
    const fetchPages = Math.ceil(totalCount / fetchPageSize)
    for (let p = 1; p <= fetchPages; p++) {
      const res = await adminAPI.accounts.list(p, fetchPageSize, filters as any)
      for (const a of res.items) allIds.push((a as Account).id)
      onProgress?.(Math.min(p * fetchPageSize, totalCount), totalCount)
    }
    return { ids: allIds, total: totalCount }
  }

  /** filtered 模式批量删除（T3 红线由上层 ConfirmDialog 兜底，本函数不再 confirm） */
  const handleBulkDeleteFiltered = async (
    filters: BulkEditFilters,
    onDone: () => void,
  ): Promise<{ failedIds: number[] } | null> => {
    let failedIds: number[] = []
    try {
      const { ids, total } = await fetchFilteredAccountIds(filters)
      if (total === 0 || ids.length === 0) {
        appStore.showError('当前筛选无匹配账号。')
        return null
      }
      const batchSize = 50
      let totalSuccess = 0, totalFailed = 0
      bulkDeleteProgress.value = { current: 0, total: ids.length }
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize)
        const res = await adminAPI.accounts.batchDelete(chunk)
        totalSuccess += res.success ?? 0
        totalFailed  += res.failed  ?? 0
        // 后端若返回 errors 则提取失败 id
        if (Array.isArray(res.errors)) {
          for (const e of res.errors) failedIds.push(e.account_id)
        }
        bulkDeleteProgress.value = { current: Math.min(i + batchSize, ids.length), total: ids.length }
      }
      if (totalFailed > 0) {
        appStore.showError(`部分失败：成功 ${totalSuccess}，失败 ${totalFailed}。`)
      } else {
        appStore.showSuccess(`已删除 ${totalSuccess} 个账号。`)
        onDone()
      }
    } catch (err: any) {
      appStore.showError(err?.message || '批量删除失败')
    } finally {
      bulkDeleteProgress.value = null
    }
    return { failedIds }
  }

  /** filtered 模式：构造 target 并打开 BulkEditModal */
  const handleBulkEditFiltered = async (filters: BulkEditFilters) => {
    try {
      const preview = await adminAPI.accounts.list(1, 100, filters as any)
      if (preview.total === 0) {
        appStore.showError('当前筛选无匹配账号。')
        return
      }
      const platforms = Array.from(new Set(preview.items.map((a: any) => a.platform))) as AccountPlatform[]
      const types     = Array.from(new Set(preview.items.map((a: any) => a.type)))     as AccountType[]
      bulkEditTarget.value = {
        mode: 'filtered',
        filters,
        previewCount: preview.total,
        selectedPlatforms: platforms,
        selectedTypes: types,
      }
      showBulkEdit.value = true
    } catch (err: any) {
      appStore.showError(err?.message || '加载筛选范围失败')
    }
  }

  const handleBulkEditSelected = (selectedIds: number[]) => {
    if (selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    const selected = accounts.value.filter(a => idSet.has(a.id))
    const platforms = Array.from(new Set(selected.map(a => a.platform))) as AccountPlatform[]
    const types     = Array.from(new Set(selected.map(a => a.type)))     as AccountType[]
    bulkEditTarget.value = {
      mode: 'selected',
      accountIds: [...selectedIds],
      selectedPlatforms: platforms,
      selectedTypes: types,
    }
    showBulkEdit.value = true
  }

  const closeBulkEdit = () => {
    showBulkEdit.value = false
    bulkEditTarget.value = null
  }

  // ── 导出 ─────────────────────────────────────────────────────────────
  const handleExportData = async (
    filters: Record<string, string | undefined>,
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ) => {
    try {
      const data = await adminAPI.accounts.exportData({
        filters: { ...filters, sort_by: sortBy, sort_order: sortOrder },
        includeProxies: true,
      })
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sub2api-accounts-${ts}.json`
      a.click()
      URL.revokeObjectURL(url)
      appStore.showSuccess('导出成功')
    } catch (err: any) {
      appStore.showError(err?.message || '导出失败')
    }
  }

  return {
    operatingSet,
    togglingSchedulable,
    todayStatsByAccountId,
    todayStatsLoading,
    manualRefreshToken,
    bulkDeleteProgress,
    refreshTodayStats,
    patchInList,
    patchAccountInList,
    syncPaginationAfterLocalRemoval,
    handleToggleStatus,
    handleRefreshOne,
    handleRecoverState,
    handleResetQuota,
    handleSetPrivacy,
    handleToggleSchedulable,
    handleBulkDelete,
    handleBulkResetStatus,
    handleBulkRefreshToken,
    handleBulkToggleSchedulable,
    handleBulkEditSelected,
    handleBulkDeleteFiltered,
    handleBulkEditFiltered,
    fetchFilteredAccountIds,
    updateSchedulableInList,
    normalizeBulkSchedulableResult,
    handleExportData,
    showBulkEdit,
    bulkEditTarget,
    closeBulkEdit,
  }
}
