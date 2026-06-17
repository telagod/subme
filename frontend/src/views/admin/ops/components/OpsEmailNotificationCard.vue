<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { opsAPI } from '@/api/admin/ops'
import type { EmailNotificationConfig, AlertSeverity } from '../types'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(false)
const config = ref<EmailNotificationConfig | null>(null)

const showEditor = ref(false)
const saving = ref(false)
const draft = ref<EmailNotificationConfig | null>(null)
const alertRecipientInput = ref('')
const reportRecipientInput = ref('')
const alertRecipientError = ref('')
const reportRecipientError = ref('')

const severityOptions: Array<{ value: AlertSeverity | 'all'; label: string }> = [
  { value: 'all', label: t('admin.ops.email.minSeverityAll') },
  { value: 'critical', label: t('common.critical') },
  { value: 'warning', label: t('common.warning') },
  { value: 'info', label: t('common.info') }
]

async function loadConfig() {
  loading.value = true
  try {
    const data = await opsAPI.getEmailNotificationConfig()
    config.value = data
  } catch (err: any) {
    console.error('[OpsEmailNotificationCard] Failed to load config', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.email.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (!draft.value) return
  if (!editorValidation.value.valid) {
    appStore.showError(editorValidation.value.errors[0] || t('admin.ops.email.validation.invalid'))
    return
  }
  saving.value = true
  try {
    config.value = await opsAPI.updateEmailNotificationConfig(draft.value)
    showEditor.value = false
    appStore.showSuccess(t('admin.ops.email.saveSuccess'))
  } catch (err: any) {
    console.error('[OpsEmailNotificationCard] Failed to save config', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.email.saveFailed'))
  } finally {
    saving.value = false
  }
}

function openEditor() {
  if (!config.value) return
  draft.value = JSON.parse(JSON.stringify(config.value))
  alertRecipientInput.value = ''
  reportRecipientInput.value = ''
  alertRecipientError.value = ''
  reportRecipientError.value = ''
  showEditor.value = true
}

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateCronField(enabled: boolean, cron: string): string | null {
  if (!enabled) return null
  if (!cron || !cron.trim()) return t('admin.ops.email.validation.cronRequired')
  if (cron.trim().split(/\s+/).length < 5) return t('admin.ops.email.validation.cronFormat')
  return null
}

const editorValidation = computed(() => {
  const errors: string[] = []
  if (!draft.value) return { valid: true, errors }

  if (draft.value.alert.enabled && draft.value.alert.recipients.length === 0) {
    errors.push(t('admin.ops.email.validation.alertRecipientsRequired'))
  }
  if (draft.value.report.enabled && draft.value.report.recipients.length === 0) {
    errors.push(t('admin.ops.email.validation.reportRecipientsRequired'))
  }

  const invalidAlertRecipients = draft.value.alert.recipients.filter((e) => !isValidEmailAddress(e))
  if (invalidAlertRecipients.length > 0) errors.push(t('admin.ops.email.validation.invalidRecipients'))

  const invalidReportRecipients = draft.value.report.recipients.filter((e) => !isValidEmailAddress(e))
  if (invalidReportRecipients.length > 0) errors.push(t('admin.ops.email.validation.invalidRecipients'))

  if (!isNonNegativeNumber(draft.value.alert.rate_limit_per_hour)) {
    errors.push(t('admin.ops.email.validation.rateLimitRange'))
  }
  if (
    !isNonNegativeNumber(draft.value.alert.batching_window_seconds) ||
    draft.value.alert.batching_window_seconds > 86400
  ) {
    errors.push(t('admin.ops.email.validation.batchWindowRange'))
  }

  const dailyErr = validateCronField(
    draft.value.report.daily_summary_enabled,
    draft.value.report.daily_summary_schedule
  )
  if (dailyErr) errors.push(dailyErr)
  const weeklyErr = validateCronField(
    draft.value.report.weekly_summary_enabled,
    draft.value.report.weekly_summary_schedule
  )
  if (weeklyErr) errors.push(weeklyErr)
  const digestErr = validateCronField(
    draft.value.report.error_digest_enabled,
    draft.value.report.error_digest_schedule
  )
  if (digestErr) errors.push(digestErr)
  const accErr = validateCronField(
    draft.value.report.account_health_enabled,
    draft.value.report.account_health_schedule
  )
  if (accErr) errors.push(accErr)

  if (!isNonNegativeNumber(draft.value.report.error_digest_min_count)) {
    errors.push(t('admin.ops.email.validation.digestMinCountRange'))
  }

  const thr = draft.value.report.account_health_error_rate_threshold
  if (!(typeof thr === 'number' && Number.isFinite(thr) && thr >= 0 && thr <= 100)) {
    errors.push(t('admin.ops.email.validation.accountHealthThresholdRange'))
  }

  return { valid: errors.length === 0, errors }
})

function addRecipient(target: 'alert' | 'report') {
  if (!draft.value) return
  const raw = (target === 'alert' ? alertRecipientInput.value : reportRecipientInput.value).trim()
  if (!raw) return

  if (!isValidEmailAddress(raw)) {
    const msg = t('common.invalidEmail')
    if (target === 'alert') alertRecipientError.value = msg
    else reportRecipientError.value = msg
    return
  }

  const normalized = raw.toLowerCase()
  const list = target === 'alert' ? draft.value.alert.recipients : draft.value.report.recipients
  if (!list.includes(normalized)) {
    list.push(normalized)
  }
  if (target === 'alert') alertRecipientInput.value = ''
  else reportRecipientInput.value = ''
  if (target === 'alert') alertRecipientError.value = ''
  else reportRecipientError.value = ''
}

function removeRecipient(target: 'alert' | 'report', email: string) {
  if (!draft.value) return
  const list = target === 'alert' ? draft.value.alert.recipients : draft.value.report.recipients
  const idx = list.indexOf(email)
  if (idx >= 0) list.splice(idx, 1)
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <Card class="p-6">
    <div class="flex items-start justify-between gap-3 mb-3.5">
      <div>
        <h3 class="flex items-center gap-2 text-sm font-bold text-foreground">{{ t('admin.ops.email.title') }}</h3>
        <p class="mt-0.5 text-[11.5px] text-muted-foreground">{{ t('admin.ops.email.description') }}</p>
      </div>
      <div class="flex items-center gap-1.5">
        <Button variant="outline" size="sm" class="h-8 w-8 p-0" :disabled="loading" @click="loadConfig">
          <svg width="13" height="13" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          {{ t('common.refresh') }}
        </Button>
        <Button variant="outline" size="sm" :disabled="!config" @click="openEditor">{{ t('common.edit') }}</Button>
      </div>
    </div>

    <div v-if="!config" class="text-sm text-muted-foreground">
      <span v-if="loading">{{ t('admin.ops.email.loading') }}</span>
      <span v-else>{{ t('admin.ops.email.noData') }}</span>
    </div>

    <div v-else class="flex flex-col gap-3">
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">{{ t('admin.ops.email.alertTitle') }}</div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('common.enabled') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.alert.enabled ? t('common.enabled') : t('common.disabled') }}</div>
          </div>
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('admin.ops.email.recipients') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.alert.recipients.length }}</div>
          </div>
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('admin.ops.email.minSeverity') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.alert.min_severity || t('admin.ops.email.minSeverityAll') }}</div>
          </div>
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('admin.ops.email.rateLimitPerHour') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.alert.rate_limit_per_hour }}</div>
          </div>
        </div>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">{{ t('admin.ops.email.reportTitle') }}</div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('common.enabled') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.report.enabled ? t('common.enabled') : t('common.disabled') }}</div>
          </div>
          <div class="rounded-lg border border-border bg-background p-3">
            <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{ t('admin.ops.email.recipients') }}</div>
            <div class="mt-0.5 text-base font-black text-foreground">{{ config.report.recipients.length }}</div>
          </div>
        </div>
      </div>
    </div>
  </Card>

  <BaseDialog :show="showEditor" :title="t('admin.ops.email.title')" width="extra-wide" @close="showEditor = false">
    <div v-if="draft" class="flex flex-col gap-4">
      <div v-if="!editorValidation.valid" class="rounded-lg border border-yellow-500/25 bg-yellow-500/8 px-3.5 py-2.5 text-[11.5px] text-yellow-500">
        <div class="font-bold">{{ t('admin.ops.email.validation.title') }}</div>
        <ul class="mt-1 pl-4">
          <li v-for="msg in editorValidation.errors" :key="msg">{{ msg }}</li>
        </ul>
      </div>

      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-3 text-sm font-semibold text-foreground">{{ t('admin.ops.email.alertTitle') }}</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('common.enabled') }}</Label>
            <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox v-model="draft.alert.enabled" />
              {{ draft.alert.enabled ? t('common.enabled') : t('common.disabled') }}
            </label>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.minSeverity') }}</Label>
            <Select :model-value="draft.alert.min_severity || 'all'" @update:model-value="(v: any) => { if (draft) draft.alert.min_severity = v === 'all' ? '' : v }">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in severityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="col-span-2">
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.recipients') }}</Label>
            <div class="flex gap-1.5">
              <Input v-model="alertRecipientInput" type="email" :placeholder="t('admin.ops.email.recipients')" @keydown.enter.prevent="addRecipient('alert')" />
              <Button variant="outline" size="sm" type="button" class="whitespace-nowrap" @click="addRecipient('alert')">{{ t('common.add') }}</Button>
            </div>
            <p v-if="alertRecipientError" class="mt-0.5 text-[11px] text-destructive">{{ alertRecipientError }}</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <Badge v-for="email in draft.alert.recipients" :key="email" variant="outline" class="gap-1.5 border-blue-500/35 bg-blue-500/10 text-blue-400">
                {{ email }}
                <Button type="button" variant="ghost" size="icon" class="h-3.5 w-3.5 p-0 opacity-70 hover:opacity-100" @click="removeRecipient('alert', email)">×</Button>
              </Badge>
            </div>
            <div class="mt-1 text-[11px] text-muted-foreground">{{ t('admin.ops.email.recipientsHint') }}</div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.rateLimitPerHour') }}</Label>
            <Input v-model.number="draft.alert.rate_limit_per_hour" type="number" min="0" max="100000" />
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.batchWindowSeconds') }}</Label>
            <Input v-model.number="draft.alert.batching_window_seconds" type="number" min="0" max="86400" />
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.includeResolved') }}</Label>
            <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox v-model="draft.alert.include_resolved_alerts" />
              {{ draft.alert.include_resolved_alerts ? t('common.enabled') : t('common.disabled') }}
            </label>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-3 text-sm font-semibold text-foreground">{{ t('admin.ops.email.reportTitle') }}</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('common.enabled') }}</Label>
            <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox v-model="draft.report.enabled" />
              {{ draft.report.enabled ? t('common.enabled') : t('common.disabled') }}
            </label>
          </div>
          <div class="col-span-2">
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.recipients') }}</Label>
            <div class="flex gap-1.5">
              <Input v-model="reportRecipientInput" type="email" :placeholder="t('admin.ops.email.recipients')" @keydown.enter.prevent="addRecipient('report')" />
              <Button variant="outline" size="sm" type="button" class="whitespace-nowrap" @click="addRecipient('report')">{{ t('common.add') }}</Button>
            </div>
            <p v-if="reportRecipientError" class="mt-0.5 text-[11px] text-destructive">{{ reportRecipientError }}</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <Badge v-for="email in draft.report.recipients" :key="email" variant="outline" class="gap-1.5 border-blue-500/35 bg-blue-500/10 text-blue-400">
                {{ email }}
                <Button type="button" variant="ghost" size="icon" class="h-3.5 w-3.5 p-0 opacity-70 hover:opacity-100" @click="removeRecipient('report', email)">×</Button>
              </Badge>
            </div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.dailySummary') }}</Label>
            <div class="flex items-center gap-2">
              <Checkbox v-model="draft.report.daily_summary_enabled" />
              <Input v-model="draft.report.daily_summary_schedule" type="text" :placeholder="t('admin.ops.email.cronPlaceholder')" />
            </div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.weeklySummary') }}</Label>
            <div class="flex items-center gap-2">
              <Checkbox v-model="draft.report.weekly_summary_enabled" />
              <Input v-model="draft.report.weekly_summary_schedule" type="text" :placeholder="t('admin.ops.email.cronPlaceholder')" />
            </div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.errorDigest') }}</Label>
            <div class="flex items-center gap-2">
              <Checkbox v-model="draft.report.error_digest_enabled" />
              <Input v-model="draft.report.error_digest_schedule" type="text" :placeholder="t('admin.ops.email.cronPlaceholder')" />
            </div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.errorDigestMinCount') }}</Label>
            <Input v-model.number="draft.report.error_digest_min_count" type="number" min="0" max="1000000" />
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.accountHealth') }}</Label>
            <div class="flex items-center gap-2">
              <Checkbox v-model="draft.report.account_health_enabled" />
              <Input v-model="draft.report.account_health_schedule" type="text" :placeholder="t('admin.ops.email.cronPlaceholder')" />
            </div>
          </div>
          <div>
            <Label class="mb-1 block text-[12.5px] font-medium text-muted-foreground">{{ t('admin.ops.email.accountHealthThreshold') }}</Label>
            <Input v-model.number="draft.report.account_health_error_rate_threshold" type="number" min="0" max="100" step="0.1" />
          </div>
          <div class="col-span-2 text-[11px] text-muted-foreground">{{ t('admin.ops.email.reportHint') }}</div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showEditor = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="saving || !editorValidation.valid" @click="saveConfig">{{ saving ? t('common.saving') : t('common.save') }}</Button>
      </div>
    </template>
  </BaseDialog>
</template>
