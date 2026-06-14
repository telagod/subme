<template>
  <div class="flex flex-col gap-2 text-[12.5px]">
    <!-- 激活 chip 列表 -->
    <div v-if="activeChips.length > 0" class="flex flex-wrap gap-1.5 items-center" role="list" :aria-label="t('advancedFilter.activeFilters')">
      <div
        v-for="chip in activeChips"
        :key="chip.key"
        class="inline-flex items-center gap-1 py-0.5 px-2.5 rounded-lg border border-primary/30 bg-primary/10 text-foreground text-[11.5px] max-w-[260px]"
        role="listitem"
      >
        <span class="text-muted-foreground text-[10.5px] font-medium uppercase tracking-[0.04em] shrink-0">{{ chip.fieldLabel }}</span>
        <span class="text-muted-foreground shrink-0">:</span>
        <span class="text-primary font-medium overflow-hidden text-ellipsis whitespace-nowrap">{{ chip.summary }}</span>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          class="w-3.5 h-3.5 text-[8.5px] rounded-sm text-muted-foreground shrink-0 ml-0.5 hover:text-destructive hover:bg-destructive/10"
          :aria-label="t('advancedFilter.removeFilter', { name: chip.fieldLabel })"
          @click="removeFilter(chip.key)"
        >✕</Button>
      </div>
    </div>

    <!-- 操作行 -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="relative" ref="addWrapRef">
        <Button
          variant="outline"
          size="sm"
          type="button"
          class="gap-1.5 rounded-[9px] border-dashed text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5"
          :aria-expanded="pickerOpen"
          :aria-haspopup="true"
          :aria-label="t('advancedFilter.addFilter')"
          @click="togglePicker"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          {{ t('advancedFilter.addFilter') }}
          <Badge v-if="activeCount > 0" variant="secondary" class="h-4 min-w-4 px-1 text-[9.5px] font-bold font-mono rounded-full">{{ activeCount }}</Badge>
        </Button>

        <Teleport to="body">
          <Transition name="af-pop">
            <div
              v-if="pickerOpen"
              ref="pickerRef"
              class="w-[300px] bg-popover border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
              :style="pickerStyle"
              role="dialog"
              :aria-label="t('advancedFilter.chooseField')"
              @keydown.esc="closePicker"
            >
              <div class="px-3.5 pt-2.5 pb-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted-foreground border-b border-border">
                {{ t('advancedFilter.chooseField') }}
              </div>
              <div class="flex flex-col p-1.5 gap-0.5 max-h-[200px] overflow-y-auto" role="listbox">
                <Button
                  v-for="field in fields" :key="field.key"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-between px-2.5 text-muted-foreground text-[12.5px]"
                  :class="{ 'bg-primary/10 text-primary': editingKey === field.key }"
                  role="option"
                  :aria-selected="editingKey === field.key"
                  type="button"
                  @click="selectField(field.key)"
                >
                  <span>{{ field.label }}</span>
                  <span
                    v-if="isFieldActive(field.key)"
                    class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                    aria-hidden="true"
                  ></span>
                </Button>
              </div>
              <Transition name="af-ctrl">
                <div v-if="editingKey && editingField" class="border-t border-border p-3 flex flex-col gap-2">
                  <div class="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                    {{ editingField.label }}
                  </div>

                  <!-- select -->
                  <div v-if="editingField.type === 'select'" class="flex flex-wrap gap-1.5">
                    <Button
                      v-for="opt in editingField.options"
                      :key="opt.value"
                      variant="outline"
                      size="sm"
                      class="rounded-[7px] text-muted-foreground text-xs"
                      :class="{ 'bg-primary/10 border-primary/40 text-primary': draftValue === opt.value }"
                      type="button"
                      @click="draftValue = opt.value"
                    >{{ opt.label }}</Button>
                  </div>

                  <!-- text -->
                  <Input
                    v-else-if="editingField.type === 'text'"
                    v-model="draftText"
                    type="text"
                    :placeholder="editingField.placeholder || ''"
                    class="h-8 text-[12.5px]"
                    @keydown.enter="applyDraft"
                  />

                  <!-- numberRange -->
                  <div v-else-if="editingField.type === 'numberRange'" class="flex items-center gap-2">
                    <Input
                      :model-value="draftNumMin ?? ''"
                      type="number"
                      :placeholder="editingField.placeholder || t('advancedFilter.min')"
                      class="flex-1 min-w-0 h-8 text-[12.5px]"
                      @update:model-value="draftNumMin = $event === '' || $event == null ? '' : Number($event)"
                      @keydown.enter="applyDraft"
                    />
                    <span class="text-muted-foreground shrink-0 text-xs">–</span>
                    <Input
                      :model-value="draftNumMax ?? ''"
                      type="number"
                      :placeholder="editingField.placeholderMax || t('advancedFilter.max')"
                      class="flex-1 min-w-0 h-8 text-[12.5px]"
                      @update:model-value="draftNumMax = $event === '' || $event == null ? '' : Number($event)"
                      @keydown.enter="applyDraft"
                    />
                  </div>

                  <!-- dateRange -->
                  <div v-else-if="editingField.type === 'dateRange'" class="flex items-center gap-2">
                    <Input
                      v-model="draftDateAfter"
                      type="date"
                      :placeholder="t('advancedFilter.after')"
                      class="flex-1 min-w-0 h-8 text-[12.5px]"
                    />
                    <span class="text-muted-foreground shrink-0 text-xs">~</span>
                    <Input
                      v-model="draftDateBefore"
                      type="date"
                      :placeholder="t('advancedFilter.before')"
                      class="flex-1 min-w-0 h-8 text-[12.5px]"
                    />
                  </div>

                  <!-- boolean -->
                  <div v-else-if="editingField.type === 'boolean'" class="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      class="rounded-[7px] text-muted-foreground text-xs"
                      :class="{ 'bg-primary/10 border-primary/40 text-primary': draftBool === true }"
                      type="button"
                      @click="draftBool = true"
                    >{{ t('advancedFilter.yes') }}</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="rounded-[7px] text-muted-foreground text-xs"
                      :class="{ 'bg-primary/10 border-primary/40 text-primary': draftBool === false }"
                      type="button"
                      @click="draftBool = false"
                    >{{ t('advancedFilter.no') }}</Button>
                  </div>

                  <!-- 应用 / 清除该字段 -->
                  <div class="flex justify-end gap-2 mt-0.5">
                    <Button
                      v-if="isFieldActive(editingKey)"
                      variant="ghost"
                      size="sm"
                      type="button"
                      class="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      @click="removeFilter(editingKey!)"
                    >{{ t('advancedFilter.clearField') }}</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      @click="applyDraft"
                    >{{ t('advancedFilter.apply') }}</Button>
                  </div>
                </div>
              </Transition>
            </div>
          </Transition>
        </Teleport>
      </div>

      <!-- 清空全部 -->
      <Button
        v-if="activeCount > 0"
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        @click="clearAll"
      >{{ t('advancedFilter.clearAll') }}</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FilterFieldDef, AdvancedFilterValues, NumberRangeValue, DateRangeValue } from './advancedFilter'
import { isFilterActive, countActiveFilters, summarizeFilterValue } from './advancedFilter'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()

// ── Props & Emits ──────────────────────────────────────────────────────────
const props = defineProps<{
  /** 字段描述列表，由接入页按需组装 */
  fields: FilterFieldDef[]
  /** 当前筛选值（受控），key → 值；区间形如 {min,max} / {after,before} */
  modelValue: AdvancedFilterValues
}>()

const emit = defineEmits<{
  'update:modelValue': [v: AdvancedFilterValues]
  /** 用户点击「应用」后触发 */
  'apply': [v: AdvancedFilterValues]
  /** 用户点击「清空全部」后触发 */
  'clear': []
}>()

// ── 弹层开关与定位 ─────────────────────────────────────────────────────────
const pickerOpen = ref(false)
const addWrapRef = ref<HTMLElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const pickerRect = ref<DOMRect | null>(null)

const pickerStyle = computed(() => {
  if (!pickerRect.value) return {}
  const r = pickerRect.value
  return { position: 'fixed' as const, top: `${r.bottom + 6}px`, left: `${r.left}px`, zIndex: '100010' }
})

function updatePickerRect() {
  if (addWrapRef.value) pickerRect.value = addWrapRef.value.getBoundingClientRect()
}

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
  if (pickerOpen.value) {
    nextTick(updatePickerRect)
    window.addEventListener('scroll', updatePickerRect, { capture: true, passive: true })
    window.addEventListener('resize', updatePickerRect)
  } else {
    closePicker()
  }
}

function closePicker() {
  pickerOpen.value = false
  editingKey.value = null
  window.removeEventListener('scroll', updatePickerRect, { capture: true })
  window.removeEventListener('resize', updatePickerRect)
}

function handleOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!pickerRef.value?.contains(target) && !addWrapRef.value?.contains(target) && pickerOpen.value) {
    closePicker()
  }
}

onMounted(() => document.addEventListener('click', handleOutside))
onUnmounted(() => {
  document.removeEventListener('click', handleOutside)
  window.removeEventListener('scroll', updatePickerRect, { capture: true })
  window.removeEventListener('resize', updatePickerRect)
})

// ── 字段选择与草稿 ─────────────────────────────────────────────────────────
const editingKey = ref<string | null>(null)
const editingField = computed(() => props.fields.find(f => f.key === editingKey.value) ?? null)

const draftValue = ref<string>('')
const draftText = ref<string>('')
const draftNumMin = ref<number | ''>('')
const draftNumMax = ref<number | ''>('')
const draftDateAfter = ref<string>('')
const draftDateBefore = ref<string>('')
const draftBool = ref<boolean | null>(null)

function selectField(key: string) {
  editingKey.value = key
  const existing = props.modelValue[key]
  const field = props.fields.find(f => f.key === key)
  if (!field) return
  if (field.type === 'select' || field.type === 'text') {
    draftValue.value = typeof existing === 'string' ? existing : ''
    draftText.value = typeof existing === 'string' ? existing : ''
  } else if (field.type === 'numberRange') {
    const v = (existing as NumberRangeValue) ?? {}
    draftNumMin.value = v.min ?? ''; draftNumMax.value = v.max ?? ''
  } else if (field.type === 'dateRange') {
    const v = (existing as DateRangeValue) ?? {}
    draftDateAfter.value = v.after ?? ''; draftDateBefore.value = v.before ?? ''
  } else if (field.type === 'boolean') {
    draftBool.value = typeof existing === 'boolean' ? existing : null
  }
}

function applyDraft() {
  if (!editingKey.value || !editingField.value) return
  const key = editingKey.value
  const field = editingField.value
  const next: AdvancedFilterValues = { ...props.modelValue }

  if (field.type === 'select') {
    if (draftValue.value) next[key] = draftValue.value; else delete next[key]
  } else if (field.type === 'text') {
    if (draftText.value.trim()) next[key] = draftText.value.trim(); else delete next[key]
  } else if (field.type === 'numberRange') {
    const v: NumberRangeValue = { min: draftNumMin.value, max: draftNumMax.value }
    if (isFilterActive(v)) next[key] = v; else delete next[key]
  } else if (field.type === 'dateRange') {
    const v: DateRangeValue = { after: draftDateAfter.value || undefined, before: draftDateBefore.value || undefined }
    if (isFilterActive(v)) next[key] = v; else delete next[key]
  } else if (field.type === 'boolean') {
    if (draftBool.value !== null) next[key] = draftBool.value; else delete next[key]
  }

  emit('update:modelValue', next)
  emit('apply', next)
  closePicker()
}

function removeFilter(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  emit('update:modelValue', next)
  emit('apply', next)
  if (editingKey.value === key) editingKey.value = null
}

function clearAll() {
  emit('update:modelValue', {})
  emit('clear')
  closePicker()
}

// ── 计算激活状态 ───────────────────────────────────────────────────────────
const activeCount = computed(() => countActiveFilters(props.modelValue))

const activeChips = computed(() =>
  props.fields
    .filter(f => isFilterActive(props.modelValue[f.key]))
    .map(f => ({ key: f.key, fieldLabel: f.label, summary: summarizeFilterValue(f, props.modelValue[f.key]) }))
)

function isFieldActive(key: string) { return isFilterActive(props.modelValue[key]) }

watch(() => props.modelValue, (v) => { if (Object.keys(v).length === 0) editingKey.value = null })
</script>

<style>
.af-pop-enter-active,
.af-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.af-pop-enter-from,
.af-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.af-ctrl-enter-active,
.af-ctrl-leave-active {
  transition: opacity 0.12s ease, max-height 0.15s ease;
  overflow: hidden;
  max-height: 400px;
}

.af-ctrl-enter-from,
.af-ctrl-leave-to {
  opacity: 0;
  max-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .af-pop-enter-active, .af-pop-leave-active,
  .af-ctrl-enter-active, .af-ctrl-leave-active { transition: none; }
}
</style>
