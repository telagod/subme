<template>
  <div class="flex items-center gap-1.5">
    <!-- Main status badge (absorbs 429/529 countdown) -->
    <button
      v-if="isTempUnschedulable"
      type="button"
      :class="['badge text-[10px]', statusClass, 'cursor-pointer']"
      :title="t('admin.accounts.status.viewTempUnschedDetails')"
      @click="handleTempUnschedClick"
    >{{ statusText }}</button>
    <span v-else-if="isRateLimited" class="badge text-[10px] badge-warning" :title="t('admin.accounts.status.rateLimitedUntil', { time: formatDateTime(account.rate_limit_reset_at) })">
      429 {{ rateLimitCountdown }}
    </span>
    <span v-else-if="isOverloaded" class="badge text-[10px] badge-danger" :title="t('admin.accounts.status.overloadedUntil', { time: formatTime(account.overload_until) })">
      529 {{ overloadCountdown }}
    </span>
    <span v-else :class="['badge text-[10px]', statusClass]">{{ statusText }}</span>

    <!-- Error tooltip -->
    <div v-if="hasError && account.error_message" class="group/error relative">
      <svg class="h-3.5 w-3.5 cursor-help text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <div class="invisible absolute left-0 top-full z-[100] mt-1 min-w-[180px] max-w-[280px] rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[10px] text-foreground/85 opacity-0 transition-all group-hover/error:visible group-hover/error:opacity-100">
        <div class="whitespace-pre-wrap break-words leading-relaxed">{{ account.error_message }}</div>
      </div>
    </div>

    <!-- Model rate limit dots -->
    <div v-if="activeModelStatuses.length > 0" class="group/models relative flex items-center gap-0.5">
      <span
        v-for="item in activeModelStatuses"
        :key="`${item.kind}-${item.model}`"
        :class="['inline-block h-1.5 w-1.5 rounded-full', dotColor(item.kind)]"
      />
      <!-- Tooltip with full model details -->
      <div class="invisible absolute left-0 top-full z-[100] mt-1 min-w-[160px] rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[10px] opacity-0 transition-all group-hover/models:visible group-hover/models:opacity-100">
        <div v-for="item in activeModelStatuses" :key="`tip-${item.model}`" class="flex items-center justify-between gap-3 py-0.5">
          <span class="font-medium text-foreground/85">{{ formatScopeName(item.model) }}</span>
          <span class="text-muted-foreground tabular-nums">{{ formatModelResetTime(item.reset_at) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '@/types'
import { formatCountdown, formatDateTime, formatCountdownWithSuffix, formatTime } from '@/utils/format'

const { t } = useI18n()
const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ (e: 'show-temp-unsched', account: Account): void }>()

const isRateLimited = computed(() => {
  if (!props.account.rate_limit_reset_at) return false
  return new Date(props.account.rate_limit_reset_at) > new Date()
})

const isOverloaded = computed(() => {
  if (!props.account.overload_until) return false
  return new Date(props.account.overload_until) > new Date()
})

const isTempUnschedulable = computed(() => {
  if (!props.account.temp_unschedulable_until) return false
  return new Date(props.account.temp_unschedulable_until) > new Date()
})

const hasError = computed(() => props.account.status === 'error')

const isQuotaExceeded = computed(() => {
  const exceeded = (used?: number | null, limit?: number | null) =>
    typeof limit === 'number' && limit > 0 && typeof used === 'number' && used >= limit
  return exceeded(props.account.quota_used, props.account.quota_limit) ||
    exceeded(props.account.quota_daily_used, props.account.quota_daily_limit) ||
    exceeded(props.account.quota_weekly_used, props.account.quota_weekly_limit)
})

const rateLimitCountdown = computed(() => formatCountdown(props.account.rate_limit_reset_at))
const overloadCountdown = computed(() => formatCountdownWithSuffix(props.account.overload_until))

const statusClass = computed(() => {
  if (hasError.value) return 'badge-danger'
  if (isTempUnschedulable.value) return 'badge-warning'
  if (props.account.status !== 'active') return props.account.status === 'error' ? 'badge-danger' : 'badge-gray'
  if (isQuotaExceeded.value) return 'badge-warning'
  if (!props.account.schedulable) return 'badge-gray'
  return 'badge-success'
})

const statusText = computed(() => {
  if (hasError.value) return t('admin.accounts.status.error')
  if (isTempUnschedulable.value) return t('admin.accounts.status.tempUnschedulable')
  if (props.account.status !== 'active') return t(`admin.accounts.status.${props.account.status}`)
  if (isQuotaExceeded.value) return t('admin.accounts.status.quotaExceeded')
  if (!props.account.schedulable) return t('admin.accounts.status.paused')
  return t(`admin.accounts.status.${props.account.status}`)
})

type ModelStatusItem = { kind: 'rate_limit' | 'credits_exhausted' | 'credits_active'; model: string; reset_at: string }

const activeModelStatuses = computed<ModelStatusItem[]>(() => {
  const extra = props.account.extra as Record<string, unknown> | undefined
  const modelLimits = extra?.model_rate_limits as Record<string, { rate_limit_reset_at: string }> | undefined
  if (!modelLimits) return []
  const now = new Date()
  const allowOverages = !!(extra?.allow_overages)
  const aiCreditsEntry = modelLimits['AICredits']
  const hasActiveAICredits = aiCreditsEntry && new Date(aiCreditsEntry.rate_limit_reset_at) > now
  const items: ModelStatusItem[] = []
  for (const [model, info] of Object.entries(modelLimits)) {
    if (new Date(info.rate_limit_reset_at) <= now) continue
    if (model === 'AICredits') items.push({ kind: 'credits_exhausted', model, reset_at: info.rate_limit_reset_at })
    else if (allowOverages && !hasActiveAICredits) items.push({ kind: 'credits_active', model, reset_at: info.rate_limit_reset_at })
    else items.push({ kind: 'rate_limit', model, reset_at: info.rate_limit_reset_at })
  }
  return items
})

const dotColor = (kind: string) => ({
  credits_exhausted: 'bg-red-400',
  credits_active: 'bg-amber-400',
  rate_limit: 'bg-primary-300'
}[kind] || 'bg-muted-foreground')

const formatScopeName = (scope: string): string => {
  const aliases: Record<string, string> = {
    'claude-opus-4-6': 'COpus46', 'claude-opus-4-7': 'COpus47', 'claude-opus-4-8': 'COpus48',
    'claude-sonnet-4-6': 'CSon46', 'claude-sonnet-4-5': 'CSon45',
    'gemini-2.5-flash': 'G25F', 'gemini-2.5-pro': 'G25P', 'gemini-3.5-flash': 'G35F',
    'gemini-3-flash': 'G3F', 'gemini-3.1-pro-high': 'G3PH',
    claude: 'Claude', claude_sonnet: 'CSon', claude_opus: 'COpus',
  }
  return aliases[scope] || scope
}

const formatModelResetTime = (resetAt: string): string => {
  const diffMs = new Date(resetAt).getTime() - Date.now()
  if (diffMs <= 0) return ''
  const h = Math.floor(diffMs / 3600000)
  const m = Math.floor((diffMs % 3600000) / 60000)
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

const handleTempUnschedClick = () => {
  if (isTempUnschedulable.value) emit('show-temp-unsched', props.account)
}
</script>
