<template>
  <div class="flex items-center gap-1 flex-wrap">
    <span :class="['w-[24px] shrink-0 rounded px-0.5 text-center text-[9px] font-semibold leading-tight', labelClass]">{{ label }}</span>
    <div class="w-[40px] shrink-0 h-[5px] rounded-full bg-muted/60 overflow-hidden">
      <div :class="['h-full rounded-full transition-all', barFillClass]" :style="{ width: barWidth }" />
    </div>
    <span
      :class="['text-[11px] font-mono font-semibold tabular-nums leading-tight', percentClass]"
      :title="statsTooltip"
    >{{ displayPercent }}</span>
    <span v-if="shouldShowResetTime" class="text-[10px] text-muted-foreground/70 tabular-nums leading-tight">{{ formatResetTime }}</span>
    <template v-if="hasInlineStats">
      <span class="text-[9px] text-muted-foreground/50 tabular-nums leading-tight">{{ inlineRequests }}r·{{ inlineTokens }}·${{ inlineCost }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WindowStats } from '@/types'
import { formatCompactNumber } from '@/utils/format'
import { useSharedClock } from '@/composables/useSharedClock'

const props = defineProps<{
  label: string
  utilization: number
  resetsAt?: string | null
  color: 'indigo' | 'emerald' | 'purple' | 'amber'
  windowStats?: WindowStats | null
  showNowWhenIdle?: boolean
}>()

const { t } = useI18n()
const { now } = useSharedClock()

const labelClass = computed(() => ({
  indigo: 'bg-indigo-900/40 text-indigo-300',
  emerald: 'bg-emerald-900/40 text-emerald-400',
  purple: 'bg-purple-900/40 text-purple-300',
  amber: 'bg-amber-900/40 text-amber-400'
}[props.color]))

const percentClass = computed(() => {
  if (props.utilization >= 100) return 'text-red-400'
  if (props.utilization >= 80) return 'text-amber-400'
  if (props.utilization >= 50) return 'text-foreground/85'
  return 'text-muted-foreground'
})

const barFillClass = computed(() => {
  if (props.utilization >= 100) return 'bg-red-500'
  return {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500'
  }[props.color]
})

const barWidth = computed(() => {
  const clamped = Math.min(100, Math.max(0, props.utilization))
  return `${clamped}%`
})

const displayPercent = computed(() => {
  const p = Math.round(props.utilization)
  return p > 999 ? '>999%' : `${p}%`
})

const shouldShowResetTime = computed(() => {
  if (props.resetsAt) return true
  return Boolean(props.showNowWhenIdle && props.utilization <= 0)
})

const formatResetTime = computed(() => {
  if (props.showNowWhenIdle && props.utilization <= 0) return t('usage.resetNow')
  if (!props.resetsAt) return ''
  const diffMs = new Date(props.resetsAt).getTime() - now.value.getTime()
  if (diffMs <= 0) return props.utilization > 0 ? t('usage.resetPending') : t('usage.resetNow')
  const h = Math.floor(diffMs / 3600000)
  const m = Math.floor((diffMs % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
})

const statsTooltip = computed(() => {
  const s = props.windowStats
  if (!s || (s.requests === 0 && s.tokens === 0)) return ''
  const parts = [
    `${formatCompactNumber(s.requests, { allowBillions: false })} req`,
    `${formatCompactNumber(s.tokens)} tok`,
    `$${s.cost.toFixed(2)} acct`
  ]
  if (s.user_cost != null) parts.push(`$${s.user_cost.toFixed(2)} user`)
  return parts.join(' · ')
})

const hasInlineStats = computed(() => {
  const s = props.windowStats
  return !!s && (s.requests > 0 || s.tokens > 0 || s.cost > 0)
})

const inlineRequests = computed(() => {
  if (!props.windowStats) return '0'
  return formatCompactNumber(props.windowStats.requests, { allowBillions: false })
})

const inlineTokens = computed(() => {
  if (!props.windowStats) return '0'
  return formatCompactNumber(props.windowStats.tokens)
})

const inlineCost = computed(() => {
  if (!props.windowStats) return '0'
  return props.windowStats.cost.toFixed(2)
})

</script>
