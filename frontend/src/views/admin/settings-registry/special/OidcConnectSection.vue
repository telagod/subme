<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- enable toggle -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.oidc.enable') }}</Label>
        <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.oidc.enableHint') }}</p>
      </div>
      <Toggle :model-value="!!local.oidc_connect_enabled" @update:model-value="set('oidc_connect_enabled', $event)" />
    </div>

    <!-- expanded fields — only when enabled -->
    <div v-if="local.oidc_connect_enabled" class="flex flex-col gap-5 border-t border-border pt-4">
      <!-- Row 1: Provider Name / Client ID / Client Secret -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.providerName') }}</Label>
          <Input
            :value="local.oidc_connect_provider_name"
            type="text"
            :placeholder="t('admin.settings.oidc.providerNamePlaceholder')"
            @input="set('oidc_connect_provider_name', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.clientId') }}</Label>
          <Input
            :value="local.oidc_connect_client_id"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.clientIdPlaceholder')"
            @input="set('oidc_connect_client_id', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.clientSecret') }}</Label>
          <Input
            :value="local.oidc_connect_client_secret"
            type="password"
            class="font-mono text-sm"
            :placeholder="local.oidc_connect_client_secret_configured
              ? t('admin.settings.oidc.clientSecretConfiguredPlaceholder')
              : t('admin.settings.oidc.clientSecretPlaceholder')"
            @input="set('oidc_connect_client_secret', ($event.target as HTMLInputElement).value)"
          />
          <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">
            {{ local.oidc_connect_client_secret_configured
              ? t('admin.settings.oidc.clientSecretConfiguredHint')
              : t('admin.settings.oidc.clientSecretHint') }}
          </p>
        </div>
      </div>

      <!-- Row 2: Issuer / Discovery / Authorize / Token / Userinfo / JWKS -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.issuerUrl') }}</Label>
          <Input
            :value="local.oidc_connect_issuer_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.issuerUrlPlaceholder')"
            @input="set('oidc_connect_issuer_url', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.discoveryUrl') }}</Label>
          <Input
            :value="local.oidc_connect_discovery_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.discoveryUrlPlaceholder')"
            @input="set('oidc_connect_discovery_url', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.authorizeUrl') }}</Label>
          <Input
            :value="local.oidc_connect_authorize_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.authorizeUrlPlaceholder')"
            @input="set('oidc_connect_authorize_url', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.tokenUrl') }}</Label>
          <Input
            :value="local.oidc_connect_token_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.tokenUrlPlaceholder')"
            @input="set('oidc_connect_token_url', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.userinfoUrl') }}</Label>
          <Input
            :value="local.oidc_connect_userinfo_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.userinfoUrlPlaceholder')"
            @input="set('oidc_connect_userinfo_url', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.jwksUrl') }}</Label>
          <Input
            :value="local.oidc_connect_jwks_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.jwksUrlPlaceholder')"
            @input="set('oidc_connect_jwks_url', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- Row 3: Scopes / Redirect URL / Frontend Redirect URL -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.scopes') }}</Label>
          <Input
            :value="local.oidc_connect_scopes"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.scopesPlaceholder')"
            @input="set('oidc_connect_scopes', ($event.target as HTMLInputElement).value)"
          />
          <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.oidc.scopesHint') }}</p>
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.redirectUrl') }}</Label>
          <Input
            :value="local.oidc_connect_redirect_url"
            type="url"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.redirectUrlPlaceholder')"
            @input="set('oidc_connect_redirect_url', ($event.target as HTMLInputElement).value)"
          />
          <!-- Quick-set / copy suggestion -->
          <div class="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
            <Button type="button" variant="outline" size="sm" class="w-fit" @click="quickSetRedirectUrl">
              {{ t('admin.settings.oidc.quickSetCopy') }}
            </Button>
            <code v-if="redirectUrlSuggestion" class="break-all rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground select-all bg-muted">
              {{ redirectUrlSuggestion }}
            </code>
          </div>
          <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.oidc.redirectUrlHint') }}</p>
        </div>

        <div class="col-span-1 flex flex-col gap-1 md:col-span-2">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.frontendRedirectUrl') }}</Label>
          <Input
            :value="local.oidc_connect_frontend_redirect_url"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.frontendRedirectUrlPlaceholder')"
            @input="set('oidc_connect_frontend_redirect_url', ($event.target as HTMLInputElement).value)"
          />
          <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.oidc.frontendRedirectUrlHint') }}</p>
        </div>
      </div>

      <!-- Row 4: Token Auth Method / Clock Skew / Signing Algs -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.tokenAuthMethod') }}</Label>
          <Select
            :model-value="local.oidc_connect_token_auth_method"
            @update:model-value="set('oidc_connect_token_auth_method', $event)"
          >
            <SelectTrigger class="font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_secret_post">client_secret_post</SelectItem>
              <SelectItem value="client_secret_basic">client_secret_basic</SelectItem>
              <SelectItem value="none">none</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.clockSkewSeconds') }}</Label>
          <Input
            :value="local.oidc_connect_clock_skew_seconds"
            type="number"
            min="0"
            max="600"
            @input="set('oidc_connect_clock_skew_seconds', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.allowedSigningAlgs') }}</Label>
          <Input
            :value="local.oidc_connect_allowed_signing_algs"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.allowedSigningAlgsPlaceholder')"
            @input="set('oidc_connect_allowed_signing_algs', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- Row 5: PKCE / Validate ID Token / Require Email Verified (toggle cards) -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.oidc.usePkce') }}</Label>
          <Toggle
            :model-value="!!local.oidc_connect_use_pkce"
            data-testid="oidc-connect-use-pkce"
            @update:model-value="set('oidc_connect_use_pkce', $event)"
          />
        </div>

        <div class="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.oidc.validateIdToken') }}</Label>
          <Toggle
            :model-value="!!local.oidc_connect_validate_id_token"
            data-testid="oidc-connect-validate-id-token"
            @update:model-value="set('oidc_connect_validate_id_token', $event)"
          />
        </div>

        <div class="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.oidc.requireEmailVerified') }}</Label>
          <Toggle
            :model-value="!!local.oidc_connect_require_email_verified"
            @update:model-value="set('oidc_connect_require_email_verified', $event)"
          />
        </div>
      </div>

      <!-- Row 6: Userinfo path overrides -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.userinfoEmailPath') }}</Label>
          <Input
            :value="local.oidc_connect_userinfo_email_path"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.userinfoEmailPathPlaceholder')"
            @input="set('oidc_connect_userinfo_email_path', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.userinfoIdPath') }}</Label>
          <Input
            :value="local.oidc_connect_userinfo_id_path"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.userinfoIdPathPlaceholder')"
            @input="set('oidc_connect_userinfo_id_path', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.oidc.userinfoUsernamePath') }}</Label>
          <Input
            :value="local.oidc_connect_userinfo_username_path"
            type="text"
            class="font-mono text-sm"
            :placeholder="t('admin.settings.oidc.userinfoUsernamePathPlaceholder')"
            @input="set('oidc_connect_userinfo_username_path', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import { useClipboard } from '@/composables/useClipboard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const { t } = useI18n()
const { copyToClipboard } = useClipboard()

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

// Prefer live form dirty-state over persisted settings
const activeSource = () => props.formValues ?? props.settings

// All OIDC keys mirrored locally for reactive rendering
interface OidcLocal {
  oidc_connect_enabled: boolean
  oidc_connect_provider_name: string
  oidc_connect_client_id: string
  oidc_connect_client_secret: string
  oidc_connect_client_secret_configured: boolean
  oidc_connect_issuer_url: string
  oidc_connect_discovery_url: string
  oidc_connect_authorize_url: string
  oidc_connect_token_url: string
  oidc_connect_userinfo_url: string
  oidc_connect_jwks_url: string
  oidc_connect_scopes: string
  oidc_connect_redirect_url: string
  oidc_connect_frontend_redirect_url: string
  oidc_connect_token_auth_method: string
  oidc_connect_use_pkce: boolean
  oidc_connect_validate_id_token: boolean
  oidc_connect_allowed_signing_algs: string
  oidc_connect_clock_skew_seconds: number
  oidc_connect_require_email_verified: boolean
  oidc_connect_userinfo_email_path: string
  oidc_connect_userinfo_id_path: string
  oidc_connect_userinfo_username_path: string
}

function pick(src: Record<string, unknown>): OidcLocal {
  return {
    oidc_connect_enabled: !!(src['oidc_connect_enabled'] ?? false),
    oidc_connect_provider_name: (src['oidc_connect_provider_name'] as string) ?? 'OIDC',
    oidc_connect_client_id: (src['oidc_connect_client_id'] as string) ?? '',
    oidc_connect_client_secret: (src['oidc_connect_client_secret'] as string) ?? '',
    oidc_connect_client_secret_configured: !!(src['oidc_connect_client_secret_configured'] ?? false),
    oidc_connect_issuer_url: (src['oidc_connect_issuer_url'] as string) ?? '',
    oidc_connect_discovery_url: (src['oidc_connect_discovery_url'] as string) ?? '',
    oidc_connect_authorize_url: (src['oidc_connect_authorize_url'] as string) ?? '',
    oidc_connect_token_url: (src['oidc_connect_token_url'] as string) ?? '',
    oidc_connect_userinfo_url: (src['oidc_connect_userinfo_url'] as string) ?? '',
    oidc_connect_jwks_url: (src['oidc_connect_jwks_url'] as string) ?? '',
    oidc_connect_scopes: (src['oidc_connect_scopes'] as string) ?? 'openid email profile',
    oidc_connect_redirect_url: (src['oidc_connect_redirect_url'] as string) ?? '',
    oidc_connect_frontend_redirect_url: (src['oidc_connect_frontend_redirect_url'] as string) ?? '/auth/oidc/callback',
    oidc_connect_token_auth_method: (src['oidc_connect_token_auth_method'] as string) ?? 'client_secret_post',
    oidc_connect_use_pkce: !!(src['oidc_connect_use_pkce'] ?? false),
    oidc_connect_validate_id_token: !!(src['oidc_connect_validate_id_token'] ?? false),
    oidc_connect_allowed_signing_algs: (src['oidc_connect_allowed_signing_algs'] as string) ?? 'RS256,ES256,PS256',
    oidc_connect_clock_skew_seconds: (src['oidc_connect_clock_skew_seconds'] as number) ?? 120,
    oidc_connect_require_email_verified: !!(src['oidc_connect_require_email_verified'] ?? false),
    oidc_connect_userinfo_email_path: (src['oidc_connect_userinfo_email_path'] as string) ?? '',
    oidc_connect_userinfo_id_path: (src['oidc_connect_userinfo_id_path'] as string) ?? '',
    oidc_connect_userinfo_username_path: (src['oidc_connect_userinfo_username_path'] as string) ?? '',
  }
}

const local = reactive<OidcLocal>(pick(activeSource()))

// Re-sync when parent resets (discard / initial load)
watch(
  () => activeSource(),
  (src) => {
    const fresh = pick(src)
    for (const k of Object.keys(fresh) as (keyof OidcLocal)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(local as any)[k] = (fresh as any)[k]
    }
  },
  { deep: true },
)

function set(key: keyof OidcLocal, value: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(local as any)[key] = value
  emit('update:field', key, value)
}

// Redirect URL suggestion (mirrors SettingsView.vue oidcRedirectUrlSuggestion computed)
const redirectUrlSuggestion = computed(() => {
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin || `${window.location.protocol}//${window.location.host}`
  return `${origin}/api/v1/auth/oauth/oidc/callback`
})

async function quickSetRedirectUrl() {
  const url = redirectUrlSuggestion.value
  if (!url) return
  set('oidc_connect_redirect_url', url)
  await copyToClipboard(url, t('admin.settings.oidc.redirectUrlSetAndCopied'))
}
</script>
