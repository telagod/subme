<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between border-b border-border px-6 py-4">
      <CardTitle class="text-lg font-semibold text-foreground">{{ t('dashboard.recentUsage') }}</CardTitle>
      <Badge variant="secondary">{{ t('dashboard.last7Days') }}</Badge>
    </CardHeader>
    <CardContent class="p-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
      <div v-else-if="data.length === 0" class="py-8">
        <EmptyState :title="t('dashboard.noUsageRecords')" :description="t('dashboard.startUsingApi')" />
      </div>
      <div v-else class="space-y-3">
        <div v-for="log in data" :key="log.id" class="flex items-center justify-between rounded-md bg-card p-4 transition-colors hover:bg-accent">
          <div class="flex items-center gap-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary ">
              <Icon name="beaker" size="md" class="text-primary" />
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">{{ log.model }}</p>
              <p class="text-xs text-muted-foreground">{{ formatDateTime(log.created_at) }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-semibold">
              <span class="tabular-nums text-emerald-500" :title="t('dashboard.actual')">${{ formatCost(log.actual_cost) }}</span>
              <span class="tabular-nums font-normal text-muted-foreground/60" :title="t('dashboard.standard')"> / ${{ formatCost(log.total_cost) }}</span>
            </p>
            <p class="text-xs text-muted-foreground">{{ (log.input_tokens + log.output_tokens).toLocaleString() }} tokens</p>
          </div>
        </div>

        <router-link to="/usage" class="flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary transition-colors hover:text-foreground">
          {{ t('dashboard.viewAllUsage') }}
          <Icon name="arrowRight" size="sm" />
        </router-link>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Icon from '@/components/icons/Icon.vue'
import { formatDateTime } from '@/utils/format'
import type { UsageLog } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

defineProps<{
  data: UsageLog[]
  loading: boolean
}>()
const { t } = useI18n()
const formatCost = (c: number) => c.toFixed(4)
</script>
