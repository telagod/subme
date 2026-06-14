<template>
  <div class="flex flex-col gap-5 px-5 py-4">
    <!-- Master switch -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <label class="text-sm font-medium text-foreground">{{ t('admin.settings.wechatConnect.enabledLabel') }}</label>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.enabledHint') }}</p>
      </div>
      <Toggle
        :model-value="local.wechat_connect_enabled"
        data-testid="wechat-connect-enabled"
        @update:model-value="setField('wechat_connect_enabled', $event)"
      />
    </div>

    <template v-if="local.wechat_connect_enabled">
      <!-- ── Mode panels ─────────────────────────────────────────────── -->
      <div class="flex flex-col gap-3">

        <!-- PC App (open platform) -->
        <div class="rounded-lg border border-border p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="mb-1 text-[13.5px] font-medium text-foreground">{{ t('admin.settings.wechatConnect.open.title') }}</h3>
              <p class="m-0 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.open.description') }}</p>
            </div>
            <Toggle
              :model-value="local.wechat_connect_open_enabled"
              data-testid="wechat-connect-open-enabled"
              @update:model-value="handleOpenEnabledChange"
            />
          </div>
          <div v-if="local.wechat_connect_open_enabled" class="mt-4 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.open.appId') }}</Label>
              <Input
                :value="local.wechat_connect_open_app_id"
                data-testid="wechat-connect-open-app-id"
                type="text"
                class="font-mono text-sm"
                :placeholder="t('admin.settings.wechatConnect.open.appIdPlaceholder')"
                @input="setField('wechat_connect_open_app_id', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.open.appSecret') }}</Label>
              <Input
                :value="local.wechat_connect_open_app_secret"
                data-testid="wechat-connect-open-app-secret"
                type="password"
                class="font-mono text-sm"
                :placeholder="local.wechat_connect_open_app_secret_configured
                  ? t('admin.settings.wechatConnect.appSecretConfiguredPlaceholder')
                  : t('admin.settings.wechatConnect.open.appSecretPlaceholder')"
                @input="setField('wechat_connect_open_app_secret', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>

        <!-- Official Account (mp) -->
        <div class="rounded-lg border border-border p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="mb-1 text-[13.5px] font-medium text-foreground">{{ t('admin.settings.wechatConnect.mp.title') }}</h3>
              <p class="m-0 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.mp.description') }}</p>
            </div>
            <Toggle
              :model-value="local.wechat_connect_mp_enabled"
              data-testid="wechat-connect-mp-enabled"
              @update:model-value="handleMPEnabledChange"
            />
          </div>
          <div v-if="local.wechat_connect_mp_enabled" class="mt-4 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.mp.appId') }}</Label>
              <Input
                :value="local.wechat_connect_mp_app_id"
                data-testid="wechat-connect-mp-app-id"
                type="text"
                class="font-mono text-sm"
                :placeholder="t('admin.settings.wechatConnect.mp.appIdPlaceholder')"
                @input="setField('wechat_connect_mp_app_id', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.mp.appSecret') }}</Label>
              <Input
                :value="local.wechat_connect_mp_app_secret"
                data-testid="wechat-connect-mp-app-secret"
                type="password"
                class="font-mono text-sm"
                :placeholder="local.wechat_connect_mp_app_secret_configured
                  ? t('admin.settings.wechatConnect.appSecretConfiguredPlaceholder')
                  : t('admin.settings.wechatConnect.mp.appSecretPlaceholder')"
                @input="setField('wechat_connect_mp_app_secret', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>

        <!-- Mobile App -->
        <div class="rounded-lg border border-border p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="mb-1 text-[13.5px] font-medium text-foreground">{{ t('admin.settings.wechatConnect.mobile.title') }}</h3>
              <p class="m-0 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.mobile.description') }}</p>
            </div>
            <Toggle
              :model-value="local.wechat_connect_mobile_enabled"
              data-testid="wechat-connect-mobile-enabled"
              @update:model-value="handleMobileEnabledChange"
            />
          </div>
          <div v-if="local.wechat_connect_mobile_enabled" class="mt-4 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.mobile.appId') }}</Label>
              <Input
                :value="local.wechat_connect_mobile_app_id"
                data-testid="wechat-connect-mobile-app-id"
                type="text"
                class="font-mono text-sm"
                :placeholder="t('admin.settings.wechatConnect.mobile.appIdPlaceholder')"
                @input="setField('wechat_connect_mobile_app_id', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <Label class="mb-1.5 block text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.mobile.appSecret') }}</Label>
              <Input
                :value="local.wechat_connect_mobile_app_secret"
                data-testid="wechat-connect-mobile-app-secret"
                type="password"
                class="font-mono text-sm"
                :placeholder="local.wechat_connect_mobile_app_secret_configured
                  ? t('admin.settings.wechatConnect.appSecretConfiguredPlaceholder')
                  : t('admin.settings.wechatConnect.mobile.appSecretPlaceholder')"
                @input="setField('wechat_connect_mobile_app_secret', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- UnionID warning: open + (mp OR mobile) -->
      <div
        v-if="local.wechat_connect_open_enabled && (local.wechat_connect_mp_enabled || local.wechat_connect_mobile_enabled)"
        class="rounded-md border border-amber-500/30 bg-amber-500/8 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-400"
      >
        {{ t('admin.settings.wechatConnect.unionIdWarning') }}
      </div>

      <!-- Redirect URL -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.redirectUrlLabel') }}</Label>
        <Input
          :value="local.wechat_connect_redirect_url"
          data-testid="wechat-connect-redirect-url"
          type="url"
          class="font-mono text-sm"
          :placeholder="t('admin.settings.wechatConnect.redirectUrlPlaceholder')"
          @input="setField('wechat_connect_redirect_url', ($event.target as HTMLInputElement).value)"
        />
        <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.redirectUrlHint') }}</p>
        <div class="mt-1 flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="w-fit"
            @click="generateAndCopyRedirectUrl"
          >
            {{ t('admin.settings.wechatConnect.generateAndCopy') }}
          </Button>
          <code
            v-if="redirectUrlSuggestion"
            class="break-all rounded px-2 py-0.5 font-mono text-[11.5px] text-muted-foreground bg-muted select-all"
          >{{ redirectUrlSuggestion }}</code>
        </div>
      </div>

      <!-- Frontend Redirect URL -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-[12.5px] font-medium">{{ t('admin.settings.wechatConnect.frontendRedirectUrlLabel') }}</Label>
        <Input
          :value="local.wechat_connect_frontend_redirect_url"
          data-testid="wechat-connect-frontend-redirect-url"
          type="text"
          class="font-mono text-sm"
          :placeholder="t('admin.settings.wechatConnect.frontendRedirectUrlPlaceholder')"
          @input="setField('wechat_connect_frontend_redirect_url', ($event.target as HTMLInputElement).value)"
        />
        <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.wechatConnect.frontendRedirectUrlHint') }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  resolveWeChatConnectModeCapabilities,
  deriveWeChatConnectStoredMode,
  defaultWeChatConnectScopesForMode,
} from '@/api/admin/settings'

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

// ── Local state (mirrors parent form + settings) ────────────────────────────

type WechatLocal = {
  wechat_connect_enabled: boolean
  wechat_connect_open_enabled: boolean
  wechat_connect_mp_enabled: boolean
  wechat_connect_mobile_enabled: boolean
  wechat_connect_open_app_id: string
  wechat_connect_open_app_secret: string
  wechat_connect_open_app_secret_configured: boolean
  wechat_connect_mp_app_id: string
  wechat_connect_mp_app_secret: string
  wechat_connect_mp_app_secret_configured: boolean
  wechat_connect_mobile_app_id: string
  wechat_connect_mobile_app_secret: string
  wechat_connect_mobile_app_secret_configured: boolean
  wechat_connect_mode: string
  wechat_connect_scopes: string
  wechat_connect_redirect_url: string
  wechat_connect_frontend_redirect_url: string
  // legacy / passthrough
  wechat_connect_app_id: string
  wechat_connect_app_secret: string
  wechat_connect_app_secret_configured: boolean
}

function buildLocal(src: Record<string, unknown>): WechatLocal {
  const bool = (key: string, fallback = false): boolean =>
    typeof src[key] === 'boolean' ? (src[key] as boolean) : fallback
  const str = (key: string, fallback = ''): string =>
    typeof src[key] === 'string' ? (src[key] as string) : fallback

  const capabilities = resolveWeChatConnectModeCapabilities(
    src['wechat_connect_open_enabled'],
    src['wechat_connect_mp_enabled'],
    src['wechat_connect_mobile_enabled'],
    src['wechat_connect_mode'],
  )

  const mode = deriveWeChatConnectStoredMode(
    capabilities.openEnabled,
    capabilities.mpEnabled,
    capabilities.mobileEnabled,
    src['wechat_connect_mode'],
  )

  return {
    wechat_connect_enabled: bool('wechat_connect_enabled'),
    wechat_connect_open_enabled: capabilities.openEnabled,
    wechat_connect_mp_enabled: capabilities.mpEnabled,
    wechat_connect_mobile_enabled: capabilities.mobileEnabled,
    wechat_connect_open_app_id: str('wechat_connect_open_app_id'),
    wechat_connect_open_app_secret: str('wechat_connect_open_app_secret'),
    wechat_connect_open_app_secret_configured: bool('wechat_connect_open_app_secret_configured'),
    wechat_connect_mp_app_id: str('wechat_connect_mp_app_id'),
    wechat_connect_mp_app_secret: str('wechat_connect_mp_app_secret'),
    wechat_connect_mp_app_secret_configured: bool('wechat_connect_mp_app_secret_configured'),
    wechat_connect_mobile_app_id: str('wechat_connect_mobile_app_id'),
    wechat_connect_mobile_app_secret: str('wechat_connect_mobile_app_secret'),
    wechat_connect_mobile_app_secret_configured: bool('wechat_connect_mobile_app_secret_configured'),
    wechat_connect_mode: mode,
    wechat_connect_scopes: str('wechat_connect_scopes') || defaultWeChatConnectScopesForMode(mode),
    wechat_connect_redirect_url: str('wechat_connect_redirect_url'),
    wechat_connect_frontend_redirect_url: str('wechat_connect_frontend_redirect_url', '/auth/wechat/callback'),
    wechat_connect_app_id: str('wechat_connect_app_id'),
    wechat_connect_app_secret: str('wechat_connect_app_secret'),
    wechat_connect_app_secret_configured: bool('wechat_connect_app_secret_configured'),
  }
}

const activeSource = computed(() => props.formValues ?? props.settings)
const local = ref<WechatLocal>(buildLocal(activeSource.value))

// Re-sync when parent resets (e.g., after save)
watch(
  () => activeSource.value,
  (incoming) => {
    local.value = buildLocal(incoming)
  },
  { deep: true },
)

// ── Helpers ─────────────────────────────────────────────────────────────────

function setField(key: keyof WechatLocal, value: unknown) {
  ;(local.value as Record<string, unknown>)[key] = value
  emit('update:field', key, value)
}

function syncMode(preferredMode?: 'open' | 'mp' | 'mobile') {
  // mp and mobile are mutually exclusive
  if (local.value.wechat_connect_mp_enabled && local.value.wechat_connect_mobile_enabled) {
    if (preferredMode === 'mobile') {
      local.value.wechat_connect_mp_enabled = false
      emit('update:field', 'wechat_connect_mp_enabled', false)
    } else {
      local.value.wechat_connect_mobile_enabled = false
      emit('update:field', 'wechat_connect_mobile_enabled', false)
    }
  }

  const capabilities = resolveWeChatConnectModeCapabilities(
    local.value.wechat_connect_open_enabled,
    local.value.wechat_connect_mp_enabled,
    local.value.wechat_connect_mobile_enabled,
    local.value.wechat_connect_mode,
  )

  local.value.wechat_connect_open_enabled = capabilities.openEnabled
  local.value.wechat_connect_mp_enabled = capabilities.mpEnabled
  local.value.wechat_connect_mobile_enabled = capabilities.mobileEnabled

  const newMode = deriveWeChatConnectStoredMode(
    capabilities.openEnabled,
    capabilities.mpEnabled,
    capabilities.mobileEnabled,
    local.value.wechat_connect_mode,
  )
  local.value.wechat_connect_mode = newMode
  local.value.wechat_connect_scopes = defaultWeChatConnectScopesForMode(newMode)

  emit('update:field', 'wechat_connect_open_enabled', capabilities.openEnabled)
  emit('update:field', 'wechat_connect_mp_enabled', capabilities.mpEnabled)
  emit('update:field', 'wechat_connect_mobile_enabled', capabilities.mobileEnabled)
  emit('update:field', 'wechat_connect_mode', newMode)
  emit('update:field', 'wechat_connect_scopes', local.value.wechat_connect_scopes)
}

function handleOpenEnabledChange(value: boolean) {
  local.value.wechat_connect_open_enabled = value
  syncMode(value ? 'open' : undefined)
}

function handleMPEnabledChange(value: boolean) {
  local.value.wechat_connect_mp_enabled = value
  if (value) {
    local.value.wechat_connect_mobile_enabled = false
  }
  syncMode(value ? 'mp' : undefined)
}

function handleMobileEnabledChange(value: boolean) {
  local.value.wechat_connect_mobile_enabled = value
  if (value) {
    local.value.wechat_connect_mp_enabled = false
  }
  syncMode(value ? 'mobile' : undefined)
}

// ── Redirect URL suggestion ──────────────────────────────────────────────────

const redirectUrlSuggestion = computed(() => {
  if (typeof window === 'undefined') return ''
  const origin = window.location.origin || `${window.location.protocol}//${window.location.host}`
  return `${origin}/api/v1/auth/oauth/wechat/callback`
})

async function generateAndCopyRedirectUrl() {
  const url = redirectUrlSuggestion.value
  if (!url) return
  setField('wechat_connect_redirect_url', url)
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // clipboard not available — still set the field
  }
}
</script>
