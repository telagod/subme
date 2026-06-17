<template>
  <div>
    <div v-if="props.loading && !props.stats" class="flex gap-2">
      <div class="h-3 w-20 animate-pulse rounded bg-muted"></div>
    </div>
    <div v-else-if="props.error && !props.stats" class="text-[10px] text-destructive">!</div>
    <div v-else-if="props.stats" class="flex items-center gap-1 text-[10px] tabular-nums">
      <span class="text-foreground/85 font-medium">{{ formatRequests }}r</span>
      <span class="text-muted-foreground/50">·</span>
      <span class="text-foreground/70">{{ formatTokens }}</span>
      <span class="text-muted-foreground/50">·</span>
      <span class="text-emerald-400 font-medium">${{ formatCost }}</span>
      <template v-if="props.stats.user_cost != null">
        <span class="text-muted-foreground/50">·</span>
        <span class="text-muted-foreground">u${{ formatUserCost }}</span>
      </template>
    </div>
    <div v-else class="text-[10px] text-muted-foreground">-</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WindowStats } from '@/types'
import { formatCompactNumber } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    stats?: WindowStats | null
    loading?: boolean
    error?: string | null
  }>(),
  { stats: null, loading: false, error: null }
)

const formatRequests = computed(() => {
  if (!props.stats) return '0'
  return formatCompactNumber(props.stats.requests, { allowBillions: false })
})

const formatTokens = computed(() => {
  if (!props.stats) return '0'
  return formatCompactNumber(props.stats.tokens)
})

const formatCost = computed(() => {
  if (!props.stats) return '0'
  return props.stats.cost.toFixed(2)
})

const formatUserCost = computed(() => {
  if (!props.stats?.user_cost) return '0'
  return props.stats.user_cost.toFixed(2)
})
</script>
