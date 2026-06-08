<template>
  <div class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] font-medium font-mono tabular-nums">
    <span :class="concurrencyClass" :title="`${t('admin.accounts.columns.capacity')}: ${currentConcurrency}/${account.concurrency}`">C{{ currentConcurrency }}/{{ account.concurrency }}</span>
    <template v-if="showWindowCost">
      <span class="text-muted-foreground/40">·</span>
      <span :class="windowCostClass" :title="windowCostTooltip">${{ fmtCost(currentWindowCost) }}/${{ fmtCost(account.window_cost_limit) }}</span>
    </template>
    <template v-if="showSessionLimit">
      <span class="text-muted-foreground/40">·</span>
      <span :class="sessionLimitClass" :title="sessionLimitTooltip">S{{ activeSessions }}/{{ account.max_sessions }}</span>
    </template>
    <template v-if="showRpmLimit">
      <span class="text-muted-foreground/40">·</span>
      <span :class="rpmClass" :title="rpmTooltip">R{{ currentRPM }}/{{ account.base_rpm }}{{ rpmStrategyTag }}</span>
    </template>
    <template v-if="showDailyQuota">
      <span class="text-muted-foreground/40">·</span>
      <span :class="quotaClass(account.quota_daily_used, account.quota_daily_limit)" :title="`Daily: $${fmtCost(account.quota_daily_used)}/$${fmtCost(account.quota_daily_limit)}`">D${{ fmtCost(account.quota_daily_used) }}/${{ fmtCost(account.quota_daily_limit) }}</span>
    </template>
    <template v-if="showWeeklyQuota">
      <span class="text-muted-foreground/40">·</span>
      <span :class="quotaClass(account.quota_weekly_used, account.quota_weekly_limit)" :title="`Weekly: $${fmtCost(account.quota_weekly_used)}/$${fmtCost(account.quota_weekly_limit)}`">W${{ fmtCost(account.quota_weekly_used) }}/${{ fmtCost(account.quota_weekly_limit) }}</span>
    </template>
    <template v-if="showTotalQuota">
      <span class="text-muted-foreground/40">·</span>
      <span :class="quotaClass(account.quota_used, account.quota_limit)" :title="`Total: $${fmtCost(account.quota_used)}/$${fmtCost(account.quota_limit)}`">${{ fmtCost(account.quota_used) }}/${{ fmtCost(account.quota_limit) }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '@/types'

const props = defineProps<{ account: Account }>()
const { t } = useI18n()

const fmtCost = (v: number | null | undefined) => {
  if (v == null) return '0'
  return v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2)
}

const thresholdClass = (current: number, max: number) => {
  const ratio = max > 0 ? current / max : 0
  if (ratio >= 1) return 'text-red-400'
  if (ratio >= 0.8) return 'text-amber-400'
  if (current > 0) return 'text-foreground/85'
  return 'text-muted-foreground'
}

const quotaClass = (used: number | null | undefined, limit: number | null | undefined) => {
  return thresholdClass(used ?? 0, limit ?? 0)
}

const currentConcurrency = computed(() => props.account.current_concurrency || 0)
const concurrencyClass = computed(() => thresholdClass(currentConcurrency.value, props.account.concurrency))

const isAnthropicOAuthOrSetupToken = computed(() =>
  props.account.platform === 'anthropic' && (props.account.type === 'oauth' || props.account.type === 'setup-token')
)

const showWindowCost = computed(() => isAnthropicOAuthOrSetupToken.value && (props.account.window_cost_limit ?? 0) > 0)
const currentWindowCost = computed(() => props.account.current_window_cost ?? 0)
const windowCostClass = computed(() => {
  if (!showWindowCost.value) return ''
  const limit = props.account.window_cost_limit || 0
  const reserve = props.account.window_cost_sticky_reserve || 10
  if (currentWindowCost.value >= limit + reserve) return 'text-red-400'
  if (currentWindowCost.value >= limit) return 'text-orange-400'
  if (currentWindowCost.value >= limit * 0.8) return 'text-amber-400'
  return 'text-emerald-400'
})
const windowCostTooltip = computed(() => {
  if (!showWindowCost.value) return ''
  const current = currentWindowCost.value
  const limit = props.account.window_cost_limit || 0
  const reserve = props.account.window_cost_sticky_reserve || 10
  if (current >= limit + reserve) return t('admin.accounts.capacity.windowCost.blocked')
  if (current >= limit) return t('admin.accounts.capacity.windowCost.stickyOnly')
  return t('admin.accounts.capacity.windowCost.normal')
})

const showSessionLimit = computed(() => isAnthropicOAuthOrSetupToken.value && (props.account.max_sessions ?? 0) > 0)
const activeSessions = computed(() => props.account.active_sessions ?? 0)
const sessionLimitClass = computed(() => thresholdClass(activeSessions.value, props.account.max_sessions || 0))
const sessionLimitTooltip = computed(() => {
  if (!showSessionLimit.value) return ''
  const idle = props.account.session_idle_timeout_minutes || 5
  if (activeSessions.value >= (props.account.max_sessions || 0)) return t('admin.accounts.capacity.sessions.full', { idle })
  return t('admin.accounts.capacity.sessions.normal', { idle })
})

const showRpmLimit = computed(() => isAnthropicOAuthOrSetupToken.value && (props.account.base_rpm ?? 0) > 0)
const currentRPM = computed(() => props.account.current_rpm ?? 0)
const rpmStrategy = computed(() => props.account.rpm_strategy || 'tiered')
const rpmStrategyTag = computed(() => rpmStrategy.value === 'sticky_exempt' ? 'S' : 'T')
const rpmBuffer = computed(() => {
  const base = props.account.base_rpm || 0
  return props.account.rpm_sticky_buffer ?? (base > 0 ? Math.max(1, Math.floor(base / 5)) : 0)
})
const rpmClass = computed(() => {
  if (!showRpmLimit.value) return ''
  const current = currentRPM.value
  const base = props.account.base_rpm ?? 0
  const buffer = rpmBuffer.value
  if (rpmStrategy.value === 'tiered') {
    if (current >= base + buffer) return 'text-red-400'
    if (current >= base) return 'text-orange-400'
  } else {
    if (current >= base) return 'text-orange-400'
  }
  if (current >= base * 0.8) return 'text-amber-400'
  return 'text-emerald-400'
})
const rpmTooltip = computed(() => {
  if (!showRpmLimit.value) return ''
  const current = currentRPM.value
  const base = props.account.base_rpm ?? 0
  const buffer = rpmBuffer.value
  if (rpmStrategy.value === 'tiered') {
    if (current >= base + buffer) return t('admin.accounts.capacity.rpm.tieredBlocked', { buffer })
    if (current >= base) return t('admin.accounts.capacity.rpm.tieredStickyOnly', { buffer })
    return t('admin.accounts.capacity.rpm.tieredNormal')
  }
  if (current >= base) return t('admin.accounts.capacity.rpm.stickyExemptOver')
  return t('admin.accounts.capacity.rpm.stickyExemptNormal')
})

const isQuotaEligible = computed(() => props.account.type === 'apikey' || props.account.type === 'bedrock')
const showDailyQuota = computed(() => isQuotaEligible.value && (props.account.quota_daily_limit ?? 0) > 0)
const showWeeklyQuota = computed(() => isQuotaEligible.value && (props.account.quota_weekly_limit ?? 0) > 0)
const showTotalQuota = computed(() => isQuotaEligible.value && (props.account.quota_limit ?? 0) > 0)
</script>
