<template>
  <div class="space-y-4">
    <Button type="button" :disabled="disabled"  variant="secondary" class="w-full" @click="startLogin">
      <svg
        class="icon mr-2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        aria-hidden="true"
        style="flex-shrink: 0"
      >
        <circle cx="12" cy="12" r="12" fill="#1677FF" />
        <text
          x="12"
          y="17"
          font-family="sans-serif"
          font-size="13"
          font-weight="bold"
          fill="white"
          text-anchor="middle"
        >钉</text>
      </svg>
      {{ t('auth.dingtalk.signIn') }}
    </Button>

    <div v-if="showDivider" class="flex items-center gap-3">
      <div class="h-px flex-1 bg-border"></div>
      <span class="text-xs text-muted-foreground">
        {{ t('auth.oauthOrContinue') }}
      </span>
      <div class="h-px flex-1 bg-border"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/utils/oauthAffiliate'

const props = withDefaults(defineProps<{
  disabled?: boolean
  affCode?: string
  showDivider?: boolean
}>(), {
  showDivider: true
})

const route = useRoute()
const { t } = useI18n()

function startLogin(): void {
  const redirectTo = (route.query.redirect as string) || '/dashboard'
  storeOAuthAffiliateCode(resolveAffiliateReferralCode(props.affCode, route.query.aff, route.query.aff_code))
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1'
  const normalized = apiBase.replace(/\/$/, '')
  const startURL = `${normalized}/auth/oauth/dingtalk/start?redirect=${encodeURIComponent(redirectTo)}`
  window.location.href = startURL
}
</script>
