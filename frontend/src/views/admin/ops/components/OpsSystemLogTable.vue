<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { opsAPI, type OpsRuntimeLogConfig, type OpsSystemLog, type OpsSystemLogSinkHealth } from '@/api/admin/ops'
import Pagination from '@/components/common/Pagination.vue'
import { useAppStore } from '@/stores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const appStore = useAppStore()

const props = withDefaults(defineProps<{
  platformFilter?: string
  refreshToken?: number
}>(), {
  platformFilter: '',
  refreshToken: 0
})

const loading = ref(false)
const logs = ref<OpsSystemLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const health = ref<OpsSystemLogSinkHealth>({
  queue_depth: 0,
  queue_capacity: 0,
  dropped_count: 0,
  write_failed_count: 0,
  written_count: 0,
  avg_write_delay_ms: 0
})

const runtimeLoading = ref(false)
const runtimeSaving = ref(false)
const runtimeConfig = reactive<OpsRuntimeLogConfig>({
  level: 'info',
  enable_sampling: false,
  sampling_initial: 100,
  sampling_thereafter: 100,
  caller: true,
  stacktrace_level: 'error',
  retention_days: 30
})

const filters = reactive({
  time_range: '1h' as '5m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d',
  start_time: '',
  end_time: '',
  level: 'all',
  component: '',
  request_id: '',
  client_request_id: '',
  user_id: '',
  account_id: '',
  platform: '',
  model: '',
  q: ''
})

const runtimeLevelOptions = [
  { value: 'debug', label: 'debug' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' }
]

const stacktraceLevelOptions = [
  { value: 'none', label: 'none' },
  { value: 'error', label: 'error' },
  { value: 'fatal', label: 'fatal' }
]

const timeRangeOptions = [
  { value: '5m', label: '5m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' }
]

const filterLevelOptions = [
  { value: 'all', label: '全部' },
  { value: 'debug', label: 'debug' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' }
]

const levelBadgeClass = (level: string) => {
  const v = String(level || '').toLowerCase()
  if (v === 'error' || v === 'fatal') return 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-destructive/35 bg-destructive/10 text-destructive'
  if (v === 'warn' || v === 'warning') return 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-amber-500/35 bg-amber-500/10 text-amber-400'
  if (v === 'debug') return 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-border bg-muted text-muted-foreground'
  return 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-primary/35 bg-primary/10 text-primary'
}

const formatTime = (value: string) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

const getExtraString = (extra: Record<string, any> | undefined, key: string) => {
  if (!extra) return ''
  const v = extra[key]
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

const formatSystemLogDetail = (row: OpsSystemLog) => {
  const parts: string[] = []
  const msg = String(row.message || '').trim()
  if (msg) parts.push(msg)

  const extra = row.extra || {}
  const statusCode = getExtraString(extra, 'status_code')
  const latencyMs = getExtraString(extra, 'latency_ms')
  const method = getExtraString(extra, 'method')
  const path = getExtraString(extra, 'path')
  const clientIP = getExtraString(extra, 'client_ip')
  const protocol = getExtraString(extra, 'protocol')

  const accessParts: string[] = []
  if (statusCode) accessParts.push(`status=${statusCode}`)
  if (latencyMs) accessParts.push(`latency_ms=${latencyMs}`)
  if (method) accessParts.push(`method=${method}`)
  if (path) accessParts.push(`path=${path}`)
  if (clientIP) accessParts.push(`ip=${clientIP}`)
  if (protocol) accessParts.push(`proto=${protocol}`)
  if (accessParts.length > 0) parts.push(accessParts.join(' '))

  const corrParts: string[] = []
  if (row.request_id) corrParts.push(`req=${row.request_id}`)
  if (row.client_request_id) corrParts.push(`client_req=${row.client_request_id}`)
  if (row.user_id != null) corrParts.push(`user=${row.user_id}`)
  if (row.account_id != null) corrParts.push(`acc=${row.account_id}`)
  if (row.platform) corrParts.push(`platform=${row.platform}`)
  if (row.model) corrParts.push(`model=${row.model}`)
  if (corrParts.length > 0) parts.push(corrParts.join(' '))

  const errors = getExtraString(extra, 'errors')
  if (errors) parts.push(`errors=${errors}`)
  const err = getExtraString(extra, 'err') || getExtraString(extra, 'error')
  if (err) parts.push(`error=${err}`)

  // 用空格拼接，交给 CSS 自动换行，尽量"填满再换行"。
  return parts.join('  ')
}

const toRFC3339 = (value: string) => {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

const buildQuery = () => {
  const query: Record<string, any> = {
    page: page.value,
    page_size: pageSize.value,
    time_range: filters.time_range
  }

  if (filters.time_range === '30d') {
    query.time_range = '30d'
  }
  if (filters.start_time) query.start_time = toRFC3339(filters.start_time)
  if (filters.end_time) query.end_time = toRFC3339(filters.end_time)
  if (filters.level.trim() && filters.level !== 'all') query.level = filters.level.trim()
  if (filters.component.trim()) query.component = filters.component.trim()
  if (filters.request_id.trim()) query.request_id = filters.request_id.trim()
  if (filters.client_request_id.trim()) query.client_request_id = filters.client_request_id.trim()
  if (filters.user_id.trim()) {
    const v = Number.parseInt(filters.user_id.trim(), 10)
    if (Number.isFinite(v) && v > 0) query.user_id = v
  }
  if (filters.account_id.trim()) {
    const v = Number.parseInt(filters.account_id.trim(), 10)
    if (Number.isFinite(v) && v > 0) query.account_id = v
  }
  if (filters.platform.trim()) query.platform = filters.platform.trim()
  if (filters.model.trim()) query.model = filters.model.trim()
  if (filters.q.trim()) query.q = filters.q.trim()
  return query
}

const fetchLogs = async () => {
  loading.value = true
  try {
    const res = await opsAPI.listSystemLogs(buildQuery())
    logs.value = res.items || []
    total.value = res.total || 0
  } catch (err: any) {
    console.error('[OpsSystemLogTable] Failed to fetch logs', err)
    appStore.showError(err?.response?.data?.detail || '系统日志加载失败')
  } finally {
    loading.value = false
  }
}

const fetchHealth = async () => {
  try {
    health.value = await opsAPI.getSystemLogSinkHealth()
  } catch {
    // 忽略健康数据读取失败，不影响主流程。
  }
}

const loadRuntimeConfig = async () => {
  runtimeLoading.value = true
  try {
    const cfg = await opsAPI.getRuntimeLogConfig()
    runtimeConfig.level = cfg.level
    runtimeConfig.enable_sampling = cfg.enable_sampling
    runtimeConfig.sampling_initial = cfg.sampling_initial
    runtimeConfig.sampling_thereafter = cfg.sampling_thereafter
    runtimeConfig.caller = cfg.caller
    runtimeConfig.stacktrace_level = cfg.stacktrace_level
    runtimeConfig.retention_days = cfg.retention_days
  } catch (err: any) {
    console.error('[OpsSystemLogTable] Failed to load runtime log config', err)
  } finally {
    runtimeLoading.value = false
  }
}

const saveRuntimeConfig = async () => {
  runtimeSaving.value = true
  try {
    const saved = await opsAPI.updateRuntimeLogConfig({ ...runtimeConfig })
    runtimeConfig.level = saved.level
    runtimeConfig.enable_sampling = saved.enable_sampling
    runtimeConfig.sampling_initial = saved.sampling_initial
    runtimeConfig.sampling_thereafter = saved.sampling_thereafter
    runtimeConfig.caller = saved.caller
    runtimeConfig.stacktrace_level = saved.stacktrace_level
    runtimeConfig.retention_days = saved.retention_days
    appStore.showSuccess('日志运行时配置已生效')
  } catch (err: any) {
    console.error('[OpsSystemLogTable] Failed to save runtime log config', err)
    appStore.showError(err?.response?.data?.detail || '保存日志配置失败')
  } finally {
    runtimeSaving.value = false
  }
}

const resetRuntimeConfig = async () => {
  const ok = window.confirm('确认回滚为启动配置（env/yaml）并立即生效？')
  if (!ok) return

  runtimeSaving.value = true
  try {
    const saved = await opsAPI.resetRuntimeLogConfig()
    runtimeConfig.level = saved.level
    runtimeConfig.enable_sampling = saved.enable_sampling
    runtimeConfig.sampling_initial = saved.sampling_initial
    runtimeConfig.sampling_thereafter = saved.sampling_thereafter
    runtimeConfig.caller = saved.caller
    runtimeConfig.stacktrace_level = saved.stacktrace_level
    runtimeConfig.retention_days = saved.retention_days
    appStore.showSuccess('已回滚到启动日志配置')
    await fetchHealth()
  } catch (err: any) {
    console.error('[OpsSystemLogTable] Failed to reset runtime log config', err)
    appStore.showError(err?.response?.data?.detail || '回滚日志配置失败')
  } finally {
    runtimeSaving.value = false
  }
}

const cleanupCurrentFilter = async () => {
  const ok = window.confirm('确认按当前筛选条件清理系统日志？该操作不可撤销。')
  if (!ok) return
  try {
    const payload = {
      start_time: toRFC3339(filters.start_time),
      end_time: toRFC3339(filters.end_time),
      level: filters.level.trim() && filters.level !== 'all' ? filters.level.trim() : undefined,
      component: filters.component.trim() || undefined,
      request_id: filters.request_id.trim() || undefined,
      client_request_id: filters.client_request_id.trim() || undefined,
      user_id: filters.user_id.trim() ? Number.parseInt(filters.user_id.trim(), 10) : undefined,
      account_id: filters.account_id.trim() ? Number.parseInt(filters.account_id.trim(), 10) : undefined,
      platform: filters.platform.trim() || undefined,
      model: filters.model.trim() || undefined,
      q: filters.q.trim() || undefined
    }
    const res = await opsAPI.cleanupSystemLogs(payload)
    appStore.showSuccess(`清理完成，删除 ${res.deleted || 0} 条日志`)
    page.value = 1
    await Promise.all([fetchLogs(), fetchHealth()])
  } catch (err: any) {
    console.error('[OpsSystemLogTable] Failed to cleanup logs', err)
    appStore.showError(err?.response?.data?.detail || '清理系统日志失败')
  }
}

const resetFilters = () => {
  filters.time_range = '1h'
  filters.start_time = ''
  filters.end_time = ''
  filters.level = 'all'
  filters.component = ''
  filters.request_id = ''
  filters.client_request_id = ''
  filters.user_id = ''
  filters.account_id = ''
  filters.platform = props.platformFilter || ''
  filters.model = ''
  filters.q = ''
  page.value = 1
  fetchLogs()
}

watch(() => props.platformFilter, (v) => {
  if (v && !filters.platform) {
    filters.platform = v
    page.value = 1
    fetchLogs()
  }
})

watch(() => props.refreshToken, () => {
  fetchLogs()
  fetchHealth()
})

const onPageChange = (next: number) => {
  page.value = next
  fetchLogs()
}

const onPageSizeChange = (next: number) => {
  pageSize.value = next
  page.value = 1
  fetchLogs()
}

const applyFilters = () => {
  page.value = 1
  fetchLogs()
}

const hasData = computed(() => logs.value.length > 0)

onMounted(async () => {
  if (props.platformFilter) {
    filters.platform = props.platformFilter
  }
  await Promise.all([fetchLogs(), fetchHealth(), loadRuntimeConfig()])
})
</script>

<template>
  <Card>
    <CardContent class="p-6">
      <!-- 标题 + 健康指标 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 class="flex items-center gap-2 text-sm font-bold text-foreground">系统日志</h3>
          <p class="mt-0.5 text-[11.5px] text-muted-foreground">默认按最新时间倒序，支持筛选搜索与按条件清理。</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <Badge variant="outline" class="text-muted-foreground">队列 {{ health.queue_depth }}/{{ health.queue_capacity }}</Badge>
          <Badge variant="outline" class="text-muted-foreground">写入 {{ health.written_count }}</Badge>
          <Badge variant="outline" class="border-amber-500/35 bg-amber-500/10 text-amber-400">丢弃 {{ health.dropped_count }}</Badge>
          <Badge variant="outline" class="border-destructive/35 bg-destructive/10 text-destructive">失败 {{ health.write_failed_count }}</Badge>
        </div>
      </div>

      <!-- 运行时日志配置 -->
      <div class="mb-4 rounded-xl border bg-muted/30 p-3">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-[11.5px] font-semibold text-muted-foreground">运行时日志配置（实时生效）</div>
          <span v-if="runtimeLoading" class="text-[11px] text-muted-foreground">加载中...</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
          <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
            级别
            <Select v-model="runtimeConfig.level">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in runtimeLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
            堆栈阈值
            <Select v-model="runtimeConfig.stacktrace_level">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in stacktraceLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
            采样初始
            <Input v-model.number="runtimeConfig.sampling_initial" type="number" min="1" class="h-8 text-xs" />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
            采样后续
            <Input v-model.number="runtimeConfig.sampling_thereafter" type="number" min="1" class="h-8 text-xs" />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
            保留天数
            <Input v-model.number="runtimeConfig.retention_days" type="number" min="1" max="3650" class="h-8 text-xs" />
          </label>
        </div>
        <div class="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap gap-3.5">
            <label class="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Checkbox v-model="runtimeConfig.caller" />caller
            </label>
            <label class="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Checkbox v-model="runtimeConfig.enable_sampling" />sampling
            </label>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" class="h-7 border-primary/35 bg-primary/10 px-3 text-[11px] text-primary hover:bg-primary/20 hover:text-primary" :disabled="runtimeSaving" @click="saveRuntimeConfig">
              {{ runtimeSaving ? '保存中...' : '保存并生效' }}
            </Button>
            <Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-[11px]" :disabled="runtimeSaving" @click="resetRuntimeConfig">
              回滚默认值
            </Button>
          </div>
        </div>
        <p v-if="health.last_error" class="mt-1.5 text-[11px] text-destructive">最近写入错误：{{ health.last_error }}</p>
      </div>

      <!-- 筛选器 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:12px;">
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          时间范围
          <Select v-model="filters.time_range">
            <SelectTrigger class="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in timeRangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          开始时间（可选）
          <Input v-model="filters.start_time" type="datetime-local" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          结束时间（可选）
          <Input v-model="filters.end_time" type="datetime-local" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          级别
          <Select v-model="filters.level">
            <SelectTrigger class="h-8 text-xs">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in filterLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          组件
          <Input v-model="filters.component" type="text" placeholder="如 http.access" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          request_id
          <Input v-model="filters.request_id" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          client_request_id
          <Input v-model="filters.client_request_id" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          user_id
          <Input v-model="filters.user_id" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          account_id
          <Input v-model="filters.account_id" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          平台
          <Input v-model="filters.platform" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          模型
          <Input v-model="filters.model" type="text" class="h-8 text-xs" />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
          关键词
          <Input v-model="filters.q" type="text" placeholder="消息/request_id" class="h-8 text-xs" />
        </label>
      </div>

      <!-- 操作按钮行 -->
      <div class="mb-3 flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" class="h-7 border-primary/35 bg-primary/10 px-3 text-[11px] text-primary hover:bg-primary/20 hover:text-primary" @click="applyFilters">查询</Button>
        <Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-[11px]" @click="resetFilters">重置</Button>
        <Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-[11px] border-destructive/25 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive" @click="cleanupCurrentFilter">按当前筛选清理</Button>
        <Button type="button" variant="outline" size="sm" class="h-7 px-2.5 text-[11px]" @click="fetchHealth">刷新健康指标</Button>
      </div>

      <!-- 日志表格 -->
      <div class="overflow-hidden rounded-xl border bg-card">
        <div v-if="loading" class="py-7 text-center text-sm text-muted-foreground">加载中...</div>
        <div v-else-if="!hasData" class="py-7 text-center text-sm text-muted-foreground">暂无系统日志</div>
        <div v-else class="overflow-auto">
          <table style="min-width:100%;border-collapse:collapse;table-layout:fixed;">
            <thead class="border-b border-border bg-muted/50">
              <tr>
                <th style="width:180px;padding:7px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">时间</th>
                <th style="width:80px;padding:7px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">级别</th>
                <th style="padding:7px 12px;text-align:left;" class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">日志详细信息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in logs" :key="row.id" class="border-b border-border last:border-b-0" style="vertical-align:top;">
                <td style="padding:7px 12px;" class="text-[11.5px] text-muted-foreground">{{ formatTime(row.created_at) }}</td>
                <td style="padding:7px 12px;">
                  <Badge variant="outline" :class="levelBadgeClass(row.level)">{{ row.level }}</Badge>
                </td>
                <td style="padding:7px 12px;white-space:normal;word-break:break-all;" class="text-[11.5px] text-muted-foreground">{{ formatSystemLogDetail(row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination :total="total" :page="page" :page-size="pageSize" @update:page="onPageChange" @update:page-size="onPageSizeChange" />
      </div>
    </CardContent>
  </Card>
</template>
