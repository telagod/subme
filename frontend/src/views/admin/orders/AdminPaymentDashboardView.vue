<template>
  <AppLayout>
    <div class="px-7 pb-16 pt-6">
      <!-- 页头 -->
      <div class="mb-5 flex items-start justify-between">
        <div>
          <h1 class="mb-1 text-xl font-bold tracking-tight text-foreground">收入看板</h1>
          <p class="text-xs text-muted-foreground">收入域 · 实时统计 · 选择时间范围</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- 日期段选择 -->
          <div class="inline-flex overflow-hidden rounded-lg border border-border">
            <Button
              v-for="d in DAYS_OPTIONS"
              :key="d"
              variant="ghost"
              size="sm"
              :class="[
                'rounded-none border-none text-xs font-medium',
                days === d
                  ? 'bg-muted text-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              ]"
              @click="days = d"
            >
              {{ d }}{{ t('payment.admin.daySuffix') }}
            </Button>
          </div>
          <Button variant="outline" size="sm" :disabled="loading" @click="loadDashboard">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" :class="loading ? 'animate-spin' : ''"><path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 2v2.5H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary"></div>
      </div>

      <template v-else-if="stats">
        <!-- 统计卡片 -->
        <OrderStatsCards :stats="stats" />

        <!-- 日收入折线图 -->
        <DailyRevenueChart :data="stats.daily_series || []" :loading="loading" style="margin-bottom:16px" />

        <!-- 支付方式 + Top 用户 -->
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PaymentMethodChart :methods="stats.payment_methods || []" />
          <TopUsersLeaderboard :users="stats.top_users || []" />
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminPaymentAPI } from '@/api/admin/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import type { DashboardStats } from '@/types/payment'
import AppLayout from '@/components/layout/AppLayout.vue'
import OrderStatsCards from '@/components/admin/payment/OrderStatsCards.vue'
import DailyRevenueChart from '@/components/admin/payment/DailyRevenueChart.vue'
import PaymentMethodChart from '@/components/admin/payment/PaymentMethodChart.vue'
import TopUsersLeaderboard from '@/components/admin/payment/TopUsersLeaderboard.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()

const DAYS_OPTIONS = [7, 30, 90] as const
const days = ref<number>(30)
const loading = ref(false)
const stats = ref<DashboardStats | null>(null)

async function loadDashboard() {
  loading.value = true
  try {
    const res = await adminPaymentAPI.getDashboard(days.value)
    stats.value = res.data
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally {
    loading.value = false
  }
}

watch(days, () => loadDashboard())
onMounted(() => loadDashboard())
</script>
