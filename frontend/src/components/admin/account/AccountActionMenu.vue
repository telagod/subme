<template>
  <Teleport to="body">
    <div v-if="show && position">
      <!-- Backdrop: click anywhere outside to close -->
      <div class="fixed inset-0 z-[9998]" @click="emit('close')"></div>
      <div
        class="action-menu-content fixed z-[9999] w-52 overflow-hidden rounded-md border border-border bg-card "
        :style="{ top: position.top + 'px', left: position.left + 'px' }"
        @click.stop
      >
        <div class="py-1">
          <template v-if="account">
            <Button variant="ghost" @click="$emit('test', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="play" size="sm" class="text-muted-foreground" :stroke-width="2" />
              {{ t('admin.accounts.testConnection') }}
            </Button>
            <Button variant="ghost" @click="$emit('stats', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="chart" size="sm" class="text-muted-foreground" />
              {{ t('admin.accounts.viewStats') }}
            </Button>
            <Button variant="ghost" @click="$emit('schedule', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="clock" size="sm" class="text-muted-foreground" />
              {{ t('admin.scheduledTests.schedule') }}
            </Button>
            <template v-if="account.type === 'oauth' || account.type === 'setup-token'">
              <Button variant="ghost" @click="$emit('reauth', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
                <Icon name="link" size="sm" class="text-muted-foreground" />
                {{ t('admin.accounts.reAuthorize') }}
              </Button>
              <Button variant="ghost" @click="$emit('refresh-token', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
                <Icon name="refresh" size="sm" class="text-muted-foreground" />
                {{ t('admin.accounts.refreshToken') }}
              </Button>
            </template>
            <Button v-if="supportsPrivacy" variant="ghost" @click="$emit('set-privacy', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="shield" size="sm" class="text-muted-foreground" />
              {{ t('admin.accounts.setPrivacy') }}
            </Button>
            <div v-if="hasRecoverableState" class="my-1 border-t border-border"></div>
            <Button v-if="hasRecoverableState" variant="ghost" @click="$emit('recover-state', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="sync" size="sm" class="text-muted-foreground" />
              {{ t('admin.accounts.recoverState') }}
            </Button>
            <Button v-if="hasQuotaLimit" variant="ghost" @click="$emit('reset-quota', account); $emit('close')" class="flex w-full items-center justify-start gap-2 px-4 py-2 text-sm text-foreground/85 hover:bg-accent h-auto rounded-none">
              <Icon name="refresh" size="sm" class="text-muted-foreground" />
              {{ t('admin.accounts.resetQuota') }}
            </Button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { Account } from '@/types'

const props = defineProps<{ show: boolean; account: Account | null; position: { top: number; left: number } | null }>()
const emit = defineEmits(['close', 'test', 'stats', 'schedule', 'reauth', 'refresh-token', 'recover-state', 'reset-quota', 'set-privacy'])
const { t } = useI18n()
const isRateLimited = computed(() => {
  if (props.account?.rate_limit_reset_at && new Date(props.account.rate_limit_reset_at) > new Date()) {
    return true
  }
  const modelLimits = (props.account?.extra as Record<string, unknown> | undefined)?.model_rate_limits as
    | Record<string, { rate_limit_reset_at: string }>
    | undefined
  if (modelLimits) {
    const now = new Date()
    return Object.values(modelLimits).some(info => new Date(info.rate_limit_reset_at) > now)
  }
  return false
})
const isOverloaded = computed(() => props.account?.overload_until && new Date(props.account.overload_until) > new Date())
const isTempUnschedulable = computed(() => props.account?.temp_unschedulable_until && new Date(props.account.temp_unschedulable_until) > new Date())
const hasRecoverableState = computed(() => {
  return props.account?.status === 'error' || Boolean(isRateLimited.value) || Boolean(isOverloaded.value) || Boolean(isTempUnschedulable.value)
})
const isAntigravityOAuth = computed(() => props.account?.platform === 'antigravity' && props.account?.type === 'oauth')
const isOpenAIOAuth = computed(() => props.account?.platform === 'openai' && props.account?.type === 'oauth')
const supportsPrivacy = computed(() => isAntigravityOAuth.value || isOpenAIOAuth.value)
const hasQuotaLimit = computed(() => {
  return (props.account?.type === 'apikey' || props.account?.type === 'bedrock') && (
    (props.account?.quota_limit ?? 0) > 0 ||
    (props.account?.quota_daily_limit ?? 0) > 0 ||
    (props.account?.quota_weekly_limit ?? 0) > 0
  )
})

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
