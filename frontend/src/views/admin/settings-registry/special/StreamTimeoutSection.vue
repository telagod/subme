<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- loading -->
    <div v-if="loading" class="flex items-center gap-2 text-[13px] text-muted-foreground">
      <div class="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-border border-b-primary" />
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <!-- enabled switch -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.streamTimeout.enabled') }}</Label>
          <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.streamTimeout.enabledHint') }}</p>
        </div>
        <Toggle v-model="form.enabled" />
      </div>

      <!-- expanded fields — only when enabled -->
      <div v-if="form.enabled" class="flex flex-col gap-3.5 border-t border-border pt-4">

        <!-- action select -->
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.streamTimeout.action') }}</Label>
          <Select v-model="form.action">
            <SelectTrigger class="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="temp_unsched">{{ t('admin.settings.streamTimeout.actionTempUnsched') }}</SelectItem>
              <SelectItem value="error">{{ t('admin.settings.streamTimeout.actionError') }}</SelectItem>
              <SelectItem value="none">{{ t('admin.settings.streamTimeout.actionNone') }}</SelectItem>
            </SelectContent>
          </Select>
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.streamTimeout.actionHint') }}</p>
        </div>

        <!-- temp_unsched_minutes — gated on action -->
        <div v-if="form.action === 'temp_unsched'" class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.streamTimeout.tempUnschedMinutes') }}</Label>
          <Input
            v-model.number="form.temp_unsched_minutes"
            type="number"
            min="1"
            max="60"
            class="w-32 font-mono"
          />
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.streamTimeout.tempUnschedMinutesHint') }}</p>
        </div>

        <!-- threshold_count -->
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.streamTimeout.thresholdCount') }}</Label>
          <Input
            v-model.number="form.threshold_count"
            type="number"
            min="1"
            max="10"
            class="w-32 font-mono"
          />
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.streamTimeout.thresholdCountHint') }}</p>
        </div>

        <!-- threshold_window_minutes -->
        <div class="flex flex-col gap-1">
          <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.streamTimeout.thresholdWindowMinutes') }}</Label>
          <Input
            v-model.number="form.threshold_window_minutes"
            type="number"
            min="1"
            max="60"
            class="w-32 font-mono"
          />
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.streamTimeout.thresholdWindowMinutesHint') }}</p>
        </div>
      </div>

      <!-- save -->
      <div class="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="saving"
          @click="save"
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)

const form = reactive({
  enabled: true,
  action: 'temp_unsched' as 'temp_unsched' | 'error' | 'none',
  temp_unsched_minutes: 5,
  threshold_count: 3,
  threshold_window_minutes: 10,
})

onMounted(async () => {
  loading.value = true
  try {
    const settings = await adminAPI.settings.getStreamTimeoutSettings()
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
    const updated = await adminAPI.settings.updateStreamTimeoutSettings({
      enabled: form.enabled,
      action: form.action,
      temp_unsched_minutes: form.temp_unsched_minutes,
      threshold_count: form.threshold_count,
      threshold_window_minutes: form.threshold_window_minutes,
    })
    Object.assign(form, updated)
    appStore.showSuccess(t('admin.settings.streamTimeout.saved'))
  } catch (error: unknown) {
    appStore.showError(
      extractApiErrorMessage(error, t('admin.settings.streamTimeout.saveFailed')),
    )
  } finally {
    saving.value = false
  }
}
</script>
