<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- Security Warning -->
    <div class="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-3">
      <svg class="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="m-0 text-[12.5px] leading-relaxed text-amber-400">{{ t('admin.settings.adminApiKey.securityWarning') }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-2 text-[13px] text-muted-foreground">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      {{ t('common.loading') }}
    </div>

    <!-- No Key -->
    <div v-else-if="!keyExists" class="flex items-center justify-between gap-4">
      <span class="text-[13px] text-muted-foreground">{{ t('admin.settings.adminApiKey.notConfigured') }}</span>
      <Button
        type="button"
        size="sm"
        :disabled="operating"
        @click="create"
      >
        <svg v-if="operating" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {{ operating ? t('admin.settings.adminApiKey.creating') : t('admin.settings.adminApiKey.create') }}
      </Button>
    </div>

    <!-- Key Exists -->
    <div v-else class="flex flex-col gap-3.5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Label class="mb-1.5 block text-xs font-medium text-muted-foreground">{{ t('admin.settings.adminApiKey.currentKey') }}</Label>
          <code class="inline-block rounded-md bg-muted px-2.5 py-[5px] font-mono text-[13px] tracking-[0.03em] text-foreground">{{ maskedKey }}</code>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="operating"
            @click="regenerate"
          >
            {{ operating ? t('admin.settings.adminApiKey.regenerating') : t('admin.settings.adminApiKey.regenerate') }}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="operating"
            @click="remove"
          >
            {{ t('admin.settings.adminApiKey.delete') }}
          </Button>
        </div>
      </div>

      <!-- Newly Generated Key (one-time reveal) -->
      <div v-if="newKey" class="flex flex-col gap-2.5 rounded-[10px] border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5">
        <p class="m-0 text-[13px] font-medium text-emerald-400">{{ t('admin.settings.adminApiKey.keyWarning') }}</p>
        <div class="flex items-center gap-2.5">
          <code class="flex-1 break-all rounded-[7px] border border-emerald-500/25 bg-background px-3 py-2 font-mono text-[12.5px] text-foreground [user-select:all]">{{ newKey }}</code>
          <Button type="button" size="sm" class="shrink-0" @click="copyNewKey">
            {{ t('admin.settings.adminApiKey.copyKey') }}
          </Button>
        </div>
        <p class="m-0 text-[11.5px] leading-[1.45] text-emerald-400">{{ t('admin.settings.adminApiKey.usage') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import adminAPI from '@/api/admin'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// Self-contained: ignores parent settings/form props — has own CRUD cycle
defineProps<{
  settings?: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const { t } = useI18n()
const appStore = useAppStore()

// ── State ──────────────────────────────────────────────────────────────────────

const loading = ref(true)
const keyExists = ref(false)
const maskedKey = ref('')
const operating = ref(false)
const newKey = ref('')

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  loading.value = true
  try {
    const status = await adminAPI.settings.getAdminApiKey()
    keyExists.value = status.exists
    maskedKey.value = status.masked_key
  } catch {
    // Silent fail — status is non-critical
  } finally {
    loading.value = false
  }
})

// ── CRUD ───────────────────────────────────────────────────────────────────────

async function create() {
  operating.value = true
  try {
    const result = await adminAPI.settings.regenerateAdminApiKey()
    newKey.value = result.key
    keyExists.value = true
    maskedKey.value = result.key.substring(0, 10) + '...' + result.key.slice(-4)
    appStore.showSuccess(t('admin.settings.adminApiKey.keyGenerated'))
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('common.error')))
  } finally {
    operating.value = false
  }
}

async function regenerate() {
  if (!confirm(t('admin.settings.adminApiKey.regenerateConfirm'))) return
  await create()
}

async function remove() {
  if (!confirm(t('admin.settings.adminApiKey.deleteConfirm'))) return
  operating.value = true
  try {
    await adminAPI.settings.deleteAdminApiKey()
    keyExists.value = false
    maskedKey.value = ''
    newKey.value = ''
    appStore.showSuccess(t('admin.settings.adminApiKey.keyDeleted'))
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('common.error')))
  } finally {
    operating.value = false
  }
}

function copyNewKey() {
  navigator.clipboard
    .writeText(newKey.value)
    .then(() => { appStore.showSuccess(t('admin.settings.adminApiKey.keyCopied')) })
    .catch(() => { appStore.showError(t('common.copyFailed')) })
}
</script>
