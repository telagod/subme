<template>
  <AppLayout>
    <div class="px-7 pb-16 pt-6 text-foreground">
      <!-- 页头 -->
      <div class="mb-5 flex items-end justify-between animate-in fade-in slide-in-from-bottom-2 duration-300" style="animation-delay:.02s">
        <div>
          <h1 class="mb-1 text-xl font-bold tracking-tight text-foreground">{{ t('admin.subscriptionsQuench.title') }}</h1>
          <p class="text-xs text-muted-foreground">{{ t('admin.subscriptionsQuench.desc') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="loading" @click="loadSubs" class="gap-1.5 text-xs">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 1.5v2.5H5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ t('admin.subscriptionsQuench.refresh') }}
          </Button>
          <Button size="sm" @click="showAssign = true" class="text-xs">{{ t('admin.subscriptionsQuench.assignBtn') }}</Button>
        </div>
      </div>

      <!-- 视图页签 -->
      <div class="animate-in fade-in slide-in-from-bottom-2 duration-300" style="animation-delay:.06s">
        <SavedViewTabs storage-key="admin_subscriptions" :current-state="savedViewState" :total-count="pagination.total" @apply="onApplyView" />
      </div>

      <!-- 快速内置视图 -->
      <div class="mb-3 flex gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300" style="animation-delay:.10s">
        <Button
          v-for="qv in QUICK_VIEWS"
          :key="qv.id"
          variant="outline"
          size="sm"
          class="h-auto rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
          :class="activeQuickView === qv.id
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-border/80'"
          @click="applyQuickView(qv as any)"
        >{{ qv.label }}</Button>
      </div>

      <!-- 筛选栏 -->
      <div class="mb-3 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300" style="animation-delay:.14s">
        <AdvancedFilter :fields="filterFields" v-model="advFilters" @apply="onFilterApply" @clear="onFilterClear" />
      </div>

      <!-- 表格卡片 -->
      <Card class="overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300" style="animation-delay:.18s">
        <CardContent class="p-0">
          <DataTableV2
            :columns="(COLUMNS as any)"
            :rows="(subs as unknown as Record<string, unknown>[])"
            :total="pagination.total"
            :loading="loading"
            :selectable="true"
            row-key="id"
            :density="density"
            :page="state.page"
            :page-size="state.pageSize"
            :sort="state.sort"
            :order="state.order"
            @update:selected="onSelectionChange"
            @update:page="p => { state.page = p }"
            @update:sort="s => { state.sort = s; state.page = 1 }"
            @update:order="o => { state.order = o; state.page = 1 }"
          >
            <!-- 用户列 -->
            <template #cell-user="{ row }">
              <div class="flex items-center gap-2.5">
                <div
                  class="flex-shrink-0 w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold text-zinc-900"
                  :style="{ background: avatarColor(String((row as any).user?.email ?? '')) }"
                >
                  {{ String((row as any).user?.email ?? '?').charAt(0).toUpperCase() }}
                </div>
                <div>
                  <div class="text-[12.5px] font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">{{ (row as any).user?.email ?? t('admin.subscriptionsQuench.unknownUser') }}</div>
                  <div class="text-[11px] text-muted-foreground mt-px"><span class="text-muted-foreground">#{{ (row as any).user_id }}</span></div>
                </div>
              </div>
            </template>

            <!-- 套餐/分组 -->
            <template #cell-group="{ row }">
              <GroupBadge v-if="(row as any).group" :name="(row as any).group.name" :platform="(row as any).group.platform" :subscription-type="(row as any).group.subscription_type" :rate-multiplier="(row as any).group.rate_multiplier" :show-rate="false" />
              <span v-else class="text-muted-foreground text-[11.5px]">—</span>
            </template>

            <!-- 状态点 -->
            <template #cell-status="{ value }">
              <span class="inline-flex items-center gap-1.5 text-[12.5px]">
                <span
                  class="inline-block w-[7px] h-[7px] rounded-full"
                  :class="value === 'active' ? 'bg-emerald-500' : value === 'expired' ? 'bg-amber-400' : 'bg-destructive'"
                ></span>
                <span :class="value === 'active' ? 'text-foreground' : 'text-muted-foreground'">{{ t(`admin.subscriptions.status.${value}`) }}</span>
              </span>
            </template>

            <!-- 到期时间 + 剩余天数 -->
            <template #cell-expires_at="{ row }">
              <div v-if="(row as any).expires_at">
                <div
                  class="font-mono text-[11.5px] tabular-nums"
                  :class="isExpiringSoon((row as any).expires_at) ? 'text-amber-400' : 'text-foreground'"
                >{{ fmtDate((row as any).expires_at) }}</div>
                <div
                  v-if="daysRemaining((row as any).expires_at) !== null"
                  class="text-[11px] mt-px"
                  :class="isExpiringSoon((row as any).expires_at) ? 'text-amber-400' : 'text-muted-foreground'"
                >{{ daysRemaining((row as any).expires_at) }}d {{ t('admin.subscriptionsQuench.daysLeft') }}</div>
              </div>
              <span v-else class="text-muted-foreground text-[11.5px]">{{ t('admin.subscriptions.noExpiration') }}</span>
            </template>

            <!-- 操作列 -->
            <template #cell-_actions="{ row }">
              <div class="sq-acts flex items-center gap-0.5 opacity-0 transition-opacity duration-100">
                <Button
                  v-if="(row as any).status === 'active' || (row as any).status === 'expired'"
                  variant="ghost"
                  size="icon"
                  class="w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-amber-400"
                  :title="t('admin.subscriptionsQuench.actionExtend')"
                  @click.stop="openExtend(row as any)"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="3.5" width="9" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 2v3M8 2v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M2 6.5h9" stroke="currentColor" stroke-width="1.2"/></svg>
                </Button>
                <Button
                  v-if="(row as any).status === 'active'"
                  variant="ghost"
                  size="icon"
                  class="w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  :title="t('admin.subscriptionsQuench.actionResetQuota')"
                  @click.stop="openResetQuota(row as any)"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8 1.5v2.5H5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </Button>
                <Button
                  v-if="(row as any).status === 'active'"
                  variant="ghost"
                  size="icon"
                  class="w-7 h-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  :title="t('admin.subscriptionsQuench.actionRevoke')"
                  @click.stop="openRevoke(row as any)"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M4 4l5 5M9 4L4 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </Button>
              </div>
            </template>

            <template #empty>
              <div class="flex flex-col items-center justify-center gap-2.5 px-6 py-[60px] text-muted-foreground text-[13px]">
                <svg class="opacity-35" width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect x="5" y="10" width="30" height="22" rx="4" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M12 16h16M12 21h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                <span>{{ t('admin.subscriptionsQuench.emptyText') }}</span>
              </div>
            </template>
          </DataTableV2>
        </CardContent>
      </Card>

      <!-- 批量操作条 -->
      <BulkBar :count="selected.length" @clear="selected = []">
        <Button variant="destructive" size="sm" @click="bulkRevoke">{{ t('admin.subscriptionsQuench.bulkRevoke') }}</Button>
      </BulkBar>

      <!-- 操作弹窗 -->
      <SubscriptionDialogs
        :show-assign="showAssign"
        :show-extend="showExtend"
        :show-revoke="showRevoke"
        :show-reset-quota="showResetQuota"
        :extending-sub="extendingSub"
        :revoking-sub="revokingSub"
        :resetting-sub="resettingSub"
        :groups="groups"
        @close-assign="showAssign = false"
        @close-extend="showExtend = false"
        @close-revoke="showRevoke = false"
        @close-reset-quota="showResetQuota = false"
        @assigned="loadSubs"
        @extended="loadSubs"
        @revoked="loadSubs"
        @quota-reset="loadSubs"
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import { DataTableV2, SavedViewTabs, BulkBar, AdvancedFilter, useTableUrlState, serializeFilters, deserializeFilters } from '@/components/datatable'
import type { ColumnDef, SavedView, FilterFieldDef, AdvancedFilterValues } from '@/components/datatable'
import { adminAPI } from '@/api/admin'
import type { UserSubscription, Group } from '@/types'
import { useAppStore } from '@/stores/app'
import GroupBadge from '@/components/common/GroupBadge.vue'
import SubscriptionDialogs from './SubscriptionDialogs.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const { t } = useI18n()
const appStore = useAppStore()
const { state, reset } = useTableUrlState('sq')
const QUICK_VIEWS = computed(() => [
  { id: 'all',     label: t('admin.subscriptionsQuench.viewAll'),     filters: {} as Record<string,string> },
  { id: 'active',  label: t('admin.subscriptionsQuench.viewActive'),  filters: { f_status: 'active' } },
  { id: 'expired', label: t('admin.subscriptionsQuench.viewExpired'), filters: { f_status: 'expired' } },
  { id: 'revoked', label: t('admin.subscriptionsQuench.viewRevoked'), filters: { f_status: 'revoked' } },
])
const COLUMNS = computed(() => [
  { key: 'user',       title: t('admin.subscriptionsQuench.colUser'),      width: '210px' },
  { key: 'group',      title: t('admin.subscriptionsQuench.colGroup'),     width: '160px' },
  { key: 'status',     title: t('admin.subscriptionsQuench.colStatus'),    width: '90px',  sortable: true },
  { key: 'expires_at', title: t('admin.subscriptionsQuench.colExpires'),   width: '130px', sortable: true },
  { key: '_actions',   title: '',                                           width: '88px' },
] as unknown as ColumnDef<Record<string, unknown>>[])
const subs = ref<UserSubscription[]>([])
const groups = ref<Group[]>([])
const loading = ref(false)
const pagination = reactive({ total: 0, pages: 0 })
const density = ref<'comfortable' | 'compact'>('comfortable')
const selected = ref<UserSubscription[]>([])
const activeQuickView = ref('active')
const filterFields = computed<FilterFieldDef[]>(() => [
  { key: 'status',     label: t('admin.subscriptionsQuench.filterStatus'),    type: 'select', options: [
    { value: 'active',  label: t('admin.subscriptions.status.active') },
    { value: 'expired', label: t('admin.subscriptions.status.expired') },
    { value: 'revoked', label: t('admin.subscriptions.status.revoked') },
  ]},
  { key: 'platform',   label: t('admin.subscriptionsQuench.filterPlatform'),  type: 'select', options: [
    { value: 'anthropic',  label: 'Anthropic' },
    { value: 'openai',     label: 'OpenAI' },
    { value: 'gemini',     label: 'Gemini' },
    { value: 'antigravity',label: 'Antigravity' },
  ]},
  { key: 'group_id',   label: t('admin.subscriptionsQuench.filterGroup'),     type: 'select', options: groups.value.map(g => ({ value: String(g.id), label: g.name })) },
  { key: 'expires_at', label: t('admin.subscriptionsQuench.filterExpires'),   type: 'dateRange' },
  { key: 'q',          label: t('admin.subscriptionsQuench.filterSearch'),    type: 'text', placeholder: t('admin.subscriptionsQuench.searchPlaceholder') },
])

const advFilters = ref<AdvancedFilterValues>(deserializeFilters(state.filters as any, filterFields.value))
const showAssign = ref(false), showExtend = ref(false), showRevoke = ref(false), showResetQuota = ref(false)
const extendingSub = ref<UserSubscription | null>(null), revokingSub = ref<UserSubscription | null>(null), resettingSub = ref<UserSubscription | null>(null)
const savedViewState = computed(() => ({ page: state.page, pageSize: state.pageSize, sort: state.sort, order: state.order, q: state.q, filters: { ...state.filters } }))
const PALETTE = ['#B9C7E8','#E8B9C2','#9BC4E8','#A3E0C8','#D6DCE6','#E8D5B9','#C4B9E8','#B9E8D5']
function avatarColor(email: string) {
  let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xFFFFFFFF
  return PALETTE[Math.abs(h) % PALETTE.length]
}
function fmtDate(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function daysRemaining(expiresAt: string): number | null {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return null
  return Math.ceil(diff / 86400000)
}
function isExpiringSoon(expiresAt: string): boolean { const d = daysRemaining(expiresAt); return d !== null && d <= 7 }
let abortCtrl: AbortController | null = null
async function loadSubs() {
  abortCtrl?.abort(); abortCtrl = new AbortController()
  const { signal } = abortCtrl
  loading.value = true
  try {
    const af = advFilters.value
    const expiresRange = af.expires_at as { after?: string; before?: string } | undefined
    const res = await adminAPI.subscriptions.list(state.page, state.pageSize, {
      status: (af.status as any) || (state.filters.f_status as any) || undefined,
      group_id: af.group_id ? parseInt(af.group_id as string) : undefined,
      platform: (af.platform as string) || undefined,
      expires_after: expiresRange?.after || undefined,
      expires_before: expiresRange?.before || undefined,
      search: (af.q as string) || undefined,
      user_id: undefined,
      sort_by: state.sort || 'created_at',
      sort_order: (state.order as any) || 'desc',
    }, { signal })
    if (signal.aborted) return
    subs.value = res.items; pagination.total = res.total; pagination.pages = res.pages
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return
    appStore.showError(e?.response?.data?.detail || t('admin.subscriptionsQuench.loadFailed'))
  } finally {
    if (!abortCtrl?.signal.aborted) loading.value = false
  }
}

async function loadGroups() { try { groups.value = await adminAPI.groups.getAll() } catch { /* ignore */ } }
function onFilterApply(vals: AdvancedFilterValues) {
  advFilters.value = vals
  // 先清除旧的 af_ 前缀键（防止残留过期 filter），再写入新序列化值
  const current = state.filters as Record<string, string>
  Object.keys(current).forEach(k => { if (k.startsWith('af_')) delete current[k] })
  Object.assign(state.filters, serializeFilters(vals, filterFields.value))
  state.page = 1
}
function onFilterClear() {
  advFilters.value = {}
  state.filters = {}
  state.page = 1
  activeQuickView.value = 'all'
}
function applyQuickView(qv: typeof QUICK_VIEWS.value[0]) {
  activeQuickView.value = qv.id
  advFilters.value = {}; state.q = ''; state.page = 1
  state.filters = { ...qv.filters }
}
function onApplyView(view: SavedView | null) {
  if (!view) { reset(); advFilters.value = {}; activeQuickView.value = 'all'; return }
  if (view.state.sort)    state.sort = view.state.sort
  if (view.state.order)   state.order = view.state.order
  if (view.state.page)    state.page = view.state.page
  if (view.state.pageSize) state.pageSize = view.state.pageSize
  if (view.state.filters) { Object.assign(state.filters, view.state.filters) }
  advFilters.value = deserializeFilters(state.filters as any, filterFields.value)
  activeQuickView.value = ''
}
function onSelectionChange(rows: Record<string, unknown>[]) { selected.value = rows as unknown as UserSubscription[] }
function openExtend(sub: UserSubscription) { extendingSub.value = sub; showExtend.value = true }
function openRevoke(sub: UserSubscription) { revokingSub.value = sub; showRevoke.value = true }
function openResetQuota(sub: UserSubscription) { resettingSub.value = sub; showResetQuota.value = true }
async function bulkRevoke() {
  const targets = selected.value.filter(s => s.status === 'active')
  if (!targets.length) { appStore.showError(t('admin.subscriptionsQuench.noBulkRevokeTarget')); return }
  await Promise.allSettled(targets.map(s => adminAPI.subscriptions.revoke(s.id)))
  appStore.showSuccess(t('admin.subscriptionsQuench.bulkRevokedSuccess', { n: targets.length }))
  selected.value = []; loadSubs()
}
watch(() => [state.page, state.pageSize, state.sort, state.order, JSON.stringify(state.filters)], loadSubs, { flush: 'post' })
onMounted(() => { loadGroups(); loadSubs() })
onUnmounted(() => abortCtrl?.abort())
</script>

<style scoped>
:deep(.q-tr:hover) .sq-acts,
:deep(.q-tr:focus-visible) .sq-acts { opacity: 1; }
</style>
