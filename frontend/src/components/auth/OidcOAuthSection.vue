<template>
  <div class="space-y-4">
    <Button type="button" variant="secondary" :disabled="disabled" class="w-full" @click="startLogin">
      <span
        class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-secondary-foreground"
      >
        {{ providerInitial }}
      </span>
      {{ t('auth.oidc.signIn', { providerName: normalizedProviderName }) }}
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
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/utils/oauthAffiliate'

const props = withDefaults(defineProps<{
  disabled?: boolean
  affCode?: string
  providerName?: string
  showDivider?: boolean
}>(), {
  providerName: 'OIDC',
  showDivider: true
})

const route = useRoute()
const { t } = useI18n()

const normalizedProviderName = computed(() => {
  const name = props.providerName?.trim()
  return name || 'OIDC'
})

const providerInitial = computed(() => normalizedProviderName.value.charAt(0).toUpperCase() || 'O')

function startLogin(): void {
  const redirectTo = (route.query.redirect as string) || '/dashboard'
  storeOAuthAffiliateCode(resolveAffiliateReferralCode(props.affCode, route.query.aff, route.query.aff_code))
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1'
  const normalized = apiBase.replace(/\/$/, '')
  const startURL = `${normalized}/auth/oauth/oidc/start?redirect=${encodeURIComponent(redirectTo)}`
  window.location.href = startURL
}
</script>
