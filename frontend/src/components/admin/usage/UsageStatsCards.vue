<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <Card class="p-4 flex items-center gap-3">
      <div class="rounded-md bg-secondary p-2 border border-border text-primary">
        <Icon name="document" size="md" />
      </div>
      <div>
        <p class="text-xs font-medium text-muted-foreground">{{ t('usage.totalRequests') }}</p>
        <p class="text-xl font-bold text-foreground">{{ stats?.total_requests?.toLocaleString() || '0' }}</p>
        <p class="text-xs text-muted-foreground">{{ t('usage.inSelectedRange') }}</p>
      </div>
    </Card>
    <Card class="p-4 flex items-center gap-3">
      <div class="rounded-md bg-secondary p-2 border border-border text-primary"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg></div>
      <div>
        <p class="text-xs font-medium text-muted-foreground">{{ t('usage.totalTokens') }}</p>
        <p class="text-xl font-bold text-foreground">{{ formatTokens(stats?.total_tokens || 0) }}</p>
        <p class="text-xs text-muted-foreground">
          {{ t('usage.in') }}: {{ formatTokens(stats?.total_input_tokens || 0) }} /
          {{ t('usage.out') }}: {{ formatTokens(stats?.total_output_tokens || 0) }}
        </p>
      </div>
    </Card>
    <Card class="p-4 flex items-center gap-3">
      <div class="rounded-md bg-secondary p-2 border border-border text-primary">
        <Icon name="dollar" size="md" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-muted-foreground">{{ t('usage.totalCost') }}</p>
        <p class="text-xl font-bold text-emerald-500">
          ${{ (stats?.total_actual_cost || 0).toFixed(4) }}
        </p>
        <p class="text-xs text-muted-foreground">
          <span class="text-amber-500">{{ t('usage.accountCost') }} ${{ (stats?.total_account_cost || 0).toFixed(4) }}</span>
          <span> · </span>
          <span>{{ t('usage.standardCost') }} ${{ (stats?.total_cost || 0).toFixed(4) }}</span>
        </p>
      </div>
    </Card>
    <Card class="p-4 flex items-center gap-3">
      <div class="rounded-md bg-secondary p-2 border border-border text-primary">
        <Icon name="clock" size="md" />
      </div>
      <div><p class="text-xs font-medium text-muted-foreground">{{ t('usage.avgDuration') }}</p><p class="text-xl font-bold text-foreground">{{ formatDuration(stats?.average_duration_ms || 0) }}</p></div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AdminUsageStatsResponse } from '@/api/admin/usage'
import Icon from '@/components/icons/Icon.vue'
import { Card } from '@/components/ui/card'

defineProps<{ stats: AdminUsageStatsResponse | null }>()

const { t } = useI18n()

const formatDuration = (ms: number) =>
  ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`

const formatTokens = (value: number) => {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B'
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M'
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K'
  return value.toLocaleString()
}
</script>
