<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { opsAPI, type AlertEventsQuery } from '@/api/admin/ops'
import type { AlertEvent } from '../types'
import { formatDateTime } from '../utils/opsFormatters'

const { t } = useI18n()
const appStore = useAppStore()

const PAGE_SIZE = 10

const loading = ref(false)
const loadingMore = ref(false)
const events = ref<AlertEvent[]>([])
const hasMore = ref(true)

// Detail modal
const showDetail = ref(false)
const selected = ref<AlertEvent | null>(null)
const detailLoading = ref(false)
const detailActionLoading = ref(false)
const historyLoading = ref(false)
const history = ref<AlertEvent[]>([])
const historyRange = ref('7d')
const historyRangeOptions = computed(() => [
  { value: '7d', label: t('admin.ops.timeRange.7d') },
  { value: '30d', label: t('admin.ops.timeRange.30d') }
])

const silenceDuration = ref('1h')
const silenceDurationOptions = computed(() => [
  { value: '1h', label: t('admin.ops.timeRange.1h') },
  { value: '24h', label: t('admin.ops.timeRange.24h') },
  { value: '7d', label: t('admin.ops.timeRange.7d') }
])

// Filters
const timeRange = ref('24h')
const timeRangeOptions = computed(() => [
  { value: '5m', label: t('admin.ops.timeRange.5m') },
  { value: '30m', label: t('admin.ops.timeRange.30m') },
  { value: '1h', label: t('admin.ops.timeRange.1h') },
  { value: '6h', label: t('admin.ops.timeRange.6h') },
  { value: '24h', label: t('admin.ops.timeRange.24h') },
  { value: '7d', label: t('admin.ops.timeRange.7d') },
  { value: '30d', label: t('admin.ops.timeRange.30d') }
])

const severity = ref<string>('all')
const severityOptions = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' }
])

const status = ref<string>('all')
const statusOptions = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'firing', label: t('admin.ops.alertEvents.status.firing') },
  { value: 'resolved', label: t('admin.ops.alertEvents.status.resolved') },
  { value: 'manual_resolved', label: t('admin.ops.alertEvents.status.manualResolved') }
])

const emailSent = ref<string>('all')
const emailSentOptions = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'true', label: t('admin.ops.alertEvents.table.emailSent') },
  { value: 'false', label: t('admin.ops.alertEvents.table.emailIgnored') }
])

function buildQuery(overrides: Partial<AlertEventsQuery> = {}): AlertEventsQuery {
  const q: AlertEventsQuery = {
    limit: PAGE_SIZE,
    time_range: timeRange.value
  }
  if (severity.value && severity.value !== 'all') q.severity = severity.value
  if (status.value && status.value !== 'all') q.status = status.value
  if (emailSent.value === 'true') q.email_sent = true
  if (emailSent.value === 'false') q.email_sent = false
  return { ...q, ...overrides }
}

async function loadFirstPage() {
  loading.value = true
  try {
    const data = await opsAPI.listAlertEvents(buildQuery())
    events.value = data
    hasMore.value = data.length === PAGE_SIZE
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to load alert events', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.alertEvents.loadFailed'))
    events.value = []
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || loading.value) return
  if (!hasMore.value) return
  const last = events.value[events.value.length - 1]
  if (!last) return

  loadingMore.value = true
  try {
    const data = await opsAPI.listAlertEvents(
      buildQuery({ before_fired_at: last.fired_at || last.created_at, before_id: last.id })
    )
    if (!data.length) {
      hasMore.value = false
      return
    }
    events.value = [...events.value, ...data]
    if (data.length < PAGE_SIZE) hasMore.value = false
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to load more alert events', err)
    hasMore.value = false
  } finally {
    loadingMore.value = false
  }
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement | null
  if (!el) return
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
  if (nearBottom) loadMore()
}

function getDimensionString(event: AlertEvent | null | undefined, key: string): string {
  const v = event?.dimensions?.[key]
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function formatDurationMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms))
  const sec = Math.floor(safe / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}

function formatDurationLabel(event: AlertEvent): string {
  const firedAt = new Date(event.fired_at || event.created_at)
  if (Number.isNaN(firedAt.getTime())) return '-'
  const resolvedAtStr = event.resolved_at || null
  const status = String(event.status || '').trim().toLowerCase()

  if (resolvedAtStr) {
    const resolvedAt = new Date(resolvedAtStr)
    if (!Number.isNaN(resolvedAt.getTime())) {
      const ms = resolvedAt.getTime() - firedAt.getTime()
      const prefix = status === 'manual_resolved'
        ? t('admin.ops.alertEvents.status.manualResolved')
        : t('admin.ops.alertEvents.status.resolved')
      return `${prefix} ${formatDurationMs(ms)}`
    }
  }

  const now = Date.now()
  const ms = now - firedAt.getTime()
  return `${t('admin.ops.alertEvents.status.firing')} ${formatDurationMs(ms)}`
}

function formatDimensionsSummary(event: AlertEvent): string {
  const parts: string[] = []
  const platform = getDimensionString(event, 'platform')
  if (platform) parts.push(`platform=${platform}`)
  const groupId = event.dimensions?.group_id
  if (groupId != null && groupId !== '') parts.push(`group_id=${String(groupId)}`)
  const region = getDimensionString(event, 'region')
  if (region) parts.push(`region=${region}`)
  return parts.length ? parts.join(' ') : '-'
}

function closeDetail() {
  showDetail.value = false
  selected.value = null
  history.value = []
}

async function openDetail(row: AlertEvent) {
  showDetail.value = true
  selected.value = row
  detailLoading.value = true
  historyLoading.value = true

  try {
    const detail = await opsAPI.getAlertEvent(row.id)
    selected.value = detail
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to load alert detail', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.alertEvents.detail.loadFailed'))
  } finally {
    detailLoading.value = false
  }

  await loadHistory()
}

async function loadHistory() {
  const ev = selected.value
  if (!ev) {
    history.value = []
    historyLoading.value = false
    return
  }

  historyLoading.value = true
  try {
    const platform = getDimensionString(ev, 'platform')
    const groupIdRaw = ev.dimensions?.group_id
    const groupId = typeof groupIdRaw === 'number' ? groupIdRaw : undefined

    const items = await opsAPI.listAlertEvents({
      limit: 20,
      time_range: historyRange.value,
      platform: platform || undefined,
      group_id: groupId,
      status: ''
    })

    // Best-effort: narrow to same rule_id + dimensions
    history.value = items.filter((it) => {
      if (it.rule_id !== ev.rule_id) return false
      const p1 = getDimensionString(it, 'platform')
      const p2 = getDimensionString(ev, 'platform')
      if ((p1 || '') !== (p2 || '')) return false
      const g1 = it.dimensions?.group_id
      const g2 = ev.dimensions?.group_id
      return (g1 ?? null) === (g2 ?? null)
    })
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to load alert history', err)
    history.value = []
  } finally {
    historyLoading.value = false
  }
}

function durationToUntilRFC3339(duration: string): string {
  const now = Date.now()
  if (duration === '1h') return new Date(now + 60 * 60 * 1000).toISOString()
  if (duration === '24h') return new Date(now + 24 * 60 * 60 * 1000).toISOString()
  if (duration === '7d') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  return new Date(now + 60 * 60 * 1000).toISOString()
}

async function silenceAlert() {
  const ev = selected.value
  if (!ev) return
  if (detailActionLoading.value) return
  detailActionLoading.value = true
  try {
    const platform = getDimensionString(ev, 'platform')
    const groupIdRaw = ev.dimensions?.group_id
    const groupId = typeof groupIdRaw === 'number' ? groupIdRaw : null
    const region = getDimensionString(ev, 'region') || null

    await opsAPI.createAlertSilence({
      rule_id: ev.rule_id,
      platform: platform || '',
      group_id: groupId ?? undefined,
      region: region ?? undefined,
      until: durationToUntilRFC3339(silenceDuration.value),
      reason: `silence from UI (${silenceDuration.value})`
    })

    appStore.showSuccess(t('admin.ops.alertEvents.detail.silenceSuccess'))
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to silence alert', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.alertEvents.detail.silenceFailed'))
  } finally {
    detailActionLoading.value = false
  }
}

async function manualResolve() {
  if (!selected.value) return
  if (detailActionLoading.value) return
  detailActionLoading.value = true
  try {
    await opsAPI.updateAlertEventStatus(selected.value.id, 'manual_resolved')
    appStore.showSuccess(t('admin.ops.alertEvents.detail.manualResolvedSuccess'))

    // Refresh detail + first page to reflect new status
    const detail = await opsAPI.getAlertEvent(selected.value.id)
    selected.value = detail
    await loadFirstPage()
    await loadHistory()
  } catch (err: any) {
    console.error('[OpsAlertEventsCard] Failed to resolve alert', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.alertEvents.detail.manualResolvedFailed'))
  } finally {
    detailActionLoading.value = false
  }
}

onMounted(() => {
  loadFirstPage()
})

watch([timeRange, severity, status, emailSent], () => {
  events.value = []
  hasMore.value = true
  loadFirstPage()
})

watch(historyRange, () => {
  if (showDetail.value) loadHistory()
})

function formatStatusLabel(status: string | undefined): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return '-'
  if (s === 'firing') return t('admin.ops.alertEvents.status.firing')
  if (s === 'resolved') return t('admin.ops.alertEvents.status.resolved')
  if (s === 'manual_resolved') return t('admin.ops.alertEvents.status.manualResolved')
  return s.toUpperCase()
}

const empty = computed(() => events.value.length === 0 && !loading.value)
</script>

<template>
  <div class="bg-card border border-border rounded-xl p-6">
    <!-- Header toolbar -->
    <div class="flex flex-wrap items-start justify-between gap-3.5 mb-3.5">
      <div>
        <h3 class="flex items-center gap-2 text-sm font-bold text-foreground">{{ t('admin.ops.alertEvents.title') }}</h3>
        <p class="mt-1 text-[11.5px] text-muted-foreground">{{ t('admin.ops.alertEvents.description') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <Select v-model="timeRange">
          <SelectTrigger class="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in timeRangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="severity">
          <SelectTrigger class="w-[88px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in severityOptions" :key="String(opt.value)" :value="String(opt.value)">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="status">
          <SelectTrigger class="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in statusOptions" :key="String(opt.value)" :value="String(opt.value)">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="emailSent">
          <SelectTrigger class="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in emailSentOptions" :key="String(opt.value)" :value="String(opt.value)">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" class="flex items-center gap-1.5" :disabled="loading" @click="loadFirstPage">
          <svg width="13" height="13" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          {{ t('common.refresh') }}
        </Button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center gap-2 text-[13px] text-muted-foreground" role="status" :aria-label="t('admin.ops.alertEvents.loading')">
      <svg width="14" height="14" class="animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      {{ t('admin.ops.alertEvents.loading') }}
    </div>

    <!-- Empty state -->
    <div v-else-if="empty" class="rounded-lg border border-dashed border-border p-7 text-center text-[13px] text-muted-foreground">
      {{ t('admin.ops.alertEvents.empty') }}
    </div>

    <!-- Table -->
    <div v-else class="bg-card border border-border rounded-xl overflow-hidden">
      <div style="max-height:600px;overflow-y:auto;" @scroll="onScroll">
        <table style="min-width:100%;border-collapse:collapse;font-size:12px;">
          <thead class="bg-muted border-b border-border" style="position:sticky;top:0;z-index:10;">
            <tr>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.time') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.severity') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.platform') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.ruleId') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.title') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.duration') }}</th>
              <th style="padding:9px 14px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.dimensions') }}</th>
              <th style="padding:9px 14px;text-align:right;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.email') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in events"
              :key="row.id"
              class="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
              style="cursor:pointer;"
              :title="row.title || ''"
              @click="openDetail(row)"
            >
              <td style="padding:9px 14px;white-space:nowrap;" class="text-muted-foreground">{{ formatDateTime(row.fired_at || row.created_at) }}</td>
              <td style="padding:9px 14px;white-space:nowrap;">
                <div style="display:flex;align-items:center;gap:5px;">
                  <Badge :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                    ['p0','critical'].includes(String(row.severity||'').toLowerCase()) ? 'bg-destructive/15 border-destructive/40 text-destructive' :
                    ['p1','warning'].includes(String(row.severity||'').toLowerCase()) ? 'bg-amber-500/15 border-amber-500/40 text-amber-500' :
                    ['p2','info'].includes(String(row.severity||'').toLowerCase()) ? 'bg-blue-500/15 border-blue-500/40 text-blue-500' :
                    'bg-muted border-border text-muted-foreground'
                  ]" variant="outline">{{ row.severity || '-' }}</Badge>
                  <Badge :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                    String(row.status||'').toLowerCase() === 'firing' ? 'bg-destructive/15 border-destructive/40 text-destructive' :
                    String(row.status||'').toLowerCase() === 'resolved' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500' :
                    'bg-muted border-border text-muted-foreground'
                  ]" variant="outline">{{ formatStatusLabel(row.status) }}</Badge>
                </div>
              </td>
              <td style="padding:9px 14px;white-space:nowrap;" class="text-muted-foreground">{{ getDimensionString(row, 'platform') || '-' }}</td>
              <td style="padding:9px 14px;white-space:nowrap;" class="text-muted-foreground"><span class="font-mono">#{{ row.rule_id }}</span></td>
              <td style="padding:9px 14px;min-width:260px;">
                <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px;" class="text-foreground">{{ row.title || '-' }}</div>
                <div v-if="row.description" style="margin-top:2px;font-size:11px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" class="text-muted-foreground">{{ row.description }}</div>
              </td>
              <td style="padding:9px 14px;white-space:nowrap;" class="text-muted-foreground">{{ formatDurationLabel(row) }}</td>
              <td style="padding:9px 14px;white-space:nowrap;font-size:11px;" class="text-muted-foreground">{{ formatDimensionsSummary(row) }}</td>
              <td style="padding:9px 14px;white-space:nowrap;text-align:right;">
                <span style="display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;" :title="row.email_sent ? t('admin.ops.alertEvents.table.emailSent') : t('admin.ops.alertEvents.table.emailIgnored')">
                  <Icon v-if="row.email_sent" name="checkCircle" size="sm" class="text-emerald-500" />
                  <Icon v-else name="ban" size="sm" class="text-muted-foreground" />
                  <span style="font-size:11px;font-weight:600;" class="text-muted-foreground">{{ row.email_sent ? t('admin.ops.alertEvents.table.emailSent') : t('admin.ops.alertEvents.table.emailIgnored') }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loadingMore" class="flex items-center justify-center gap-2 p-2.5 text-[11.5px] text-muted-foreground" role="status" :aria-label="t('admin.ops.alertEvents.loading')">
          <svg width="13" height="13" class="animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          {{ t('admin.ops.alertEvents.loading') }}
        </div>
        <div v-else-if="!hasMore && events.length > 0" class="p-2.5 text-center text-[11px] text-muted-foreground">-</div>
      </div>
    </div>

    <!-- Detail Dialog -->
    <BaseDialog :show="showDetail" :title="t('admin.ops.alertEvents.detail.title')" width="wide" :close-on-click-outside="true" @close="closeDetail">
      <div v-if="detailLoading" class="flex items-center justify-center py-9 text-[13px] text-muted-foreground">
        {{ t('admin.ops.alertEvents.detail.loading') }}
      </div>
      <div v-else-if="!selected" class="py-9 text-center text-[13px] text-muted-foreground">
        {{ t('admin.ops.alertEvents.detail.empty') }}
      </div>
      <div v-else class="flex flex-col gap-4">
        <!-- Summary card -->
        <div class="bg-muted/50 border border-border rounded-xl p-3.5">
          <div class="flex flex-wrap gap-2.5 justify-between items-start">
            <div>
              <div class="flex flex-wrap gap-1.5 items-center">
                <Badge :class="[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                  ['p0','critical'].includes(String(selected.severity||'').toLowerCase()) ? 'bg-destructive/15 border-destructive/40 text-destructive' :
                  ['p1','warning'].includes(String(selected.severity||'').toLowerCase()) ? 'bg-amber-500/15 border-amber-500/40 text-amber-500' :
                  ['p2','info'].includes(String(selected.severity||'').toLowerCase()) ? 'bg-blue-500/15 border-blue-500/40 text-blue-500' :
                  'bg-muted border-border text-muted-foreground'
                ]" variant="outline">{{ selected.severity || '-' }}</Badge>
                <Badge :class="[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                  String(selected.status||'').toLowerCase() === 'firing' ? 'bg-destructive/15 border-destructive/40 text-destructive' :
                  String(selected.status||'').toLowerCase() === 'resolved' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500' :
                  'bg-muted border-border text-muted-foreground'
                ]" variant="outline">{{ formatStatusLabel(selected.status) }}</Badge>
              </div>
              <div class="mt-2 text-[13px] font-semibold text-foreground">{{ selected.title || '-' }}</div>
              <div v-if="selected.description" class="mt-1 text-[11.5px] whitespace-pre-wrap text-muted-foreground">{{ selected.description }}</div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <div class="bg-card border border-border rounded-lg flex items-center gap-1.5 px-2.5 py-1.5">
                <span class="text-[11px] font-semibold text-muted-foreground">{{ t('admin.ops.alertEvents.detail.silence') }}</span>
                <Select v-model="silenceDuration">
                  <SelectTrigger class="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in silenceDurationOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px]" :disabled="detailActionLoading" @click="silenceAlert">
                  <Icon name="ban" size="sm" />{{ t('common.apply') }}
                </Button>
              </div>
              <Button type="button" variant="outline" size="sm" class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px]" :disabled="detailActionLoading" @click="manualResolve">
                <Icon name="checkCircle" size="sm" />{{ t('admin.ops.alertEvents.detail.manualResolve') }}
              </Button>
            </div>
          </div>
        </div>

        <!-- Meta grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="bg-card border border-border rounded-xl p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.detail.firedAt') }}</div>
            <div class="mt-1 text-[13px] font-medium text-foreground">{{ formatDateTime(selected.fired_at || selected.created_at) }}</div>
          </div>
          <div class="bg-card border border-border rounded-xl p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.detail.resolvedAt') }}</div>
            <div class="mt-1 text-[13px] font-medium text-foreground">{{ selected.resolved_at ? formatDateTime(selected.resolved_at) : '-' }}</div>
          </div>
          <div class="bg-card border border-border rounded-xl p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.detail.ruleId') }}</div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[13px] font-bold text-foreground">#{{ selected.rule_id }}</span>
              <a class="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground no-underline transition-colors hover:text-foreground" :href="`/admin/ops?open_alert_rules=1&alert_rule_id=${selected.rule_id}`"><Icon name="externalLink" size="xs"/>{{ t('admin.ops.alertEvents.detail.viewRule') }}</a>
              <a class="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground no-underline transition-colors hover:text-foreground" :href="`/admin/ops?platform=${encodeURIComponent(getDimensionString(selected,'platform')||'')}&group_id=${selected.dimensions?.group_id || ''}&error_type=request&open_error_details=1`"><Icon name="externalLink" size="xs"/>{{ t('admin.ops.alertEvents.detail.viewLogs') }}</a>
            </div>
          </div>
          <div class="bg-card border border-border rounded-xl p-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.detail.dimensions') }}</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              <div v-if="getDimensionString(selected, 'platform')">platform={{ getDimensionString(selected, 'platform') }}</div>
              <div v-if="selected.dimensions?.group_id">group_id={{ selected.dimensions.group_id }}</div>
              <div v-if="getDimensionString(selected, 'region')">region={{ getDimensionString(selected, 'region') }}</div>
            </div>
          </div>
        </div>

        <!-- History card -->
        <div class="bg-card border border-border rounded-xl p-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2.5 mb-3">
            <div>
              <div class="text-[13px] font-bold text-foreground">{{ t('admin.ops.alertEvents.detail.historyTitle') }}</div>
              <div class="mt-0.5 text-[11px] text-muted-foreground">{{ t('admin.ops.alertEvents.detail.historyHint') }}</div>
            </div>
            <Select v-model="historyRange">
              <SelectTrigger class="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in historyRangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="historyLoading" class="py-5 text-center text-[11.5px] text-muted-foreground">{{ t('admin.ops.alertEvents.detail.historyLoading') }}</div>
          <div v-else-if="history.length === 0" class="py-5 text-center text-[11.5px] text-muted-foreground">{{ t('admin.ops.alertEvents.detail.historyEmpty') }}</div>
          <div v-else class="bg-card border border-border rounded-xl overflow-hidden">
            <table style="min-width:100%;border-collapse:collapse;font-size:11.5px;">
              <thead class="bg-muted border-b border-border">
                <tr>
                  <th style="padding:6px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.time') }}</th>
                  <th style="padding:6px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.status') }}</th>
                  <th style="padding:6px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ t('admin.ops.alertEvents.table.metric') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in history" :key="it.id" class="border-b border-border last:border-0">
                  <td style="padding:6px 12px;" class="text-muted-foreground">{{ formatDateTime(it.fired_at || it.created_at) }}</td>
                  <td style="padding:6px 12px;"><Badge :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                    String(it.status||'').toLowerCase() === 'firing' ? 'bg-destructive/15 border-destructive/40 text-destructive' :
                    String(it.status||'').toLowerCase() === 'resolved' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500' :
                    'bg-muted border-border text-muted-foreground'
                  ]" variant="outline">{{ formatStatusLabel(it.status) }}</Badge></td>
                  <td style="padding:6px 12px;" class="text-muted-foreground">
                    <span v-if="typeof it.metric_value === 'number' && typeof it.threshold_value === 'number'">{{ it.metric_value.toFixed(2) }} / {{ it.threshold_value.toFixed(2) }}</span>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>
