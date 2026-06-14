<template>
  <div v-if="visible" class="flex flex-col">
    <!-- switch -->
    <template v-if="field.type === 'switch'">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <Label class="text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
          <p v-if="field.help" class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
        </div>
        <Switch
          :model-value="!!modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </div>
    </template>

    <!-- select -->
    <template v-else-if="field.type === 'select'">
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <Select :model-value="String(modelValue ?? '')" @update:model-value="emit('update:modelValue', $event)">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in field.options" :key="String(opt.value)" :value="String(opt.value)">
            {{ resolveLabel(opt.label) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="field.help" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
    </template>

    <!-- password -->
    <template v-else-if="field.type === 'password'">
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <div class="relative">
        <Input
          :type="showPassword ? 'text' : 'password'"
          class="pr-10"
          :model-value="String(modelValue ?? '')"
          :placeholder="passwordPlaceholder"
          autocomplete="new-password"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
          :aria-label="showPassword ? 'Hide' : 'Show'"
          @click="showPassword = !showPassword"
        >
          <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </Button>
      </div>
      <p v-if="field.help" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
    </template>

    <!-- image -->
    <template v-else-if="field.type === 'image'">
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <ImageUpload
        :model-value="String(modelValue ?? '')"
        mode="image"
        upload-label="Upload"
        remove-label="Remove"
        :hint="field.help ? resolveLabel(field.help) : ''"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>

    <!-- json / textarea -->
    <template v-else-if="field.type === 'json' || field.type === 'textarea'">
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <Textarea
        class="font-mono text-xs"
        rows="4"
        :model-value="jsonDisplay"
        :placeholder="field.placeholder ? resolveLabel(field.placeholder) : ''"
        @update:model-value="handleJsonChange(String($event))"
      />
      <p v-if="jsonError" class="mt-1 text-xs text-destructive">{{ jsonError }}</p>
      <p v-else-if="field.help" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
    </template>

    <!-- number -->
    <template v-else-if="field.type === 'number'">
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <Input
        type="number"
        class="w-[120px]"
        :model-value="String(modelValue ?? '')"
        :placeholder="field.placeholder ? resolveLabel(field.placeholder) : ''"
        @update:model-value="emit('update:modelValue', Number($event))"
      />
      <p v-if="field.help" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
    </template>

    <!-- text (default) -->
    <template v-else>
      <Label class="mb-1 block text-sm font-medium text-foreground">{{ resolveLabel(field.label) }}</Label>
      <Input
        type="text"
        :model-value="String(modelValue ?? '')"
        :placeholder="field.placeholder ? resolveLabel(field.placeholder) : ''"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="field.help" class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ resolveLabel(field.help) }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ImageUpload from '@/components/common/ImageUpload.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SettingsField } from './types'

const props = defineProps<{
  field: SettingsField
  modelValue: unknown
  formValues: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useI18n()

const showPassword = ref(false)
const jsonError = ref('')

/**
 * For sensitive password fields: if the value is empty/null but the backend
 * reports <key>_configured = true, show a hint instead of a blank placeholder.
 */
const passwordPlaceholder = computed(() => {
  if (props.field.type !== 'password') return ''
  if (props.modelValue != null && props.modelValue !== '') {
    return props.field.placeholder ? resolveLabel(props.field.placeholder) : ''
  }
  if (props.field.sensitive) {
    const configuredKey = `${props.field.key}_configured`
    if (props.formValues[configuredKey]) return t('admin.settingsRegistry.fieldPasswordConfigured')
  }
  return props.field.placeholder ? resolveLabel(props.field.placeholder) : ''
})

/** Show only when showWhen predicate passes (or absent) */
const visible = computed(() =>
  props.field.showWhen ? props.field.showWhen(props.formValues) : true,
)

/** Resolve i18n key or literal string */
function resolveLabel(key: string): string {
  // If the key exists in i18n, translate; else return as-is
  try {
    const result = t(key)
    return result === key ? key : result
  } catch {
    return key
  }
}

/** JSON/textarea display */
const jsonDisplay = computed(() => {
  const v = props.modelValue
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
})

function handleJsonChange(raw: string) {
  jsonError.value = ''
  if (!raw.trim()) {
    emit('update:modelValue', raw)
    return
  }
  // Try to parse as JSON for array/object fields
  try {
    const parsed = JSON.parse(raw)
    emit('update:modelValue', parsed)
  } catch {
    jsonError.value = 'Invalid JSON'
    emit('update:modelValue', raw)
  }
}
</script>
