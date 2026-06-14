<template>
  <div class="flex h-full flex-col gap-4 p-6 text-sm text-foreground">
    <!-- ── 页头 ── -->
    <div class="flex flex-shrink-0 items-center gap-3.5">
      <h1 class="m-0 flex-1 text-lg font-bold tracking-tight text-foreground">{{ resource.title }}</h1>
      <Button
        v-if="resource.api.create"
        size="sm"
        @click="openCreateDrawer"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        新建
      </Button>
    </div>

    <!-- ── SavedViewTabs ── -->
    <SavedViewTabs
      :storage-key="resource.key"
      :current-state="state"
      :total-count="total"
      @apply="onApplyView"
    />

    <!-- ── 筛选条 ── -->
    <div v-if="resource.filters && resource.filters.length > 0" class="flex flex-shrink-0 flex-wrap items-center gap-2.5">
      <!-- 关键词搜索 -->
      <Input
        v-model="state.q"
        type="search"
        class="w-48 text-xs"
        placeholder="搜索…"
        @input="onSearchInput"
      />

      <!-- 下拉/文本过滤 -->
      <template v-for="filter in resource.filters" :key="filter.key">
        <Select
          v-if="filter.type === 'select'"
          :model-value="filterValues[filter.key]"
          @update:model-value="(val: string) => { filterValues[filter.key] = val; onFilterChange() }"
        >
          <SelectTrigger class="w-36 text-xs">
            <SelectValue :placeholder="filter.placeholder ?? filter.label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{{ filter.placeholder ?? filter.label }}</SelectItem>
            <SelectItem
              v-for="opt in (filter.options ?? [])"
              :key="String(opt.value)"
              :value="String(opt.value)"
            >{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-else
          v-model="filterValues[filter.key]"
          type="text"
          class="w-48 text-xs"
          :placeholder="filter.placeholder ?? filter.label"
          @input="onFilterChange"
        />
      </template>

      <!-- 清除筛选 -->
      <Button
        v-if="hasActiveFilters"
        variant="ghost"
        size="sm"
        @click="clearFilters"
      >清除</Button>
    </div>

    <!-- ── DataTableV2 ── -->
    <DataTableV2
      :columns="resource.columns"
      :rows="rows as any[]"
      :total="total"
      :loading="loading"
      :selectable="hasBulkActions"
      :row-key="resource.rowKey ?? 'id'"
      :page="state.page"
      :page-size="state.pageSize"
      :sort="state.sort"
      :order="state.order"
      @update:page="(p) => { state.page = p; loadData() }"
      @update:sort="(s) => { state.sort = s; loadData() }"
      @update:order="(o) => { state.order = o; loadData() }"
      @update:selected="onSelectedChange"
    >
      <!-- 透传行操作插槽 -->
      <template v-if="resource.rowActions && resource.rowActions.length > 0" #[`cell-${rowActionsKey}`]="{ row }">
        <div class="flex items-center gap-1.5">
          <template v-for="action in resource.rowActions" :key="action.key">
            <Button
              v-if="!action.hidden || !action.hidden(row as any)"
              variant="outline"
              size="sm"
              :class="{ 'border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive': action.danger }"
              class="h-6 px-2.5 text-[11.5px] font-medium"
              @click.stop="action.handler(row as any)"
            >{{ action.label }}</Button>
          </template>
        </div>
      </template>

      <!-- 透传其他具名单元格插槽（排除已由行操作插槽处理的 key） -->
      <template
        v-for="col in nonActionsColumns"
        :key="col.key"
        #[`cell-${col.key}`]="slotProps"
      >
        <slot :name="`cell-${col.key}`" v-bind="slotProps">
          <span>{{ slotProps.value }}</span>
        </slot>
      </template>

      <template #empty>
        <div class="flex flex-col items-center gap-3 px-6 py-14 text-sm text-muted-foreground">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="5" y="7" width="26" height="22" rx="4" stroke="currentColor" stroke-width="1.5"/>
            <line x1="11" y1="15" x2="25" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="11" y1="21" x2="19" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>暂无数据</span>
        </div>
      </template>
    </DataTableV2>

    <!-- ── 错误提示 ── -->
    <Alert v-if="error" variant="destructive" class="flex-shrink-0">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <!-- ── BulkBar ── -->
    <BulkBar
      v-if="hasBulkActions"
      :count="selectedRows.length"
      @clear="selectedRows = []"
    >
      <template v-for="action in resource.bulkActions" :key="action.key">
        <Button
          variant="outline"
          size="sm"
          :class="{ 'border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive': action.danger }"
          class="h-7 px-2.5 text-[11.5px] font-semibold"
          @click="action.handler(selectedRows as any[])"
        >{{ action.label }}</Button>
      </template>
    </BulkBar>

    <!-- ── 新建/编辑抽屉 ── -->
    <ResourceFormDrawer
      v-model="drawerOpen"
      :title="editingRow ? `编辑 ${resource.title}` : `新建 ${resource.title}`"
      :fields="resource.form ?? []"
      :initial-data="editingRow ?? undefined"
      :submitting="submitting"
      @submit="handleFormSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { DataTableV2, SavedViewTabs, BulkBar, useTableUrlState } from '@/components/datatable'
import type { SavedView } from '@/components/datatable/types'
import ResourceFormDrawer from './ResourceFormDrawer.vue'
import type { ResourceDef } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Props ──────────────────────────────────────────────────────────────
const props = defineProps<{
  resource: ResourceDef
}>()

// ── URL 状态 ───────────────────────────────────────────────────────────
const { state, reset: resetState } = useTableUrlState(props.resource.key)

// ── 筛选值（filter 字段 → state.filters 同步） ─────────────────────────
const filterValues = reactive<Record<string, string>>({})

// 初始化 filterValues 从 state.filters
for (const filter of props.resource.filters ?? []) {
  const val = state.filters[filter.key]
  filterValues[filter.key] = Array.isArray(val) ? val[0] ?? '' : val ?? ''
}

// filterValues → state.filters 同步
watch(filterValues, () => {
  const f: Record<string, string> = {}
  for (const key of Object.keys(filterValues)) {
    if (filterValues[key]) f[key] = filterValues[key]
  }
  state.filters = f
}, { deep: true })

const hasActiveFilters = computed(() =>
  state.q !== '' || Object.values(filterValues).some(v => v !== '')
)

function clearFilters() {
  state.q = ''
  for (const key of Object.keys(filterValues)) {
    filterValues[key] = ''
  }
  state.page = 1
  loadData()
}

// ── 数据 ───────────────────────────────────────────────────────────────
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const selectedRows = ref<Record<string, unknown>[]>([])

const hasBulkActions = computed(() =>
  (props.resource.bulkActions?.length ?? 0) > 0
)

// 操作列 key（约定：最后一列且 key === 'actions'）
const rowActionsKey = computed(() => {
  const last = props.resource.columns[props.resource.columns.length - 1]
  return last?.key ?? 'actions'
})

// 排除行操作列，避免两个插槽定义同一 key 冲突
const nonActionsColumns = computed(() =>
  props.resource.columns.filter(
    col => !(props.resource.rowActions?.length && col.key === rowActionsKey.value)
  )
)

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const result = await props.resource.api.list({
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort || undefined,
      order: state.order,
      q: state.q || undefined,
      filters: state.filters
    })
    rows.value = result.items as Record<string, unknown>[]
    total.value = result.total
  } catch (e: unknown) {
    error.value = '数据加载失败'
    console.error('[ResourcePage] load error:', e)
  } finally {
    loading.value = false
  }
}

// 监听 state 变化（page/sort/order/q/filters）自动加载
watch(
  () => ({ ...state, filters: { ...state.filters } }),
  () => loadData(),
  { deep: true }
)

onMounted(() => loadData())

// ── SavedViewTabs 回调 ──────────────────────────────────────────────────
function onApplyView(view: SavedView | null) {
  if (!view) {
    resetState()
  } else {
    const s = view.state
    if (s.page) state.page = s.page
    if (s.pageSize) state.pageSize = s.pageSize
    if (s.sort) state.sort = s.sort
    if (s.order) state.order = s.order
    if (s.q != null) state.q = s.q
    if (s.filters) state.filters = { ...s.filters }
  }
}

// ── 筛选/搜索 ──────────────────────────────────────────────────────────
function onSearchInput() {
  state.page = 1
}

function onFilterChange() {
  state.page = 1
}

// ── 行选择 ────────────────────────────────────────────────────────────
function onSelectedChange(r: Record<string, unknown>[]) {
  selectedRows.value = r
}

// ── 抽屉 ──────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const editingRow = ref<Record<string, unknown> | null>(null)
const submitting = ref(false)

function openCreateDrawer() {
  editingRow.value = null
  drawerOpen.value = true
}

// 外部通过 expose 打开编辑
function openEditDrawer(row: Record<string, unknown>) {
  editingRow.value = row
  drawerOpen.value = true
}

async function handleFormSubmit(data: Record<string, unknown>) {
  submitting.value = true
  try {
    if (editingRow.value) {
      const id = editingRow.value[props.resource.rowKey ?? 'id'] as number
      await props.resource.api.update?.(id, data)
    } else {
      await props.resource.api.create?.(data)
    }
    drawerOpen.value = false
    await loadData()
  } catch (e) {
    console.error('[ResourcePage] submit error:', e)
  } finally {
    submitting.value = false
  }
}

// ── expose 给外部使用（可选） ─────────────────────────────────────────
defineExpose({ openEditDrawer, reload: loadData })
</script>
