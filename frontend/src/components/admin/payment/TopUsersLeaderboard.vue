<template>
  <Card>
    <CardContent class="p-5">
      <h3 class="mb-3.5 text-[13px] font-semibold text-foreground">{{ t('payment.admin.topUsers') }}</h3>
      <div v-if="!users?.length" class="flex items-center justify-center text-[13px] text-muted-foreground" style="min-height:120px">
        {{ t('payment.admin.noData') }}
      </div>
      <div v-else>
        <div v-for="(user, idx) in users" :key="user.user_id" class="flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors hover:bg-muted">
          <div class="flex items-center gap-2.5">
            <span :class="['flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold shrink-0', rankClass(idx)]">{{ idx + 1 }}</span>
            <span class="text-[12.5px] text-foreground">{{ user.email }}</span>
          </div>
          <span class="font-mono tabular-nums text-[12.5px] text-foreground">${{ user.amount.toFixed(2) }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Card, CardContent } from '@/components/ui/card'

const { t } = useI18n()

defineProps<{
  users: { user_id: number; email: string; amount: number }[]
}>()

// rank 1/3: --warn-dim + --warn（琥珀金奖牌）
// rank 2:   --bg-2 + --ink-1（钢银）
// rest:     transparent + --ink-2（弱化）
function rankClass(idx: number): string {
  if (idx === 0) return 'oq-rank-gold'
  if (idx === 1) return 'oq-rank-silver'
  if (idx === 2) return 'oq-rank-gold'
  return 'oq-rank-dim'
}
</script>

<style scoped>
/* rank badge colours — script-driven class names, no QUENCH vars */
.oq-rank-gold   { background: rgba(224, 179, 78, 0.15); color: #E0B34E; }
.oq-rank-silver { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.oq-rank-dim    { background: transparent; color: hsl(var(--muted-foreground)); }
</style>
