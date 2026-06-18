<template>
  <div class="flex flex-col gap-5 p-5">
    <!-- SMTP fields -->
    <div class="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      <FieldRenderer
        v-for="field in smtpFields"
        :key="field.key"
        :field="field"
        :model-value="form[field.key]"
        :form-values="form"
        @update:model-value="emit('update:field', field.key, $event)"
      />
    </div>

    <!-- Test Connection button -->
    <div class="flex items-center gap-3 border-t border-border pt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="testing"
        @click="handleTestConnection"
      >
        <svg
          v-if="testing"
          class="mr-1.5 h-3.5 w-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {{ testing ? t('admin.settings.smtp.testing') : t('admin.settings.smtp.testConnection') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Button } from '@/components/ui/button'
import FieldRenderer from '../FieldRenderer.vue'
import type { SettingsField } from '../types'

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()
const appStore = useAppStore()

const form = computed(() => props.formValues ?? props.settings)

const testing = ref(false)

const smtpFields: SettingsField[] = [
  {
    key: 'smtp_host',
    label: 'admin.settings.smtp.host',
    type: 'text',
    placeholder: 'admin.settings.smtp.hostPlaceholder',
  },
  {
    key: 'smtp_port',
    label: 'admin.settings.smtp.port',
    type: 'number',
    placeholder: 'admin.settings.smtp.portPlaceholder',
  },
  {
    key: 'smtp_username',
    label: 'admin.settings.smtp.username',
    type: 'text',
    placeholder: 'admin.settings.smtp.usernamePlaceholder',
  },
  {
    key: 'smtp_password',
    label: 'admin.settings.smtp.password',
    type: 'password',
    sensitive: true,
    placeholder: 'admin.settings.smtp.passwordPlaceholder',
    help: 'admin.settings.smtp.passwordHint',
  },
  {
    key: 'smtp_from_email',
    label: 'admin.settings.smtp.fromEmail',
    type: 'text',
    placeholder: 'admin.settings.smtp.fromEmailPlaceholder',
  },
  {
    key: 'smtp_from_name',
    label: 'admin.settings.smtp.fromName',
    type: 'text',
    placeholder: 'admin.settings.smtp.fromNamePlaceholder',
  },
  {
    key: 'smtp_use_tls',
    label: 'admin.settings.smtp.useTls',
    type: 'switch',
    help: 'admin.settings.smtp.useTlsHint',
  },
]

async function handleTestConnection() {
  testing.value = true
  try {
    const f = form.value
    const result = await adminAPI.settings.testSmtpConnection({
      smtp_host: String(f['smtp_host'] ?? ''),
      smtp_port: Number(f['smtp_port'] ?? 587),
      smtp_username: String(f['smtp_username'] ?? ''),
      smtp_password: String(f['smtp_password'] ?? ''),
      smtp_use_tls: Boolean(f['smtp_use_tls']),
    })
    appStore.showSuccess(result.message || t('admin.settings.smtpConnectionSuccess'))
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('admin.settings.failedToTestSmtp')))
  } finally {
    testing.value = false
  }
}
</script>
