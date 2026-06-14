<template>
  <BaseDialog
    :show="show"
    :title="t('admin.channelMonitor.template.managerTitle')"
    width="wide"
    @close="$emit('close')"
  >
    <!-- provider tabs -->
    <div class="mb-4 border-b border-border">
      <div role="tablist" class="flex gap-1">
        <Button
          v-for="tab in providerTabs"
          :key="tab.value"
          type="button"
          variant="ghost"
          role="tab"
          :aria-selected="activeProvider === tab.value"
          class="px-4 py-2 text-sm font-medium transition-colors rounded-none"
          :class="tabClass(tab.value)"
          @click="activeProvider = tab.value"
        >
          {{ tab.label }}
          <Badge
            v-if="countByProvider[tab.value] > 0"
            variant="secondary"
            class="ml-1.5"
          >
            {{ countByProvider[tab.value] }}
          </Badge>
        </Button>
      </div>
    </div>

    <!-- active provider list -->
    <div v-if="!editing" class="space-y-2">
      <div class="flex justify-end">
        <Button size="sm" @click="openCreateForm">
          <Icon name="plus" size="sm" class="mr-1" />
          {{ t('admin.channelMonitor.template.createButton') }}
        </Button>
      </div>

      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </div>

      <div
        v-else-if="templatesForActiveProvider.length === 0"
        class="py-8 text-center text-sm text-muted-foreground"
      >
        {{ t('admin.channelMonitor.template.emptyState') }}
      </div>

      <div
        v-for="tpl in templatesForActiveProvider"
        v-else
        :key="tpl.id"
        class="rounded-lg border border-border bg-card p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-foreground">{{ tpl.name }}</span>
              <Badge
                variant="outline"
                :class="modeBadgeClass(tpl.body_override_mode)"
              >
                {{ modeLabel(tpl.body_override_mode) }}
              </Badge>
              <Badge
                v-if="tpl.provider === PROVIDER_OPENAI"
                variant="outline"
                :class="apiModeBadgeClass(tpl.api_mode)"
              >
                {{ apiModeLabel(tpl.api_mode) }}
              </Badge>
              <span
                v-if="tpl.associated_monitors > 0"
                class="text-xs text-muted-foreground"
              >
                {{ t('admin.channelMonitor.template.associatedCount', { n: tpl.associated_monitors }) }}
              </span>
            </div>
            <p v-if="tpl.description" class="mt-0.5 text-xs text-muted-foreground">
              {{ tpl.description }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t('admin.channelMonitor.template.headersSummary', {
                n: Object.keys(tpl.extra_headers || {}).length,
              }) }}
            </p>
          </div>
          <div class="flex flex-shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="tpl.associated_monitors === 0"
              :title="t('admin.channelMonitor.template.applyTooltip')"
              @click="confirmApply(tpl)"
            >
              <Icon name="refresh" size="sm" class="mr-1" />
              {{ t('admin.channelMonitor.template.applyButton') }}
            </Button>
            <Button variant="outline" size="sm" @click="openEditForm(tpl)">
              {{ t('common.edit') }}
            </Button>
            <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" @click="handleDelete(tpl)">
              {{ t('common.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- edit / create form -->
    <div v-else class="space-y-4">
      <div>
        <Label class="mb-1.5 block">
          {{ t('admin.channelMonitor.template.form.name') }}
          <span class="text-destructive">*</span>
        </Label>
        <Input
          v-model="form.name"
          type="text"
          required
          :placeholder="t('admin.channelMonitor.template.form.namePlaceholder')"
        />
      </div>

      <div v-if="editing === 'new'">
        <Label class="mb-1.5 block">
          {{ t('admin.channelMonitor.form.provider') }}
          <span class="text-destructive">*</span>
        </Label>
        <div class="grid grid-cols-3 gap-3">
          <Button
            v-for="opt in providerTabs"
            :key="opt.value"
            type="button"
            variant="outline"
            class="rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors"
            :class="providerPickerClass(opt.value, form.provider === opt.value)"
            @click="form.provider = opt.value"
          >
            {{ opt.label }}
          </Button>
        </div>
      </div>

      <div v-if="form.provider === PROVIDER_OPENAI" class="rounded-lg border border-border bg-accent p-3">
        <Label class="mb-1.5 block">{{ t('admin.channelMonitor.form.apiMode') }}</Label>
        <div class="grid gap-3 sm:grid-cols-2">
          <Button
            v-for="opt in apiModeOptions"
            :key="opt.value"
            type="button"
            variant="outline"
            class="h-auto rounded-lg border-2 px-3 py-2 text-left transition-colors flex-col items-start"
            :class="apiModeButtonClass(opt.value)"
            @click="form.api_mode = opt.value"
          >
            <span class="block text-sm font-semibold">{{ opt.label }}</span>
            <span class="mt-0.5 block text-xs opacity-80">{{ opt.hint }}</span>
          </Button>
        </div>
      </div>

      <div>
        <Label class="mb-1.5 block">
          {{ t('admin.channelMonitor.template.form.description') }}
        </Label>
        <Input
          v-model="form.description"
          type="text"
          :placeholder="t('admin.channelMonitor.template.form.descriptionPlaceholder')"
        />
      </div>

      <MonitorAdvancedRequestConfig
        :provider="form.provider"
        :api-mode="form.api_mode"
        :extra-headers="form.extra_headers"
        :body-override-mode="form.body_override_mode"
        :body-override="form.body_override"
        @update:extra-headers="form.extra_headers = $event"
        @update:body-override-mode="form.body_override_mode = $event"
        @update:body-override="form.body_override = $event"
      />
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-between">
        <!-- Left: back to list / nothing -->
        <div>
          <Button v-if="editing" variant="outline" @click="backToList">
            {{ t('common.back') }}
          </Button>
        </div>
        <!-- Right: save or close -->
        <div class="flex gap-2">
          <Button variant="outline" @click="$emit('close')">
            {{ t('common.close') }}
          </Button>
          <Button v-if="editing" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? t('common.submitting') : editing === 'new' ? t('common.create') : t('common.update') }}
          </Button>
        </div>
      </div>
    </template>
  </BaseDialog>

  <MonitorTemplateApplyPickerDialog
    :show="applyPicker.show"
    :template-id="applyPicker.tpl ? applyPicker.tpl.id : null"
    :template-name="applyPicker.tpl ? applyPicker.tpl.name : ''"
    @close="applyPicker.show = false"
    @applied="onApplied"
  />

  <ConfirmDialog
    :show="confirmDelete.show"
    :title="t('common.delete')"
    :message="confirmDeleteMessage"
    :confirm-text="t('common.delete')"
    :cancel-text="t('common.cancel')"
    :danger="true"
    @confirm="doDelete"
    @cancel="confirmDelete.show = false"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '@/api/admin'
import type {
  APIMode,
  BodyOverrideMode,
  Provider,
} from '@/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '@/api/admin/channelMonitorTemplate'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import MonitorAdvancedRequestConfig from '@/components/admin/monitor/MonitorAdvancedRequestConfig.vue'
import MonitorTemplateApplyPickerDialog from '@/components/admin/monitor/MonitorTemplateApplyPickerDialog.vue'
import { useChannelMonitorFormat } from '@/composables/useChannelMonitorFormat'
import {
  PROVIDER_ANTHROPIC,
  PROVIDER_OPENAI,
  PROVIDER_GEMINI,
  API_MODE_CHAT_COMPLETIONS,
  API_MODE_RESPONSES,
} from '@/constants/channelMonitor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  /** Fired when any template changed (create / update / delete / apply). */
  (e: 'updated'): void
}>()

const { t } = useI18n()
const appStore = useAppStore()
const { providerPickerClass } = useChannelMonitorFormat()

const providerTabs = computed<{ value: Provider; label: string }[]>(() => [
  { value: PROVIDER_ANTHROPIC, label: t('monitorCommon.providers.anthropic') },
  { value: PROVIDER_OPENAI, label: t('monitorCommon.providers.openai') },
  { value: PROVIDER_GEMINI, label: t('monitorCommon.providers.gemini') },
])

const activeProvider = ref<Provider>(PROVIDER_ANTHROPIC)
const templates = ref<ChannelMonitorTemplate[]>([])
const loading = ref(false)

const templatesForActiveProvider = computed(() =>
  templates.value.filter((t) => t.provider === activeProvider.value),
)

const countByProvider = computed<Record<Provider, number>>(() => {
  const out: Record<Provider, number> = {
    anthropic: 0,
    openai: 0,
    gemini: 0,
  }
  for (const t of templates.value) out[t.provider]++
  return out
})

// --- form state ---
interface TemplateForm {
  id: number | null
  name: string
  provider: Provider
  api_mode: APIMode
  description: string
  extra_headers: Record<string, string>
  body_override_mode: BodyOverrideMode
  body_override: Record<string, unknown> | null
}

const editing = ref<null | 'new' | number>(null) // null = list view; 'new' = create; <id> = edit
const submitting = ref(false)
const form = reactive<TemplateForm>(emptyForm(PROVIDER_ANTHROPIC))

function emptyForm(provider: Provider): TemplateForm {
  return {
    id: null,
    name: '',
    provider,
    api_mode: API_MODE_CHAT_COMPLETIONS,
    description: '',
    extra_headers: {},
    body_override_mode: 'off',
    body_override: null,
  }
}

function loadForm(tpl: ChannelMonitorTemplate) {
  form.id = tpl.id
  form.name = tpl.name
  form.provider = tpl.provider
  form.api_mode = normalizeAPIMode(tpl.api_mode)
  form.description = tpl.description
  form.extra_headers = { ...(tpl.extra_headers || {}) }
  form.body_override_mode = tpl.body_override_mode
  form.body_override = tpl.body_override ? { ...tpl.body_override } : null
}

function openCreateForm() {
  Object.assign(form, emptyForm(activeProvider.value))
  editing.value = 'new'
}

function openEditForm(tpl: ChannelMonitorTemplate) {
  loadForm(tpl)
  editing.value = tpl.id
}

function backToList() {
  editing.value = null
}

// --- data fetch ---
async function fetchTemplates() {
  loading.value = true
  try {
    const { items } = await adminAPI.channelMonitorTemplate.list()
    templates.value = items
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      editing.value = null
      fetchTemplates()
    }
  },
  { immediate: true },
)

// --- submit ---
async function handleSubmit() {
  if (submitting.value) return
  if (!form.name.trim()) {
    appStore.showError(t('admin.channelMonitor.template.missingName'))
    return
  }
  submitting.value = true
  try {
    if (editing.value === 'new') {
      await adminAPI.channelMonitorTemplate.create({
        name: form.name.trim(),
        provider: form.provider,
        api_mode: form.provider === PROVIDER_OPENAI ? form.api_mode : API_MODE_CHAT_COMPLETIONS,
        description: form.description.trim(),
        extra_headers: form.extra_headers,
        body_override_mode: form.body_override_mode,
        body_override: form.body_override,
      })
      appStore.showSuccess(t('admin.channelMonitor.template.createSuccess'))
    } else if (typeof editing.value === 'number') {
      await adminAPI.channelMonitorTemplate.update(editing.value, {
        name: form.name.trim(),
        api_mode: form.provider === PROVIDER_OPENAI ? form.api_mode : API_MODE_CHAT_COMPLETIONS,
        description: form.description.trim(),
        extra_headers: form.extra_headers,
        body_override_mode: form.body_override_mode,
        body_override: form.body_override,
      })
      appStore.showSuccess(t('admin.channelMonitor.template.updateSuccess'))
    }
    await fetchTemplates()
    emit('updated')
    editing.value = null
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    submitting.value = false
  }
}

// --- apply to monitors (picker 流程) ---
const applyPicker = reactive<{ show: boolean; tpl: ChannelMonitorTemplate | null }>({
  show: false,
  tpl: null,
})

function confirmApply(tpl: ChannelMonitorTemplate) {
  applyPicker.tpl = tpl
  applyPicker.show = true
}

// picker 提交后触发：刷新模板列表（拿最新 associated_monitors）+ 通知父组件
async function onApplied(_affected: number) {
  await fetchTemplates()
  emit('updated')
}

// --- delete ---
const confirmDelete = reactive<{ show: boolean; tpl: ChannelMonitorTemplate | null }>({
  show: false,
  tpl: null,
})

function handleDelete(tpl: ChannelMonitorTemplate) {
  confirmDelete.tpl = tpl
  confirmDelete.show = true
}

const confirmDeleteMessage = computed(() => {
  const tpl = confirmDelete.tpl
  if (!tpl) return ''
  return t('admin.channelMonitor.template.deleteConfirm', {
    name: tpl.name,
    n: tpl.associated_monitors,
  })
})

async function doDelete() {
  const tpl = confirmDelete.tpl
  confirmDelete.show = false
  if (!tpl) return
  try {
    await adminAPI.channelMonitorTemplate.del(tpl.id)
    appStore.showSuccess(t('admin.channelMonitor.template.deleteSuccess'))
    await fetchTemplates()
    emit('updated')
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  }
}

// --- misc ---
function tabClass(value: Provider): string {
  return activeProvider.value === value
    ? 'border-b-2 border-primary text-primary'
    : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
}

function modeBadgeClass(mode: BodyOverrideMode): string {
  switch (mode) {
    case 'merge':
      return 'bg-amber-500/15 text-amber-400 '
    case 'replace':
      return 'bg-purple-500/15 text-purple-300 '
    default:
      return 'bg-accent text-muted-foreground'
  }
}

function modeLabel(mode: BodyOverrideMode): string {
  return t(`admin.channelMonitor.advanced.bodyMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)
}

const apiModeOptions = computed<{ value: APIMode; label: string; hint: string }[]>(() => [
  {
    value: API_MODE_CHAT_COMPLETIONS,
    label: t('admin.channelMonitor.form.apiModeChatCompletions'),
    hint: t('admin.channelMonitor.form.apiModeChatCompletionsHint'),
  },
  {
    value: API_MODE_RESPONSES,
    label: t('admin.channelMonitor.form.apiModeResponses'),
    hint: t('admin.channelMonitor.form.apiModeResponsesHint'),
  },
])

watch(() => form.provider, (provider) => {
  if (provider !== PROVIDER_OPENAI) {
    form.api_mode = API_MODE_CHAT_COMPLETIONS
  }
})

function normalizeAPIMode(mode: APIMode | undefined | null): APIMode {
  return mode === API_MODE_RESPONSES ? API_MODE_RESPONSES : API_MODE_CHAT_COMPLETIONS
}

function apiModeButtonClass(mode: APIMode): string {
  const active = form.api_mode === mode
  if (active) {
    return 'border-primary bg-primary/15 text-primary shadow-sm  '
  }
  return 'border-border bg-card text-muted-foreground hover:border-primary/50'
}

function apiModeLabel(mode: APIMode): string {
  return normalizeAPIMode(mode) === API_MODE_RESPONSES
    ? t('admin.channelMonitor.form.apiModeResponses')
    : t('admin.channelMonitor.form.apiModeChatCompletions')
}

function apiModeBadgeClass(mode: APIMode): string {
  if (normalizeAPIMode(mode) === API_MODE_RESPONSES) {
    return 'bg-blue-500/15 text-sky-400 '
  }
  return 'bg-emerald-500/15 text-emerald-400 '
}
</script>
