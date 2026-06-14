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
    <Dialog :open="showDetailDialog" @update:open="showDetailDialog = $event">
      <DialogContent class="max-h-[86vh] w-[540px] max-w-[92vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>订单详情</DialogTitle>
        </DialogHeader>
        <div v-if="selectedOrder" class="grid grid-cols-2 gap-3.5">
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.orderId') }}</label><p class="m-0 font-mono text-sm tabular-nums text-foreground">#{{ selectedOrder.id }}</p></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.orderNo') }}</label><p class="m-0 font-mono text-[11.5px] tabular-nums text-foreground">{{ selectedOrder.out_trade_no }}</p></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.status') }}</label><span :class="['inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold', (['COMPLETED','PAID'].includes(selectedOrder.status.toUpperCase())) ? 'bg-emerald-500/15 text-emerald-400' : (['PENDING','REFUND_REQUESTED'].includes(selectedOrder.status.toUpperCase())) ? 'bg-amber-500/15 text-amber-400' : (['FAILED','REFUND_FAILED','CANCELLED','EXPIRED'].includes(selectedOrder.status.toUpperCase())) ? 'bg-red-500/15 text-red-400' : selectedOrder.status.toUpperCase() === 'REFUNDED' ? 'bg-sky-500/12 text-sky-400' : 'bg-muted text-muted-foreground']">{{ t('payment.status.' + selectedOrder.status.toLowerCase(), selectedOrder.status) }}</span></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.amount') }}</label><span class="block font-mono tabular-nums text-sm text-foreground text-right">{{ selectedOrder.order_type === 'balance' ? '$' : '¥' }}{{ selectedOrder.amount.toFixed(2) }}</span></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.payAmount') }}</label><span class="block font-mono tabular-nums text-sm text-foreground text-right">¥{{ selectedOrder.pay_amount.toFixed(2) }}</span></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.paymentMethod') }}</label><p class="m-0 text-sm text-foreground">{{ t('payment.methods.' + selectedOrder.payment_type, selectedOrder.payment_type) }}</p></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.feeRate') }}</label><p class="m-0 text-sm text-foreground">{{ selectedOrder.fee_rate }}%</p></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.orders.createdAt') }}</label><p class="m-0 text-[11.5px] text-muted-foreground">{{ formatDateTime(selectedOrder.created_at) }}</p></div>
          <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.expiresAt') }}</label><p class="m-0 text-[11.5px] text-muted-foreground">{{ formatDateTime(selectedOrder.expires_at) }}</p></div>
          <div v-if="selectedOrder.paid_at" class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.paidAt') }}</label><p class="m-0 text-[11.5px] text-muted-foreground">{{ formatDateTime(selectedOrder.paid_at) }}</p></div>
          <div v-if="selectedOrder.refund_amount" class="col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3">
            <h4 class="mb-2 text-[12.5px] font-bold text-destructive">{{ t('payment.admin.refundInfo') }}</h4>
            <p class="m-0 text-[12.5px] text-destructive/85">{{ t('payment.admin.refundAmount') }}: {{ selectedOrder.order_type === 'balance' ? '$' : '¥' }}{{ selectedOrder.refund_amount.toFixed(2) }}</p>
            <p v-if="selectedOrder.refund_reason" class="m-0 text-[12.5px] text-destructive/85">{{ t('payment.admin.refundReason') }}: {{ selectedOrder.refund_reason }}</p>
          </div>
          <div v-if="selectedOrder.refund_requested_at" class="col-span-2">
            <Separator class="my-1" />
            <p class="mb-2.5 text-[11.5px] font-semibold text-primary">{{ t('payment.admin.refundRequestInfo') }}</p>
            <div class="grid grid-cols-2 gap-3.5">
              <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.refundRequestedAt') }}</label><p class="m-0 text-[11.5px] text-muted-foreground">{{ formatDateTime(selectedOrder.refund_requested_at) }}</p></div>
              <div class="flex flex-col gap-0.5"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.refundRequestedBy') }}</label><p class="m-0 text-sm text-foreground">#{{ selectedOrder.refund_requested_by }}</p></div>
              <div class="flex flex-col gap-0.5 col-span-2"><label class="block text-[11px] text-muted-foreground">{{ t('payment.admin.refundRequestReason') }}</label><p class="m-0 text-sm text-foreground">{{ selectedOrder.refund_request_reason }}</p></div>
            </div>
          </div>
          <div v-if="orderAuditLogs.length > 0" class="col-span-2">
            <Separator class="my-1" />
            <p class="mb-2.5 text-[11.5px] font-semibold text-primary">{{ t('payment.admin.auditLogs') }}</p>
            <ScrollArea class="max-h-[180px]">
              <div class="flex flex-col gap-1.5">
                <div v-for="log in orderAuditLogs" :key="log.id" class="rounded-lg border border-border bg-muted px-2.5 py-2">
                  <div class="mb-0.5 flex items-center justify-between">
                    <span class="text-xs font-semibold text-foreground">{{ log.action }}</span>
                    <span class="text-[11px] text-muted-foreground">{{ formatDateTime(log.created_at) }}</span>
                  </div>
                  <div v-if="log.detail" class="break-all text-[11.5px] text-muted-foreground">{{ log.detail }}</div>
                  <div v-if="log.operator" class="text-[11.5px] text-muted-foreground">{{ t('payment.admin.operator') }}: {{ log.operator }}</div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="showDetailDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AdminRefundDialog :show="showRefundDialog" :order="selectedOrder" :submitting="refundSubmitting" @confirm="handleRefund" @cancel="showRefundDialog = false" />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminPaymentAPI } from '@/api/admin/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { formatOrderDateTime } from '@/components/payment/orderUtils'
import type { PaymentOrder } from '@/types/payment'
import AppLayout from '@/components/layout/AppLayout.vue'
import Pagination from '@/components/common/Pagination.vue'
import AdminRefundDialog from '@/components/admin/payment/AdminRefundDialog.vue'
import OrderTable from '@/components/payment/OrderTable.vue'
import OrdersFilterBar from './OrdersFilterBar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AuditLog { id: number; action: string; detail: string | null; operator: string | null; created_at: string }

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
const orderAuditLogs = ref<AuditLog[]>([])

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

async function showOrderDetail(order: PaymentOrder) {
  selectedOrder.value = order; orderAuditLogs.value = []; showDetailDialog.value = true
  try {
    const res = await adminPaymentAPI.getOrder(order.id)
    const data = res.data as unknown as Record<string, unknown>
    if (data.order) selectedOrder.value = data.order as PaymentOrder
    orderAuditLogs.value = ((data.auditLogs || data.audit_logs || []) as unknown) as AuditLog[]
  } catch { /* keep cached */ }
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

function formatDateTime(dateStr: string): string { return formatOrderDateTime(dateStr) }

onMounted(() => loadOrders())
</script>

<style scoped>
.spin-icon { animation: icon-spin .7s linear infinite; }
@keyframes icon-spin { to { transform: rotate(360deg); } }
</style>
