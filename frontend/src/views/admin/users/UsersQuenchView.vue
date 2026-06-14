<template>
  <AppLayout>
    <div class="px-7 pb-16 pt-6">
      <!-- 页头 -->
      <div class="mb-5 flex items-end justify-between" style="animation-delay:.02s">
        <div>
          <h1 class="mb-1 text-xl font-bold tracking-tight text-foreground">{{ t('admin.usersQuench.title') }}</h1>
          <p class="text-xs text-muted-foreground">{{ t('admin.usersQuench.desc') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="loading" @click="loadUsers">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 1.5v2.5H5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ t('admin.usersQuench.refresh') }}
          </Button>
          <Button size="sm" @click="openCreateDrawer">{{ t('admin.usersQuench.createBtn') }}</Button>
        </div>
      </div>

      <!-- 视图页签 -->
      <div class="mb-3" style="animation-delay:.06s">
        <SavedViewTabs storage-key="admin_users" :current-state="savedViewState" :total-count="pagination.total" @apply="onApplyView" />
      </div>

      <!-- 快速内置视图 -->
      <div class="mb-3 flex gap-1.5" style="animation-delay:.10s">
        <Button
          v-for="qv in QUICK_VIEWS"
          :key="qv.id"
          variant="outline"
          size="sm"
          class="h-auto rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
          :class="activeQuickView === qv.id
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-transparent text-muted-foreground hover:border-input hover:text-foreground'"
          @click="applyQuickView(qv as any)"
        >{{ qv.label }}</Button>
      </div>

      <!-- 筛选栏 -->
      <div class="mb-3" style="animation-delay:.14s">
        <UsersFilterBar
          v-model:search="searchInput"
          v-model:density="density"
          :fields="FILTER_FIELDS"
          :advanced-filter="advancedFilterValues"
          @update:advanced-filter="onAdvancedFilterApply"
          @apply-filter="onAdvancedFilterApply"
          @commit-search="commitSearch"
          @clear="clearFilters"
        />
      </div>

      <!-- 表格卡片 -->
      <Card class="overflow-hidden" style="animation-delay:.18s">
        <CardContent class="p-0">
          <DataTableV2
            :columns="(COLUMNS as any)"
            :rows="(users as unknown as Record<string, unknown>[])"
            :total="pagination.total"
            :loading="loading"
            :selectable="true"
            row-key="id"
            :density="density"
            :page="state.page"
            :page-size="state.pageSize"
            :sort="state.sort"
            :order="state.order"
            @row-click="onRowClick"
            @update:selected="onSelectionChange"
            @update:page="p => { state.page = p }"
            @update:sort="s => { state.sort = s; state.page = 1 }"
            @update:order="o => { state.order = o; state.page = 1 }"
          >
            <template #cell-email="{ row }">
              <div class="flex items-center gap-2.5">
                <div class="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[13px] font-bold text-background" :style="{ background: avatarColor(String(row.email)) }">{{ String(row.email).charAt(0).toUpperCase() }}</div>
                <div>
                  <div class="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-medium text-foreground">{{ row.email }}</div>
                  <div class="mt-px text-[11px] text-muted-foreground"><span v-if="row.username">@{{ row.username }}</span><span v-else class="text-muted-foreground">—</span><span class="text-muted-foreground"> · #{{ String(row.id).padStart(4, '0') }}</span></div>
                </div>
              </div>
            </template>

            <template #cell-role="{ value }">
              <Badge :variant="value === 'admin' ? 'default' : 'secondary'">{{ value === 'admin' ? t('admin.usersQuench.roleAdmin') : t('admin.usersQuench.roleUser') }}</Badge>
            </template>

            <template #cell-balance="{ row }">
              <div class="flex flex-col items-end gap-1">
                <span
                  class="font-mono tabular-nums text-[12.5px]"
                  :class="{
                    'text-destructive': Number(row.balance) < 1,
                    'text-amber-500': Number(row.balance) >= 1 && Number(row.balance) < 5,
                    'text-foreground': Number(row.balance) >= 5
                  }"
                >${{ Number(row.balance).toFixed(2) }}</span>
                <div class="h-[3px] w-[72px] overflow-hidden rounded-full bg-muted">
                  <i
                    class="block h-full rounded-full"
                    :style="{ width: Math.min(100, Math.max(0, Number(row.balance))) + '%' }"
                    :class="{
                      'bg-destructive': Number(row.balance) < 1,
                      'bg-amber-500': Number(row.balance) >= 1 && Number(row.balance) < 5,
                      'bg-primary': Number(row.balance) >= 5
                    }"
                  ></i>
                </div>
              </div>
            </template>

            <template #cell-concurrency="{ row }">
              <span class="font-mono tabular-nums text-muted-foreground">{{ row.current_concurrency ?? 0 }}/{{ row.concurrency }}</span>
            </template>

            <template #cell-status="{ value }">
              <span class="inline-flex items-center gap-1.5 text-[12.5px]">
                <span class="inline-block h-[7px] w-[7px] rounded-full" :class="value === 'active' ? 'bg-emerald-500' : 'bg-destructive'"></span>
                {{ value === 'active' ? t('admin.usersQuench.statusActive') : t('admin.usersQuench.statusDisabled') }}
              </span>
            </template>

            <template #cell-created_at="{ value }">
              <span class="font-mono text-[11.5px] tabular-nums text-muted-foreground">{{ fmtDate(String(value)) }}</span>
            </template>

            <template #empty>
              <div class="flex flex-col items-center justify-center gap-2.5 px-6 py-[60px] text-[13px] text-muted-foreground">
                <svg class="opacity-35" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                  <rect x="5" y="10" width="30" height="22" rx="4" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M12 16h16M12 21h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <circle cx="30" cy="30" r="8" fill="transparent" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M27 30h6M30 27v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                <span>{{ t('admin.usersQuench.emptyText') }}</span>
              </div>
            </template>

            <template #cell-_actions="{ row }">
              <div class="row-acts flex items-center gap-0.5">
                <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground" :title="t('admin.usersQuench.actionAdjustBalance')" @click.stop="openBalance(row as unknown as AdminUser, 'add')">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 4v5M4 6.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </Button>
                <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground" :title="t('admin.usersQuench.actionEdit')" @click.stop="openEditDrawer(row as unknown as AdminUser)">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9.5 2L11 3.5L5 9.5H3.5V8L9.5 2Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </Button>
                <Button
                  v-if="(row as unknown as AdminUser).role !== 'admin'"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :class="(row as unknown as AdminUser).status === 'active' ? 'text-muted-foreground hover:text-amber-500' : 'text-muted-foreground hover:text-emerald-500'"
                  :title="(row as unknown as AdminUser).status === 'active' ? t('admin.usersQuench.actionDisable') : t('admin.usersQuench.actionEnable')"
                  @click.stop="toggleStatus(row as unknown as AdminUser)"
                >
                  <svg v-if="(row as unknown as AdminUser).status === 'active'" width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 4.5L8.5 8.5M8.5 4.5L4.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  <svg v-else width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 6.5L5.8 7.8L8.5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </Button>
              </div>
            </template>
          </DataTableV2>
        </CardContent>
      </Card>

      <!-- 批量操作条 -->
      <BulkBar :count="selected.length" @clear="selected = []">
        <Button variant="outline" size="sm" @click="bulkEnable">{{ t('admin.usersQuench.bulkEnable') }}</Button>
        <Button variant="outline" size="sm" @click="bulkDisable">{{ t('admin.usersQuench.bulkDisable') }}</Button>
        <Button variant="destructive" size="sm" @click="showBulkDel = true">{{ t('admin.usersQuench.bulkDelete') }}</Button>
      </BulkBar>

      <!-- 批量删除确认 -->
      <Dialog :open="showBulkDel" @update:open="showBulkDel = $event">
        <DialogContent class="max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{{ t('admin.usersQuench.bulkDeleteTitle') }}</DialogTitle>
            <DialogDescription>{{ t('admin.usersQuench.bulkDeleteConfirm', { n: selected.length }) }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="showBulkDel = false">{{ t('admin.usersQuench.bulkDeleteCancel') }}</Button>
            <Button variant="destructive" :disabled="bulkDeleting" @click="doBulkDelete">{{ bulkDeleting ? t('admin.usersQuench.bulkDeletingProgress', { current: bulkDelProg, total: selected.length }) : t('admin.usersQuench.bulkDeleteConfirmBtn') }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- 用户 360 抽屉 (U2 契约) -->
      <UserDetailDrawer :userId="drawerUserId" :open="drawerOpen" @close="drawerOpen = false" @updated="loadUsers" />

      <!-- 创建/编辑抽屉 -->
      <UserFormDrawer :open="formOpen" :user="editingUser" @close="formOpen = false" @success="onFormSuccess" />

      <!-- 调余额 Modal -->
      <UserBalanceModal :show="showBalance" :user="balanceUser" :operation="balanceOp" @close="showBalance = false" @success="loadUsers" />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import { DataTableV2, SavedViewTabs, BulkBar, useTableUrlState, serializeFilters, deserializeFilters } from '@/components/datatable'
import type { ColumnDef, SavedView, FilterFieldDef, AdvancedFilterValues, NumberRangeValue, DateRangeValue } from '@/components/datatable'
import { adminAPI } from '@/api/admin'
import type { AdminUser } from '@/types'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'
import UsersFilterBar from './UsersFilterBar.vue'
import UserFormDrawer from './UserFormDrawer.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

const UserDetailDrawer = defineAsyncComponent(() => import('@/components/admin/users/UserDetailDrawer.vue'))
const UserBalanceModal = defineAsyncComponent(() => import('@/components/admin/user/UserBalanceModal.vue'))

const { t } = useI18n()
const appStore = useAppStore()
const { state, reset } = useTableUrlState('u')

// ─── 高级筛选字段定义 ──────────────────────────────────────────
const FILTER_FIELDS = computed((): FilterFieldDef[] => [
  {
    key: 'role',
    label: t('admin.usersQuench.filterFieldRole'),
    type: 'select',
    options: [
      { value: 'admin', label: t('admin.usersQuench.roleAdmin') },
      { value: 'user',  label: t('admin.usersQuench.roleUser') },
    ],
  },
  {
    key: 'status',
    label: t('admin.usersQuench.filterFieldStatus'),
    type: 'select',
    options: [
      { value: 'active',   label: t('admin.usersQuench.statusActive') },
      { value: 'disabled', label: t('admin.usersQuench.statusDisabled') },
    ],
  },
  {
    key: 'group_name',
    label: t('admin.usersQuench.filterFieldGroup'),
    type: 'text',
    placeholder: t('admin.usersQuench.filterFieldGroupPlaceholder'),
  },
  {
    key: 'balance',
    label: t('admin.usersQuench.filterFieldBalance'),
    type: 'numberRange',
    placeholder: t('admin.usersQuench.filterMin'),
    placeholderMax: t('admin.usersQuench.filterMax'),
  },
  {
    key: 'created_at',
    label: t('admin.usersQuench.filterFieldCreatedAt'),
    type: 'dateRange',
  },
  {
    key: 'last_active',
    label: t('admin.usersQuench.filterFieldLastActive'),
    type: 'dateRange',
  },
  {
    key: 'subscription_status',
    label: t('admin.usersQuench.filterFieldSubStatus'),
    type: 'select',
    options: [
      { value: 'active',  label: t('admin.usersQuench.subStatusActive') },
      { value: 'expired', label: t('admin.usersQuench.subStatusExpired') },
      { value: 'none',    label: t('admin.usersQuench.subStatusNone') },
    ],
  },
])

// ─── 高级筛选值（从 URL 反序列化初始值）──────────────────────────
// AF 值存在 state.filters 的 af_ 命名空间中，通过 serializeFilters 写入
function readAfFromState(): AdvancedFilterValues {
  // state.filters 里以 af_ 开头的 key 转回 query 对象让 deserializeFilters 解析
  const afQuery: Record<string, string> = {}
  for (const [k, v] of Object.entries(state.filters)) {
    if (k.startsWith('af_') && typeof v === 'string') afQuery[k] = v
  }
  return deserializeFilters(afQuery, FILTER_FIELDS.value)
}

const advancedFilterValues = ref<AdvancedFilterValues>(readAfFromState())

// ─── 快速视图定义 ───────────────────────────────────────────────
const QUICK_VIEWS = computed(() => [
  { id: 'all', label: t('admin.usersQuench.viewAll'), filters: {} as Record<string,string> },
  { id: 'admin', label: t('admin.usersQuench.viewAdmin'), filters: { role: 'admin' } },
  { id: 'disabled', label: t('admin.usersQuench.viewDisabled'), filters: { status: 'disabled' } },
])

// ─── 列定义 ─────────────────────────────────────────────────────
const COLUMNS = computed(() => [
  { key: 'email',       title: t('admin.usersQuench.colUser'),       width: '220px' },
  { key: 'role',        title: t('admin.usersQuench.colRole'),        width: '80px' },
  { key: 'balance',     title: t('admin.usersQuench.colBalance'),     align: 'right', width: '140px', sortable: true },
  { key: 'concurrency', title: t('admin.usersQuench.colConcurrency'), align: 'center', width: '80px' },
  { key: 'status',      title: t('admin.usersQuench.colStatus'),      width: '90px',  sortable: true },
  { key: 'created_at',  title: t('admin.usersQuench.colCreatedAt'),   width: '110px', sortable: true },
  { key: '_actions',    title: '',                                     width: '96px' },
] as unknown as ColumnDef<Record<string, unknown>>[])

// ─── 本地状态 ────────────────────────────────────────────────────
const users = ref<AdminUser[]>([])
const loading = ref(false)
const pagination = reactive({ total: 0, pages: 0 })
const density = ref<'comfortable' | 'compact'>('comfortable')
const selected = ref<AdminUser[]>([])
const activeQuickView = ref('all')

const searchInput = ref(state.q)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// 抽屉
const drawerOpen = ref(false)
const drawerUserId = ref<number | null>(null)
const formOpen = ref(false)
const editingUser = ref<AdminUser | null>(null)
// 余额
const showBalance = ref(false)
const balanceUser = ref<AdminUser | null>(null)
const balanceOp = ref<'add' | 'subtract'>('add')
// 批量删除
const showBulkDel = ref(false)
const bulkDeleting = ref(false)
const bulkDelProg = ref(0)

// AbortController
let abortCtrl: AbortController | null = null

// ─── 计算属性 ────────────────────────────────────────────────────
const savedViewState = computed(() => ({ page: state.page, pageSize: state.pageSize, sort: state.sort, order: state.order, q: state.q, filters: { ...state.filters } }))

// ─── 工具函数 ────────────────────────────────────────────────────
const PALETTE = ['#B9C7E8','#E8B9C2','#9BC4E8','#A3E0C8','#D6DCE6','#E8D5B9','#C4B9E8','#B9E8D5']
function avatarColor(email: string) {
  let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xFFFFFFFF
  return PALETTE[Math.abs(h) % PALETTE.length]
}
function fmtDate(iso: string) { return iso ? formatDateTime(iso) : '-' }

/** 从 advancedFilterValues 提取后端 API 参数 */
function extractApiFilters() {
  const af = advancedFilterValues.value
  const balVal = af.balance as NumberRangeValue | undefined
  const createdVal = af.created_at as DateRangeValue | undefined
  const activeVal = af.last_active as DateRangeValue | undefined
  return {
    role:                ((af.role as string) || undefined) as 'admin' | 'user' | undefined,
    status:              ((af.status as string) || undefined) as 'active' | 'disabled' | undefined,
    group_name:          (af.group_name as string) || undefined,
    balance_min:         (balVal?.min !== '' && balVal?.min != null) ? Number(balVal.min) : undefined,
    balance_max:         (balVal?.max !== '' && balVal?.max != null) ? Number(balVal.max) : undefined,
    created_after:       createdVal?.after || undefined,
    created_before:      createdVal?.before || undefined,
    last_active_after:   activeVal?.after || undefined,
    last_active_before:  activeVal?.before || undefined,
    subscription_status: ((af.subscription_status as string) || undefined) as 'active' | 'expired' | 'none' | undefined,
  }
}

// ─── 数据加载 ────────────────────────────────────────────────────
async function loadUsers() {
  abortCtrl?.abort(); abortCtrl = new AbortController()
  const { signal } = abortCtrl
  loading.value = true
  try {
    const res = await adminAPI.users.list(state.page, state.pageSize, {
      ...extractApiFilters(),
      search: state.q || undefined,
      sort_by: state.sort || 'created_at',
      sort_order: (state.order as any) || 'desc',
      include_subscriptions: true,
    }, { signal })
    if (signal.aborted) return
    users.value = res.items; pagination.total = res.total; pagination.pages = res.pages
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return
    appStore.showError(e?.response?.data?.detail || t('admin.usersQuench.loadFailed'))
  } finally {
    if (!abortCtrl?.signal.aborted) loading.value = false
  }
}

/** 把 AF 值序列化写入 state.filters（af_ 前缀），触发 URL 持久化 */
function syncAfToState(vals: AdvancedFilterValues) {
  const serialized = serializeFilters(vals, FILTER_FIELDS.value)
  // 清除旧 af_ 键
  for (const k of Object.keys(state.filters)) {
    if (k.startsWith('af_')) delete state.filters[k]
  }
  Object.assign(state.filters, serialized)
  state.page = 1
}

// ─── 筛选 ────────────────────────────────────────────────────────
function commitSearch() { state.q = searchInput.value; state.page = 1 }

function onAdvancedFilterApply(vals: AdvancedFilterValues) {
  advancedFilterValues.value = vals
  syncAfToState(vals)
  activeQuickView.value = ''
}

function clearFilters() {
  searchInput.value = ''
  state.q = ''
  state.page = 1
  advancedFilterValues.value = {}
  for (const k of Object.keys(state.filters)) {
    if (k.startsWith('af_')) delete state.filters[k]
  }
  activeQuickView.value = 'all'
}

function applyQuickView(qv: typeof QUICK_VIEWS.value[0]) {
  activeQuickView.value = qv.id
  searchInput.value = ''
  state.q = ''
  state.page = 1
  // 快速视图用 AF 覆盖（role/status）
  const next: AdvancedFilterValues = {}
  if (qv.filters.role) next.role = qv.filters.role
  if (qv.filters.status) next.status = qv.filters.status
  advancedFilterValues.value = next
  syncAfToState(next)
}

function onApplyView(view: SavedView | null) {
  if (!view) {
    reset()
    searchInput.value = ''
    advancedFilterValues.value = {}
    activeQuickView.value = 'all'
    return
  }
  if (view.state.q != null) { state.q = view.state.q; searchInput.value = view.state.q }
  if (view.state.sort) state.sort = view.state.sort
  if (view.state.order) state.order = view.state.order
  if (view.state.page) state.page = view.state.page
  if (view.state.pageSize) state.pageSize = view.state.pageSize
  if (view.state.filters) {
    Object.assign(state.filters, view.state.filters)
    advancedFilterValues.value = readAfFromState()
  }
  activeQuickView.value = ''
}

// ─── 行操作 ──────────────────────────────────────────────────────
function onRowClick(row: Record<string, unknown>) { drawerUserId.value = (row as unknown as AdminUser).id; drawerOpen.value = true }
function onSelectionChange(rows: Record<string, unknown>[]) { selected.value = rows as unknown as AdminUser[] }
function openCreateDrawer() { editingUser.value = null; formOpen.value = true }
function openEditDrawer(user: AdminUser) { editingUser.value = user; formOpen.value = true }
function onFormSuccess() { formOpen.value = false; loadUsers() }
function openBalance(user: AdminUser, op: 'add' | 'subtract') { balanceUser.value = user; balanceOp.value = op; showBalance.value = true }

async function toggleStatus(user: AdminUser) {
  const ns = user.status === 'active' ? 'disabled' : 'active'
  try { await adminAPI.users.toggleStatus(user.id, ns); appStore.showSuccess(ns === 'active' ? t('admin.usersQuench.enabled') : t('admin.usersQuench.disabled')); loadUsers() }
  catch (e: any) { appStore.showError(e?.response?.data?.detail || t('admin.usersQuench.operationFailed')) }
}

// ─── 批量操作 ────────────────────────────────────────────────────
async function bulkEnable() {
  const targets = selected.value.filter(u => u.status !== 'active')
  if (!targets.length) { appStore.showError(t('admin.usersQuench.noEnableTarget')); return }
  await Promise.allSettled(targets.map(u => adminAPI.users.toggleStatus(u.id, 'active')))
  appStore.showSuccess(t('admin.usersQuench.bulkEnabledSuccess', { n: targets.length })); selected.value = []; loadUsers()
}
async function bulkDisable() {
  const targets = selected.value.filter(u => u.role !== 'admin' && u.status !== 'disabled')
  if (!targets.length) { appStore.showError(t('admin.usersQuench.noDisableTarget')); return }
  await Promise.allSettled(targets.map(u => adminAPI.users.toggleStatus(u.id, 'disabled')))
  appStore.showSuccess(t('admin.usersQuench.bulkDisabledSuccess', { n: targets.length })); selected.value = []; loadUsers()
}
async function doBulkDelete() {
  const targets = selected.value.filter(u => u.role !== 'admin')
  bulkDeleting.value = true; bulkDelProg.value = 0; let done = 0
  for (const u of targets) { try { await adminAPI.users.delete(u.id) } catch { /* continue */ } bulkDelProg.value = ++done }
  bulkDeleting.value = false; showBulkDel.value = false
  appStore.showSuccess(t('admin.usersQuench.bulkDeletedSuccess', { n: done })); selected.value = []; loadUsers()
}

// ─── 搜索防抖 ─────────────────────────────────────────────────────
watch(searchInput, () => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(commitSearch, 350) })

// ─── state 变化 → loadUsers ──────────────────────────────────────
watch(() => [state.page, state.pageSize, state.sort, state.order, state.q, JSON.stringify(state.filters)], loadUsers, { flush: 'post' })

onMounted(loadUsers)
onUnmounted(() => { abortCtrl?.abort(); if (searchTimer) clearTimeout(searchTimer) })
</script>

<style scoped>
/* :deep 规则必须在 scoped 块里才能穿透子组件 */
:deep(.q-tr:hover) .row-acts,
:deep(.q-tr:focus-visible) .row-acts { opacity: 1; }
</style>
