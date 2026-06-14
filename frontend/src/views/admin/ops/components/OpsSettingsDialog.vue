<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { opsAPI } from '@/api/admin/ops'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import type { OpsAlertRuntimeSettings, EmailNotificationConfig, AlertSeverity, OpsAdvancedSettings, OpsMetricThresholds } from '../types'

const { t } = useI18n()
const appStore = useAppStore()

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const loading = ref(false)
const saving = ref(false)

// 运行时设置
const runtimeSettings = ref<OpsAlertRuntimeSettings | null>(null)
// 邮件通知配置
const emailConfig = ref<EmailNotificationConfig | null>(null)
// 高级设置
const advancedSettings = ref<OpsAdvancedSettings | null>(null)
// 指标阈值配置
const metricThresholds = ref<OpsMetricThresholds>({
  sla_percent_min: 99.5,
  ttft_p99_ms_max: 500,
  request_error_rate_percent_max: 5,
  upstream_error_rate_percent_max: 5
})

// 加载所有配置
async function loadAllSettings() {
  loading.value = true
  try {
    const [runtime, email, advanced, thresholds] = await Promise.all([
      opsAPI.getAlertRuntimeSettings(),
      opsAPI.getEmailNotificationConfig(),
      opsAPI.getAdvancedSettings(),
      opsAPI.getMetricThresholds()
    ])
    runtimeSettings.value = runtime
    emailConfig.value = email
    advancedSettings.value = advanced
    // 兼容旧 payload：后端未返回该字段时补默认值，保证表单可绑定
    if (advancedSettings.value && !advancedSettings.value.openai_account_quota_auto_pause) {
      advancedSettings.value.openai_account_quota_auto_pause = { default_threshold_5h: 0, default_threshold_7d: 0 }
    }
    // 如果后端返回了阈值，使用后端的值；否则保持默认值
    if (thresholds && Object.keys(thresholds).length > 0) {
        metricThresholds.value = {
          sla_percent_min: thresholds.sla_percent_min ?? 99.5,
          ttft_p99_ms_max: thresholds.ttft_p99_ms_max ?? 500,
          request_error_rate_percent_max: thresholds.request_error_rate_percent_max ?? 5,
          upstream_error_rate_percent_max: thresholds.upstream_error_rate_percent_max ?? 5
        }
    }
  } catch (err: any) {
    console.error('[OpsSettingsDialog] Failed to load settings', err)
    appStore.showError(err?.response?.data?.detail || t('admin.ops.settings.loadFailed'))
  } finally {
    loading.value = false
  }
}

// 监听弹窗打开
watch(() => props.show, (show) => {
  if (show) {
    loadAllSettings()
  }
})

// 邮件输入
const alertRecipientInput = ref('')
const reportRecipientInput = ref('')

// 严重级别选项
const severityOptions: Array<{ value: AlertSeverity | ''; label: string }> = [
  { value: '', label: t('admin.ops.email.minSeverityAll') },
  { value: 'critical', label: t('common.critical') },
  { value: 'warning', label: t('common.warning') },
  { value: 'info', label: t('common.info') }
]

// 验证邮箱
function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// 添加收件人
function addRecipient(target: 'alert' | 'report') {
  if (!emailConfig.value) return
  const raw = (target === 'alert' ? alertRecipientInput.value : reportRecipientInput.value).trim()
  if (!raw) return

  if (!isValidEmailAddress(raw)) {
    appStore.showError(t('common.invalidEmail'))
    return
  }

  const normalized = raw.toLowerCase()
  const list = target === 'alert' ? emailConfig.value.alert.recipients : emailConfig.value.report.recipients
  if (!list.includes(normalized)) {
    list.push(normalized)
  }
  if (target === 'alert') alertRecipientInput.value = ''
  else reportRecipientInput.value = ''
}

// 移除收件人
function removeRecipient(target: 'alert' | 'report', email: string) {
  if (!emailConfig.value) return
  const list = target === 'alert' ? emailConfig.value.alert.recipients : emailConfig.value.report.recipients
  const idx = list.indexOf(email)
  if (idx >= 0) list.splice(idx, 1)
}

// OpenAI 账号配额自动暂停：后端按 0~1 分数存储，UI 按百分比(0~100)展示
const quotaAutoPause5hPercent = computed<number | null>({
  get() {
    const v = advancedSettings.value?.openai_account_quota_auto_pause?.default_threshold_5h
    return v && v > 0 ? Math.round(v * 1000) / 10 : null
  },
  set(val) {
    if (!advancedSettings.value?.openai_account_quota_auto_pause) return
    advancedSettings.value.openai_account_quota_auto_pause.default_threshold_5h = val != null && val > 0 ? val / 100 : 0
  }
})
const quotaAutoPause7dPercent = computed<number | null>({
  get() {
    const v = advancedSettings.value?.openai_account_quota_auto_pause?.default_threshold_7d
    return v && v > 0 ? Math.round(v * 1000) / 10 : null
  },
  set(val) {
    if (!advancedSettings.value?.openai_account_quota_auto_pause) return
    advancedSettings.value.openai_account_quota_auto_pause.default_threshold_7d = val != null && val > 0 ? val / 100 : 0
  }
})

// 验证
const validation = computed(() => {
  const errors: string[] = []

  // 验证运行时设置
  if (runtimeSettings.value) {
    const evalSeconds = runtimeSettings.value.evaluation_interval_seconds
    if (!Number.isFinite(evalSeconds) || evalSeconds < 1 || evalSeconds > 86400) {
      errors.push(t('admin.ops.runtime.validation.evalIntervalRange'))
    }
  }

  // 邮件配置: 启用但无收件人时不阻断保存, 保存时会自动禁用

  // 验证高级设置
  if (advancedSettings.value) {
    const { error_log_retention_days, minute_metrics_retention_days, hourly_metrics_retention_days } = advancedSettings.value.data_retention
    if (error_log_retention_days < 0 || error_log_retention_days > 365) {
      errors.push(t('admin.ops.settings.validation.retentionDaysRange'))
    }
    if (minute_metrics_retention_days < 0 || minute_metrics_retention_days > 365) {
      errors.push(t('admin.ops.settings.validation.retentionDaysRange'))
    }
    if (hourly_metrics_retention_days < 0 || hourly_metrics_retention_days > 365) {
      errors.push(t('admin.ops.settings.validation.retentionDaysRange'))
    }

    const { default_threshold_5h, default_threshold_7d } = advancedSettings.value.openai_account_quota_auto_pause
    if (default_threshold_5h < 0 || default_threshold_5h > 1 || default_threshold_7d < 0 || default_threshold_7d > 1) {
      errors.push(t('admin.ops.settings.validation.openaiQuotaAutoPauseRange'))
    }
  }

  // 验证指标阈值
  if (metricThresholds.value.sla_percent_min != null && (metricThresholds.value.sla_percent_min < 0 || metricThresholds.value.sla_percent_min > 100)) {
    errors.push(t('admin.ops.settings.validation.slaMinPercentRange'))
  }
  if (metricThresholds.value.ttft_p99_ms_max != null && metricThresholds.value.ttft_p99_ms_max < 0) {
    errors.push(t('admin.ops.settings.validation.ttftP99MaxRange'))
  }
  if (metricThresholds.value.request_error_rate_percent_max != null && (metricThresholds.value.request_error_rate_percent_max < 0 || metricThresholds.value.request_error_rate_percent_max > 100)) {
    errors.push(t('admin.ops.settings.validation.requestErrorRateMaxRange'))
  }
  if (metricThresholds.value.upstream_error_rate_percent_max != null && (metricThresholds.value.upstream_error_rate_percent_max < 0 || metricThresholds.value.upstream_error_rate_percent_max > 100)) {
    errors.push(t('admin.ops.settings.validation.upstreamErrorRateMaxRange'))
  }

  return { valid: errors.length === 0, errors }
})

// 保存所有配置
async function saveAllSettings() {
  if (!validation.value.valid) {
    appStore.showError(validation.value.errors[0])
    return
  }

  saving.value = true
  try {
    // 无收件人时自动禁用邮件通知
    if (emailConfig.value) {
      if (emailConfig.value.alert.enabled && emailConfig.value.alert.recipients.length === 0) {
        emailConfig.value.alert.enabled = false
      }
      if (emailConfig.value.report.enabled && emailConfig.value.report.recipients.length === 0) {
        emailConfig.value.report.enabled = false
      }
    }
    await Promise.all([
      runtimeSettings.value ? opsAPI.updateAlertRuntimeSettings(runtimeSettings.value) : Promise.resolve(),
      emailConfig.value ? opsAPI.updateEmailNotificationConfig(emailConfig.value) : Promise.resolve(),
      advancedSettings.value ? opsAPI.updateAdvancedSettings(advancedSettings.value) : Promise.resolve(),
      opsAPI.updateMetricThresholds(metricThresholds.value)
    ])
    appStore.showSuccess(t('admin.ops.settings.saveSuccess'))
    emit('saved')
    emit('close')
  } catch (err: any) {
    console.error('[OpsSettingsDialog] Failed to save settings', err)
    appStore.showError(err?.response?.data?.message || err?.response?.data?.detail || t('admin.ops.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :show="show" :title="t('admin.ops.settings.title')" width="extra-wide" @close="emit('close')">
    <div v-if="loading" class="py-9 text-center text-sm text-muted-foreground">{{ t('common.loading') }}</div>

    <div v-else-if="runtimeSettings && emailConfig && advancedSettings" class="flex flex-col gap-4">
      <div v-if="!validation.valid" class="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5">
        <div class="text-xs font-bold text-amber-500">{{ t('admin.ops.settings.validation.title') }}</div>
        <ul class="mt-1 list-inside list-disc pl-1 text-[11.5px] text-amber-500">
          <li v-for="msg in validation.errors" :key="msg">{{ msg }}</li>
        </ul>
      </div>

      <!-- 数据采集频率 -->
      <div class="rounded-xl border border-border bg-card p-3.5">
        <h4 class="mb-2.5 text-[13px] font-semibold text-foreground">{{ t('admin.ops.settings.dataCollection') }}</h4>
        <div>
          <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.evaluationInterval') }}</Label>
          <Input v-model.number="runtimeSettings.evaluation_interval_seconds" type="number" min="1" max="86400" />
          <p class="mt-1 text-[11px] text-muted-foreground">{{ t('admin.ops.settings.evaluationIntervalHint') }}</p>
        </div>
      </div>

      <!-- 预警配置 -->
      <div class="rounded-xl border border-border bg-card p-3.5">
        <h4 class="mb-3 text-[13px] font-semibold text-foreground">{{ t('admin.ops.settings.alertConfig') }}</h4>
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <label class="text-[13px] text-muted-foreground">{{ t('admin.ops.settings.enableAlert') }}</label>
            <Switch v-model="emailConfig.alert.enabled" />
          </div>
          <div v-if="emailConfig.alert.enabled">
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.alertRecipients') }}</Label>
            <div class="flex gap-1.5">
              <Input v-model="alertRecipientInput" type="email" :placeholder="t('admin.ops.settings.emailPlaceholder')" @keydown.enter.prevent="addRecipient('alert')" />
              <Button variant="outline" size="sm" type="button" class="shrink-0 text-xs" @click="addRecipient('alert')">{{ t('common.add') }}</Button>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <Badge v-for="email in emailConfig.alert.recipients" :key="email" variant="outline" class="gap-1.5 text-primary">
                {{ email }}
                <Button variant="ghost" size="icon" type="button" class="h-3.5 w-3.5 opacity-70 hover:opacity-100" :aria-label="`移除 ${email}`" @click="removeRecipient('alert', email)">×</Button>
              </Badge>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">{{ t('admin.ops.settings.recipientsHint') }}</p>
          </div>
          <div v-if="emailConfig.alert.enabled">
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.minSeverity') }}</Label>
            <Select v-model="emailConfig.alert.min_severity">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in severityOptions" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <!-- 评估报告配置 -->
      <div class="rounded-xl border border-border bg-card p-3.5">
        <h4 class="mb-3 text-[13px] font-semibold text-foreground">{{ t('admin.ops.settings.reportConfig') }}</h4>
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <label class="text-[13px] text-muted-foreground">{{ t('admin.ops.settings.enableReport') }}</label>
            <Switch v-model="emailConfig.report.enabled" />
          </div>
          <div v-if="emailConfig.report.enabled">
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.reportRecipients') }}</Label>
            <div class="flex gap-1.5">
              <Input v-model="reportRecipientInput" type="email" :placeholder="t('admin.ops.settings.emailPlaceholder')" @keydown.enter.prevent="addRecipient('report')" />
              <Button variant="outline" size="sm" type="button" class="shrink-0 text-xs" @click="addRecipient('report')">{{ t('common.add') }}</Button>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <Badge v-for="email in emailConfig.report.recipients" :key="email" variant="outline" class="gap-1.5 text-primary">
                {{ email }}
                <Button variant="ghost" size="icon" type="button" class="h-3.5 w-3.5 opacity-70 hover:opacity-100" :aria-label="`移除 ${email}`" @click="removeRecipient('report', email)">×</Button>
              </Badge>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">{{ t('admin.ops.settings.recipientsHint') }}</p>
          </div>
          <div v-if="emailConfig.report.enabled" class="grid grid-cols-2 gap-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.dailySummary') }}</label>
              <Switch v-model="emailConfig.report.daily_summary_enabled" />
            </div>
            <div v-if="emailConfig.report.daily_summary_enabled">
              <Input v-model="emailConfig.report.daily_summary_schedule" type="text" placeholder="0 9 * * *" />
            </div>
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.weeklySummary') }}</label>
              <Switch v-model="emailConfig.report.weekly_summary_enabled" />
            </div>
            <div v-if="emailConfig.report.weekly_summary_enabled">
              <Input v-model="emailConfig.report.weekly_summary_schedule" type="text" placeholder="0 9 * * 1" />
            </div>
          </div>
        </div>
      </div>

      <!-- 指标阈值 -->
      <div class="rounded-xl border border-border bg-card p-3.5">
        <h4 class="mb-1 text-[13px] font-semibold text-foreground">{{ t('admin.ops.settings.metricThresholds') }}</h4>
        <p class="mb-3 text-[11px] text-muted-foreground">{{ t('admin.ops.settings.metricThresholdsHint') }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.slaMinPercent') }}</Label>
            <Input v-model.number="metricThresholds.sla_percent_min" type="number" min="0" max="100" step="0.1" />
            <p class="mt-1 text-[10px] text-muted-foreground">{{ t('admin.ops.settings.slaMinPercentHint') }}</p>
          </div>
          <div>
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.ttftP99MaxMs') }}</Label>
            <Input v-model.number="metricThresholds.ttft_p99_ms_max" type="number" min="0" step="50" />
            <p class="mt-1 text-[10px] text-muted-foreground">{{ t('admin.ops.settings.ttftP99MaxMsHint') }}</p>
          </div>
          <div>
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.requestErrorRateMaxPercent') }}</Label>
            <Input v-model.number="metricThresholds.request_error_rate_percent_max" type="number" min="0" max="100" step="0.1" />
            <p class="mt-1 text-[10px] text-muted-foreground">{{ t('admin.ops.settings.requestErrorRateMaxPercentHint') }}</p>
          </div>
          <div>
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.upstreamErrorRateMaxPercent') }}</Label>
            <Input v-model.number="metricThresholds.upstream_error_rate_percent_max" type="number" min="0" max="100" step="0.1" />
            <p class="mt-1 text-[10px] text-muted-foreground">{{ t('admin.ops.settings.upstreamErrorRateMaxPercentHint') }}</p>
          </div>
        </div>
      </div>

      <!-- 高级设置 -->
      <details class="rounded-xl border border-border bg-card">
        <summary class="cursor-pointer px-3.5 py-3.5 text-[13px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.advancedSettings') }}</summary>
        <div class="flex flex-col gap-4 px-3.5 pb-3.5">
          <!-- 数据保留策略 -->
          <div class="flex flex-col gap-2">
            <h5 class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.dataRetention') }}</h5>
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.enableCleanup') }}</label>
              <Switch v-model="advancedSettings.data_retention.cleanup_enabled" />
            </div>
            <div v-if="advancedSettings.data_retention.cleanup_enabled">
              <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.cleanupSchedule') }}</Label>
              <Input v-model="advancedSettings.data_retention.cleanup_schedule" type="text" placeholder="0 2 * * *" />
              <p class="mt-1 text-[10px] text-muted-foreground">{{ t('admin.ops.settings.cleanupScheduleHint') }}</p>
            </div>
            <div class="grid grid-cols-3 gap-2.5">
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.errorLogRetentionDays') }}</Label>
                <Input v-model.number="advancedSettings.data_retention.error_log_retention_days" type="number" min="0" max="365" />
              </div>
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.minuteMetricsRetentionDays') }}</Label>
                <Input v-model.number="advancedSettings.data_retention.minute_metrics_retention_days" type="number" min="0" max="365" />
              </div>
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.hourlyMetricsRetentionDays') }}</Label>
                <Input v-model.number="advancedSettings.data_retention.hourly_metrics_retention_days" type="number" min="0" max="365" />
              </div>
            </div>
            <p class="text-[11px] text-muted-foreground">{{ t('admin.ops.settings.retentionDaysHint') }}</p>
          </div>

          <!-- 预聚合 -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.enableAggregation') }}</label>
              <p class="mt-0.5 text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.aggregationHint') }}</p>
            </div>
            <Switch v-model="advancedSettings.aggregation.aggregation_enabled" />
          </div>

          <!-- OpenAI 配额 -->
          <div class="flex flex-col gap-2">
            <h5 class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.openaiQuotaAutoPause') }}</h5>
            <p class="text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.openaiQuotaAutoPauseHint') }}</p>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.openaiQuotaAutoPauseDefault5h') }}</Label>
                <Input v-model.number="quotaAutoPause5hPercent" type="number" min="0" max="100" step="0.1" data-testid="ops-quota-auto-pause-5h" />
              </div>
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.openaiQuotaAutoPauseDefault7d') }}</Label>
                <Input v-model.number="quotaAutoPause7dPercent" type="number" min="0" max="100" step="0.1" data-testid="ops-quota-auto-pause-7d" />
              </div>
            </div>
            <p class="text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.openaiQuotaAutoPauseThresholdHint') }}</p>
          </div>

          <!-- 错误过滤 -->
          <div class="flex flex-col gap-2.5">
            <h5 class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.errorFiltering') }}</h5>
            <div v-for="(key, idx) in (['ignore_count_tokens_errors','ignore_context_canceled','ignore_no_available_accounts','ignore_invalid_api_key_errors','ignore_insufficient_balance_errors'] as const)" :key="idx" class="flex items-start justify-between gap-3">
              <div>
                <label class="text-xs text-muted-foreground">{{ t(`admin.ops.settings.${key}`) }}</label>
                <p class="mt-0.5 text-[10.5px] text-muted-foreground">{{ t(`admin.ops.settings.${key}Hint`) }}</p>
              </div>
              <Switch v-model="(advancedSettings as any)[key]" />
            </div>
          </div>

          <!-- Auto Refresh -->
          <div class="flex flex-col gap-2">
            <h5 class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.autoRefresh') }}</h5>
            <div class="flex items-start justify-between gap-3">
              <div>
                <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.enableAutoRefresh') }}</label>
                <p class="mt-0.5 text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.enableAutoRefreshHint') }}</p>
              </div>
              <Switch v-model="advancedSettings.auto_refresh_enabled" />
            </div>
            <div v-if="advancedSettings.auto_refresh_enabled">
              <Label class="mb-1 block text-xs font-medium text-muted-foreground">{{ t('admin.ops.settings.refreshInterval') }}</Label>
              <Select v-model="advancedSettings.auto_refresh_interval_seconds">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="15">{{ t('admin.ops.settings.refreshInterval15s') }}</SelectItem>
                  <SelectItem :value="30">{{ t('admin.ops.settings.refreshInterval30s') }}</SelectItem>
                  <SelectItem :value="60">{{ t('admin.ops.settings.refreshInterval60s') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Dashboard Cards -->
          <div class="flex flex-col gap-2.5">
            <h5 class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.ops.settings.dashboardCards') }}</h5>
            <div class="flex items-start justify-between gap-3">
              <div>
                <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.displayAlertEvents') }}</label>
                <p class="mt-0.5 text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.displayAlertEventsHint') }}</p>
              </div>
              <Switch v-model="advancedSettings.display_alert_events" />
            </div>
            <div class="flex items-start justify-between gap-3">
              <div>
                <label class="text-xs text-muted-foreground">{{ t('admin.ops.settings.displayOpenAITokenStats') }}</label>
                <p class="mt-0.5 text-[10.5px] text-muted-foreground">{{ t('admin.ops.settings.displayOpenAITokenStatsHint') }}</p>
              </div>
              <Switch v-model="advancedSettings.display_openai_token_stats" />
            </div>
          </div>
        </div>
      </details>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button :disabled="saving || !validation.valid" @click="saveAllSettings">{{ saving ? t('common.saving') : t('common.save') }}</Button>
      </div>
    </template>
  </BaseDialog>
</template>
