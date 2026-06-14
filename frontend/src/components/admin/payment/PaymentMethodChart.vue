<template>
  <Card class="rounded-xl">
    <CardContent class="px-5 py-[18px]">
      <h3 class="mb-3.5 text-[13px] font-semibold text-foreground">{{ t('payment.admin.paymentDistribution') }}</h3>
      <div v-if="!methods?.length" class="flex items-center justify-center text-[13px] text-muted-foreground" style="min-height:120px">
        {{ t('payment.admin.noData') }}
      </div>
      <div v-else>
        <div v-for="method in methods" :key="method.type" class="mb-3 flex flex-col gap-1 last:mb-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-[12.5px] text-foreground">
              <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: dotColor(method.type) }"></span>
              {{ t('payment.methods.' + method.type, method.type) }}
            </div>
            <div class="flex items-center gap-1.5">
              <span class="font-mono tabular-nums text-[12.5px] text-foreground">${{ method.amount.toFixed(2) }}</span>
              <span class="text-[11px] text-muted-foreground">({{ method.count }})</span>
            </div>
          </div>
          <div class="h-1 overflow-hidden rounded-sm bg-muted">
            <div class="h-full rounded-sm transition-[width] duration-500 ease-in-out" :style="{ width: barWidth(method.amount) + '%', background: dotColor(method.type) }"></div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent } from '@/components/ui/card'

const { t } = useI18n()

const props = defineProps<{
  methods: { type: string; amount: number; count: number }[]
}>()

// --azure: #5CA8FF  → alipay（主系蓝）
// --ok:    #46C98C  → wxpay（绿）
// #2E6FB8           → alipay_direct（深蓝，mockup .bar-fill）
// #3DAF7A           → wxpay_direct（深绿降级）
// --ink-1: #97A0AF  → stripe（钢银次系）
// --warn:  #E0B34E  → airwallex（琥珀）
const METHOD_COLORS: Record<string, string> = {
  alipay:        '#5CA8FF',  // --azure
  wxpay:         '#46C98C',  // --ok
  alipay_direct: '#2E6FB8',  // mockup deep-blue
  wxpay_direct:  '#3DAF7A',  // ok deep-green
  stripe:        '#97A0AF',  // --ink-1 钢银
  airwallex:     '#E0B34E',  // --warn
}

const maxAmount = computed(() => {
  if (!props.methods?.length) return 1
  return Math.max(...props.methods.map(m => m.amount), 1)
})

function dotColor(type: string): string {
  return METHOD_COLORS[type] || '#5C6470'  // fallback --ink-2
}

function barWidth(amount: number): number {
  return Math.min((amount / maxAmount.value) * 100, 100)
}
</script>
