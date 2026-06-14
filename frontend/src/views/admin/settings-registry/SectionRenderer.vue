<template>
  <div :id="`sr-section-${section.id}`" class="overflow-hidden rounded-xl border border-border bg-card shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_4px_16px_rgba(0,0,0,.25)] scroll-mt-24">
    <!-- card header -->
    <div class="border-b border-border bg-gradient-to-b from-white/[.025] to-transparent px-5 py-3.5">
      <h2 class="mb-0.5 text-[13.5px] font-semibold tracking-tight text-foreground">{{ resolveLabel(section.title) }}</h2>
      <p v-if="section.description" class="text-[11.5px] leading-[1.55] text-muted-foreground">{{ resolveLabel(section.description) }}</p>
    </div>

    <!-- custom component escape hatch -->
    <component
      v-if="section.component"
      :is="section.component"
      :settings="settings"
      :form-values="form"
      @update:field="onFieldUpdate"
    />

    <!-- field grid -->
    <div v-else class="grid gap-5 p-5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      <FieldRenderer
        v-for="field in section.fields"
        :key="field.key"
        :field="field"
        :model-value="form[field.key]"
        :form-values="form"
        @update:model-value="onFieldUpdate(field.key, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FieldRenderer from './FieldRenderer.vue'
import type { SettingsSection } from './types'

defineProps<{
  section: SettingsSection
  form: Record<string, unknown>
  settings: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

function resolveLabel(key: string): string {
  try {
    const result = t(key)
    return result === key ? key : result
  } catch {
    return key
  }
}

function onFieldUpdate(key: string, value: unknown) {
  emit('update:field', key, value)
}
</script>
