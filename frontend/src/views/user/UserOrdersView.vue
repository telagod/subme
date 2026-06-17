<template>
  <AppLayout>
    <div class="space-y-4">
      <!-- Filters -->
      <Card>
        <CardContent class="p-4">
          <div class="flex flex-wrap items-center gap-3">
            <Select v-model="currentFilter" @update:modelValue="fetchOrders" class="w-36">
              <SelectTrigger class="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in statusFilters" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
            <div class="flex flex-1 items-center justify-end gap-2">
              <Button variant="outline" size="icon" @click="fetchOrders" :disabled="loading" :title="t('common.refresh')">
                <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
              </Button>
              <Button @click="router.push('/purchase')">{{ t('payment.result.backToRecharge') }}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Table -->
      <OrderTable :orders="orders" :loading="loading">
        <template #actions="{ row }">
          <div class="flex items-center gap-2">
            <Button v-if="row.status === 'PENDING'" variant="ghost" size="sm" @click="handleCancel(row.id)" class="h-auto gap-1 px-2 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/10 hover:text-amber-500">
              <Icon name="x" size="sm" />
              <span>{{ t('payment.orders.cancel') }}</span>
            </Button>
            <Button v-if="canRequestRefund(row)" variant="ghost" size="sm" @click="openRefundDialog(row)" class="h-auto gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary">
              <Icon name="dollar" size="sm" />
              <span>{{ t('payment.orders.requestRefund') }}</span>
            </Button>
          </div>
        </template>
      </OrderTable>

      <!-- Pagination -->
      <Pagination
        v-if="pagination.total > 0"
        :page="pagination.page"
        :total="pagination.total"
        :page-size="pagination.page_size"
        @update:page="handlePageChange"
        @update:pageSize="handlePageSizeChange"
      />
    </div>

    <!-- Cancel Confirm Dialog -->
    <Dialog :open="!!cancelTargetId" @update:open="val => { if (!val) cancelTargetId = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('payment.orders.cancel') }}</DialogTitle>
        </DialogHeader>
        <p class="text-sm text-foreground/85">{{ t('payment.confirmCancel') }}</p>
        <DialogFooter>
          <Button variant="outline" @click="cancelTargetId = null">{{ t('common.cancel') }}</Button>
          <Button variant="destructive" :disabled="actionLoading" @click="confirmCancel">{{ actionLoading ? t('common.processing') : t('payment.orders.cancel') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Refund Dialog -->
    <Dialog :open="!!refundTarget" @update:open="val => { if (!val) refundTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('payment.orders.requestRefund') }}</DialogTitle>
        </DialogHeader>
        <div v-if="refundTarget" class="space-y-4">
          <div class="rounded-md bg-muted p-4">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">{{ t('payment.orders.orderId') }}</span>
              <span class="font-mono text-foreground">#{{ refundTarget.id }}</span>
            </div>
            <div class="mt-2 flex justify-between text-sm">
              <span class="text-muted-foreground">{{ t('payment.orders.amount') }}</span>
              <span class="text-foreground">${{ refundTarget.amount.toFixed(2) }}</span>
            </div>
          </div>
          <div>
            <Label class="mb-1 block">{{ t('payment.refundReason') }}</Label>
            <Textarea v-model="refundReason" rows="3" class="w-full" :placeholder="t('payment.refundReasonPlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="refundTarget = null">{{ t('common.cancel') }}</Button>
          <Button :disabled="actionLoading || !refundReason.trim()" @click="confirmRefund">{{ actionLoading ? t('common.processing') : t('payment.orders.requestRefund') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import { paymentAPI } from '@/api/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import type { PaymentOrder } from '@/types/payment'
import AppLayout from '@/components/layout/AppLayout.vue'
import Pagination from '@/components/common/Pagination.vue'
import Icon from '@/components/icons/Icon.vue'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import OrderTable from '@/components/payment/OrderTable.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(false)
const actionLoading = ref(false)
const orders = ref<PaymentOrder[]>([])
const refundEligibleProviders = ref<Set<string>>(new Set())
const currentFilter = ref('all')
const cancelTargetId = ref<number | null>(null)
const refundTarget = ref<PaymentOrder | null>(null)
const refundReason = ref('')
const pagination = reactive({ page: 1, page_size: 20, total: 0 })

const statusFilters = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'PENDING', label: t('payment.status.pending') },
  { value: 'COMPLETED', label: t('payment.status.completed') },
  { value: 'FAILED', label: t('payment.status.failed') },
  { value: 'REFUNDED', label: t('payment.status.refunded') },
])

async function fetchOrders() {
  loading.value = true
  try {
    const res = await paymentAPI.getMyOrders({
      page: pagination.page,
      page_size: pagination.page_size,
      status: (currentFilter.value && currentFilter.value !== 'all') ? currentFilter.value : undefined,
    })
    orders.value = res.data.items || []
    pagination.total = res.data.total || 0
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) { pagination.page = page; fetchOrders() }
function handlePageSizeChange(size: number) { pagination.page_size = size; pagination.page = 1; fetchOrders() }

function handleCancel(orderId: number) { cancelTargetId.value = orderId }

async function confirmCancel() {
  if (!cancelTargetId.value) return
  actionLoading.value = true
  try {
    await paymentAPI.cancelOrder(cancelTargetId.value)
    appStore.showSuccess(t('common.success'))
    cancelTargetId.value = null
    await fetchOrders()
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally {
    actionLoading.value = false
  }
}

function openRefundDialog(order: PaymentOrder) { refundTarget.value = order; refundReason.value = '' }

async function confirmRefund() {
  if (!refundTarget.value || !refundReason.value.trim()) return
  actionLoading.value = true
  try {
    await paymentAPI.requestRefund(refundTarget.value.id, { reason: refundReason.value.trim() })
    appStore.showSuccess(t('common.success'))
    refundTarget.value = null
    refundReason.value = ''
    await fetchOrders()
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally {
    actionLoading.value = false
  }
}

function canRequestRefund(order: PaymentOrder): boolean {
  if (order.status !== 'COMPLETED') return false
  if (!order.provider_instance_id) return false
  return refundEligibleProviders.value.has(order.provider_instance_id)
}

async function loadRefundEligibility() {
  try {
    const res = await paymentAPI.getRefundEligibleProviders()
    refundEligibleProviders.value = new Set(res.data.provider_instance_ids || [])
  } catch { /* ignore — default to hiding refund button */ }
}

onMounted(() => { fetchOrders(); loadRefundEligibility() })
</script>
