<template>
  <div class="space-y-6">
    <!-- Date Range Filter -->
    <Card>
      <CardContent class="p-4">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.timeRange') }}:</span>
            <DateRangePicker :start-date="startDate" :end-date="endDate" @update:startDate="$emit('update:startDate', $event)" @update:endDate="$emit('update:endDate', $event)" @change="$emit('dateRangeChange', $event)" />
          </div>
          <Button variant="outline" size="sm" @click="$emit('refresh')" :disabled="loading">
            {{ t('common.refresh') }}
          </Button>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.granularity') }}:</span>
            <div class="w-28">
              <Select :model-value="granularity" @update:model-value="$emit('update:granularity', $event); $emit('granularityChange')">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{{ t('dashboard.day') }}</SelectItem>
                  <SelectItem value="hour">{{ t('dashboard.hour') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Model Distribution Chart -->
      <Card class="relative overflow-hidden">
        <CardContent class="p-4">
          <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
            <LoadingSpinner size="md" />
          </div>
          <h3 class="mb-4 text-sm font-semibold text-foreground">{{ t('dashboard.modelDistribution') }}</h3>
          <div class="flex items-center gap-6">
            <div class="h-48 w-48">
              <Doughnut v-if="modelData" :data="modelData" :options="doughnutOptions" />
              <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">{{ t('dashboard.noDataAvailable') }}</div>
            </div>
            <div class="max-h-48 flex-1 overflow-y-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-muted-foreground">
                    <th class="pb-2 text-left">{{ t('dashboard.model') }}</th>
                    <th class="pb-2 text-right">{{ t('dashboard.requests') }}</th>
                    <th class="pb-2 text-right">{{ t('dashboard.tokens') }}</th>
                    <th class="pb-2 text-right">{{ t('dashboard.actual') }}</th>
                    <th class="pb-2 text-right">{{ t('dashboard.standard') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="model in models" :key="model.model" class="border-t border-border">
                    <td class="max-w-[100px] truncate py-1.5 font-medium text-foreground" :title="model.model">{{ model.model }}</td>
                    <td class="py-1.5 text-right text-muted-foreground">{{ formatNumber(model.requests) }}</td>
                    <td class="py-1.5 text-right text-muted-foreground">{{ formatTokens(model.total_tokens) }}</td>
                    <td class="py-1.5 text-right text-emerald-500">${{ formatCost(model.actual_cost) }}</td>
                    <td class="py-1.5 text-right text-muted-foreground/60">${{ formatCost(model.cost) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Token Usage Trend Chart -->
      <TokenUsageTrend :trend-data="trend" :loading="loading" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import DateRangePicker from '@/components/common/DateRangePicker.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Doughnut } from 'vue-chartjs'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend.vue'
import type { TrendDataPoint, ModelStat } from '@/types'
import { formatCostFixed as formatCost, formatNumberLocaleString as formatNumber, formatTokensK as formatTokens } from '@/utils/format'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

const props = defineProps<{ loading: boolean, startDate: string, endDate: string, granularity: string, trend: TrendDataPoint[], models: ModelStat[] }>()
defineEmits(['update:startDate', 'update:endDate', 'update:granularity', 'dateRangeChange', 'granularityChange', 'refresh'])
const { t } = useI18n()

const modelData = computed(() => !props.models?.length ? null : {
  labels: props.models.map((m: ModelStat) => m.model),
  datasets: [{
    data: props.models.map((m: ModelStat) => m.total_tokens),
    backgroundColor: ['#5CA8FF', '#46C98C', '#E0B34E', '#F25C69', '#8CC4FF', '#97A0AF', '#3D91F0', '#c0c4cc']
  }]
})

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context: any) => `${context.label}: ${formatTokens(context.parsed)} tokens`
      }
    }
  }
}
</script>
