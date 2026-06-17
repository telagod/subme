<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- loading -->
    <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
      <svg class="h-4 w-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <!-- enabled switch -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label class="text-sm font-medium">{{ t('admin.settings.rateLimit429Cooldown.enabled') }}</Label>
          <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.rateLimit429Cooldown.enabledHint') }}</p>
        </div>
        <Toggle v-model="form.enabled" />
      </div>

      <!-- expanded fields -->
      <div v-if="form.enabled" class="flex flex-col gap-3 border-t border-border pt-4">
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.rateLimit429Cooldown.cooldownSeconds') }}</Label>
          <Input
            v-model.number="form.cooldown_seconds"
            type="number"
            min="1"
            max="7200"
            class="w-32 font-mono"
          />
          <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('admin.settings.rateLimit429Cooldown.cooldownSecondsHint') }}</p>
        </div>
      </div>

      <!-- save -->
      <div class="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          :disabled="saving"
          @click="save"
          class="gap-1.5"
        >
          <svg
            v-if="saving"
            class="h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
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
  cooldown_seconds: 5,
})

onMounted(async () => {
  loading.value = true
  try {
    const settings = await adminAPI.settings.getRateLimit429CooldownSettings()
    Object.assign(form, settings)
  } catch {
    // silent — form stays at defaults
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  try {
    const updated = await adminAPI.settings.updateRateLimit429CooldownSettings({
      enabled: form.enabled,
      cooldown_seconds: form.cooldown_seconds,
    })
    Object.assign(form, updated)
    appStore.showSuccess(t('admin.settings.rateLimit429Cooldown.saved'))
  } catch (error: unknown) {
    appStore.showError(
      extractApiErrorMessage(error, t('admin.settings.rateLimit429Cooldown.saveFailed')),
    )
  } finally {
    saving.value = false
  }
}
</script>
