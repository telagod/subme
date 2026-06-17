/**
 * AccountsPoolView 操作逻辑 composable
 * 涵盖：单账号 CRUD、批量操作、今日统计、调度、导出
 */
import { ref, reactive } from 'vue'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api/admin'
import type { Account, AccountPlatform, AccountType, WindowStats } from '@/types'

export type BulkEditTarget = {
  mode: 'selected'
  accountIds: number[]
  selectedPlatforms: AccountPlatform[]
  selectedTypes: AccountType[]
}

export function useAccountPoolActions(accounts: { value: Account[] }) {
  const appStore = useAppStore()

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

  // ── 行内 patch ────────────────────────────────────────────────────────
  const patchInList = (updated: Account) => {
    const idx = accounts.value.findIndex(a => a.id === updated.id)
    if (idx !== -1) accounts.value[idx] = updated
  }

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

  const handleBulkToggleSchedulable = async (
    selectedIds: number[],
    schedulable: boolean,
    onDone: () => void
  ) => {
    if (!confirm(`确认${schedulable ? '启用' : '禁用'}已选账号的调度？`)) return
    try {
      const res = await adminAPI.accounts.bulkUpdate(selectedIds, { schedulable })
      if (res.failed > 0) {
        appStore.showError(`部分失败：成功 ${res.success}，失败 ${res.failed}`)
      } else {
        appStore.showSuccess(`已${schedulable ? '启用' : '禁用'} ${res.success} 个账号调度`)
        onDone()
      }
    } catch (err: any) {
      appStore.showError(err?.message || '操作失败')
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
    handleExportData,
    showBulkEdit,
    bulkEditTarget,
    closeBulkEdit,
  }
}
