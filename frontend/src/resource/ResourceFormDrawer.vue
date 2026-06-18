<template>
  <!-- 遮罩 -->
  <Transition name="q-drawer-mask">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[49] bg-black/55 backdrop-blur-sm"
      aria-hidden="true"
      @click="handleClose"
    />
  </Transition>

  <!-- 抽屉面板 -->
  <Transition name="q-drawer">
    <aside
      v-if="modelValue"
      class="fixed bottom-0 right-0 top-0 z-50 flex w-[480px] max-w-full flex-col border-l border-border bg-card text-foreground shadow-xl"
      role="dialog"
      :aria-label="title"
      aria-modal="true"
    >
      <!-- 头部 -->
      <div class="flex flex-shrink-0 items-center border-b border-border px-[22px] py-[18px]">
        <span class="flex-1 text-sm font-semibold tracking-[0.01em] text-foreground">{{ title }}</span>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-[7px]"
          :aria-label="'关闭'"
          @click="handleClose"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </Button>
      </div>

      <!-- 表单区 -->
      <div class="flex-1 overflow-y-auto p-[22px]">
        <form id="resource-form" class="flex flex-col gap-[18px]" @submit.prevent="handleSubmit">
          <template v-for="field in visibleFields" :key="field.key">
            <div class="flex flex-col gap-[7px]">
              <Label class="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {{ field.label }}
                <span v-if="field.required" class="ml-[2px] text-destructive" aria-hidden="true">*</span>
              </Label>

              <!-- text / password -->
              <template v-if="field.type === 'text' || field.type === 'password'">
                <div class="relative">
                  <Input
                    v-model="formData[field.key] as string"
                    :type="passwordVisible[field.key] ? 'text' : field.type"
                    :required="field.required"
                    :placeholder="field.placeholder ?? ''"
                    :class="field.type === 'password' ? 'pr-10' : ''"
                  />
                  <Button
                    v-if="field.type === 'password'"
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="absolute right-[2px] top-1/2 h-7 w-7 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                    :aria-label="passwordVisible[field.key] ? '隐藏' : '显示'"
                    @click="passwordVisible[field.key] = !passwordVisible[field.key]"
                  >
                    <svg v-if="passwordVisible[field.key]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                    <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </Button>
                </div>
              </template>

              <!-- number -->
              <template v-else-if="field.type === 'number'">
                <Input
                  :model-value="toNumberInputValue(formData[field.key])"
                  type="number"
                  :required="field.required"
                  :placeholder="field.placeholder ?? ''"
                  @update:model-value="formData[field.key] = $event === '' || $event == null ? null : Number($event)"
                />
              </template>

              <!-- select -->
              <template v-else-if="field.type === 'select'">
                <Select
                  :model-value="String(formData[field.key] ?? '')"
                  :required="field.required"
                  @update:model-value="formData[field.key] = $event"
                >
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="field.placeholder ?? ''" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="opt in (field.options ?? [])"
                      :key="String(opt.value)"
                      :value="String(opt.value)"
                    >{{ opt.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </template>

              <!-- switch -->
              <template v-else-if="field.type === 'switch'">
                <Switch
                  :checked="!!formData[field.key]"
                  @update:checked="formData[field.key] = $event"
                />
              </template>
            </div>
          </template>
        </form>
      </div>

      <!-- 底部操作 -->
      <div class="flex flex-shrink-0 items-center justify-end gap-[10px] border-t border-border px-[22px] py-4">
        <Button type="button" variant="outline" @click="handleClose">取消</Button>
        <Button
          type="submit"
          form="resource-form"
          :disabled="submitting"
        >
          <svg
            v-if="submitting"
            class="animate-spin"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity=".25"/>
            <path d="M12 2a10 10 0 010 20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
          {{ submitting ? '保存中…' : (isEdit ? '保存' : '创建') }}
        </Button>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { FieldDef } from './types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ── Props ──────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean
  title: string
  fields: FieldDef[]
  /** 编辑时传入初始值，新建时为 undefined */
  initialData?: Record<string, unknown>
  submitting?: boolean
}>()

// ── Emits ──────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  'submit': [data: Record<string, unknown>]
}>()

// ── 状态 ───────────────────────────────────────────────────────────────
const isEdit = computed(() => !!props.initialData)
const formData = reactive<Record<string, unknown>>({})
const passwordVisible = reactive<Record<string, boolean>>({})

// 初始数据同步
watch(
  () => [props.modelValue, props.initialData] as const,
  ([open, init]) => {
    if (!open) return
    // 重置 formData
    for (const key of Object.keys(formData)) {
      delete formData[key]
    }
    for (const key of Object.keys(passwordVisible)) {
      delete passwordVisible[key]
    }
    // 填入初始值或字段默认
    for (const field of props.fields) {
      if (init && field.key in init) {
        formData[field.key] = init[field.key]
      } else {
        formData[field.key] = field.type === 'switch' ? false
          : field.type === 'number' ? 0
          : field.type === 'select' && field.options?.[0] ? field.options[0].value
          : ''
      }
    }
  },
  { immediate: true }
)

const visibleFields = computed(() =>
  props.fields.filter(f => !f.showWhen || f.showWhen(formData))
)

function toNumberInputValue(v: unknown): number | string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  return String(v)
}

function handleClose() {
  emit('update:modelValue', false)
}

function handleSubmit() {
  emit('submit', { ...formData })
}
</script>

<style scoped>
/* 入场过渡 */
.q-drawer-enter-active,
.q-drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.q-drawer-enter-from,
.q-drawer-leave-to {
  transform: translateX(100%);
}

.q-drawer-mask-enter-active,
.q-drawer-mask-leave-active {
  transition: opacity 0.25s;
}

.q-drawer-mask-enter-from,
.q-drawer-mask-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .q-drawer-enter-active,
  .q-drawer-leave-active,
  .q-drawer-mask-enter-active,
  .q-drawer-mask-leave-active { transition: none; }
}
</style>
