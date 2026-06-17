<template>
  <Teleport to="body">
    <Transition name="cmdk-overlay">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9999] flex items-start justify-center bg-black/65 backdrop-blur-sm pt-[120px]"
        @click.self="close"
      >
        <div
          class="cmdk-panel w-full max-w-[540px] overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl ring-1 ring-primary/[0.08]"
          role="dialog"
          aria-modal="true"
          :aria-label="t('nav.quench.commandPalette')"
        >
          <!-- Search input -->
          <div class="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <Search class="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              ref="inputRef"
              v-model="query"
              class="flex-1 border-0 bg-transparent p-0 text-sm font-[inherit] text-foreground shadow-none outline-none ring-0 focus-visible:ring-0 placeholder:text-muted-foreground"
              :placeholder="t('nav.quench.commandPalettePlaceholder')"
              @keydown="handleKeydown"
            />
            <kbd class="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
          </div>

          <!-- Results -->
          <div class="cmdk-results max-h-[340px] overflow-y-auto p-1.5" ref="listRef">
            <template v-if="filteredItems.length > 0">
              <Button
                v-for="(item, idx) in filteredItems"
                :key="item.key"
                variant="ghost"
                class="cmdk-item flex h-auto w-full cursor-pointer items-center justify-start gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-[inherit] text-muted-foreground transition-[background,color] duration-100"
                :class="{ 'cmdk-item--active bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/.25),0_0_12px_hsl(var(--primary)/.1)]': idx === activeIndex }"
                @click="selectItem(item)"
                @mouseenter="activeIndex = idx"
              >
                <component :is="item.icon" class="h-[15px] w-[15px] shrink-0 opacity-80" />
                <span class="flex-1 font-medium">{{ t(item.labelKey) }}</span>
                <span class="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">{{ t(item.groupLabelKey) }}</span>
              </Button>
            </template>
            <div v-else class="px-6 py-6 text-center text-[13px] text-muted-foreground">
              {{ t('nav.quench.noResults') }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMagicKeys } from '@vueuse/core'
import { Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { flatNavItems } from './nav'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { t } = useI18n()
const router = useRouter()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const allItems = flatNavItems()

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allItems
  return allItems.filter((item) => {
    const label = t(item.labelKey).toLowerCase()
    const group = t(item.groupLabelKey).toLowerCase()
    return label.includes(q) || group.includes(q)
  })
})

watch(query, () => {
  activeIndex.value = 0
})

watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      query.value = ''
      activeIndex.value = 0
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

// Global ⌘K / Ctrl+K
const { Meta_k, Ctrl_k } = useMagicKeys()
watch([Meta_k, Ctrl_k], ([mk, ck]) => {
  if (mk || ck) {
    emit('update:modelValue', !props.modelValue)
  }
})

function close() {
  emit('update:modelValue', false)
}

function selectItem(item: ReturnType<typeof flatNavItems>[number]) {
  router.push(item.path)
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredItems.value.length - 1)
    scrollActiveIntoView()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollActiveIntoView()
    return
  }
  if (e.key === 'Enter') {
    const item = filteredItems.value[activeIndex.value]
    if (item) selectItem(item)
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const active = list.querySelectorAll('.cmdk-item')[activeIndex.value] as HTMLElement | undefined
    active?.scrollIntoView({ block: 'nearest' })
  })
}
</script>

<style scoped>
/* Scrollbar styling — cannot be expressed as Tailwind utilities */
.cmdk-results {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.cmdk-results::-webkit-scrollbar {
  width: 4px;
}

.cmdk-results::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}

/* Overlay enter/leave transitions */
.cmdk-overlay-enter-active,
.cmdk-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.cmdk-overlay-enter-active .cmdk-panel,
.cmdk-overlay-leave-active .cmdk-panel {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.cmdk-overlay-enter-from,
.cmdk-overlay-leave-to {
  opacity: 0;
}

.cmdk-overlay-enter-from .cmdk-panel,
.cmdk-overlay-leave-to .cmdk-panel {
  opacity: 0;
  transform: scale(0.96) translateY(-10px);
}

@media (prefers-reduced-motion: reduce) {
  .cmdk-overlay-enter-active,
  .cmdk-overlay-leave-active,
  .cmdk-overlay-enter-active .cmdk-panel,
  .cmdk-overlay-leave-active .cmdk-panel {
    transition: none;
  }
  .cmdk-overlay-enter-from .cmdk-panel,
  .cmdk-overlay-leave-to .cmdk-panel {
    transform: none;
  }
  .cmdk-item {
    transition: none;
  }
}
</style>
