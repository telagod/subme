<template>
  <div class="af-root">
    <!-- 激活 chip 列表 -->
    <div v-if="activeChips.length > 0" class="af-chips" role="list" :aria-label="t('advancedFilter.activeFilters')">
      <div v-for="chip in activeChips" :key="chip.key" class="af-chip" role="listitem">
        <span class="af-chip-label">{{ chip.fieldLabel }}</span>
        <span class="af-chip-sep">:</span>
        <span class="af-chip-val">{{ chip.summary }}</span>
        <button class="af-chip-del" type="button" :aria-label="t('advancedFilter.removeFilter', { name: chip.fieldLabel })" @click="removeFilter(chip.key)">✕</button>
      </div>
    </div>

    <!-- 操作行 -->
    <div class="af-bar">
      <div class="af-add-wrap" ref="addWrapRef">
        <button class="af-btn-add" type="button" :aria-expanded="pickerOpen" :aria-haspopup="true" :aria-label="t('advancedFilter.addFilter')" @click="togglePicker">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          {{ t('advancedFilter.addFilter') }}
          <span v-if="activeCount > 0" class="af-badge">{{ activeCount }}</span>
        </button>

        <Teleport to="body">
          <Transition name="af-pop">
            <div v-if="pickerOpen" ref="pickerRef" class="af-picker" :style="pickerStyle" role="dialog" :aria-label="t('advancedFilter.chooseField')" @keydown.esc="closePicker">
              <div class="af-picker-head">{{ t('advancedFilter.chooseField') }}</div>
              <div class="af-picker-list" role="listbox">
                <button
                  v-for="field in fields" :key="field.key"
                  class="af-picker-item" :class="{ 'af-picker-item-on': editingKey === field.key }"
                  role="option" :aria-selected="editingKey === field.key" type="button"
                  @click="selectField(field.key)"
                >
                  <span>{{ field.label }}</span>
                  <span v-if="isFieldActive(field.key)" class="af-picker-dot" aria-hidden="true"></span>
                </button>
              </div>
              <Transition name="af-ctrl">
                <div v-if="editingKey && editingField" class="af-ctrl-wrap">
                  <div class="af-ctrl-head">{{ editingField.label }}</div>

                  <!-- select -->
                  <div v-if="editingField.type === 'select'" class="af-ctrl-opts">
                    <button
                      v-for="opt in editingField.options"
                      :key="opt.value"
                      class="af-opt"
                      :class="{ 'af-opt-on': draftValue === opt.value }"
                      type="button"
                      @click="draftValue = opt.value"
                    >{{ opt.label }}</button>
                  </div>

                  <!-- text -->
                  <input
                    v-else-if="editingField.type === 'text'"
                    v-model="draftText"
                    class="af-input"
                    type="text"
                    :placeholder="editingField.placeholder || ''"
                    @keydown.enter="applyDraft"
                  />

                  <!-- numberRange -->
                  <div v-else-if="editingField.type === 'numberRange'" class="af-range-row">
                    <input
                      v-model.number="draftNumMin"
                      class="af-input af-input-sm"
                      type="number"
                      :placeholder="editingField.placeholder || t('advancedFilter.min')"
                      @keydown.enter="applyDraft"
                    />
                    <span class="af-range-dash">–</span>
                    <input
                      v-model.number="draftNumMax"
                      class="af-input af-input-sm"
                      type="number"
                      :placeholder="editingField.placeholderMax || t('advancedFilter.max')"
                      @keydown.enter="applyDraft"
                    />
                  </div>

                  <!-- dateRange -->
                  <div v-else-if="editingField.type === 'dateRange'" class="af-range-row">
                    <input
                      v-model="draftDateAfter"
                      class="af-input af-input-date"
                      type="date"
                      :placeholder="t('advancedFilter.after')"
                    />
                    <span class="af-range-dash">~</span>
                    <input
                      v-model="draftDateBefore"
                      class="af-input af-input-date"
                      type="date"
                      :placeholder="t('advancedFilter.before')"
                    />
                  </div>

                  <!-- boolean -->
                  <div v-else-if="editingField.type === 'boolean'" class="af-bool-row">
                    <button
                      class="af-opt"
                      :class="{ 'af-opt-on': draftBool === true }"
                      type="button"
                      @click="draftBool = true"
                    >{{ t('advancedFilter.yes') }}</button>
                    <button
                      class="af-opt"
                      :class="{ 'af-opt-on': draftBool === false }"
                      type="button"
                      @click="draftBool = false"
                    >{{ t('advancedFilter.no') }}</button>
                  </div>

                  <!-- 应用 / 清除该字段 -->
                  <div class="af-ctrl-foot">
                    <button
                      v-if="isFieldActive(editingKey)"
                      class="af-btn-ghost"
                      type="button"
                      @click="removeFilter(editingKey!)"
                    >{{ t('advancedFilter.clearField') }}</button>
                    <button class="af-btn-apply" type="button" @click="applyDraft">
                      {{ t('advancedFilter.apply') }}
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </Transition>
        </Teleport>
      </div>

      <!-- 清空全部 -->
      <button v-if="activeCount > 0" class="af-btn-clear" type="button" @click="clearAll">
        {{ t('advancedFilter.clearAll') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FilterFieldDef, AdvancedFilterValues, NumberRangeValue, DateRangeValue } from './advancedFilter'
import { isFilterActive, countActiveFilters, summarizeFilterValue } from './advancedFilter'

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

<style src="./advanced-filter.css"></style>
