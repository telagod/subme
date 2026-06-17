<template>
  <div class="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
    <!-- 今日收入 -->
    <Card>
      <CardContent class="p-4">
        <div class="mb-2.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <!-- dollar sign -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M5.5 5.5C5.5 4.12 6.62 3 8 3h1a2 2 0 0 1 0 4H7a2 2 0 0 0 0 4h1.5A2 2 0 0 0 10.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="mb-1 text-[11.5px] text-muted-foreground">{{ t('payment.admin.todayRevenue') }}</p>
        <p class="font-mono text-[22px] font-bold leading-tight tabular-nums text-foreground">${{ formatMoney(stats.today_amount) }}</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">{{ stats.today_count }} {{ t('payment.admin.orders') }}</p>
      </CardContent>
    </Card>

    <!-- 总收入 -->
    <Card>
      <CardContent class="p-4">
        <div class="mb-2.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <!-- credit card -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.3"/><path d="M4 9.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </div>
        <p class="mb-1 text-[11.5px] text-muted-foreground">{{ t('payment.admin.totalRevenue') }}</p>
        <p class="font-mono text-[22px] font-bold leading-tight tabular-nums text-foreground">${{ formatMoney(stats.total_amount) }}</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">{{ stats.total_count }} {{ t('payment.admin.orders') }}</p>
      </CardContent>
    </Card>

    <!-- 今日订单数 -->
    <Card>
      <CardContent class="p-4">
        <div class="mb-2.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <!-- bar chart -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12h2V7H2v5ZM7 12h2V4H7v8ZM12 12h2V9h-2v3Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="mb-1 text-[11.5px] text-muted-foreground">{{ t('payment.admin.todayOrders') }}</p>
        <p class="font-mono text-[22px] font-bold leading-tight tabular-nums text-foreground">{{ stats.today_count }}</p>
      </CardContent>
    </Card>

    <!-- 平均客单 -->
    <Card>
      <CardContent class="p-4">
        <div class="mb-2.5 inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <!-- trend up -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 11L6 7L9 10L14 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 5h3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="mb-1 text-[11.5px] text-muted-foreground">{{ t('payment.admin.avgAmount') }}</p>
        <p class="font-mono text-[22px] font-bold leading-tight tabular-nums text-foreground">${{ formatMoney(stats.avg_amount) }}</p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DashboardStats } from '@/types/payment'
import { Card, CardContent } from '@/components/ui/card'

const { t } = useI18n()

defineProps<{
  stats: DashboardStats
}>()

function formatMoney(value: number): string {
  return value.toFixed(2)
}
</script>
