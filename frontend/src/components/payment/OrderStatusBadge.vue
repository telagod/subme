<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="statusClass"
  >
    {{ statusLabel }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OrderStatus } from '@/types/payment'

const props = defineProps<{
  status: OrderStatus
}>()

const { t } = useI18n()

const statusMap: Record<OrderStatus, { key: string; class: string }> = {
  PENDING: { key: 'payment.status.pending', class: 'bg-amber-500/10 text-amber-400' },
  PAID: { key: 'payment.status.paid', class: 'bg-sky-500/10 text-sky-400' },
  RECHARGING: { key: 'payment.status.recharging', class: 'bg-sky-500/10 text-sky-400' },
  COMPLETED: { key: 'payment.status.completed', class: 'bg-emerald-500/10 text-emerald-400' },
  EXPIRED: { key: 'payment.status.expired', class: 'bg-accent text-muted-foreground' },
  CANCELLED: { key: 'payment.status.cancelled', class: 'bg-accent text-muted-foreground' },
  FAILED: { key: 'payment.status.failed', class: 'bg-red-500/10 text-red-400' },
  REFUND_REQUESTED: { key: 'payment.status.refund_requested', class: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  REFUNDING: { key: 'payment.status.refunding', class: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  REFUNDED: { key: 'payment.status.refunded', class: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  PARTIALLY_REFUNDED: { key: 'payment.status.partially_refunded', class: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  REFUND_FAILED: { key: 'payment.status.refund_failed', class: 'bg-red-500/10 text-red-400' },
}

const statusLabel = computed(() => {
  const entry = statusMap[props.status]
  return entry ? t(entry.key) : props.status
})

const statusClass = computed(() => {
  const entry = statusMap[props.status]
  return entry?.class ?? 'bg-accent text-muted-foreground'
})
</script>
