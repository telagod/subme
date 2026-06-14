<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- enabled switch -->
    <div class="flex items-center justify-between gap-4">
      <Label>{{ t('admin.settings.quotaNotify.enabled') }}</Label>
      <Toggle v-model="localEnabled" />
    </div>

    <!-- email list -->
    <template v-if="localEnabled">
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, index) in localEmails"
          :key="index"
          class="flex items-center gap-2"
        >
          <!-- per-item mini toggle -->
          <Switch
            :checked="!entry.disabled"
            @update:checked="toggleEntryDisabled(index)"
          />
          <Input
            v-model="entry.email"
            type="email"
            :placeholder="t('admin.settings.quotaNotify.emailPlaceholder')"
            @input="emitEmails"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/25 border border-transparent"
            :aria-label="t('common.remove')"
            @click="removeEmail(index)"
          >
            <Icon name="x" size="xs" class="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          class="self-start text-xs font-medium"
          @click="addEmail"
        >
          + {{ t('admin.settings.quotaNotify.addEmail') }}
        </Button>
      </div>

      <p class="text-xs text-muted-foreground leading-relaxed m-0">{{ t('admin.settings.quotaNotify.emailsHint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import Icon from '@/components/icons/Icon.vue'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface QuotaEmail {
  email: string
  disabled?: boolean
}

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

// ── helpers ────────────────────────────────────────────────────────────────────
const activeSource = computed(() => props.formValues ?? props.settings)

function cloneEmails(src: Record<string, unknown>): QuotaEmail[] {
  const raw = src['account_quota_notify_emails']
  if (!Array.isArray(raw)) return []
  return raw.map((e) => ({ ...(e as QuotaEmail) }))
}

// ── local state ────────────────────────────────────────────────────────────────
const localEnabled = ref<boolean>(!!activeSource.value['account_quota_notify_enabled'])
const localEmails = ref<QuotaEmail[]>(cloneEmails(activeSource.value))

// Sync enabled when parent resets
watch(
  () => activeSource.value['account_quota_notify_enabled'],
  (v) => { localEnabled.value = !!v },
)

// Sync emails when parent resets
watch(
  () => activeSource.value['account_quota_notify_emails'],
  (incoming) => {
    if (JSON.stringify(incoming) !== JSON.stringify(localEmails.value)) {
      localEmails.value = cloneEmails(activeSource.value)
    }
  },
  { deep: true },
)

// Propagate enabled changes up
watch(localEnabled, (v) => {
  emit('update:field', 'account_quota_notify_enabled', v)
})

function emitEmails() {
  emit('update:field', 'account_quota_notify_emails', localEmails.value.map((e) => ({ ...e })))
}

function toggleEntryDisabled(index: number) {
  localEmails.value = localEmails.value.map((e, i) =>
    i === index ? { ...e, disabled: !e.disabled } : e,
  )
  emitEmails()
}

function addEmail() {
  localEmails.value = [...localEmails.value, { email: '', disabled: false }]
  emitEmails()
}

function removeEmail(index: number) {
  localEmails.value = localEmails.value.filter((_, i) => i !== index)
  emitEmails()
}
</script>
