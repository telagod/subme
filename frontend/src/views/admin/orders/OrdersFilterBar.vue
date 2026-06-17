<template>
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <!-- 搜索框 -->
    <div
      class="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2.5 py-1.5 min-w-[220px] text-muted-foreground transition-colors"
      :class="focused ? 'border-ring ring-1 ring-ring' : ''"
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" class="shrink-0"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.2"/><path d="M9 9L11.5 11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <Input
        :value="search"
        class="flex-1 border-0 bg-transparent p-0 text-[12.5px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-auto placeholder:text-muted-foreground"
        placeholder="搜索订单号 / 用户…"
        @focus="focused = true"
        @blur="focused = false"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- 状态 -->
    <div class="relative">
      <Button
        variant="outline"
        size="sm"
        class="flex items-center gap-1 text-xs font-normal"
        :class="status ? 'border-ring/50 text-primary' : 'text-muted-foreground'"
        @click.stop="showStatus = !showStatus; showPayType = false; showOrderType = false"
      >
        状态 <b class="text-foreground font-semibold">{{ statusLabel }}</b>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </Button>
      <div v-if="showStatus" class="absolute top-[calc(100%+4px)] left-0 min-w-[140px] bg-popover border border-border rounded-lg p-1 z-[100] shadow-lg" @click.stop>
        <Button
          v-for="opt in statusOptions"
          :key="opt.value"
          variant="ghost"
          size="sm"
          class="w-full justify-start text-xs font-normal"
          :class="status === opt.value ? 'text-primary font-semibold' : 'text-muted-foreground'"
          @click="$emit('update:status', opt.value); showStatus = false"
        >{{ opt.label }}</Button>
      </div>
    </div>

    <!-- 支付方式 -->
    <div class="relative">
      <Button
        variant="outline"
        size="sm"
        class="flex items-center gap-1 text-xs font-normal"
        :class="payType ? 'border-ring/50 text-primary' : 'text-muted-foreground'"
        @click.stop="showPayType = !showPayType; showStatus = false; showOrderType = false"
      >
        支付 <b class="text-foreground font-semibold">{{ payTypeLabel }}</b>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </Button>
      <div v-if="showPayType" class="absolute top-[calc(100%+4px)] left-0 min-w-[140px] bg-popover border border-border rounded-lg p-1 z-[100] shadow-lg" @click.stop>
        <Button
          v-for="opt in payTypeOptions"
          :key="opt.value"
          variant="ghost"
          size="sm"
          class="w-full justify-start text-xs font-normal"
          :class="payType === opt.value ? 'text-primary font-semibold' : 'text-muted-foreground'"
          @click="$emit('update:payType', opt.value); showPayType = false"
        >{{ opt.label }}</Button>
      </div>
    </div>

    <!-- 订单类型 -->
    <div class="relative">
      <Button
        variant="outline"
        size="sm"
        class="flex items-center gap-1 text-xs font-normal"
        :class="orderType ? 'border-ring/50 text-primary' : 'text-muted-foreground'"
        @click.stop="showOrderType = !showOrderType; showStatus = false; showPayType = false"
      >
        类型 <b class="text-foreground font-semibold">{{ orderTypeLabel }}</b>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </Button>
      <div v-if="showOrderType" class="absolute top-[calc(100%+4px)] left-0 min-w-[140px] bg-popover border border-border rounded-lg p-1 z-[100] shadow-lg" @click.stop>
        <Button
          v-for="opt in orderTypeOptions"
          :key="opt.value"
          variant="ghost"
          size="sm"
          class="w-full justify-start text-xs font-normal"
          :class="orderType === opt.value ? 'text-primary font-semibold' : 'text-muted-foreground'"
          @click="$emit('update:orderType', opt.value); showOrderType = false"
        >{{ opt.label }}</Button>
      </div>
    </div>

    <!-- 清空 -->
    <Button
      v-if="hasFilters"
      variant="outline"
      size="sm"
      class="text-xs font-normal border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
      @click="$emit('clear')"
    >清空筛选</Button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const props = defineProps<{
  search: string
  status: string
  payType: string
  orderType: string
}>()

defineEmits<{
  'update:search': [v: string]
  'update:status': [v: string]
  'update:payType': [v: string]
  'update:orderType': [v: string]
  'clear': []
}>()

const focused = ref(false)
const showStatus = ref(false)
const showPayType = ref(false)
const showOrderType = ref(false)

const statusOptions = computed(() => [
  { value: '', label: '全部状态' },
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

const payTypeOptions = computed(() => [
  { value: '', label: t('payment.admin.allPaymentTypes') },
  { value: 'alipay', label: t('payment.methods.alipay') },
  { value: 'wxpay', label: t('payment.methods.wxpay') },
  { value: 'stripe', label: t('payment.methods.stripe') },
  { value: 'airwallex', label: t('payment.methods.airwallex') },
])

const orderTypeOptions = computed(() => [
  { value: '', label: t('payment.admin.allOrderTypes') },
  { value: 'balance', label: t('payment.admin.balanceOrder') },
  { value: 'subscription', label: t('payment.admin.subscriptionOrder') },
])

const statusLabel = computed(() => statusOptions.value.find(o => o.value === props.status)?.label ?? '全部')
const payTypeLabel = computed(() => payTypeOptions.value.find(o => o.value === props.payType)?.label ?? '全部')
const orderTypeLabel = computed(() => orderTypeOptions.value.find(o => o.value === props.orderType)?.label ?? '全部')
const hasFilters = computed(() => !!(props.search || props.status || props.payType || props.orderType))

function onDocClick() { showStatus.value = false; showPayType.value = false; showOrderType.value = false }
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>
