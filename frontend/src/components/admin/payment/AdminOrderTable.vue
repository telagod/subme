<template>
  <div>
    <!-- 筛选栏 -->
    <div class="mb-3.5 flex flex-wrap items-center gap-2">
      <!-- 搜索框 -->
      <div class="relative">
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          aria-hidden="true"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.2"/>
          <path d="M9 9L11.5 11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <Input
          v-model="searchQuery"
          class="h-8 pl-8 text-sm"
          :class="{ 'ring-2 ring-ring': searchFocused }"
          :placeholder="t('payment.admin.searchOrders')"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
          @input="handleSearch"
        />
      </div>

      <!-- 状态筛选 -->
      <Select
        :model-value="filters.status"
        @update:model-value="val => { filters.status = val; emitFiltersChanged() }"
      >
        <SelectTrigger class="h-8 w-auto gap-1 text-xs" :class="{ 'border-primary text-primary': filters.status !== 'all' }">
          <span class="mr-0.5">状态</span>
          <SelectValue :placeholder="statusLabel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in statusFilterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- 支付方式筛选 -->
      <Select
        :model-value="filters.payment_type"
        @update:model-value="val => { filters.payment_type = val; emitFiltersChanged() }"
      >
        <SelectTrigger class="h-8 w-auto gap-1 text-xs" :class="{ 'border-primary text-primary': filters.payment_type !== 'all' }">
          <span class="mr-0.5">支付</span>
          <SelectValue :placeholder="payTypeLabel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in paymentTypeFilterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- 订单类型筛选 -->
      <Select
        :model-value="filters.order_type"
        @update:model-value="val => { filters.order_type = val; emitFiltersChanged() }"
      >
        <SelectTrigger class="h-8 w-auto gap-1 text-xs" :class="{ 'border-primary text-primary': filters.order_type !== 'all' }">
          <span class="mr-0.5">类型</span>
          <SelectValue :placeholder="orderTypeLabel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in orderTypeFilterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div class="ml-auto">
        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs" :disabled="loading" @click="emit('refresh')">
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            :class="loading ? 'animate-spin' : ''"
          >
            <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M11 2v2.5H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('common.refresh') }}
        </Button>
      </div>
    </div>

    <!-- 表格 -->
    <Card>
      <CardContent class="p-0">
        <DataTable :columns="columns" :data="orders" :loading="loading">
          <template #cell-id="{ value }">
            <span class="font-mono text-xs text-muted-foreground">#{{ value }}</span>
          </template>

          <template #cell-user_id="{ value }">
            <span class="font-mono text-xs text-muted-foreground">#{{ value }}</span>
          </template>

          <template #cell-pay_amount="{ value, row }">
            <span class="text-[13px] font-medium text-foreground">¥{{ value.toFixed(2) }}</span>
            <span
              v-if="row.fee_rate > 0"
              class="ml-1 text-xs text-muted-foreground"
              :title="t('payment.orders.fee') + ': ' + row.fee_rate + '%'"
            >({{ row.fee_rate }}%)</span>
            <div v-if="row.amount !== row.pay_amount" class="text-xs text-muted-foreground">
              {{ t('payment.orders.creditedAmount') }}: {{ row.order_type === 'balance' ? '$' : '¥' }}{{ row.amount.toFixed(2) }}
            </div>
          </template>

          <template #cell-payment_type="{ value }">
            <span class="text-xs text-foreground">{{ t('payment.methods.' + value, value) }}</span>
          </template>

          <template #cell-status="{ value }">
            <Badge :variant="statusBadgeVariant(value)">{{ t('payment.status.' + value.toLowerCase(), value) }}</Badge>
          </template>

          <template #cell-order_type="{ value }">
            <span class="text-xs text-muted-foreground">{{ t('payment.admin.' + value + 'Order', value) }}</span>
          </template>

          <template #cell-created_at="{ value }">
            <span class="font-mono text-xs text-muted-foreground">{{ formatDateTime(value) }}</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" @click="emit('detail', row)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
                  <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
                </svg>
                <span>{{ t('common.view') }}</span>
              </Button>
              <Button
                v-if="row.status === 'PENDING'"
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                @click="emit('cancel', row)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                <span>{{ t('payment.orders.cancel') }}</span>
              </Button>
              <Button
                v-if="row.status === 'FAILED'"
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs"
                @click="emit('retry', row)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M10 5.5A3.5 3.5 0 1 1 5.5 2a3.5 3.5 0 0 1 2.47 1.03" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  <path d="M10 2v2H8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                <span>{{ t('payment.admin.retry') }}</span>
              </Button>
              <!-- TODO(backlog): 此组件为 backup/unused，晋升为主组件时需拆分为三分支：
                   REFUND_REQUESTED → emit('approveRefund'), REFUND_FAILED → emit('retryRefund'), 其余 → emit('refund')
                   参考 AdminOrdersView.vue 中的 template v-if/v-else-if 链 -->
              <Button
                v-if="canRefundRow(row)"
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="emit('refund', row)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M3 5l3-3 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>{{ t('payment.admin.refund') }}</span>
              </Button>
            </div>
          </template>
        </DataTable>

        <Pagination
          v-if="total > 0"
          :page="page"
          :total="total"
          :page-size="pageSize"
          @update:page="emit('update:page', $event)"
          @update:pageSize="emit('update:pageSize', $event)"
        />
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PaymentOrder } from '@/types/payment'
import type { Column } from '@/components/common/types'
import DataTable from '@/components/common/DataTable.vue'
import Pagination from '@/components/common/Pagination.vue'
import { canRefund, formatOrderDateTime } from '@/components/payment/orderUtils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

const { t } = useI18n()

defineProps<{
  orders: PaymentOrder[]
  loading: boolean
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{
  (e: 'detail', order: PaymentOrder): void
  (e: 'cancel', order: PaymentOrder): void
  (e: 'retry', order: PaymentOrder): void
  (e: 'refund', order: PaymentOrder): void
  (e: 'refresh'): void
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', size: number): void
  (e: 'filter', filters: { keyword?: string; status?: string; payment_type?: string; order_type?: string }): void
}>()

// UI state
const searchFocused = ref(false)
const searchQuery = ref('')
const filters = reactive({ status: 'all', payment_type: 'all', order_type: 'all' })

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => emitFiltersChanged(), 300)
}

function emitFiltersChanged() {
  emit('filter', {
    keyword: searchQuery.value || undefined,
    status: (filters.status && filters.status !== 'all') ? filters.status : undefined,
    payment_type: (filters.payment_type && filters.payment_type !== 'all') ? filters.payment_type : undefined,
    order_type: (filters.order_type && filters.order_type !== 'all') ? filters.order_type : undefined,
  })
}

const columns = computed<Column[]>(() => [
  { key: 'id', label: t('payment.orders.orderId') },
  { key: 'user_id', label: t('payment.orders.userId') },
  { key: 'pay_amount', label: t('payment.orders.payAmount') },
  { key: 'payment_type', label: t('payment.orders.paymentMethod') },
  { key: 'status', label: t('payment.orders.status') },
  { key: 'order_type', label: t('payment.orders.orderType') },
  { key: 'created_at', label: t('payment.orders.createdAt') },
  { key: 'actions', label: t('payment.orders.actions') },
])

const statusFilterOptions = computed(() => [
  { value: 'all', label: t('payment.admin.allStatuses') },
  { value: 'PENDING', label: t('payment.status.pending') },
  { value: 'PAID', label: t('payment.status.paid') },
  { value: 'COMPLETED', label: t('payment.status.completed') },
  { value: 'EXPIRED', label: t('payment.status.expired') },
  { value: 'CANCELLED', label: t('payment.status.cancelled') },
  { value: 'FAILED', label: t('payment.status.failed') },
  { value: 'REFUNDED', label: t('payment.status.refunded') },
  { value: 'REFUND_REQUESTED', label: t('payment.status.refund_requested') },
  { value: 'REFUND_FAILED', label: t('payment.status.refund_failed') },
])

const paymentTypeFilterOptions = computed(() => [
  { value: 'all', label: t('payment.admin.allPaymentTypes') },
  { value: 'alipay', label: t('payment.methods.alipay') },
  { value: 'wxpay', label: t('payment.methods.wxpay') },
  { value: 'stripe', label: t('payment.methods.stripe') },
  { value: 'airwallex', label: t('payment.methods.airwallex') },
])

const orderTypeFilterOptions = computed(() => [
  { value: 'all', label: t('payment.admin.allOrderTypes') },
  { value: 'balance', label: t('payment.admin.balanceOrder') },
  { value: 'subscription', label: t('payment.admin.subscriptionOrder') },
])

const statusLabel = computed(() => statusFilterOptions.value.find(o => o.value === filters.status)?.label ?? '全部')
const payTypeLabel = computed(() => paymentTypeFilterOptions.value.find(o => o.value === filters.payment_type)?.label ?? '全部')
const orderTypeLabel = computed(() => orderTypeFilterOptions.value.find(o => o.value === filters.order_type)?.label ?? '全部')

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = status.toUpperCase()
  if (s === 'COMPLETED' || s === 'PAID') return 'default'
  if (s === 'PENDING' || s === 'REFUND_REQUESTED') return 'secondary'
  if (s === 'FAILED' || s === 'REFUND_FAILED' || s === 'CANCELLED' || s === 'EXPIRED') return 'destructive'
  if (s === 'REFUNDED') return 'outline'
  return 'secondary'
}

function canRefundRow(order: PaymentOrder): boolean {
  return canRefund(order.status)
}

function formatDateTime(dateStr: string): string {
  return formatOrderDateTime(dateStr)
}
</script>
