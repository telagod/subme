<template>
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-semibold">{{ t('payment.admin.dailyRevenue') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="h-64">
        <div v-if="loading" class="flex h-full items-center justify-center">
          <svg class="h-7 w-7 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <Line v-else-if="chartData" :data="chartData" :options="chartOptions" />
        <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">{{ t('payment.admin.noData') }}</div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const { t } = useI18n()

// ── Chart color palette (semantic equivalents) ────────────────────────────
const CHART_COLORS = {
  azureLine:      '#5CA8FF',                       // primary blue
  azureFill:      'rgba(92,168,255,0.08)',          // primary blue dim fill
  okLine:         '#46C98C',                        // success green
  okFill:         'rgba(70,201,140,0.06)',          // success green dim fill
  gridLine:       'rgba(32,36,44,0.8)',             // subtle grid
  axisText:       '#5C6470',                        // muted axis text
  legendText:     '#97A0AF',                        // muted legend text
  tooltipBg:      '#171A20',                        // dark tooltip bg
  tooltipBorder:  '#2F3540',                        // tooltip border
} as const

const props = defineProps<{
  data: { date: string; amount: number; count: number }[]
  loading?: boolean
}>()

const chartData = computed(() => {
  if (!props.data || props.data.length === 0) return null
  return {
    labels: props.data.map(d => d.date),
    datasets: [
      {
        label: t('payment.admin.revenue'),
        data: props.data.map(d => d.amount),
        borderColor: CHART_COLORS.azureLine,
        backgroundColor: CHART_COLORS.azureFill,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: CHART_COLORS.azureLine,
        borderWidth: 1.8,
      },
      {
        label: t('payment.admin.orderCount'),
        data: props.data.map(d => d.count),
        borderColor: CHART_COLORS.okLine,
        backgroundColor: CHART_COLORS.okFill,
        fill: false,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: CHART_COLORS.okLine,
        borderWidth: 1.5,
        yAxisID: 'y1',
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    x: {
      grid: { color: CHART_COLORS.gridLine },
      ticks: { color: CHART_COLORS.axisText, font: { size: 11 } },
    },
    y: {
      type: 'linear' as const,
      display: true,
      position: 'left' as const,
      title: { display: true, text: t('payment.admin.revenue'), color: CHART_COLORS.axisText, font: { size: 11 } },
      grid: { color: CHART_COLORS.gridLine },
      ticks: { color: CHART_COLORS.axisText, font: { size: 11 } },
    },
    y1: {
      type: 'linear' as const,
      display: true,
      position: 'right' as const,
      title: { display: true, text: t('payment.admin.orderCount'), color: CHART_COLORS.axisText, font: { size: 11 } },
      grid: { drawOnChartArea: false },
      ticks: { color: CHART_COLORS.axisText, font: { size: 11 } },
    }
  },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: CHART_COLORS.legendText, font: { size: 12 }, boxWidth: 10, boxHeight: 3, useBorderRadius: true, borderRadius: 2 },
    },
    tooltip: {
      backgroundColor: CHART_COLORS.tooltipBg,
      borderColor: CHART_COLORS.tooltipBorder,
      borderWidth: 1,
      titleColor: '#E8EBF0',
      bodyColor: '#97A0AF',
      padding: 10,
    }
  }
}
</script>
