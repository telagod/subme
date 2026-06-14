<template>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <!-- 搜索框 -->
    <div class="relative min-w-[220px]">
      <svg
        width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 shrink-0 text-muted-foreground"
      >
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <Input
        :value="search"
        :placeholder="t('admin.usersQuench.searchPlaceholder')"
        class="h-8 pl-8 text-[12.5px]"
        :class="{ 'pr-8': search }"
        @focus="focused = true"
        @blur="focused = false"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        @keyup.enter="$emit('commit-search')"
      />
      <Button
        v-if="search"
        variant="ghost"
        size="icon"
        class="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        :aria-label="t('admin.usersQuench.clearSearch')"
        @click="$emit('update:search', ''); $emit('commit-search')"
      >✕</Button>
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
    <div class="ml-auto inline-flex overflow-hidden rounded-lg border border-border">
      <Button
        variant="ghost"
        class="rounded-none px-2.5 py-1 text-[11.5px] transition-colors"
        :class="density === 'comfortable' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="$emit('update:density', 'comfortable')"
      >{{ t('admin.usersQuench.densityComfortable') }}</Button>
      <Button
        variant="ghost"
        class="rounded-none px-2.5 py-1 text-[11.5px] transition-colors"
        :class="density === 'compact' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="$emit('update:density', 'compact')"
      >{{ t('admin.usersQuench.densityCompact') }}</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
