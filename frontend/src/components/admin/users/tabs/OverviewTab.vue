<template>
  <div class="flex flex-col gap-5">
    <!-- KPI 三格（去重：余额/消耗已在抽屉顶部 KPI 条展示，此处放更有信息量的活动指标） -->
    <div class="grid grid-cols-3 gap-2.5">
      <Card class="flex flex-col gap-1 px-4 py-3.5">
        <span class="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.userTabs.kpiMonthRequests') }}</span>
        <span class="font-mono text-lg font-bold tabular-nums text-foreground" v-if="!statsLoading">{{ monthStats.total_requests.toLocaleString() }}</span>
        <span class="font-mono text-lg font-bold tabular-nums text-muted-foreground" v-else>…</span>
      </Card>
      <Card class="flex flex-col gap-1 px-4 py-3.5">
        <span class="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.userTabs.kpiMonthTokens') }}</span>
        <span class="font-mono text-lg font-bold tabular-nums text-foreground" v-if="!statsLoading">{{ fmtTok(monthStats.total_tokens) }}</span>
        <span class="font-mono text-lg font-bold tabular-nums text-muted-foreground" v-else>…</span>
      </Card>
      <Card class="flex flex-col gap-1 px-4 py-3.5">
        <span class="text-[10.5px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.userTabs.kpiConcurrency') }}</span>
        <span class="font-mono text-lg font-bold tabular-nums text-foreground">{{ user.current_concurrency ?? 0 }}<span class="ml-0.5 text-xs font-normal text-muted-foreground">/{{ user.concurrency }}</span></span>
      </Card>
    </div>

    <!-- 近 30 日消耗折线图（SVG 简版） -->
    <div class="flex flex-col gap-2">
      <p class="m-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.chart30dTitle') }}</p>
      <div v-if="chartLoading" class="flex h-[100px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs text-muted-foreground">
        <svg class="opacity-30" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="14" cy="14" r="3" stroke="currentColor" stroke-width="1.3"/>
        </svg>
        {{ t('admin.userTabs.loading') }}
      </div>
      <div v-else-if="chartError" class="flex h-[100px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs text-muted-foreground">
        <svg class="opacity-30" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="10" stroke="currentColor" stroke-width="1.3"/>
          <path d="M14 9v6M14 18v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>{{ chartError }}</span>
      </div>
      <template v-else>
        <!-- 无数据体面空态 -->
        <div v-if="!chartPath" class="flex h-[100px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs text-muted-foreground">
          <svg class="opacity-30" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M4 22L10 14L15 18L20 10L24 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2"/>
            <rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" stroke-width="1.3" opacity=".4"/>
          </svg>
          <span>{{ t('admin.userTabs.chartNoData') }}</span>
        </div>
        <!-- 有数据：primary 折线 + 渐变填充 -->
        <svg
          v-else
          class="block h-[100px] w-full"
          viewBox="0 0 480 100"
          preserveAspectRatio="none"
          :aria-label="t('admin.userTabs.chart30dTitle')"
        >
          <defs>
            <linearGradient id="ud-chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#5CA8FF" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#5CA8FF" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <!-- 网格线 -->
          <line x1="0" y1="25" x2="480" y2="25" stroke="hsl(var(--border))" stroke-width="1"/>
          <line x1="0" y1="50" x2="480" y2="50" stroke="hsl(var(--border))" stroke-width="1"/>
          <line x1="0" y1="75" x2="480" y2="75" stroke="hsl(var(--border))" stroke-width="1"/>
          <!-- 面积填充（渐变） -->
          <path :d="chartFillPath" fill="url(#ud-chart-grad)"/>
          <!-- 折线 -->
          <path :d="chartPath" fill="none" stroke="#5CA8FF" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </template>
    </div>

    <!-- 基础信息 -->
    <div class="flex flex-col">
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoUserId') }}</span>
        <span class="flex-1 break-all font-mono text-xs text-foreground">#{{ user.id }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoEmail') }}</span>
        <span class="flex-1 break-all text-foreground">{{ user.email }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]" v-if="user.username">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoUsername') }}</span>
        <span class="flex-1 break-all text-foreground">{{ user.username }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoConcurrency') }}</span>
        <span class="flex-1 break-all font-mono text-xs text-foreground">{{ user.concurrency }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]" v-if="user.rpm_limit !== undefined">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoRpm') }}</span>
        <span class="flex-1 break-all font-mono text-xs text-foreground">{{ user.rpm_limit === 0 ? t('admin.userTabs.infoRpmUnlimited') : user.rpm_limit }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoRegistered') }}</span>
        <span class="flex-1 break-all text-muted-foreground">{{ fmt(user.created_at) }}</span>
      </div>
      <div class="flex items-baseline gap-3 border-b border-border py-[9px] text-[12.5px]" v-if="user.last_active_at">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoLastActive') }}</span>
        <span class="flex-1 break-all text-muted-foreground">{{ fmt(user.last_active_at) }}</span>
      </div>
      <div class="flex items-baseline gap-3 py-[9px] text-[12.5px]" v-if="user.notes">
        <span class="w-20 shrink-0 text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.infoNotes') }}</span>
        <span class="flex-1 break-all text-foreground">{{ user.notes }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser } from '@/types'
import { formatDateTime } from '@/utils/format'
import { Card } from '@/components/ui/card'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser }>()

const statsLoading = ref(false)
const chartLoading = ref(false)
const chartError = ref<string | null>(null)
const monthStats = ref({ total_cost: 0, total_requests: 0, total_tokens: 0 })

// 日粒度数据点 [{date, cost}]
const dailyPoints = ref<{ date: string; cost: number }[]>([])


function fmtTok(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K'
  return Math.round(v).toLocaleString()
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '-'
  return formatDateTime(iso)
}

// 构建折线 path（视口 480×100）
const chartPath = computed(() => {
  const pts = dailyPoints.value
  if (!pts.length) return ''
  const maxVal = Math.max(...pts.map(p => p.cost), 0.000001)
  const n = pts.length
  const coords = pts.map((p, i) => {
    const x = (i / (n - 1 || 1)) * 476 + 2
    const y = 96 - (p.cost / maxVal) * 86
    return [x, y] as [number, number]
  })
  return coords.reduce((acc, [x, y], i) => acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`), '')
})

const chartFillPath = computed(() => {
  if (!chartPath.value) return ''
  const pts = dailyPoints.value
  const n = pts.length
  if (!n) return ''
  const maxVal = Math.max(...pts.map(p => p.cost), 0.000001)
  const last = pts.map((p, i) => {
    const x = (i / (n - 1 || 1)) * 476 + 2
    const y = 96 - (p.cost / maxVal) * 86
    return [x, y] as [number, number]
  })
  return `${chartPath.value} L${last[last.length - 1][0]},98 L${last[0][0]},98 Z`
})

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await adminAPI.users.getUserUsageStats(props.user.id, 'month')
    monthStats.value = res
  } catch { /* ignore */ } finally {
    statsLoading.value = false
  }
}

async function loadChart() {
  chartLoading.value = true
  chartError.value = null
  try {
    // 拉近 30 日的日粒度 usage stats
    const now = new Date()
    // end/start vars unused — sampling uses per-window date ranges below
    // 用 adminUsageAPI.getStats 按天分组（通过遍历 7 日 × 5 批）
    // 由于接口不支持日粒度分组，改为拉 30 天内逐日统计（不发 30 次请求）
    // 实际用单次 getStats + period=month 做概览，图表展示本月累计趋势占位
    // 若要精确日粒度需后端支持，此处用近似点（7个采样点）
    const promises = Array.from({ length: 5 }, (_, w) => {
      const eDate = new Date(now.getTime() - w * 6 * 86400000)
      const sDate = new Date(eDate.getTime() - 5 * 86400000)
      return adminAPI.usage.getStats({
        user_id: props.user.id,
        start_date: sDate.toISOString().split('T')[0],
        end_date: eDate.toISOString().split('T')[0],
      }).then(r => ({ date: eDate.toISOString().split('T')[0], cost: r.total_cost }))
    })
    const results = await Promise.all(promises)
    dailyPoints.value = results.sort((a, b) => a.date.localeCompare(b.date))
  } catch (e) {
    chartError.value = t('admin.userTabs.chartLoadError')
  } finally {
    chartLoading.value = false
  }
}

watch(() => props.user.id, () => { loadStats(); loadChart() })
onMounted(() => { loadStats(); loadChart() })
</script>
