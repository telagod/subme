<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- loading -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
      <div class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-b-primary" />
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <!-- Master enabled switch -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label class="text-sm font-medium">{{ t('admin.settings.rectifier.enabled') }}</Label>
          <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.rectifier.enabledHint') }}</p>
        </div>
        <Toggle v-model="form.enabled" />
      </div>

      <!-- Sub-toggles (only show when master is enabled) -->
      <div v-if="form.enabled" class="flex flex-col gap-4 border-t border-border pt-4">
        <!-- Thinking Signature Rectifier -->
        <div class="flex items-center justify-between gap-4">
          <div>
            <Label class="text-[12.5px] font-medium opacity-85">{{ t('admin.settings.rectifier.thinkingSignature') }}</Label>
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.rectifier.thinkingSignatureHint') }}</p>
          </div>
          <Toggle v-model="form.thinking_signature_enabled" />
        </div>

        <!-- Thinking Budget Rectifier -->
        <div class="flex items-center justify-between gap-4">
          <div>
            <Label class="text-[12.5px] font-medium opacity-85">{{ t('admin.settings.rectifier.thinkingBudget') }}</Label>
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.rectifier.thinkingBudgetHint') }}</p>
          </div>
          <Toggle v-model="form.thinking_budget_enabled" />
        </div>

        <!-- API Key Signature Rectifier -->
        <div class="flex items-center justify-between gap-4">
          <div>
            <Label class="text-[12.5px] font-medium opacity-85">{{ t('admin.settings.rectifier.apikeySignature') }}</Label>
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.rectifier.apikeySignatureHint') }}</p>
          </div>
          <Toggle v-model="form.apikey_signature_enabled" />
        </div>

        <!-- Custom Patterns (only when apikey_signature_enabled) -->
        <div v-if="form.apikey_signature_enabled" class="ml-4 flex flex-col gap-2 border-l-2 border-border pl-4">
          <div>
            <Label class="text-[12.5px] font-medium opacity-85">{{ t('admin.settings.rectifier.apikeyPatterns') }}</Label>
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.rectifier.apikeyPatternsHint') }}</p>
          </div>
          <div
            v-for="(_, index) in form.apikey_signature_patterns"
            :key="index"
            class="flex items-center gap-2"
          >
            <Input
              v-model="form.apikey_signature_patterns[index]"
              type="text"
              class="flex-1 font-mono"
              :placeholder="t('admin.settings.rectifier.apikeyPatternPlaceholder')"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              @click="form.apikey_signature_patterns.splice(index, 1)"
              :aria-label="t('common.remove')"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="self-start text-primary hover:text-primary"
            @click="form.apikey_signature_patterns.push('')"
          >
            + {{ t('admin.settings.rectifier.addPattern') }}
          </Button>
        </div>
      </div>

      <!-- Save button -->
      <div class="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          :disabled="saving"
          @click="save"
          class="gap-1.5"
        >
          <svg v-if="saving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {{ saving ? t('common.saving') : t('common.save') }}
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)

const form = reactive({
  enabled: true,
  thinking_signature_enabled: true,
  thinking_budget_enabled: true,
  apikey_signature_enabled: false,
  apikey_signature_patterns: [] as string[],
})

onMounted(async () => {
  loading.value = true
  try {
    const settings = await adminAPI.settings.getRectifierSettings()
    Object.assign(form, settings)
    if (!Array.isArray(form.apikey_signature_patterns)) {
      form.apikey_signature_patterns = []
    }
  } catch {
    // silent — form stays at defaults
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  try {
    const updated = await adminAPI.settings.updateRectifierSettings({
      enabled: form.enabled,
      thinking_signature_enabled: form.thinking_signature_enabled,
      thinking_budget_enabled: form.thinking_budget_enabled,
      apikey_signature_enabled: form.apikey_signature_enabled,
      apikey_signature_patterns: form.apikey_signature_patterns.filter((p) => p.trim() !== ''),
    })
    Object.assign(form, updated)
    if (!Array.isArray(form.apikey_signature_patterns)) {
      form.apikey_signature_patterns = []
    }
    appStore.showSuccess(t('admin.settings.rectifier.saved'))
  } catch (error: unknown) {
    appStore.showError(
      extractApiErrorMessage(error, t('admin.settings.rectifier.saveFailed')),
    )
  } finally {
    saving.value = false
  }
}
</script>
