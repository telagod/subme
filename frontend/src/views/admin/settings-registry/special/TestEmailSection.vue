<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <div class="flex flex-col gap-1.5">
      <Label for="test-email-recipient" class="text-sm font-medium">
        {{ t('admin.settings.testEmail.recipientEmail') }}
      </Label>
      <div class="flex items-center gap-2">
        <Input
          id="test-email-recipient"
          v-model="recipient"
          type="email"
          class="max-w-xs"
          :placeholder="t('admin.settings.testEmail.recipientEmailPlaceholder')"
        />
        <Button
          type="button"
          size="sm"
          :disabled="sending || !recipient.trim()"
          @click="handleSend"
        >
          <svg
            v-if="sending"
            class="mr-1.5 h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {{ sending ? t('admin.settings.testEmail.sending') : t('admin.settings.testEmail.sendTestEmail') }}
        </Button>
      </div>
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const { t } = useI18n()
const appStore = useAppStore()

const form = computed(() => props.formValues ?? props.settings)

const recipient = ref('')
const sending = ref(false)

async function handleSend() {
  if (!recipient.value.trim()) {
    appStore.showError(t('admin.settings.testEmail.enterRecipientHint'))
    return
  }
  sending.value = true
  try {
    const f = form.value
    const result = await adminAPI.settings.sendTestEmail({
      email: recipient.value.trim(),
      smtp_host: String(f['smtp_host'] ?? ''),
      smtp_port: Number(f['smtp_port'] ?? 587),
      smtp_username: String(f['smtp_username'] ?? ''),
      smtp_password: String(f['smtp_password'] ?? ''),
      smtp_from_email: String(f['smtp_from_email'] ?? ''),
      smtp_from_name: String(f['smtp_from_name'] ?? ''),
      smtp_use_tls: Boolean(f['smtp_use_tls']),
    })
    appStore.showSuccess(result.message || t('admin.settings.testEmailSent'))
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('admin.settings.failedToSendTestEmail')))
  } finally {
    sending.value = false
  }
}
</script>
