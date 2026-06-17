<template>
  <div class="flex flex-wrap items-center gap-1.5 mb-3.5" role="tablist" :aria-label="ariaLabel">
    <!-- 固定「全部」页签 -->
    <Button
      variant="ghost"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 h-auto rounded-lg border text-xs font-medium cursor-pointer transition-colors"
      :class="activeId === '__all__'
        ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary'
        : 'bg-card border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-card'"
      role="tab"
      :aria-selected="activeId === '__all__'"
      @click="applyAll"
    >
      {{ t('datatable.savedViews.all') }}
      <span v-if="totalCount != null" class="font-mono text-[10.5px] opacity-75">{{ totalCount.toLocaleString() }}</span>
    </Button>

    <!-- 用户保存的视图页签 -->
    <div
      v-for="view in savedViews"
      :key="view.id"
      class="group relative inline-flex"
    >
      <Button
        variant="ghost"
        class="inline-flex items-center gap-1.5 pl-3 pr-6 py-1.5 h-auto rounded-lg border text-xs font-medium cursor-pointer transition-colors"
        :class="activeId === view.id
          ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary'
          : 'bg-card border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-card'"
        role="tab"
        :aria-selected="activeId === view.id"
        @click="applyView(view)"
      >
        {{ view.name }}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded text-[9px] opacity-0 group-hover:opacity-100 transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        :aria-label="t('datatable.savedViews.delete', { name: view.name })"
        @click.stop="deleteView(view.id)"
        @keydown.enter.stop="deleteView(view.id)"
      >✕</Button>
    </div>

    <!-- 保存当前视图按钮 -->
    <Button
      variant="outline"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 h-auto rounded-lg border-dashed text-xs font-medium cursor-pointer text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground hover:bg-card"
      :aria-label="t('datatable.savedViews.save')"
      @click="saveCurrentView"
    >
      + {{ t('datatable.savedViews.save') }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SavedView, TableQueryState } from './types'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

// ── Props ──────────────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  /** localStorage key 前缀，用于持久化 */
  storageKey: string
  /** 当前查询状态（用于保存快照） */
  currentState?: Partial<TableQueryState>
  /** 「全部」页签显示的数量（可选） */
  totalCount?: number
  /** aria label */
  ariaLabel?: string
}>(), {
  currentState: undefined,
  totalCount: undefined,
  ariaLabel: '视图页签'
})

// ── Emits ──────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'apply': [view: SavedView | null]
}>()

// ── 持久化 ────────────────────────────────────────────────────────────
const STORAGE_KEY = computed(() => `q_saved_views_${props.storageKey}`)

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.value)
    return raw ? (JSON.parse(raw) as SavedView[]) : []
  } catch {
    return []
  }
}

function persistViews(views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_KEY.value, JSON.stringify(views))
  } catch {
    // localStorage 满或者 SSR，忽略
  }
}

const savedViews = ref<SavedView[]>(loadViews())

// 当 storageKey 变化时重新加载
watch(STORAGE_KEY, () => {
  savedViews.value = loadViews()
})

// ── 当前激活 id ──────────────────────────────────────────────────────
const activeId = ref<string>('__all__')

// ── 操作 ───────────────────────────────────────────────────────────────
function applyAll() {
  activeId.value = '__all__'
  emit('apply', null)
}

function applyView(view: SavedView) {
  activeId.value = view.id
  emit('apply', view)
}

function deleteView(id: string) {
  savedViews.value = savedViews.value.filter(v => v.id !== id)
  persistViews(savedViews.value)
  // 如果删除的是当前激活视图，回到全部
  if (activeId.value === id) {
    applyAll()
  }
}

function saveCurrentView() {
  const name = window.prompt(t('datatable.savedViews.namePrompt'))
  if (!name || !name.trim()) return
  const newView: SavedView = {
    id: `view_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    state: props.currentState ? { ...props.currentState } : {}
  }
  savedViews.value = [...savedViews.value, newView]
  persistViews(savedViews.value)
  applyView(newView)
}


</script>
