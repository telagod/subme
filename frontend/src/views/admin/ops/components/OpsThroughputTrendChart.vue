<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Chart as ChartJS, CategoryScale, Filler, Legend, LineElement, LinearScale, PointElement, Title, Tooltip } from 'chart.js'
import { Line } from 'vue-chartjs'
import type { ChartComponentRef } from 'vue-chartjs'
import type { OpsThroughputGroupBreakdownItem, OpsThroughputPlatformBreakdownItem, OpsThroughputTrendPoint } from '@/api/admin/ops'
import type { ChartState } from '../types'
import { formatHistoryLabel, sumNumbers } from '../utils/opsFormatters'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatNumber } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

ChartJS.register(Title, Tooltip, Legend, LineElement, LinearScale, PointElement, CategoryScale, Filler)

interface Props {
  points: OpsThroughputTrendPoint[]
  loading: boolean
  timeRange: string
  byPlatform?: OpsThroughputPlatformBreakdownItem[]
  topGroups?: OpsThroughputGroupBreakdownItem[]
  fullscreen?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()
const emit = defineEmits<{
  (e: 'selectPlatform', platform: string): void
  (e: 'selectGroup', groupId: number): void
  (e: 'openDetails'): void
}>()

const throughputChartRef = ref<ChartComponentRef | null>(null)
watch(
  () => props.timeRange,
  () => {
    setTimeout(() => {
      const chart: any = throughputChartRef.value?.chart
      if (chart && typeof chart.resetZoom === 'function') {
        chart.resetZoom()
      }
    }, 100)
  }
)

const colors = computed(() => ({
  blue: '#5CA8FF',              /* azure 主系 */
  blueAlpha: 'rgba(92,168,255,.12)',
  green: '#46C98C',             /* ok 次系 */
  greenAlpha: 'rgba(70,201,140,.12)',
  grid: '#20242C',              /* line-0 */
  text: '#5C6470'               /* ink-2 */
}))

const totalRequests = computed(() => sumNumbers(props.points.map((p) => p.request_count)))

const chartData = computed(() => {
  if (!props.points.length || totalRequests.value <= 0) return null
  return {
    labels: props.points.map((p) => formatHistoryLabel(p.bucket_start, props.timeRange)),
    datasets: [
      {
        label: 'QPS',
        data: props.points.map((p) => p.qps ?? 0),
        borderColor: colors.value.blue,
        backgroundColor: colors.value.blueAlpha,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 10
      },
      {
        label: t('admin.ops.tpsK'),
        data: props.points.map((p) => (p.tps ?? 0) / 1000),
        borderColor: colors.value.green,
        backgroundColor: colors.value.greenAlpha,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 10,
        yAxisID: 'y1'
      }
    ]
  }
})

const state = computed<ChartState>(() => {
  if (chartData.value) return 'ready'
  if (props.loading) return 'loading'
  return 'empty'
})

const options = computed(() => {
  const c = colors.value
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: { color: c.text, usePointStyle: true, boxWidth: 6, font: { size: 10 } }
      },
      tooltip: {
        backgroundColor: '#111111',
        titleColor: '#ededed',
        bodyColor: '#a3a3a3',
        borderColor: c.grid,
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          label: (context: any) => {
            let label = context.dataset.label || ''
            if (label) label += ': '
            if (context.raw !== null) label += context.parsed.y.toFixed(1)
            return label
          }
        }
      },
      // Optional: if chartjs-plugin-zoom is installed, these options will enable zoom/pan.
      zoom: {
        pan: { enabled: true, mode: 'x' as const, modifierKey: 'ctrl' as const },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' as const }
      }
    },
    scales: {
      x: {
        type: 'category' as const,
        grid: { display: false },
        ticks: {
          color: c.text,
          font: { size: 10 },
          maxTicksLimit: 8,
          autoSkip: true,
          autoSkipPadding: 10
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: { color: c.grid, borderDash: [4, 4] },
        ticks: { color: c.text, font: { size: 10 } }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { display: false },
        ticks: { color: c.green, font: { size: 10 } }
      }
    }
  }
})

function resetZoom() {
  const chart: any = throughputChartRef.value?.chart
  if (chart && typeof chart.resetZoom === 'function') chart.resetZoom()
}

function downloadChart() {
  const chart: any = throughputChartRef.value?.chart
  if (!chart || typeof chart.toBase64Image !== 'function') return
  const url = chart.toBase64Image('image/png', 1)
  const a = document.createElement('a')
  a.href = url
  a.download = `ops-throughput-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
  a.click()
}
</script>

<template>
  <div class="bg-card border border-border rounded-xl p-5 flex flex-col h-full">
    <div class="flex items-center justify-between mb-[14px] flex-shrink-0">
      <h3 class="flex items-center gap-2 text-[13px] font-bold text-foreground">
        <svg class="text-primary flex-shrink-0" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        {{ t('admin.ops.throughputTrend') }}
        <HelpTooltip v-if="!props.fullscreen" :content="t('admin.ops.tooltips.throughputTrend')" />
      </h3>
      <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span class="inline-flex items-center gap-1"><span class="w-[7px] h-[7px] rounded-full bg-[#5CA8FF] inline-block"></span>QPS</span>
        <span class="inline-flex items-center gap-1"><span class="w-[7px] h-[7px] rounded-full bg-[#46C98C] inline-block"></span>{{ t('admin.ops.tpsK') }}</span>
        <template v-if="!props.fullscreen">
          <Button variant="outline" size="sm" class="h-auto py-[3px] px-2 text-[11px]" :disabled="state !== 'ready'" :title="t('admin.ops.requestDetails.title')" @click="emit('openDetails')">
            {{ t('admin.ops.requestDetails.details') }}
          </Button>
          <Button variant="outline" size="sm" class="h-auto py-[3px] px-2 text-[11px]" :disabled="state !== 'ready'" :title="t('admin.ops.charts.resetZoomHint')" @click="resetZoom">
            {{ t('admin.ops.charts.resetZoom') }}
          </Button>
          <Button variant="outline" size="sm" class="h-auto py-[3px] px-2 text-[11px]" :disabled="state !== 'ready'" :title="t('admin.ops.charts.downloadChartHint')" @click="downloadChart">
            {{ t('admin.ops.charts.downloadChart') }}
          </Button>
        </template>
      </div>
    </div>

    <!-- Drilldown chips -->
    <div v-if="(props.topGroups?.length ?? 0) > 0" class="flex flex-wrap gap-1.5 mb-[10px]">
      <Badge
        v-for="g in props.topGroups"
        :key="g.group_id"
        variant="secondary"
        class="cursor-pointer rounded-full inline-flex items-center gap-1"
        @click="emit('selectGroup', g.group_id)"
      >
        <span class="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">{{ g.group_name || `#${g.group_id}` }}</span>
        <span class="text-muted-foreground">{{ formatNumber(g.request_count) }}</span>
      </Badge>
    </div>

    <div v-else-if="(props.byPlatform?.length ?? 0) > 0" class="flex flex-wrap gap-1.5 mb-[10px]">
      <Badge
        v-for="p in props.byPlatform"
        :key="p.platform"
        variant="secondary"
        class="cursor-pointer rounded-full inline-flex items-center gap-1"
        @click="emit('selectPlatform', p.platform)"
      >
        <span class="uppercase">{{ p.platform }}</span>
        <span class="text-muted-foreground">{{ formatNumber(p.request_count) }}</span>
      </Badge>
    </div>

    <div class="flex-1 min-h-0">
      <Line v-if="state === 'ready' && chartData" ref="throughputChartRef" :data="chartData" :options="options" />
      <div v-else class="flex h-full items-center justify-center">
        <div v-if="state === 'loading'" class="text-[13px] text-muted-foreground animate-pulse">{{ t('common.loading') }}</div>
        <EmptyState v-else :title="t('common.noData')" :description="t('admin.ops.charts.emptyRequest')" />
      </div>
    </div>
  </div>
</template>
