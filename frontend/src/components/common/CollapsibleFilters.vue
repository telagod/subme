<template>
  <div class="space-y-2">
    <!-- Top bar: search + filter toggle + actions -->
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div class="min-w-0 flex-1">
        <slot name="search" />
      </div>

      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          v-if="hasFilters"
          type="button"
          class="btn btn-secondary btn-sm sm:btn-md gap-1.5"
          :class="expanded && 'bg-accent'"
          @click="toggle"
        >
          <Icon name="filter" size="sm" />
          <span class="hidden sm:inline">{{ t('common.filters') }}</span>
          <span
            v-if="activeCount > 0"
            class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-400 px-1 text-[10px] font-bold text-background"
          >
            {{ activeCount }}
          </span>
          <Icon
            name="chevronDown"
            size="xs"
            class="hidden sm:inline-block transition-transform duration-150"
            :class="expanded && 'rotate-180'"
          />
        </button>

        <slot name="actions" />
      </div>
    </div>

    <!-- Collapsible filter panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 -translate-y-1 max-h-0"
      enter-to-class="opacity-100 translate-y-0 max-h-96"
      leave-from-class="opacity-100 translate-y-0 max-h-96"
      leave-to-class="opacity-0 -translate-y-1 max-h-0"
    >
      <div v-show="expanded" class="overflow-hidden">
        <div class="filter-panel rounded-lg border border-border bg-card/50 px-3 py-2.5">
          <slot name="filters" />
          <button
            v-if="activeCount > 0"
            type="button"
            class="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            @click="$emit('clear')"
          >
            {{ t('common.clearFilters') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()
const slots = useSlots()

interface Props {
  activeCount?: number
  storageKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  activeCount: 0
})

defineEmits<{
  (e: 'clear'): void
}>()

const hasFilters = computed(() => !!slots.filters)

const stored = props.storageKey && typeof window !== 'undefined'
  ? localStorage.getItem(`filter-expanded:${props.storageKey}`)
  : null
const expanded = ref(stored === 'true')

const toggle = () => {
  expanded.value = !expanded.value
  if (props.storageKey) {
    localStorage.setItem(`filter-expanded:${props.storageKey}`, String(expanded.value))
  }
}
</script>

<style scoped>
.filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* Mobile: selects go full-width */
@media (max-width: 639px) {
  .filter-panel :deep(.w-36),
  .filter-panel :deep(.w-40),
  .filter-panel :deep(.w-44) {
    width: 100%;
  }
}
</style>
