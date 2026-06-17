<template>
  <div class="space-y-2">
    <!-- Top bar: search + filter toggle + actions -->
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div class="min-w-0 flex-1">
        <slot name="search" />
      </div>

      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          v-if="hasFilters"
          type="button"
          variant="outline"
          size="sm"
          class="gap-1.5"
          :class="expanded && 'bg-accent'"
          @click="toggle"
        >
          <Icon name="filter" size="sm" />
          <span class="hidden sm:inline">{{ t('common.filters') }}</span>
          <span
            v-if="activeCount > 0"
            class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
          >
            {{ activeCount }}
          </span>
          <Icon
            name="chevronDown"
            size="xs"
            class="hidden sm:inline-block transition-transform duration-150"
            :class="expanded && 'rotate-180'"
          />
        </Button>

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
        <div class="filter-panel flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
          <slot name="filters" />
          <Button
            v-if="activeCount > 0"
            type="button"
            variant="ghost"
            size="sm"
            class="shrink-0 h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
            @click="$emit('clear')"
          >
            {{ t('common.clearFilters') }}
          </Button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

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
/* Mobile: selects go full-width */
@media (max-width: 639px) {
  .filter-panel :deep(.w-36),
  .filter-panel :deep(.w-40),
  .filter-panel :deep(.w-44) {
    width: 100%;
  }
}
</style>
