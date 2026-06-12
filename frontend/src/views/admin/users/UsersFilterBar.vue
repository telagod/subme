<template>
  <div class="ufb-bar">
    <!-- 搜索框 -->
    <div class="ufb-search" :class="{ 'ufb-search-focus': focused }">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <input
        :value="search"
        :placeholder="t('admin.usersQuench.searchPlaceholder')"
        class="ufb-input"
        @focus="focused = true"
        @blur="focused = false"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        @keyup.enter="$emit('commit-search')"
      />
      <button v-if="search" class="ufb-clear-x" @click="$emit('update:search', ''); $emit('commit-search')" :aria-label="t('admin.usersQuench.clearSearch')">✕</button>
    </div>

    <!-- 高级筛选 -->
    <AdvancedFilter
      :fields="fields"
      :model-value="advancedFilter"
      @update:model-value="$emit('update:advancedFilter', $event)"
      @apply="$emit('apply-filter', $event)"
      @clear="$emit('clear')"
    />

    <!-- 密度切换 -->
    <div class="ufb-seg">
      <button :class="{ on: density === 'comfortable' }" @click="$emit('update:density', 'comfortable')">{{ t('admin.usersQuench.densityComfortable') }}</button>
      <button :class="{ on: density === 'compact' }" @click="$emit('update:density', 'compact')">{{ t('admin.usersQuench.densityCompact') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AdvancedFilter } from '@/components/datatable'
import type { FilterFieldDef, AdvancedFilterValues } from '@/components/datatable'

const { t } = useI18n()

defineProps<{
  search: string
  density: 'comfortable' | 'compact'
  fields: FilterFieldDef[]
  advancedFilter: AdvancedFilterValues
}>()

defineEmits<{
  'update:search': [val: string]
  'update:density': [val: 'comfortable' | 'compact']
  'update:advancedFilter': [val: AdvancedFilterValues]
  'commit-search': []
  'apply-filter': [val: AdvancedFilterValues]
  'clear': []
}>()

const focused = ref(false)
</script>

<style scoped>
.ufb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  font-family: var(--font-ui, "Archivo", "PingFang SC", sans-serif);
}

.ufb-search {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-1, #101216);
  border: 1px solid var(--line-1, #2F3540);
  border-radius: 9px;
  padding: 5px 10px;
  min-width: 220px;
  color: var(--ink-2, #5C6470);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ufb-search-focus {
  border-color: rgba(92, 168, 255, 0.5);
  box-shadow: var(--glow-focus, 0 0 0 1.5px rgba(92,168,255,.65), 0 0 20px rgba(92,168,255,.28));
}
.ufb-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--ink-0, #E8EBF0);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
}
.ufb-input::placeholder { color: var(--ink-2, #5C6470); }
.ufb-clear-x {
  font-size: 10px; color: var(--ink-2, #5C6470); background: transparent;
  border: none; cursor: pointer; padding: 2px;
}
.ufb-clear-x:hover { color: var(--ink-0, #E8EBF0); }

.ufb-seg {
  display: inline-flex; border: 1px solid var(--line-1,#2F3540);
  border-radius: 8px; overflow: hidden; margin-left: auto;
}
.ufb-seg button {
  padding: 4px 10px; background: transparent; border: none;
  color: var(--ink-2,#5C6470); font-size: 11.5px; font-family: inherit;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.ufb-seg button.on { background: var(--bg-2,#171A20); color: var(--ink-0,#E8EBF0); }

.ufb-search:focus-visible,
.ufb-seg button:focus-visible {
  outline: none;
  box-shadow: var(--glow-focus, 0 0 0 1.5px rgba(92,168,255,.65), 0 0 20px rgba(92,168,255,.28));
  border-color: rgba(92,168,255,.5);
}

@media (prefers-reduced-motion: reduce) {
  .ufb-search, .ufb-seg button { transition: none; }
}
</style>
