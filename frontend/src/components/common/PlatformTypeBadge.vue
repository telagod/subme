<template>
  <!-- Compact mode: single-line tiny pills -->
  <div v-if="compact" class="inline-flex items-center gap-0.5 flex-wrap">
    <span :class="['inline-block text-[9px] leading-tight font-medium px-1 py-0 rounded', compactPlatformClass]">{{ compactPlatformLabel }}</span>
    <span :class="['inline-block text-[9px] leading-tight font-medium px-1 py-0 rounded', compactTypeClass]">{{ compactTypeLabel }}</span>
    <span v-if="planLabel" :class="['inline-block text-[9px] leading-tight font-medium px-1 py-0 rounded', compactPlanClass]">{{ planLabel }}</span>
    <span v-if="privacyBadge" class="text-[9px] leading-tight" :title="privacyBadge.title">🔒</span>
  </div>
  <!-- Full mode: existing two-row badge blocks -->
  <div v-else class="inline-flex flex-col gap-0.5 text-xs font-medium">
    <!-- Row 1: Platform + Type -->
    <div class="inline-flex items-center overflow-hidden rounded-md">
      <span :class="['inline-flex items-center gap-1 px-2 py-1', platformClass]">
        <PlatformIcon :platform="platform" size="xs" />
        <span>{{ platformLabel }}</span>
      </span>
      <span :class="['inline-flex items-center gap-1 px-1.5 py-1', typeClass]">
        <!-- OAuth icon -->
        <svg
          v-if="type === 'oauth'"
          class="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        <!-- Setup Token icon -->
        <Icon v-else-if="type === 'setup-token'" name="shield" size="xs" />
        <!-- API Key icon -->
        <Icon v-else-if="type === 'service_account'" name="cloud" size="xs" />
        <Icon v-else name="key" size="xs" />
        <span>{{ typeLabel }}</span>
      </span>
    </div>
    <!-- Row 2: Plan type + Privacy mode (only if either exists) -->
    <div v-if="planLabel || privacyBadge" class="inline-flex items-center overflow-hidden rounded-md">
      <span v-if="planLabel" :class="['inline-flex items-center gap-1 px-1.5 py-1', planBadgeClass]">
        <span>{{ planLabel }}</span>
      </span>
      <span
        v-if="privacyBadge"
        :class="['inline-flex items-center gap-1 px-1.5 py-1', privacyBadge.class]"
        :title="privacyBadge.title"
      >
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" :d="privacyBadge.icon" />
        </svg>
        <span>{{ privacyBadge.label }}</span>
      </span>
    </div>
    <!-- Row 3: Subscription expiration (non-free paid accounts only) -->
    <div v-if="expiresLabel" class="text-[10px] leading-tight text-muted-foreground pl-0.5" :title="subscriptionExpiresAt">
      {{ expiresLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AccountPlatform, AccountType } from '@/types'
import PlatformIcon from './PlatformIcon.vue'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()

interface Props {
  platform: AccountPlatform
  type: AccountType
  planType?: string
  privacyMode?: string
  subscriptionExpiresAt?: string
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
})

const platformLabel = computed(() => {
  if (props.platform === 'anthropic') return 'Anthropic'
  if (props.platform === 'openai') return 'OpenAI'
  if (props.platform === 'antigravity') return 'Antigravity'
  return 'Gemini'
})

// Compact mode: abbreviated labels
const compactPlatformLabel = computed(() => {
  if (props.platform === 'anthropic') return 'ANT'
  if (props.platform === 'openai') return 'OAI'
  if (props.platform === 'antigravity') return 'AG'
  return 'GEM'
})

const compactTypeLabel = computed(() => {
  switch (props.type) {
    case 'oauth': return 'OAuth'
    case 'setup-token': return 'ST'
    case 'apikey': return 'Key'
    case 'bedrock': return 'BR'
    case 'service_account': return 'SA'
    default: return props.type
  }
})

const compactPlatformClass = computed(() => {
  if (props.platform === 'anthropic') return 'bg-orange-900/30 text-orange-400'
  if (props.platform === 'openai') return 'bg-emerald-500/10 text-emerald-400'
  if (props.platform === 'antigravity') return 'bg-purple-900/30 text-purple-400'
  return 'bg-sky-500/10 text-sky-400'
})

const compactTypeClass = computed(() => {
  if (props.platform === 'anthropic') return 'bg-orange-900/20 text-orange-300'
  if (props.platform === 'openai') return 'bg-emerald-500/10 text-emerald-300'
  if (props.platform === 'antigravity') return 'bg-purple-900/20 text-purple-300'
  return 'bg-sky-500/10 text-sky-300'
})

const compactPlanClass = computed(() => {
  if (props.planType && props.planType.toLowerCase() === 'abnormal') return 'bg-red-500/10 text-red-400'
  return compactTypeClass.value
})

const typeLabel = computed(() => {
  switch (props.type) {
    case 'oauth':
      return 'OAuth'
    case 'setup-token':
      return 'Token'
    case 'apikey':
      return 'Key'
    case 'bedrock':
      return 'AWS'
    case 'service_account':
      return 'Vertex'
    default:
      return props.type
  }
})

const planLabel = computed(() => {
  if (!props.planType) return ''
  const lower = props.planType.toLowerCase()
  switch (lower) {
    case 'plus':
      return 'Plus'
    case 'team':
      return 'Team'
    case 'chatgptpro':
    case 'pro':
      return 'Pro'
    case 'free':
      return 'Free'
    case 'abnormal':
      return t('admin.accounts.subscriptionAbnormal')
    default:
      return props.planType
  }
})

const platformClass = computed(() => {
  if (props.platform === 'anthropic') {
    return 'bg-orange-900/30 text-orange-400'
  }
  if (props.platform === 'openai') {
    return 'bg-emerald-500/10 text-emerald-400'
  }
  if (props.platform === 'antigravity') {
    return 'bg-purple-900/30 text-purple-400'
  }
  return 'bg-sky-500/10 text-sky-400'
})

const typeClass = computed(() => {
  if (props.platform === 'anthropic') {
    return 'bg-orange-900/30 text-orange-400  '
  }
  if (props.platform === 'openai') {
    return 'bg-emerald-500/10 text-emerald-400'
  }
  if (props.platform === 'antigravity') {
    return 'bg-purple-900/30 text-purple-400  '
  }
  return 'bg-sky-500/10 text-sky-400'
})

const planBadgeClass = computed(() => {
  if (props.planType && props.planType.toLowerCase() === 'abnormal') {
    return 'bg-red-500/10 text-red-400'
  }
  return typeClass.value
})

// Subscription expiration label (non-free only)
const expiresLabel = computed(() => {
  if (!props.subscriptionExpiresAt || !props.planType) return ''
  if (props.planType.toLowerCase() === 'free') return ''
  try {
    const d = new Date(props.subscriptionExpiresAt)
    if (isNaN(d.getTime())) return ''
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${t('admin.accounts.subscriptionExpires')} ${yyyy}-${mm}-${dd}`
  } catch {
    return ''
  }
})

// Privacy badge — shows different states for OpenAI/Antigravity OAuth privacy setting
const privacyBadge = computed(() => {
  if (props.type !== 'oauth' || !props.privacyMode) return null
  // 支持 OpenAI 和 Antigravity 平台
  if (props.platform !== 'openai' && props.platform !== 'antigravity') return null

  const shieldCheck = 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z'
  const shieldX = 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285zM12 18h.008v.008H12V18z'
  switch (props.privacyMode) {
    // OpenAI states
    case 'training_off':
      return { label: 'Private', icon: shieldCheck, title: t('admin.accounts.privacyTrainingOff'), class: 'bg-emerald-500/10 text-emerald-400' }
    case 'training_set_cf_blocked':
      return { label: 'CF', icon: shieldX, title: t('admin.accounts.privacyCfBlocked'), class: 'bg-amber-500/10 text-amber-400' }
    case 'training_set_failed':
      return { label: 'Fail', icon: shieldX, title: t('admin.accounts.privacyFailed'), class: 'bg-red-500/10 text-red-400' }
    // Antigravity states
    case 'privacy_set':
      return { label: 'Private', icon: shieldCheck, title: t('admin.accounts.privacyAntigravitySet'), class: 'bg-emerald-500/10 text-emerald-400' }
    case 'privacy_set_failed':
      return { label: 'Fail', icon: shieldX, title: t('admin.accounts.privacyAntigravityFailed'), class: 'bg-red-500/10 text-red-400' }
    default:
      return null
  }
})
</script>
