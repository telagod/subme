<template>
  <div class="w-full text-foreground" :style="cssVars">
    <!-- ── 骨架态 ── -->
    <template v-if="loading">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead v-if="selectable" class="w-[34px] px-[10px]"></TableHead>
            <TableHead
              v-for="col in columns"
              :key="col.key"
              :class="[`text-${col.align ?? 'left'}`]"
              :style="col.width ? { width: col.width } : {}"
            >
              {{ col.title }}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="i in 5" :key="i" class="hover:bg-transparent">
            <TableCell v-if="selectable" class="w-[34px] px-[10px]">
              <div class="h-3.5 w-3.5 rounded-sm bg-muted animate-pulse"></div>
            </TableCell>
            <TableCell v-for="col in columns" :key="col.key">
              <div
                class="h-3 rounded bg-muted animate-pulse"
                :style="{ width: col.align === 'right' ? '60%' : '75%', marginLeft: col.align === 'right' ? 'auto' : undefined }"
              ></div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>

    <!-- ── 空态 ── -->
    <template v-else-if="!rows || rows.length === 0">
      <slot name="empty">
        <div class="flex flex-col items-center gap-3 px-6 py-16 text-muted-foreground text-sm">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="6" y="8" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.5"/>
            <line x1="12" y1="16" x2="28" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="22" x2="22" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>暂无数据</span>
        </div>
      </slot>
    </template>

    <!-- ── 正文表格 ── -->
    <template v-else>
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <!-- 全选 checkbox -->
            <TableHead v-if="selectable" class="w-[34px] px-[10px]">
              <Checkbox
                :checked="isIndeterminate ? 'indeterminate' : isAllSelected"
                aria-label="全选"
                @update:checked="(v) => onToggleAll(v === true)"
              />
            </TableHead>
            <!-- 列头 -->
            <TableHead
              v-for="col in columns"
              :key="col.key"
              :class="[
                `text-${col.align ?? 'left'}`,
                col.sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''
              ]"
              :style="col.width ? { width: col.width } : {}"
              :tabindex="col.sortable ? 0 : undefined"
              :role="col.sortable ? 'button' : undefined"
              :aria-sort="sortAriaAttr(col)"
              @click="col.sortable && onSort(col.key)"
              @keydown.enter="col.sortable && onSort(col.key)"
              @keydown.space.prevent="col.sortable && onSort(col.key)"
            >
              <span class="inline-flex items-center gap-1.5">
                {{ col.title }}
                <span v-if="col.sortable" class="dt-sort-icon inline-flex items-center text-primary" aria-hidden="true">
                  <svg v-if="currentSort === col.key && currentOrder === 'asc'" width="10" height="10" viewBox="0 0 10 10"><path d="M5 2 L8 7 L2 7 Z" fill="currentColor"/></svg>
                  <svg v-else-if="currentSort === col.key && currentOrder === 'desc'" width="10" height="10" viewBox="0 0 10 10"><path d="M5 8 L8 3 L2 3 Z" fill="currentColor"/></svg>
                  <svg v-else width="10" height="10" viewBox="0 0 10 10" opacity=".35"><path d="M5 2 L7 5 L3 5 Z" fill="currentColor"/><path d="M5 8 L7 5 L3 5 Z" fill="currentColor"/></svg>
                </span>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="(row, idx) in rows"
            :key="resolveRowKey(row, idx)"
            :class="[
              'cursor-pointer',
              isSelected(row) ? 'bg-primary/10 hover:bg-primary/10' : ''
            ]"
            tabindex="0"
            @click="onRowClick(row, idx)"
            @keydown.enter="onRowClick(row, idx)"
          >
            <!-- 行选 checkbox -->
            <TableCell v-if="selectable" class="w-[34px] px-[10px]" @click.stop>
              <Checkbox
                :checked="isSelected(row)"
                :aria-label="`选择行 ${idx + 1}`"
                @update:checked="() => onToggleRow(row)"
              />
            </TableCell>
            <!-- 单元格 -->
            <TableCell
              v-for="col in columns"
              :key="col.key"
              :class="[`text-${col.align ?? 'left'}`, col.cellClass ?? '']"
            >
              <!-- 具名插槽优先，fallback 默认渲染 -->
              <slot :name="`cell-${col.key}`" :row="row" :value="getCellValue(row, col.key)" :index="idx">
                <span :class="col.cellClass ?? ''">{{ getCellValue(row, col.key) }}</span>
              </slot>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>

    <!-- ── 底部分页栏 ── -->
    <div v-if="!loading" class="flex items-center gap-3.5 border-t border-border px-4 py-2.5 text-muted-foreground text-xs">
      <span>
        共 <b class="font-mono tabular-nums text-foreground">{{ total.toLocaleString() }}</b> 条
        <template v-if="selectable && selectedRows.length > 0">
          · 已选 <b class="font-mono tabular-nums text-primary">{{ selectedRows.length }}</b>
        </template>
      </span>
      <!-- 页码 -->
      <nav class="ml-auto flex items-center gap-1" aria-label="分页">
        <Button
          variant="ghost"
          size="icon"
          class="h-[26px] w-[26px] rounded-[7px] font-mono text-[11px] text-muted-foreground"
          :disabled="currentPage <= 1"
          aria-label="上一页"
          @click="onPageChange(currentPage - 1)"
        >‹</Button>
        <Button
          v-for="p in pageNumbers"
          :key="p"
          variant="ghost"
          size="icon"
          class="h-[26px] min-w-[26px] w-auto px-1 rounded-[7px] font-mono text-[11px]"
          :class="[
            p === currentPage
              ? 'bg-primary/12 text-primary font-semibold hover:bg-primary/12'
              : 'text-muted-foreground',
            p === -1 ? 'cursor-default pointer-events-none' : ''
          ]"
          :disabled="p === -1"
          :aria-current="p === currentPage ? 'page' : undefined"
          @click="p !== -1 && onPageChange(p)"
        >
          {{ p === -1 ? '…' : p }}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-[26px] w-[26px] rounded-[7px] font-mono text-[11px] text-muted-foreground"
          :disabled="currentPage >= totalPages"
          aria-label="下一页"
          @click="onPageChange(currentPage + 1)"
        >›</Button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed, shallowRef } from 'vue'
import type { ColumnDef, SortOrder } from './types'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

// ── Props ──────────────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  columns: ColumnDef<T>[]
  rows: T[]
  total: number
  loading?: boolean
  selectable?: boolean
  rowKey?: keyof T & string
  density?: 'comfortable' | 'compact'
  /** 当前页（受控），不传则组件内部管理 */
  page?: number
  /** 每页条数，默认 20 */
  pageSize?: number
  /** 当前排序字段 */
  sort?: string
  /** 当前排序方向 */
  order?: SortOrder
}>(), {
  loading: false,
  selectable: false,
  density: 'compact',
  page: 1,
  pageSize: 20,
  sort: '',
  order: 'asc'
})

// ── Emits ──────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'row-click': [row: T, index: number]
  'update:selected': [rows: T[]]
  'update:page': [page: number]
  'update:sort': [sort: string]
  'update:order': [order: SortOrder]
}>()

// ── 内部状态 ────────────────────────────────────────────────────────────
const selectedRows = shallowRef<T[]>([])

const currentPage = computed(() => props.page)
const currentSort = computed(() => props.sort)
const currentOrder = computed(() => props.order)
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

// ── CSS 变量（密度控行高） ─────────────────────────────────────────────
const cssVars = computed(() => ({
  '--dt-row-h': props.density === 'comfortable' ? '44px' : '32px'
}))

// ── 工具 ───────────────────────────────────────────────────────────────
function resolveRowKey(row: T, idx: number): string {
  if (props.rowKey && row[props.rowKey] != null) {
    return String(row[props.rowKey])
  }
  return String(idx)
}

function getCellValue(row: T, key: string): unknown {
  return row[key]
}

function isSelected(row: T): boolean {
  const key = props.rowKey
  if (key) return selectedRows.value.some(r => r[key] === row[key])
  return selectedRows.value.includes(row)
}

const isAllSelected = computed(() =>
  props.rows.length > 0 && props.rows.every(r => isSelected(r))
)

const isIndeterminate = computed(() =>
  !isAllSelected.value && props.rows.some(r => isSelected(r))
)

// ── 事件处理 ───────────────────────────────────────────────────────────
function onRowClick(row: T, idx: number) {
  emit('row-click', row, idx)
}

function onToggleRow(row: T) {
  const key = props.rowKey
  const current = selectedRows.value
  const idx = key
    ? current.findIndex(r => r[key] === row[key])
    : current.indexOf(row)
  if (idx >= 0) {
    const next = [...current]
    next.splice(idx, 1)
    selectedRows.value = next
  } else {
    selectedRows.value = [...current, row]
  }
  emit('update:selected', [...selectedRows.value])
}

function onToggleAll(checked: boolean) {
  selectedRows.value = checked ? [...props.rows] : []
  emit('update:selected', [...selectedRows.value])
}

function onSort(key: string) {
  if (currentSort.value === key) {
    emit('update:order', currentOrder.value === 'asc' ? 'desc' : 'asc')
  } else {
    emit('update:sort', key)
    emit('update:order', 'asc')
  }
  emit('update:page', 1)
}

function onPageChange(page: number) {
  if (page < 1 || page > totalPages.value) return
  emit('update:page', page)
}

function sortAriaAttr(col: ColumnDef<T>): 'ascending' | 'descending' | 'none' | undefined {
  if (!col.sortable) return undefined
  if (currentSort.value !== col.key) return 'none'
  return currentOrder.value === 'asc' ? 'ascending' : 'descending'
}

// ── 页码序列（含省略号 -1） ────────────────────────────────────────────
const pageNumbers = computed<number[]>(() => {
  const total = totalPages.value
  const cur = currentPage.value
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: number[] = [1]
  if (cur > 3) pages.push(-1)
  const start = Math.max(2, cur - 1)
  const end = Math.min(total - 1, cur + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (cur < total - 2) pages.push(-1)
  pages.push(total)
  return pages
})
</script>

<style scoped>
/* ── DataTableV2 scoped 样式（行高受 density prop 控制） ── */

/* 单元格行高 — 由 cssVars 注入 --dt-row-h */
:deep(td) {
  height: var(--dt-row-h);
  padding-top: 0;
  padding-bottom: 0;
}

/* 金额约定 class（全局可用） */
:global(.q-money) {
  font-family: var(--font-mono, "IBM Plex Mono", monospace);
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

@media (prefers-reduced-motion: reduce) {
  :deep(.animate-pulse) { animation: none; }
}
</style>
