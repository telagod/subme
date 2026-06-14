<template>
  <BaseDialog
    :show="show"
    :title="t('payment.admin.orderDetail')"
    width="wide"
    @close="emit('close')"
  >
    <div v-if="order" class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.orderId') }}</Label>
        <p class="text-sm text-foreground m-0 font-mono tabular-nums">#{{ order.id }}</p>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.status') }}</Label>
        <Badge
          :class="{
            'border-transparent bg-emerald-500/15 text-emerald-500': statusBadgeQuench(order.status) === 'oq-badge-ok',
            'border-transparent bg-amber-500/15 text-amber-500': statusBadgeQuench(order.status) === 'oq-badge-warn',
            'border-transparent bg-destructive/15 text-destructive': statusBadgeQuench(order.status) === 'oq-badge-bad',
            'border-transparent bg-primary/15 text-primary': statusBadgeQuench(order.status) === 'oq-badge-azure',
            'border-transparent bg-muted text-muted-foreground': statusBadgeQuench(order.status) === 'oq-badge-dim',
          }"
        >
          {{ t('payment.status.' + order.status.toLowerCase(), order.status) }}
        </Badge>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.baseAmount') }}</Label>
        <span class="font-mono tabular-nums text-foreground block text-right">¥{{ baseAmount.toFixed(2) }}</span>
      </div>
      <div v-if="order.fee_rate > 0" class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.fee') }} ({{ order.fee_rate }}%)</Label>
        <span class="font-mono tabular-nums text-foreground block text-right">¥{{ feeAmount.toFixed(2) }}</span>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.payAmount') }}</Label>
        <span class="font-mono tabular-nums text-foreground block text-right">¥{{ order.pay_amount.toFixed(2) }}</span>
      </div>
      <div v-if="order.amount !== order.pay_amount" class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.creditedAmount') }}</Label>
        <span class="font-mono tabular-nums text-foreground block text-right">{{ order.order_type === 'balance' ? '$' : '¥' }}{{ order.amount.toFixed(2) }}</span>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.paymentMethod') }}</Label>
        <p class="text-sm text-foreground m-0">{{ t('payment.methods.' + order.payment_type, order.payment_type) }}</p>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.admin.orderType') }}</Label>
        <p class="text-sm text-foreground m-0">{{ t('payment.admin.' + order.order_type + 'Order', order.order_type) }}</p>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.userId') }}</Label>
        <p class="text-sm text-muted-foreground m-0 font-mono tabular-nums">#{{ order.user_id }}</p>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.orders.createdAt') }}</Label>
        <p class="text-xs text-muted-foreground m-0">{{ formatDateTime(order.created_at) }}</p>
      </div>
      <div class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.admin.expiresAt') }}</Label>
        <p class="text-xs text-muted-foreground m-0">{{ formatDateTime(order.expires_at) }}</p>
      </div>
      <div v-if="order.paid_at" class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.admin.paidAt') }}</Label>
        <p class="text-xs text-muted-foreground m-0">{{ formatDateTime(order.paid_at) }}</p>
      </div>
      <div v-if="order.completed_at" class="flex flex-col gap-0.5">
        <Label class="text-[11px] text-muted-foreground block mb-1">{{ t('payment.admin.completedAt') }}</Label>
        <p class="text-xs text-muted-foreground m-0">{{ formatDateTime(order.completed_at) }}</p>
      </div>

      <!-- 退款信息 -->
      <div v-if="order.refund_amount" class="col-span-2 border border-destructive/30 bg-destructive/10 rounded-lg p-3">
        <h4 class="text-[12.5px] font-bold text-destructive m-0 mb-2">{{ t('payment.admin.refundInfo') }}</h4>
        <p class="text-[12.5px] text-destructive/85 m-0"><strong>{{ t('payment.admin.refundAmount') }}:</strong> {{ order.order_type === 'balance' ? '$' : '¥' }}{{ order.refund_amount.toFixed(2) }}</p>
        <p v-if="order.refund_reason" class="text-[12.5px] text-destructive/85 m-0">{{ t('payment.admin.refundReason') }}: {{ order.refund_reason }}</p>
      </div>

      <!-- 底部操作 -->
      <Separator class="col-span-2 my-1" />
      <div class="col-span-2 flex gap-2 justify-end">
        <Button
          v-if="order.status === 'PENDING'"
          variant="outline"
          size="sm"
          class="text-amber-500 border-amber-500/35 bg-amber-500/12 hover:bg-amber-500/20"
          @click="emit('cancel', order)"
        >
          {{ t('payment.orders.cancel') }}
        </Button>
        <Button
          v-if="order.status === 'FAILED'"
          variant="outline"
          size="sm"
          @click="emit('retry', order)"
        >
          {{ t('payment.admin.retry') }}
        </Button>
        <Button
          v-if="canRefund(order)"
          variant="outline"
          size="sm"
          class="text-destructive border-destructive/35 bg-destructive/12 hover:bg-destructive/20"
          @click="emit('refund', order)"
        >
          {{ t('payment.admin.refund') }}
        </Button>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { PaymentOrder } from '@/types/payment'
import { canRefund as canRefundStatus, formatOrderDateTime } from '@/components/payment/orderUtils'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  order: PaymentOrder | null
}>()

/** 充值金额 (base amount before fee) = pay_amount / (1 + fee_rate/100) */
const baseAmount = computed(() => {
  if (!props.order) return 0
  const feeRate = Number(props.order.fee_rate) || 0
  if (feeRate <= 0) return props.order.pay_amount
  return props.order.pay_amount / (1 + feeRate / 100)
})

/** 手续费 = pay_amount - baseAmount */
const feeAmount = computed(() => {
  if (!props.order) return 0
  const feeRate = Number(props.order.fee_rate) || 0
  if (feeRate <= 0) return 0
  return props.order.pay_amount - baseAmount.value
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'cancel', order: PaymentOrder): void
  (e: 'retry', order: PaymentOrder): void
  (e: 'refund', order: PaymentOrder): void
}>()

function canRefund(order: PaymentOrder): boolean {
  return canRefundStatus(order.status)
}

function statusBadgeQuench(status: string): string {
  const s = status.toUpperCase()
  if (s === 'COMPLETED' || s === 'PAID') return 'oq-badge-ok'
  if (s === 'PENDING' || s === 'REFUND_REQUESTED') return 'oq-badge-warn'
  if (s === 'FAILED' || s === 'REFUND_FAILED' || s === 'CANCELLED' || s === 'EXPIRED') return 'oq-badge-bad'
  if (s === 'REFUNDED') return 'oq-badge-azure'
  return 'oq-badge-dim'
}

function formatDateTime(dateStr: string): string {
  return formatOrderDateTime(dateStr)
}
</script>
