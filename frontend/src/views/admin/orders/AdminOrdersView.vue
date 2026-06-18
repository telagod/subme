<template>
  <AppLayout>
    <div class="px-7 pb-16 pt-6">
      <!-- 页头 -->
      <div class="mb-5 flex items-start justify-between">
        <div>
          <h1 class="mb-1 text-xl font-bold tracking-tight text-foreground">订单流水</h1>
          <p class="text-xs text-muted-foreground">收入域 · 全量订单 · 点击操作列处理退款</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="ordersLoading" @click="loadOrders" class="gap-1.5">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" :class="ordersLoading ? 'spin-icon' : ''"><path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 2v2.5H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            刷新
          </Button>
        </div>
      </div>

      <!-- 筛选栏 -->
      <OrdersFilterBar
        v-model:search="orderSearch"
        v-model:status="orderFilters.status"
        v-model:pay-type="orderFilters.payment_type"
        v-model:order-type="orderFilters.order_type"
        @update:search="debounceLoadOrders"
        @update:status="loadOrders"
        @update:pay-type="loadOrders"
        @update:order-type="loadOrders"
        @clear="clearFilters"
      />

      <!-- 表格卡片 -->
      <Card>
        <CardContent class="p-0">
          <OrderTable :orders="orders" :loading="ordersLoading" show-user>
            <template #actions="{ row }">
              <div class="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:text-foreground" @click="showOrderDetail(row)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>
                  {{ t('common.view') }}
                </Button>
                <Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500" @click="handleCancelOrder(row)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  {{ t('payment.orders.cancel') }}
                </Button>
                <Button v-if="row.status === 'FAILED'" variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:text-foreground" @click="handleRetryOrder(row)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 5.5A3.5 3.5 0 1 1 5.5 2a3.5 3.5 0 0 1 2.47 1.03" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10 2v2H8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  {{ t('payment.admin.retry') }}
                </Button>
                <template v-if="row.status === 'REFUND_REQUESTED'">
                  <span v-if="row.refund_amount" class="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums font-mono bg-amber-500/15 text-amber-400" style="font-size:10.5px">{{ row.order_type === 'balance' ? '$' : '¥' }}{{ row.refund_amount.toFixed(2) }}</span>
                  <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500" @click="openRefundDialog(row)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('payment.admin.approveRefund') }}
                  </Button>
                </template>
                <Button v-else-if="row.status === 'REFUND_FAILED'" variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="openRefundDialog(row)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 5.5A3.5 3.5 0 1 1 5.5 2a3.5 3.5 0 0 1 2.47 1.03" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10 2v2H8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  {{ t('payment.admin.retryRefund') }}
                </Button>
                <Button v-else-if="row.status === 'COMPLETED' || row.status === 'PARTIALLY_REFUNDED'" variant="ghost" size="sm" class="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="openRefundDialog(row)">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M3 5l3-3 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {{ t('payment.admin.refund') }}
                </Button>
              </div>
            </template>
          </OrderTable>
          <Pagination v-if="orderPagination.total > 0" :page="orderPagination.page" :total="orderPagination.total" :page-size="orderPagination.page_size" @update:page="handleOrderPageChange" @update:pageSize="handleOrderPageSizeChange" />
        </CardContent>
      </Card>
    </div>

    <!-- 订单详情弹窗 -->
    <AdminOrderDetail
      :show="showDetailDialog"
      :order="selectedOrder"
      @close="showDetailDialog = false"
      @cancel="handleCancelOrder"
      @retry="handleRetryOrder"
      @refund="openRefundDialog"
    />

    <AdminRefundDialog :show="showRefundDialog" :order="selectedOrder" :submitting="refundSubmitting" @confirm="handleRefund" @cancel="showRefundDialog = false" />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminPaymentAPI } from '@/api/admin/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import type { PaymentOrder } from '@/types/payment'
import AppLayout from '@/components/layout/AppLayout.vue'
import Pagination from '@/components/common/Pagination.vue'
import AdminRefundDialog from '@/components/admin/payment/AdminRefundDialog.vue'
import OrderTable from '@/components/payment/OrderTable.vue'
import OrdersFilterBar from './OrdersFilterBar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import AdminOrderDetail from '@/components/admin/payment/AdminOrderDetail.vue'

const { t } = useI18n()
const appStore = useAppStore()

const ordersLoading = ref(false)
const orders = ref<PaymentOrder[]>([])
const orderSearch = ref('')
const orderFilters = reactive({ status: '', payment_type: '', order_type: '' })
const orderPagination = reactive({ page: 1, page_size: 20, total: 0 })
const selectedOrder = ref<PaymentOrder | null>(null)
const showDetailDialog = ref(false)
const showRefundDialog = ref(false)
const refundSubmitting = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debounceLoadOrders() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => loadOrders(), 300)
}

async function loadOrders() {
  ordersLoading.value = true
  try {
    const res = await adminPaymentAPI.getOrders({
      page: orderPagination.page, page_size: orderPagination.page_size,
      keyword: orderSearch.value || undefined, status: orderFilters.status || undefined,
      payment_type: orderFilters.payment_type || undefined, order_type: orderFilters.order_type || undefined,
    })
    orders.value = res.data.items || []
    orderPagination.total = res.data.total || 0
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally { ordersLoading.value = false }
}

function handleOrderPageChange(page: number) { orderPagination.page = page; loadOrders() }
function handleOrderPageSizeChange(size: number) { orderPagination.page_size = size; orderPagination.page = 1; loadOrders() }
function clearFilters() { orderSearch.value = ''; orderFilters.status = ''; orderFilters.payment_type = ''; orderFilters.order_type = ''; orderPagination.page = 1; loadOrders() }

function showOrderDetail(order: PaymentOrder) {
  selectedOrder.value = order; showDetailDialog.value = true
}

async function handleCancelOrder(order: PaymentOrder) {
  try { await adminPaymentAPI.cancelOrder(order.id); appStore.showSuccess(t('payment.admin.orderCancelled')); loadOrders() }
  catch (err: unknown) { appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error'))) }
}

async function handleRetryOrder(order: PaymentOrder) {
  try { await adminPaymentAPI.retryRecharge(order.id); appStore.showSuccess(t('payment.admin.retrySuccess')); loadOrders() }
  catch (err: unknown) { appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error'))) }
}

function openRefundDialog(order: PaymentOrder) { selectedOrder.value = order; showRefundDialog.value = true }

async function handleRefund(data: { amount: number; reason: string; deduct_balance: boolean; force: boolean }) {
  if (!selectedOrder.value) return
  refundSubmitting.value = true
  try {
    await adminPaymentAPI.refundOrder(selectedOrder.value.id, data)
    appStore.showSuccess(t('payment.admin.refundSuccess')); showRefundDialog.value = false; loadOrders()
  } catch (err: unknown) { appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error'))) }
  finally { refundSubmitting.value = false }
}

onMounted(() => loadOrders())
</script>

<style scoped>
.spin-icon { animation: icon-spin .7s linear infinite; }
@keyframes icon-spin { to { transform: rotate(360deg); } }
</style>
