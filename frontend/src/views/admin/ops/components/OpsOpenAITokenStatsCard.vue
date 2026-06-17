<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/common/EmptyState.vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { opsAPI, type OpsOpenAITokenStatsResponse, type OpsOpenAITokenStatsTimeRange } from '@/api/admin/ops'
import { formatNumber } from '@/utils/format'

interface Props {
  platformFilter?: string
  groupIdFilter?: number | null
  refreshToken: number
}

type ViewMode = 'topn' | 'pagination'

const props = withDefaults(defineProps<Props>(), {
  platformFilter: '',
  groupIdFilter: null
})

const { t } = useI18n()

const loading = ref(false)
const errorMessage = ref('')
const response = ref<OpsOpenAITokenStatsResponse | null>(null)

const timeRange = ref<OpsOpenAITokenStatsTimeRange>('30d')
const viewMode = ref<ViewMode>('topn')
const topN = ref<number>(20)
const page = ref<number>(1)
const pageSize = ref<number>(20)

const items = computed(() => response.value?.items ?? [])
const total = computed(() => response.value?.total ?? 0)
const totalPages = computed(() => {
  if (viewMode.value !== 'pagination') return 1
  const size = pageSize.value > 0 ? pageSize.value : 20
  return Math.max(1, Math.ceil(total.value / size))
})

const timeRangeOptions = computed(() => [
  { value: '30m', label: t('admin.ops.timeRange.30m') },
  { value: '1h', label: t('admin.ops.timeRange.1h') },
  { value: '1d', label: t('admin.ops.timeRange.1d') },
  { value: '15d', label: t('admin.ops.timeRange.15d') },
  { value: '30d', label: t('admin.ops.timeRange.30d') }
])

const viewModeOptions = computed(() => [
  { value: 'topn', label: t('admin.ops.openaiTokenStats.viewModeTopN') },
  { value: 'pagination', label: t('admin.ops.openaiTokenStats.viewModePagination') }
])

const topNOptions = computed(() => [
  { value: 10, label: 'Top 10' },
  { value: 20, label: 'Top 20' },
  { value: 50, label: 'Top 50' },
  { value: 100, label: 'Top 100' }
])

const pageSizeOptions = computed(() => [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
])

function formatRate(v?: number | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-'
  return v.toFixed(2)
}

function formatInt(v?: number | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-'
  return formatNumber(Math.round(v))
}

function buildParams() {
  const params: Record<string, any> = {
    time_range: timeRange.value,
    platform: props.platformFilter || undefined,
    group_id: typeof props.groupIdFilter === 'number' && props.groupIdFilter > 0 ? props.groupIdFilter : undefined
  }

  if (viewMode.value === 'topn') {
    params.top_n = topN.value
  } else {
    params.page = page.value
    params.page_size = pageSize.value
  }
  return params
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    response.value = await opsAPI.getOpenAITokenStats(buildParams())
    // 防御：若 total 变化导致当前页超出最大页，则回退到末页并重新拉取一次。
    if (viewMode.value === 'pagination' && page.value > totalPages.value) {
      page.value = totalPages.value
      response.value = await opsAPI.getOpenAITokenStats(buildParams())
    }
  } catch (err: any) {
    console.error('[OpsOpenAITokenStatsCard] Failed to load data', err)
    response.value = null
    errorMessage.value = err?.message || t('admin.ops.openaiTokenStats.failedToLoad')
  } finally {
    loading.value = false
  }
}

watch(
  () => ({
    timeRange: timeRange.value,
    viewMode: viewMode.value,
    topN: topN.value,
    page: page.value,
    pageSize: pageSize.value,
    platform: props.platformFilter,
    groupId: props.groupIdFilter,
    refreshToken: props.refreshToken
  }),
  (next, prev) => {
    // 避免"筛选变化 -> 重置页码 -> 触发两次请求"：
    // 先只重置页码，等待下一次 watch（仅 page 变化）再发起请求。
    const filtersChanged = !prev ||
      next.timeRange !== prev.timeRange ||
      next.viewMode !== prev.viewMode ||
      next.pageSize !== prev.pageSize ||
      next.platform !== prev.platform ||
      next.groupId !== prev.groupId

    if (next.viewMode === 'pagination' && filtersChanged && next.page !== 1) {
      page.value = 1
      return
    }

    void loadData()
  },
  { immediate: true }
)

function onPrevPage() {
  if (viewMode.value !== 'pagination') return
  if (page.value > 1) page.value -= 1
}

function onNextPage() {
  if (viewMode.value !== 'pagination') return
  if (page.value < totalPages.value) page.value += 1
}
</script>

<template>
  <Card class="p-4">
    <div class="mb-[14px] flex flex-wrap items-center justify-between gap-[10px]">
      <h3 class="flex items-center gap-2 text-sm font-bold text-foreground">{{ t('admin.ops.openaiTokenStats.title') }}</h3>
      <div class="flex flex-wrap items-center gap-[6px]">
        <Select v-model="timeRange" style="width:136px;">
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in timeRangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="viewMode" style="width:136px;">
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in viewModeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-if="viewMode === 'topn'" :model-value="String(topN)" @update:model-value="(v) => topN = Number(v)" style="width:100px;">
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in topNOptions" :key="opt.value" :value="String(opt.value)">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <template v-else>
          <Select :model-value="String(pageSize)" @update:model-value="(v) => pageSize = Number(v)" style="width:80px;">
            <SelectTrigger class="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in pageSizeOptions" :key="opt.value" :value="String(opt.value)">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" class="px-[10px] text-[11px]" :disabled="loading || page <= 1" @click="onPrevPage">{{ t('admin.ops.openaiTokenStats.prevPage') }}</Button>
          <Button variant="outline" size="sm" class="px-[10px] text-[11px]" :disabled="loading || page >= totalPages" @click="onNextPage">{{ t('admin.ops.openaiTokenStats.nextPage') }}</Button>
          <span class="text-xs text-muted-foreground">{{ t('admin.ops.openaiTokenStats.pageInfo', { page, total: totalPages }) }}</span>
        </template>
      </div>
    </div>

    <div v-if="errorMessage" class="mb-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
      {{ errorMessage }}
    </div>

    <div v-if="loading" class="py-7 text-center text-[13px] text-muted-foreground">
      {{ t('admin.ops.loadingText') }}
    </div>

    <EmptyState v-else-if="items.length === 0" :title="t('common.noData')" :description="t('admin.ops.openaiTokenStats.empty')" />

    <div v-else>
      <div class="overflow-hidden rounded-xl border border-border bg-card">
        <div style="max-height:420px;overflow:auto;">
          <table style="min-width:100%;text-align:left;font-size:12px;border-collapse:collapse;">
            <thead class="sticky top-0 z-10 border-b border-border bg-muted">
              <tr>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.model') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.requestCount') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.avgTokensPerSec') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.avgFirstTokenMs') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.totalOutputTokens') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.avgDurationMs') }}</th>
                <th class="px-[10px] py-[7px] font-semibold text-muted-foreground">{{ t('admin.ops.openaiTokenStats.table.requestsWithFirstToken') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.model" class="border-b border-border last:border-b-0">
                <td class="px-[10px] py-[7px] font-medium text-foreground">{{ row.model }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatInt(row.request_count) }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatRate(row.avg_tokens_per_sec) }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatRate(row.avg_first_token_ms) }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatInt(row.total_output_tokens) }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatInt(row.avg_duration_ms) }}</td>
                <td class="px-[10px] py-[7px] text-muted-foreground">{{ formatInt(row.requests_with_first_token) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="viewMode === 'topn'" class="mt-[10px] text-[11px] text-muted-foreground">
        {{ t('admin.ops.openaiTokenStats.totalModels', { total }) }}
      </div>
    </div>
  </Card>
</template>
