<template>
  <div class="flex flex-col gap-[18px] px-5 py-4">
    <!-- Global Enable Toggle -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="block text-foreground">{{ t('admin.settings.webSearchEmulation.enabled') }}</Label>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.webSearchEmulation.enabledHint') }}</p>
      </div>
      <Switch v-model="config.enabled" />
    </div>

    <!-- Providers List -->
    <div v-if="config.enabled" class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <Label class="block text-foreground">{{ t('admin.settings.webSearchEmulation.providers') }}</Label>
        <Button type="button" variant="outline" size="sm" @click="addProvider">
          {{ t('admin.settings.webSearchEmulation.addProvider') }}
        </Button>
      </div>

      <div
        v-if="config.providers.length === 0"
        class="rounded-lg border border-dashed border-border px-4 py-3.5 text-center text-sm text-muted-foreground"
      >
        {{ t('admin.settings.webSearchEmulation.noProviders') }}
      </div>

      <div
        v-for="(provider, pIdx) in config.providers"
        :key="pIdx"
        class="overflow-hidden rounded-[10px] border border-border"
      >
        <!-- Collapsible header -->
        <div class="flex cursor-pointer select-none items-center justify-between px-3.5 py-2.5" @click="toggleExpand(pIdx)">
          <div class="flex items-center gap-2.5">
            <svg
              class="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-150"
              :class="{ 'rotate-90': expandedProviders[pIdx] }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <Select :modelValue="provider.type" @update:modelValue="provider.type = $event as any" @click.stop>
              <SelectTrigger class="w-36" @click.stop>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brave">Brave Search</SelectItem>
                <SelectItem value="tavily">Tavily</SelectItem>
              </SelectContent>
            </Select>
            <span class="text-xs tabular-nums text-muted-foreground">
              {{ provider.quota_used ?? 0 }} /
              {{ provider.quota_limit != null && provider.quota_limit > 0 ? provider.quota_limit : '∞' }}
            </span>
            <span
              v-if="!expandedProviders[pIdx] && provider.api_key_configured"
              class="text-xs text-emerald-500"
            >
              {{ t('admin.settings.webSearchEmulation.apiKeyConfigured') }}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-auto px-1.5 py-0.5 text-xs text-destructive hover:bg-transparent hover:text-destructive/80"
            @click.stop="removeProvider(pIdx)"
          >
            {{ t('admin.settings.webSearchEmulation.removeProvider') }}
          </Button>
        </div>

        <!-- Expanded Content -->
        <div v-if="expandedProviders[pIdx]" class="flex flex-col gap-3 border-t border-border p-3.5">
          <!-- API Key -->
          <div>
            <Label class="mb-1 block text-xs text-muted-foreground">{{ t('admin.settings.webSearchEmulation.apiKey') }}</Label>
            <div class="relative mt-1">
              <Input
                v-model="provider.api_key"
                :type="apiKeyVisible[pIdx] ? 'text' : 'password'"
                :class="provider.api_key || provider.api_key_configured ? 'pr-16' : ''"
                :placeholder="
                  provider.api_key_configured
                    ? '••••••••'
                    : t('admin.settings.webSearchEmulation.apiKeyPlaceholder')
                "
              />
              <div
                v-if="provider.api_key || provider.api_key_configured"
                class="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground"
                  :title="apiKeyVisible[pIdx]
                    ? t('admin.settings.webSearchEmulation.hideApiKey')
                    : t('admin.settings.webSearchEmulation.showApiKey')"
                  @click="apiKeyVisible[pIdx] = !apiKeyVisible[pIdx]"
                >
                  <svg v-if="!apiKeyVisible[pIdx]" class="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  :title="t('admin.settings.webSearchEmulation.copyApiKey')"
                  :disabled="!provider.api_key"
                  @click="copyApiKey(pIdx)"
                >
                  <svg class="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>

          <!-- Quota + Subscription -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label class="mb-1 block text-xs text-muted-foreground">{{ t('admin.settings.webSearchEmulation.quotaLimit') }}</Label>
              <Input
                v-model.number="provider.quota_limit"
                type="number"
                min="1"
                class="font-mono tabular-nums"
                placeholder="∞"
              />
              <p class="mt-1 text-[11px] leading-snug text-muted-foreground">{{ t('admin.settings.webSearchEmulation.quotaLimitHint') }}</p>
            </div>
            <div>
              <Label class="mb-1 block text-xs text-muted-foreground">{{ t('admin.settings.webSearchEmulation.subscribedAt') }}</Label>
              <Input
                :value="formatSubscribedAt(provider.subscribed_at)"
                type="date"
                @input="provider.subscribed_at = parseSubscribedAt(($event.target as HTMLInputElement).value)"
              />
              <p class="mt-1 text-[11px] leading-snug text-muted-foreground">{{ t('admin.settings.webSearchEmulation.subscribedAtHint') }}</p>
            </div>
          </div>

          <!-- Quota Usage Bar -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{{ t('admin.settings.webSearchEmulation.quotaUsage') }}:</span>
            <div
              v-if="provider.quota_limit != null && provider.quota_limit > 0"
              class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                class="h-full rounded-full transition-[width] duration-300"
                :class="
                  quotaPercentage(provider) > 90
                    ? 'bg-destructive'
                    : quotaPercentage(provider) > 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                "
                :style="{ width: Math.min(quotaPercentage(provider), 100) + '%' }"
              />
            </div>
            <div v-else class="flex-1" />
            <span class="text-xs text-muted-foreground">
              {{ provider.quota_used ?? 0 }} /
              {{ provider.quota_limit != null && provider.quota_limit > 0 ? provider.quota_limit : '∞' }}
            </span>
            <Button
              v-if="(provider.quota_used ?? 0) > 0"
              type="button"
              variant="ghost"
              size="sm"
              class="h-auto whitespace-nowrap px-1 py-0.5 text-xs text-primary hover:bg-transparent hover:text-primary/80"
              @click="resetUsage(pIdx)"
            >
              {{ t('admin.settings.webSearchEmulation.resetUsage') }}
            </Button>
          </div>

          <!-- Proxy + Test -->
          <div class="flex items-end gap-3">
            <div class="flex-1">
              <Label class="mb-1 block text-xs text-muted-foreground">{{ t('admin.settings.webSearchEmulation.proxy') }}</Label>
              <ProxySelector v-model="provider.proxy_id" :proxies="proxies" />
            </div>
            <Button type="button" variant="outline" size="sm" class="flex-shrink-0 whitespace-nowrap" @click="openTestDialog">
              {{ t('admin.settings.webSearchEmulation.test') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end border-t border-border pt-1">
      <Button
        type="button"
        :disabled="saving"
        @click="save"
      >
        <svg v-if="saving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {{ saving ? t('common.saving') : t('common.save') }}
      </Button>
    </div>

    <!-- Test Dialog -->
    <div
      v-if="testDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      @click.self="testDialogOpen = false"
    >
      <Card class="mx-4 w-full max-w-[520px] p-6">
        <h3 class="m-0 mb-4 text-[15px] font-semibold text-foreground">{{ t('admin.settings.webSearchEmulation.testResultTitle') }}</h3>
        <div class="flex items-center gap-2">
          <Input
            v-model="testQuery"
            type="text"
            class="flex-1"
            :placeholder="t('admin.settings.webSearchEmulation.testDefaultQuery')"
            @keyup.enter="runTest"
          />
          <Button
            type="button"
            :disabled="testLoading"
            class="whitespace-nowrap"
            @click="runTest"
          >
            {{ testLoading
              ? t('admin.settings.webSearchEmulation.testing')
              : t('admin.settings.webSearchEmulation.test') }}
          </Button>
        </div>
        <div v-if="testResult" class="mt-4 max-h-80 overflow-y-auto rounded-lg bg-muted p-3.5">
          <p class="m-0 mb-2 text-sm font-medium text-foreground">
            {{ t('admin.settings.webSearchEmulation.testResultProvider') }}: {{ testResult.provider }}
          </p>
          <div v-if="testResult.results.length === 0" class="text-sm text-muted-foreground">
            {{ t('admin.settings.webSearchEmulation.testNoResults') }}
          </div>
          <div
            v-for="(r, rIdx) in testResult.results"
            :key="rIdx"
            class="mt-2.5 border-t border-border pt-2.5 first:mt-0 first:border-t-0 first:pt-0"
          >
            <a :href="r.url" target="_blank" class="text-sm font-medium text-primary no-underline hover:underline">{{ r.title }}</a>
            <p class="mt-1 text-xs leading-snug text-muted-foreground">{{ r.snippet }}</p>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" @click="testDialogOpen = false">
            {{ t('common.close') }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ProxySelector from '@/components/common/ProxySelector.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import adminAPI from '@/api/admin'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'
import type {
  WebSearchEmulationConfig,
  WebSearchProviderConfig,
  WebSearchTestResult,
} from '@/api/admin/settings'
import type { Proxy } from '@/types'

// Self-contained: ignores parent settings/form props — has own GET/PUT cycle
defineProps<{
  settings?: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const { t } = useI18n()
const appStore = useAppStore()

const DEFAULT_QUOTA_LIMIT = 1000

// ── State ──────────────────────────────────────────────────────────────────────

const config = reactive<WebSearchEmulationConfig>({
  enabled: false,
  providers: [],
})

const proxies = ref<Proxy[]>([])
const saving = ref(false)

const expandedProviders = reactive<Record<number, boolean>>({})
const apiKeyVisible = reactive<Record<number, boolean>>({})

const testDialogOpen = ref(false)
const testQuery = ref('')
const testLoading = ref(false)
const testResult = ref<WebSearchTestResult | null>(null)

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const [resp, proxiesResp] = await Promise.all([
      adminAPI.settings.getWebSearchEmulationConfig(),
      adminAPI.proxies.list().catch(() => ({ items: [] as Proxy[] })),
    ])
    if (resp) {
      config.enabled = resp.enabled || false
      config.providers = resp.providers || []
    }
    proxies.value = proxiesResp.items || []
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status !== 404 && status !== undefined) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    }
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSubscribedAt(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseSubscribedAt(dateStr: string): number | null {
  if (!dateStr) return null
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000)
}

function quotaPercentage(provider: WebSearchProviderConfig): number {
  if (!provider.quota_limit || provider.quota_limit <= 0) return 0
  return ((provider.quota_used ?? 0) / provider.quota_limit) * 100
}

// ── Provider CRUD ──────────────────────────────────────────────────────────────

function addProvider() {
  const idx = config.providers.length
  config.providers.push({
    type: 'brave',
    api_key: '',
    api_key_configured: false,
    quota_limit: DEFAULT_QUOTA_LIMIT,
    subscribed_at: null,
    proxy_id: null,
    expires_at: null,
  } as WebSearchProviderConfig)
  expandedProviders[idx] = true
}

function removeProvider(idx: number) {
  config.providers.splice(idx, 1)
  const newExpanded: Record<number, boolean> = {}
  const newVisible: Record<number, boolean> = {}
  for (let i = 0; i < config.providers.length; i++) {
    const oldIdx = i >= idx ? i + 1 : i
    newExpanded[i] = expandedProviders[oldIdx] ?? false
    newVisible[i] = apiKeyVisible[oldIdx] ?? false
  }
  Object.keys(expandedProviders).forEach((k) => delete expandedProviders[Number(k)])
  Object.keys(apiKeyVisible).forEach((k) => delete apiKeyVisible[Number(k)])
  Object.assign(expandedProviders, newExpanded)
  Object.assign(apiKeyVisible, newVisible)
}

function toggleExpand(idx: number) {
  expandedProviders[idx] = !expandedProviders[idx]
}

// ── API Key actions ────────────────────────────────────────────────────────────

async function copyApiKey(idx: number) {
  const key = config.providers[idx]?.api_key
  if (!key) return
  try {
    await navigator.clipboard.writeText(key)
    appStore.showSuccess(t('admin.settings.webSearchEmulation.copied'))
  } catch {
    appStore.showError(t('common.error'))
  }
}

// ── Usage reset ────────────────────────────────────────────────────────────────

async function resetUsage(idx: number) {
  const provider = config.providers[idx]
  if (!provider) return
  if (!confirm(t('admin.settings.webSearchEmulation.resetUsageConfirm'))) return
  try {
    await adminAPI.settings.resetWebSearchUsage({ provider_type: provider.type })
    provider.quota_used = 0
    appStore.showSuccess(t('admin.settings.webSearchEmulation.resetUsageSuccess'))
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  }
}

// ── Save ───────────────────────────────────────────────────────────────────────

async function save() {
  for (const p of config.providers) {
    const raw = p.quota_limit
    if (raw != null && Number(raw) !== 0 && Number(raw) < 1) {
      appStore.showError(t('admin.settings.webSearchEmulation.quotaLimitMustBePositive'))
      return
    }
  }
  saving.value = true
  try {
    const providers = config.providers.map((p: WebSearchProviderConfig) => ({
      ...p,
      quota_limit: Number(p.quota_limit) > 0 ? Number(p.quota_limit) : null,
    }))
    await adminAPI.settings.updateWebSearchEmulationConfig({
      enabled: config.enabled,
      providers,
    })
    appStore.showSuccess(t('common.saved'))
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    saving.value = false
  }
}

// ── Test Dialog ────────────────────────────────────────────────────────────────

function openTestDialog() {
  testResult.value = null
  testDialogOpen.value = true
}

async function runTest() {
  testLoading.value = true
  testResult.value = null
  try {
    const query = testQuery.value.trim() || t('admin.settings.webSearchEmulation.testDefaultQuery')
    testResult.value = await adminAPI.settings.testWebSearchEmulation(query)
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    testLoading.value = false
  }
}
</script>
