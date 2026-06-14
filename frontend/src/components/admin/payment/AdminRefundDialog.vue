<template>
  <BaseDialog
    :show="show"
    :title="t('payment.admin.refundOrder')"
    width="normal"
    @close="emit('cancel')"
  >
    <form id="refund-form" class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
      <!-- 退款申请信息 -->
      <div
        v-if="order?.refund_requested_at || order?.refund_request_reason"
        class="rounded-md border border-blue-500/20 bg-blue-500/[0.08] p-3"
      >
        <div class="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-400">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 6.5v3M7 4.5h.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          {{ t('payment.admin.refundRequestInfo') }}
        </div>
        <div v-if="order?.refund_requested_at" class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('payment.admin.refundRequestedAt') }}</span>
          <span class="text-foreground">{{ formatDateTime(order.refund_requested_at) }}</span>
        </div>
        <div v-if="order?.refund_request_reason" class="flex flex-col gap-0.5 text-sm">
          <span class="text-muted-foreground">{{ t('payment.admin.refundRequestReason') }}:</span>
          <span class="text-foreground">{{ order.refund_request_reason }}</span>
        </div>
      </div>

      <!-- 订单信息 -->
      <div class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('payment.orders.orderId') }}</span>
          <span class="font-mono text-foreground">#{{ order?.id }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('payment.orders.creditedAmount') }}</span>
          <span class="text-foreground">{{ order?.order_type === 'balance' ? '$' : '¥' }}{{ order?.amount?.toFixed(2) }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('payment.orders.payAmount') }}</span>
          <span class="text-foreground">¥{{ order?.pay_amount?.toFixed(2) }}</span>
        </div>
        <div v-if="actuallyRefunded > 0" class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('payment.admin.alreadyRefunded') }}</span>
          <span class="text-destructive font-medium">{{ order?.order_type === 'balance' ? '$' : '¥' }}{{ actuallyRefunded.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 扣减余额 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Checkbox id="deduct-balance" v-model="form.deduct_balance" />
          <Label for="deduct-balance">{{ t('payment.admin.deductBalance') }}</Label>
          <span class="text-xs text-muted-foreground">{{ t('payment.admin.deductBalanceHint') }}</span>
        </div>

        <!-- 用户余额信息 -->
        <div v-if="form.deduct_balance && userBalance != null" class="grid grid-cols-2 gap-2.5 mt-1">
          <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <div class="mb-1 text-xs text-muted-foreground">{{ t('payment.admin.userBalance') }}</div>
            <div class="font-mono text-sm font-bold text-emerald-500">${{ userBalance.toFixed(2) }}</div>
          </div>
          <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <div class="mb-1 text-xs text-muted-foreground">{{ t('payment.admin.orderAmount') }}</div>
            <div class="font-mono text-sm font-bold text-emerald-500">{{ order?.order_type === 'balance' ? '$' : '¥' }}{{ order?.amount?.toFixed(2) }}</div>
          </div>
        </div>

        <!-- 余额不足警告 -->
        <div v-if="form.deduct_balance && balanceInsufficient" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive mt-1">
          {{ t('payment.admin.insufficientBalance') }}
        </div>

        <!-- 不扣减说明 -->
        <div v-if="!form.deduct_balance" class="rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground mt-1">
          {{ t('payment.admin.noDeduction') }}
        </div>
      </div>

      <!-- 退款金额 -->
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('payment.admin.refundAmount') }}</Label>
        <div class="relative">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{{ order?.order_type === 'balance' ? '$' : '¥' }}</span>
          <Input
            v-model.number="form.amount"
            type="number"
            step="0.01"
            min="0.01"
            :max="maxRefundable"
            required
            class="pl-7"
          />
        </div>
        <p class="text-xs text-muted-foreground">{{ t('payment.admin.maxRefundable') }}: {{ order?.order_type === 'balance' ? '$' : '¥' }}{{ maxRefundable.toFixed(2) }}</p>
      </div>

      <!-- 退款原因 -->
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('payment.admin.refundReason') }}</Label>
        <Textarea
          v-model="form.reason"
          rows="3"
          :placeholder="t('payment.admin.refundReasonPlaceholder')"
          required
        />
      </div>

      <!-- 警告信息 -->
      <div v-if="warning" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ warning }}</div>

      <!-- 强制退款 -->
      <div v-if="requireForce" class="flex items-center gap-2">
        <Checkbox id="force-refund" v-model="form.force" class="border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground" />
        <Label for="force-refund" class="font-semibold text-destructive">{{ t('payment.admin.forceRefund') }}</Label>
      </div>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2.5">
        <Button type="button" variant="outline" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="refund-form"
          variant="destructive"
          :disabled="submitting || form.amount <= 0 || (requireForce && !form.force)"
        >
          {{ submitting ? t('common.processing') : t('payment.admin.confirmRefund') }}
        </Button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { PaymentOrder } from '@/types/payment'
import { formatOrderDateTime } from '@/components/payment/orderUtils'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  order: PaymentOrder | null
  submitting?: boolean
  userBalance?: number | null
  requireForce?: boolean
  warning?: string
}>()

const emit = defineEmits<{
  (e: 'confirm', data: { amount: number; reason: string; deduct_balance: boolean; force: boolean }): void
  (e: 'cancel'): void
}>()

const form = reactive({
  amount: 0,
  reason: '',
  deduct_balance: true,
  force: false,
})

// In REFUND_REQUESTED status, refund_amount is the REQUESTED amount, not actually refunded.
// Only PARTIALLY_REFUNDED / REFUNDED have real refund amounts.
const actuallyRefunded = computed(() => {
  if (!props.order) return 0
  const s = props.order.status
  if (s === 'PARTIALLY_REFUNDED' || s === 'REFUNDED') return props.order.refund_amount || 0
  return 0
})

const maxRefundable = computed(() => {
  if (!props.order) return 0
  return props.order.amount - actuallyRefunded.value
})

const balanceInsufficient = computed(() => {
  if (props.userBalance == null || !props.order) return false
  return props.userBalance < props.order.amount
})

watch(() => props.show, (val) => {
  if (val && props.order) {
    // For REFUND_REQUESTED, pre-fill with the requested amount
    if (props.order.status === 'REFUND_REQUESTED' && props.order.refund_amount) {
      form.amount = props.order.refund_amount
    } else {
      form.amount = maxRefundable.value
    }
    form.reason = props.order.refund_request_reason || ''
    form.deduct_balance = true
    form.force = false
  }
})

function formatDateTime(dateStr: string): string {
  return formatOrderDateTime(dateStr)
}

function handleSubmit() {
  if (form.amount <= 0 || form.amount > maxRefundable.value) return
  if (props.requireForce && !form.force) return
  emit('confirm', { ...form })
}
</script>
