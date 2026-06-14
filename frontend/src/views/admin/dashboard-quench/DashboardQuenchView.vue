<template>
  <AppLayout>
    <div class="dq-root">
      <!-- 页头 -->
      <div class="dq-head rise">
        <div>
          <h1 class="dq-title">{{ t('admin.dashboardQuench.title') }}</h1>
          <p class="dq-desc">
            <span class="dq-live"><span class="dq-live-dot"></span>{{ t('admin.dashboardQuench.live') }}</span>
            <span class="dq-desc-sep">·</span>
            <span>{{ t('admin.dashboardQuench.updatedAt', { time: lastUpdated }) }}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" :disabled="loading" @click="reload">
          <span class="inline-block text-[13px] leading-none" :class="{ 'animate-spin': loading }">⟳</span>
          {{ t('admin.dashboardQuench.refresh') }}
        </Button>
      </div>

      <div v-if="loading && !stats" class="dq-spin">
        <LoadingSpinner size="md" />
      </div>

      <template v-else>
        <!-- ═══ 经营行 ═══ -->
        <div class="dq-kpi-row">
          <!-- 英雄：今日营收 -->
          <div class="dq-kpi dq-kpi-hero rise" style="animation-delay:.04s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiRevenue') }}</div>
            <div class="dq-kpi-value dq-hero-value text-emerald-500">${{ fmtMoney(tickRevenue) }}</div>
            <div class="dq-kpi-foot">
              <span class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiOrdersSub', { n: payDash?.today_count ?? 0 }) }}</span>
              <span v-if="payDash" class="dq-margin" :class="todayMargin >= 0 ? 'dq-ok' : 'dq-bad'">
                {{ t('admin.dashboardQuench.kpiMargin') }} <b class="text-emerald-500">${{ fmtMoney(todayMargin) }}</b>
              </span>
              <span v-else class="dq-kpi-sub dq-muted">{{ t('admin.dashboardQuench.kpiMarginNa') }}</span>
            </div>
          </div>
          <div class="dq-kpi rise" style="animation-delay:.08s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiRequests') }}</div>
            <div class="dq-kpi-value">{{ fmtNum(tickRequests) }}</div>
            <div class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiAccumRequests', { n: fmtNum(stats?.total_requests ?? 0) }) }}</div>
          </div>
          <div class="dq-kpi rise" style="animation-delay:.12s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiNewUsers') }}</div>
            <div class="dq-kpi-value dq-ok">+{{ stats?.today_new_users ?? 0 }}</div>
            <div class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiTotalUsers', { n: fmtNum(stats?.total_users ?? 0) }) }}</div>
          </div>
          <div class="dq-kpi rise" style="animation-delay:.16s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiCostToday') }}</div>
            <div class="dq-kpi-value text-emerald-500">${{ fmtMoney(stats?.today_actual_cost ?? 0) }}</div>
            <div class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiCostSub') }} <span class="text-emerald-500">${{ fmtMoney(stats?.today_account_cost ?? 0) }}</span></div>
          </div>
        </div>

        <!-- ═══ 流量行（紧凑 KPI，不再与图表挤压拉伸）═══ -->
        <div class="dq-traffic-kpis">
          <div class="dq-kpi dq-kpi-sm rise" style="animation-delay:.20s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiTokenToday') }}</div>
            <div class="dq-kpi-value dq-val-sm">{{ fmtTok(stats?.today_tokens ?? 0) }}</div>
            <div class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiTokenAccum', { n: fmtTok(stats?.total_tokens ?? 0) }) }}</div>
          </div>
          <div class="dq-kpi dq-kpi-sm dq-kpi-azure rise" style="animation-delay:.24s">
            <div class="dq-kpi-label"><span class="dq-live-dot"></span>RPM</div>
            <div class="dq-kpi-value dq-val-sm dq-azure">{{ fmtTok(stats?.rpm ?? 0) }}</div>
            <div class="dq-kpi-sub">TPM {{ fmtTok(stats?.tpm ?? 0) }}</div>
          </div>
          <div class="dq-kpi dq-kpi-sm rise" style="animation-delay:.28s">
            <div class="dq-kpi-label">{{ t('admin.dashboardQuench.kpiAvgResponse') }}</div>
            <div class="dq-kpi-value dq-val-sm">{{ fmtDur(stats?.average_duration_ms ?? 0) }}</div>
            <div class="dq-kpi-sub">{{ t('admin.dashboardQuench.kpiActiveUsers', { n: stats?.active_users ?? 0 }) }}</div>
          </div>
        </div>

        <!-- ═══ 图表面板（整宽）═══ -->
        <div class="dq-charts-panel rise" style="animation-delay:.30s">
          <div class="dq-chart-filters">
            <DateRangePicker v-model:start-date="startDate" v-model:end-date="endDate" @change="onRangeChange" />
            <Select v-model="granularity" :options="granOpts" class="dq-gran-sel" @change="loadCharts" />
          </div>
          <div class="dq-charts-grid">
            <ModelDistributionChart
              :model-stats="modelStats"
              :enable-ranking-view="true"
              :ranking-items="rankingItems"
              :ranking-total-actual-cost="rankingTotalActualCost"
              :ranking-total-requests="rankingTotalRequests"
              :ranking-total-tokens="rankingTotalTokens"
              :loading="chartsLoading"
              :ranking-loading="rankingLoading"
              :ranking-error="rankingError"
              :start-date="startDate"
              :end-date="endDate"
              @ranking-click="goToUsage"
            />
            <TokenUsageTrend :trend-data="trendData" :loading="chartsLoading" />
          </div>
        </div>

        <!-- ═══ 异常行 ═══ -->
        <DashAnomalyRow
          :base-delay=".36"
          :error-accounts="stats?.error_accounts"
          :ratelimit-accounts="stats?.ratelimit_accounts"
          :normal-accounts="stats?.normal_accounts"
          :total-accounts="stats?.total_accounts"
          :active-keys="stats?.active_api_keys"
          :total-keys="stats?.total_api_keys"
          :alerts-loading="alertsLoading"
          :firing-count="firingAlerts"
          :resolved-count="resolvedAlerts"
          :latest-title="latestAlert?.title ?? latestAlert?.description ?? null"
          :latest-severity="latestAlert?.severity ?? null"
          @nav="goTo"
        />
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api/admin'
import { opsAPI } from '@/api/admin/ops'
import { adminPaymentAPI } from '@/api/admin/payment'
import type { DashboardStats, TrendDataPoint, ModelStat, UserSpendingRankingItem } from '@/types'
import type { DashboardStats as PayDashboardStats } from '@/types/payment'
import type { AlertEvent } from '@/api/admin/ops'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import DateRangePicker from '@/components/common/DateRangePicker.vue'
import Select from '@/components/common/Select.vue'
import ModelDistributionChart from '@/components/charts/ModelDistributionChart.vue'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend.vue'
import DashAnomalyRow from './DashAnomalyRow.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(false), chartsLoading = ref(false), rankingLoading = ref(false)
const rankingError = ref(false), alertsLoading = ref(false)
const stats = ref<DashboardStats | null>(null), payDash = ref<PayDashboardStats | null>(null)
const trendData = ref<TrendDataPoint[]>([]), modelStats = ref<ModelStat[]>([])
const rankingItems = ref<UserSpendingRankingItem[]>([])
const rankingTotalActualCost = ref(0), rankingTotalRequests = ref(0), rankingTotalTokens = ref(0)
const alertEvents = ref<AlertEvent[]>([])
let chartSeq = 0, rankingSeq = 0

const fmtLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const last24h = () => {
  const end = new Date()
  return { start: fmtLocalDate(new Date(end.getTime() - 86400000)), end: fmtLocalDate(end) }
}
const granularity = ref<'day' | 'hour'>('hour')
const r0 = last24h()
const startDate = ref(r0.start)
const endDate = ref(r0.end)

const granOpts = computed(() => [
  { value: 'hour', label: t('admin.dashboard.hour') },
  { value: 'day', label: t('admin.dashboard.day') }
])
const firingAlerts = computed(() => alertEvents.value.filter(e => e.status === 'firing').length)
const resolvedAlerts = computed(() => alertEvents.value.filter(e => e.status !== 'firing').length)
const latestAlert = computed(() => alertEvents.value.find(e => e.status === 'firing') ?? null)

// 今日毛利 = 营收 − 账号成本（运营最关心的派生指标，纯前端聚合）
const todayMargin = computed(() => (payDash.value?.today_amount ?? 0) - (stats.value?.today_account_cost ?? 0))

// 最近更新时间（心跳可见化）
const lastUpdated = ref('—')
function stampUpdated(now: number) {
  const d = new Date(now)
  lastUpdated.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function fmtNum(v: number) { return Math.round(v).toLocaleString() }
function fmtMoney(v: number) {
  const n = Math.abs(v)
  if (n >= 1000) return (v / 1000).toFixed(2) + 'K'
  if (n >= 0.01 || v === 0) return v.toFixed(2)
  return v.toFixed(4)
}
function fmtTok(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K'
  return Math.round(v).toLocaleString()
}

// counter-tick：关键数字变化时缓动归位（reduced-motion 直接落位）
const tickRevenue = ref(0)
const tickRequests = ref(0)
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function tweenTo(target: number, from: number, setter: (v: number) => void) {
  if (reduceMotion || from === target) { setter(target); return }
  const dur = 650, t0 = performance.now()
  function step(now: number) {
    const p = Math.min((now - t0) / dur, 1)
    setter(from + (target - from) * (1 - Math.pow(1 - p, 3)))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
watch(() => payDash.value?.today_amount ?? 0, (n) => tweenTo(n, tickRevenue.value, v => (tickRevenue.value = v)))
watch(() => stats.value?.today_requests ?? 0, (n) => tweenTo(n, tickRequests.value, v => (tickRequests.value = v)))
function fmtDur(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms` }
function goTo(path: string) { void router.push(path) }
function goToUsage(item: UserSpendingRankingItem) {
  void router.push({ path: '/admin/usage', query: { user_id: String(item.user_id), start_date: startDate.value, end_date: endDate.value } })
}

async function loadSnapshot(withStats: boolean) {
  const seq = ++chartSeq
  if (withStats && !stats.value) loading.value = true
  chartsLoading.value = true
  try {
    const res = await adminAPI.dashboard.getSnapshotV2({
      start_date: startDate.value, end_date: endDate.value, granularity: granularity.value,
      include_stats: withStats, include_trend: true, include_model_stats: true
    })
    if (seq !== chartSeq) return
    if (withStats && res.stats) stats.value = res.stats
    trendData.value = res.trend ?? []
    modelStats.value = res.models ?? []
  } catch (e) {
    if (seq !== chartSeq) return
    appStore.showError(t('admin.dashboardQuench.loadFailed'))
  } finally {
    if (seq === chartSeq) { loading.value = false; chartsLoading.value = false }
  }
}

async function loadRanking() {
  const seq = ++rankingSeq
  rankingLoading.value = true; rankingError.value = false
  try {
    const res = await adminAPI.dashboard.getUserSpendingRanking({ start_date: startDate.value, end_date: endDate.value, limit: 12 })
    if (seq !== rankingSeq) return
    rankingItems.value = res.ranking ?? []
    rankingTotalActualCost.value = res.total_actual_cost ?? 0
    rankingTotalRequests.value = res.total_requests ?? 0
    rankingTotalTokens.value = res.total_tokens ?? 0
  } catch { if (seq !== rankingSeq) return; rankingError.value = true }
  finally { if (seq === rankingSeq) rankingLoading.value = false }
}

async function loadPayDash() {
  try { const res = await adminPaymentAPI.getDashboard(1); payDash.value = res.data } catch { /* 支付未启用时静默降级 */ }
}

async function loadAlerts() {
  alertsLoading.value = true
  try {
    const [firing, resolved] = await Promise.all([
      opsAPI.listAlertEvents({ limit: 20, status: 'firing' }),
      opsAPI.listAlertEvents({ limit: 5, status: 'resolved' })
    ])
    alertEvents.value = [...firing, ...resolved]
  } catch { alertEvents.value = [] }
  finally { alertsLoading.value = false }
}

function onRangeChange(r: { startDate: string; endDate: string; preset: string | null }) {
  const diff = Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000)
  granularity.value = diff <= 1 ? 'hour' : 'day'
  loadCharts()
}
async function loadCharts() { await Promise.all([loadSnapshot(false), loadRanking()]) }
async function reload() {
  await Promise.all([loadSnapshot(true), loadRanking(), loadPayDash(), loadAlerts()])
  stampUpdated(performance.timeOrigin + performance.now())
}

let heartbeat: ReturnType<typeof setInterval>
onMounted(() => { void reload(); heartbeat = setInterval(() => { void reload() }, 5000) })
onUnmounted(() => clearInterval(heartbeat))
</script>

<style scoped>
.dq-root { display: flex; flex-direction: column; gap: 14px; }

.rise { opacity: 0; transform: translateY(10px); animation: rise .5s cubic-bezier(.22,.68,0,1.2) forwards; }
@keyframes rise { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } .dq-live-dot { animation: none; box-shadow: none; } .dq-btn-ico.dq-spinning { animation: none; } }

.dq-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.dq-title { font-size: 21px; font-weight: 700; letter-spacing: .01em; color: hsl(var(--foreground)); margin: 0; }
.dq-desc { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 4px 0 0; display: flex; align-items: center; gap: 7px; }
.dq-desc-sep { opacity: .5; }
.dq-live { display: inline-flex; align-items: center; gap: 6px; color: hsl(var(--primary)); font-weight: 600; font-family: monospace; letter-spacing: .04em; }
.dq-btn-ico { display: inline-block; font-size: 13px; line-height: 1; }
.dq-btn-ico.dq-spinning { animation: dq-spin 1s linear infinite; }
@keyframes dq-spin { to { transform: rotate(360deg); } }

/* 卡片面 */
.dq-kpi {
  position: relative; overflow: hidden; padding: 15px 16px 13px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border)); border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 8px 22px rgba(0,0,0,.3);
}
.dq-kpi-label {
  font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  color: hsl(var(--muted-foreground)); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
}
.dq-kpi-value { font-family: monospace; font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; color: hsl(var(--foreground)); line-height: 1.05; letter-spacing: -.01em; }
.dq-kpi-sub { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 6px; }
.dq-muted { opacity: .85; }
.dq-ok    { color: #10b981; }
.dq-bad   { color: hsl(var(--destructive)); }
.dq-azure { color: hsl(var(--primary)); }
.dq-kpi-azure { border-color: color-mix(in srgb, hsl(var(--primary)) 28%, transparent); }

/* 英雄卡：今日营收 */
.dq-kpi-hero { background: hsl(var(--card)); border-color: color-mix(in srgb, hsl(var(--primary)) 18%, transparent); }
.dq-hero-value { font-size: 32px; }
.dq-kpi-foot { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 7px; }
.dq-margin { font-size: 11px; }
.dq-margin b { font-weight: 600; }

/* 紧凑流量 KPI */
.dq-kpi-sm { padding: 12px 14px; }
.dq-val-sm { font-size: 20px; }

.dq-live-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: hsl(var(--primary)); animation: pulse-b 1.8s infinite;
}
@keyframes pulse-b { 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb, hsl(var(--primary)) 55%, transparent);} 50%{ box-shadow:0 0 0 5px transparent;} }

.dq-kpi-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .dq-kpi-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .dq-kpi-row { grid-template-columns: 1fr; } }

.dq-traffic-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 540px) { .dq-traffic-kpis { grid-template-columns: 1fr; } }

.dq-charts-panel {
  padding: 14px; display: flex; flex-direction: column; gap: 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border)); border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 8px 22px rgba(0,0,0,.3);
}
.dq-chart-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dq-gran-sel { width: 90px; }
.dq-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 800px) { .dq-charts-grid { grid-template-columns: 1fr; } }

.dq-spin { display: flex; justify-content: center; padding: 48px 0; }
</style>
