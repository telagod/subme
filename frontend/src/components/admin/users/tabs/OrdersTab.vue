<template>
  <div class="flex flex-col gap-2.5">
    <div v-if="loading" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.loading') }}</div>
    <div v-else-if="error" class="text-[12.5px] text-destructive">{{ error }}</div>
    <div v-else-if="!items.length" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.noOrders') }}</div>
    <div v-else class="flex flex-col gap-2">
      <div v-for="order in items" :key="order.id" class="flex flex-col gap-1.5 rounded-[10px] border border-border bg-muted/40 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs text-foreground">{{ order.out_trade_no || ('#' + order.id) }}</span>
          <Badge
            variant="outline"
            :class="statusClass(order.status)"
          >{{ order.status }}</Badge>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-medium text-emerald-500">${{ (order.amount / 100).toFixed(2) }}</span>
          <span class="text-xs text-muted-foreground" v-if="order.payment_type">{{ order.payment_type }}</span>
          <span class="text-xs text-muted-foreground">{{ fmt(order.created_at) }}</span>
        </div>
      </div>
    </div>
    <div v-if="total > items.length" class="text-center text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.totalCountPartial', { total, shown: items.length }) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { adminAPI } from '@/api/admin'
import type { AdminUser } from '@/types'
import type { PaymentOrder } from '@/types/payment'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser; active: boolean }>()

const loading = ref(false)
const error = ref<string | null>(null)
const items = ref<PaymentOrder[]>([])
const total = ref(0)
const loaded = ref(false)

function fmt(iso: string | null | undefined) { return iso ? formatDateTime(iso) : '-' }
function statusClass(s: string) {
  if (s === 'paid' || s === 'completed') return 'ud-badge-ok'
  if (s === 'pending') return 'ud-badge-warn'
  return 'ud-badge-bad'
}

async function load() {
  if (loaded.value) return
  loading.value = true; error.value = null
  try {
    const res = await adminAPI.payment.getOrders({ user_id: props.user.id, page: 1, page_size: 20 })
    // getOrders returns AxiosResponse — unwrap .data
    const payload = (res as any).data ?? res
    items.value = payload?.items ?? []; total.value = payload?.total ?? 0; loaded.value = true
  } catch { error.value = t('admin.userTabs.loadFailed') } finally { loading.value = false }
}

watch(() => props.active, (v) => { if (v) load() })
onMounted(() => { if (props.active) load() })
</script>

<style scoped>
/* 状态色 — 由 statusClass() 动态绑定，必须保留 */
.ud-badge-ok   { background: rgba(70, 201, 140, .15); color: #46C98C; border-color: rgba(70, 201, 140, .3); }
.ud-badge-warn { background: rgba(224, 179, 78, .15);  color: #E0B34E; border-color: rgba(224, 179, 78, .3); }
.ud-badge-bad  { background: rgba(242, 92, 105, .15);  color: #F25C69; border-color: rgba(242, 92, 105, .3); }
</style>
