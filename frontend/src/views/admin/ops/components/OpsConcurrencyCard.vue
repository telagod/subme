<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { opsAPI, type OpsAccountAvailabilityStatsResponse, type OpsConcurrencyStatsResponse, type OpsUserConcurrencyStatsResponse } from '@/api/admin/ops'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Props {
  platformFilter?: string
  groupIdFilter?: number | null
  refreshToken: number
}

const props = withDefaults(defineProps<Props>(), {
  platformFilter: '',
  groupIdFilter: null
})

const { t } = useI18n()

const loading = ref(false)
const errorMessage = ref('')
const concurrency = ref<OpsConcurrencyStatsResponse | null>(null)
const availability = ref<OpsAccountAvailabilityStatsResponse | null>(null)
const userConcurrency = ref<OpsUserConcurrencyStatsResponse | null>(null)

// 用户视图开关
const showByUser = ref(false)

const realtimeEnabled = computed(() => {
  return (concurrency.value?.enabled ?? true) && (availability.value?.enabled ?? true)
})

function safeNumber(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

// 计算显示维度
const displayDimension = computed<'platform' | 'group' | 'account' | 'user'>(() => {
  if (showByUser.value) {
    return 'user'
  }
  if (typeof props.groupIdFilter === 'number' && props.groupIdFilter > 0) {
    return 'account'
  }
  if (props.platformFilter) {
    return 'group'
  }
  return 'platform'
})

// 平台/分组汇总行数据
interface SummaryRow {
  key: string
  name: string
  platform?: string
  // 账号统计
  total_accounts: number
  available_accounts: number
  rate_limited_accounts: number
  error_accounts: number
  // 并发统计
  total_concurrency: number
  used_concurrency: number
  waiting_in_queue: number
  // 计算字段
  availability_percentage: number
  concurrency_percentage: number
}

// 账号详细行数据
interface AccountRow {
  key: string
  name: string
  platform: string
  group_name: string
  // 并发
  current_in_use: number
  max_capacity: number
  waiting_in_queue: number
  load_percentage: number
  // 状态
  is_available: boolean
  is_rate_limited: boolean
  rate_limit_remaining_sec?: number
  is_overloaded: boolean
  overload_remaining_sec?: number
  has_error: boolean
  error_message?: string
}

// 用户行数据
interface UserRow {
  key: string
  user_id: number
  user_email: string
  username: string
  current_in_use: number
  max_capacity: number
  waiting_in_queue: number
  load_percentage: number
}

// 平台维度汇总
const platformRows = computed((): SummaryRow[] => {
  const concStats = concurrency.value?.platform || {}
  const availStats = availability.value?.platform || {}

  const platforms = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

  return Array.from(platforms).map(platform => {
    const conc = concStats[platform] || {}
    const avail = availStats[platform] || {}

    const totalAccounts = safeNumber(avail.total_accounts)
    const availableAccounts = safeNumber(avail.available_count)
    const totalConcurrency = safeNumber(conc.max_capacity)
    const usedConcurrency = safeNumber(conc.current_in_use)

    return {
      key: platform,
      name: platform.toUpperCase(),
      total_accounts: totalAccounts,
      available_accounts: availableAccounts,
      rate_limited_accounts: safeNumber(avail.rate_limit_count),

      error_accounts: safeNumber(avail.error_count),
      total_concurrency: totalConcurrency,
      used_concurrency: usedConcurrency,
      waiting_in_queue: safeNumber(conc.waiting_in_queue),
      availability_percentage: totalAccounts > 0 ? Math.round((availableAccounts / totalAccounts) * 100) : 0,
      concurrency_percentage: totalConcurrency > 0 ? Math.round((usedConcurrency / totalConcurrency) * 100) : 0
    }
  }).sort((a, b) => b.concurrency_percentage - a.concurrency_percentage)
})

// 分组维度汇总
const groupRows = computed((): SummaryRow[] => {
  const concStats = concurrency.value?.group || {}
  const availStats = availability.value?.group || {}

  const groupIds = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

  const rows = Array.from(groupIds)
    .map(gid => {
      const conc = concStats[gid] || {}
      const avail = availStats[gid] || {}

      // 只显示匹配的平台
      if (props.platformFilter && conc.platform !== props.platformFilter && avail.platform !== props.platformFilter) {
        return null
      }

      const totalAccounts = safeNumber(avail.total_accounts)
      const availableAccounts = safeNumber(avail.available_count)
      const totalConcurrency = safeNumber(conc.max_capacity)
      const usedConcurrency = safeNumber(conc.current_in_use)

      return {
        key: gid,
        name: String(conc.group_name || avail.group_name || `Group ${gid}`),
        platform: String(conc.platform || avail.platform || ''),
        total_accounts: totalAccounts,
        available_accounts: availableAccounts,
        rate_limited_accounts: safeNumber(avail.rate_limit_count),

        error_accounts: safeNumber(avail.error_count),
        total_concurrency: totalConcurrency,
        used_concurrency: usedConcurrency,
        waiting_in_queue: safeNumber(conc.waiting_in_queue),
        availability_percentage: totalAccounts > 0 ? Math.round((availableAccounts / totalAccounts) * 100) : 0,
        concurrency_percentage: totalConcurrency > 0 ? Math.round((usedConcurrency / totalConcurrency) * 100) : 0
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  return rows.sort((a, b) => b.concurrency_percentage - a.concurrency_percentage)
})

// 账号维度详细
const accountRows = computed((): AccountRow[] => {
  const concStats = concurrency.value?.account || {}
  const availStats = availability.value?.account || {}

  const accountIds = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

  const rows = Array.from(accountIds)
    .map(aid => {
      const conc = concStats[aid] || {}
      const avail = availStats[aid] || {}

      // 只显示匹配的分组
      if (typeof props.groupIdFilter === 'number' && props.groupIdFilter > 0) {
        if (conc.group_id !== props.groupIdFilter && avail.group_id !== props.groupIdFilter) {
          return null
        }
      }

      return {
        key: aid,
        name: String(conc.account_name || avail.account_name || `Account ${aid}`),
        platform: String(conc.platform || avail.platform || ''),
        group_name: String(conc.group_name || avail.group_name || ''),
        current_in_use: safeNumber(conc.current_in_use),
        max_capacity: safeNumber(conc.max_capacity),
        waiting_in_queue: safeNumber(conc.waiting_in_queue),
        load_percentage: safeNumber(conc.load_percentage),
        is_available: avail.is_available || false,
        is_rate_limited: avail.is_rate_limited || false,
        rate_limit_remaining_sec: avail.rate_limit_remaining_sec,
        is_overloaded: avail.is_overloaded || false,
        overload_remaining_sec: avail.overload_remaining_sec,
        has_error: avail.has_error || false,
        error_message: avail.error_message || ''
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  return rows.sort((a, b) => {
    // 优先显示异常账号
    if (a.has_error !== b.has_error) return a.has_error ? -1 : 1
    if (a.is_rate_limited !== b.is_rate_limited) return a.is_rate_limited ? -1 : 1
    // 然后按负载排序
    return b.load_percentage - a.load_percentage
  })
})

// 用户维度详细
const userRows = computed((): UserRow[] => {
  const userStats = userConcurrency.value?.user || {}

  return Object.keys(userStats)
    .map(uid => {
      const u = userStats[uid] || {}
      return {
        key: uid,
        user_id: safeNumber(u.user_id),
        user_email: u.user_email || `User ${uid}`,
        username: u.username || '',
        current_in_use: safeNumber(u.current_in_use),
        max_capacity: safeNumber(u.max_capacity),
        waiting_in_queue: safeNumber(u.waiting_in_queue),
        load_percentage: safeNumber(u.load_percentage)
      }
    })
    .sort((a, b) => b.current_in_use - a.current_in_use || b.load_percentage - a.load_percentage)
})

// 根据维度选择数据
const displayRows = computed(() => {
  if (displayDimension.value === 'user') return userRows.value
  if (displayDimension.value === 'account') return accountRows.value
  if (displayDimension.value === 'group') return groupRows.value
  return platformRows.value
})

const displayTitle = computed(() => {
  if (displayDimension.value === 'user') return t('admin.ops.concurrency.byUser')
  if (displayDimension.value === 'account') return t('admin.ops.concurrency.byAccount')
  if (displayDimension.value === 'group') return t('admin.ops.concurrency.byGroup')
  return t('admin.ops.concurrency.byPlatform')
})

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    if (showByUser.value) {
      // 用户视图模式只加载用户并发数据
      const userData = await opsAPI.getUserConcurrencyStats()
      userConcurrency.value = userData
    } else {
      // 常规模式加载账号/平台/分组数据
      const [concData, availData] = await Promise.all([
        opsAPI.getConcurrencyStats(props.platformFilter, props.groupIdFilter),
        opsAPI.getAccountAvailabilityStats(props.platformFilter, props.groupIdFilter)
      ])
      concurrency.value = concData
      availability.value = availData
    }
  } catch (err: any) {
    // dev console; production build suppresses console.*
    console.error('[OpsConcurrencyCard] Failed to load data', err)
    errorMessage.value = err?.response?.data?.detail || t('admin.ops.concurrency.loadFailed')
  } finally {
    loading.value = false
  }
}

// 刷新节奏由父组件统一控制（OpsDashboard Header 的刷新状态/倒计时）
watch(
  () => props.refreshToken,
  () => {
    if (!realtimeEnabled.value) return
    loadData()
  }
)

// 切换用户视图时重新加载数据
watch(
  () => showByUser.value,
  () => {
    loadData()
  }
)

function getLoadBarClass(loadPct: number): string {
  const base = 'h-full rounded-full transition-all duration-300'
  if (loadPct >= 90) return `${base} bg-red-500`
  if (loadPct >= 50) return `${base} bg-amber-500`
  return `${base} bg-emerald-500`
}

function getLoadBarStyle(loadPct: number): string {
  return `width: ${Math.min(100, Math.max(0, loadPct))}%`
}

function getLoadTextClass(loadPct: number): string {
  if (loadPct >= 90) return 'text-red-500'
  if (loadPct >= 50) return 'text-amber-500'
  return 'text-emerald-500'
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}


watch(
  () => realtimeEnabled.value,
  async (enabled) => {
    if (enabled) {
      await loadData()
    }
  },
  { immediate: true }
)
</script>

<template>
  <Card class="p-5 flex flex-col h-full rounded-xl shadow-none">
    <!-- 头部 -->
    <div class="flex items-center justify-between mb-3.5 flex-shrink-0">
      <h3 class="flex items-center gap-2 text-[13px] font-bold text-foreground">
        <svg class="text-primary flex-shrink-0" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {{ t('admin.ops.concurrency.title') }}
      </h3>
      <div style="display:flex;align-items:center;gap:6px;">
        <!-- 用户视图切换按钮 -->
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 flex-shrink-0"
          :class="showByUser ? 'bg-primary/10 border-primary/35 text-primary' : ''"
          :title="showByUser ? t('admin.ops.concurrency.switchToPlatform') : t('admin.ops.concurrency.switchToUser')"
          :aria-label="showByUser ? t('admin.ops.concurrency.switchToPlatform') : t('admin.ops.concurrency.switchToUser')"
          @click="showByUser = !showByUser"
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </Button>
        <!-- 刷新按钮 -->
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 flex-shrink-0"
          :disabled="loading"
          :title="t('common.refresh')"
          :aria-label="t('common.refresh')"
          @click="loadData"
        >
          <svg width="13" height="13" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="mb-2.5 rounded-lg bg-destructive/10 border border-destructive/35 px-3 py-2 text-[11.5px] text-destructive">
      {{ errorMessage }}
    </div>

    <!-- 禁用状态 -->
    <div
      v-if="!realtimeEnabled"
      class="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground"
    >
      {{ t('admin.ops.concurrency.disabledHint') }}
    </div>

    <!-- 数据展示区域 -->
    <div v-else class="flex-1 min-h-0 overflow-hidden rounded-lg border border-border flex flex-col">
      <!-- 维度标题栏 -->
      <div class="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border flex-shrink-0">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{{ displayTitle }}</span>
        <span class="text-[10px] text-muted-foreground">{{ t('admin.ops.concurrency.totalRows', { count: displayRows.length }) }}</span>
      </div>

      <!-- 空状态 -->
      <div v-if="displayRows.length === 0" class="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
        {{ t('admin.ops.concurrency.empty') }}
      </div>

      <!-- 用户视图 -->
      <div v-else-if="displayDimension === 'user'" class="flex-1 overflow-y-auto p-2.5 scrollbar-thin" style="max-height:360px;">
        <div v-for="row in (displayRows as UserRow[])" :key="row.key" class="bg-muted rounded-lg p-2.5 mb-1.5 last:mb-0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">
            <div style="display:flex;min-width:0;flex:1;align-items:center;gap:5px;">
              <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground" :title="row.username || row.user_email">{{ row.username || row.user_email }}</span>
              <span v-if="row.username" class="flex-shrink-0 text-[10px] text-muted-foreground overflow-hidden text-ellipsis" :title="row.user_email">{{ row.user_email }}</span>
            </div>
            <div style="display:flex;flex-shrink:0;align-items:center;gap:6px;font-size:10px;">
              <span class="font-mono tabular-nums font-bold text-foreground">{{ row.current_in_use }}/{{ row.max_capacity }}</span>
              <span :class="getLoadTextClass(row.load_percentage)" class="font-bold">{{ Math.round(row.load_percentage) }}%</span>
            </div>
          </div>
          <div class="h-[5px] rounded-full bg-background overflow-hidden my-1"><div :class="getLoadBarClass(row.load_percentage)" :style="getLoadBarStyle(row.load_percentage)"></div></div>
          <div v-if="row.waiting_in_queue > 0" class="mt-1 flex justify-end">
            <Badge class="bg-primary/10 border border-primary/35 text-primary text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.concurrency.queued', { count: row.waiting_in_queue }) }}</Badge>
          </div>
        </div>
      </div>

      <!-- 汇总视图（平台/分组） -->
      <div v-else-if="displayDimension === 'platform' || displayDimension === 'group'" class="flex-1 overflow-y-auto p-2.5 scrollbar-thin" style="max-height:360px;">
        <div v-for="row in (displayRows as SummaryRow[])" :key="row.key" class="bg-muted rounded-lg p-2.5 mb-1.5 last:mb-0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground" :title="row.name">{{ row.name }}</span>
              <span v-if="displayDimension === 'group' && row.platform" class="text-[10px] text-muted-foreground">{{ row.platform.toUpperCase() }}</span>
            </div>
            <div style="display:flex;flex-shrink:0;align-items:center;gap:6px;font-size:10px;">
              <span class="font-mono tabular-nums font-bold text-foreground">{{ row.used_concurrency }}/{{ row.total_concurrency }}</span>
              <span :class="getLoadTextClass(row.concurrency_percentage)" class="font-bold">{{ row.concurrency_percentage }}%</span>
            </div>
          </div>
          <div class="h-[5px] rounded-full bg-background overflow-hidden my-1 mb-1.5"><div :class="getLoadBarClass(row.concurrency_percentage)" :style="getLoadBarStyle(row.concurrency_percentage)"></div></div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:10px;">
            <div style="display:flex;align-items:center;gap:4px;">
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="text-muted-foreground">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              <span class="text-muted-foreground"><span class="text-emerald-500 font-bold">{{ row.available_accounts }}</span>/{{ row.total_accounts }}</span>
              <span class="text-muted-foreground">{{ row.availability_percentage }}%</span>
            </div>
            <Badge v-if="row.rate_limited_accounts > 0" class="bg-amber-500/10 border border-amber-500/35 text-amber-500 text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.concurrency.rateLimited', { count: row.rate_limited_accounts }) }}</Badge>
            <Badge v-if="row.error_accounts > 0" class="bg-destructive/10 border border-destructive/35 text-destructive text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.concurrency.errorAccounts', { count: row.error_accounts }) }}</Badge>
            <Badge v-if="row.waiting_in_queue > 0" class="bg-primary/10 border border-primary/35 text-primary text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.concurrency.queued', { count: row.waiting_in_queue }) }}</Badge>
          </div>
        </div>
      </div>

      <!-- 账号详细视图 -->
      <div v-else class="flex-1 overflow-y-auto p-2.5 scrollbar-thin" style="max-height:360px;">
        <div v-for="row in (displayRows as AccountRow[])" :key="row.key" class="bg-muted rounded-lg p-2.5 mb-1.5 last:mb-0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">
            <div style="min-width:0;flex:1;">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground" :title="row.name">{{ row.name }}</div>
              <div class="mt-px text-[9px] text-muted-foreground">{{ row.group_name }}</div>
            </div>
            <div style="display:flex;flex-shrink:0;align-items:center;gap:6px;">
              <span class="font-mono tabular-nums text-[11px] font-bold text-foreground">{{ row.current_in_use }}/{{ row.max_capacity }}</span>
              <Badge v-if="row.is_available" class="bg-emerald-500/10 border border-emerald-500/35 text-emerald-500 text-[10px] rounded-full px-2 py-0.5 gap-1">
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                {{ t('admin.ops.accountAvailability.available') }}
              </Badge>
              <Badge v-else-if="row.is_rate_limited" class="bg-amber-500/10 border border-amber-500/35 text-amber-500 text-[10px] rounded-full px-2 py-0.5 gap-1">
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {{ formatDuration(row.rate_limit_remaining_sec || 0) }}
              </Badge>
              <Badge v-else-if="row.is_overloaded" class="bg-destructive/10 border border-destructive/35 text-destructive text-[10px] rounded-full px-2 py-0.5 gap-1">
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                {{ formatDuration(row.overload_remaining_sec || 0) }}
              </Badge>
              <Badge v-else-if="row.has_error" class="bg-destructive/10 border border-destructive/35 text-destructive text-[10px] rounded-full px-2 py-0.5 gap-1">
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                {{ t('admin.ops.accountAvailability.accountError') }}
              </Badge>
              <Badge v-else variant="secondary" class="text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.accountAvailability.unavailable') }}</Badge>
            </div>
          </div>
          <div class="h-[5px] rounded-full bg-background overflow-hidden my-1"><div :class="getLoadBarClass(row.load_percentage)" :style="getLoadBarStyle(row.load_percentage)"></div></div>
          <div v-if="row.waiting_in_queue > 0" class="mt-1 flex justify-end">
            <Badge class="bg-primary/10 border border-primary/35 text-primary text-[10px] rounded-full px-2 py-0.5">{{ t('admin.ops.concurrency.queued', { count: row.waiting_in_queue }) }}</Badge>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

