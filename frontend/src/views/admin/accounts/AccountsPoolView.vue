<template>
  <AppLayout>
    <div class="apv-root">
      <!-- ── 工具栏 ── -->
      <div class="apv-toolbar">
        <input v-model="params.search" class="apv-search" :placeholder="t('admin.accountsQuench.searchPlaceholder')" @input="debouncedReload" />

        <button class="apv-icon-btn" :class="{ 'apv-spin': loading }" :title="t('admin.accountsQuench.refresh')" :aria-label="t('admin.accountsQuench.refresh')" @click="handleManualRefresh">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
        </button>

        <!-- 工具菜单 -->
        <div class="apv-menu-wrap" ref="toolsMenuRef">
          <button class="apv-icon-btn" :aria-label="t('admin.accountsQuench.moreTools')" :aria-expanded="showToolsMenu" aria-haspopup="menu" @click="showToolsMenu = !showToolsMenu">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>
          </button>
          <div v-if="showToolsMenu" class="apv-dropdown">
            <button class="apv-ditem" @click="showToolsMenu=false; showSync=true">{{ t('admin.accountsQuench.toolsSync') }}</button>
            <button class="apv-ditem" @click="showToolsMenu=false; showImportData=true">{{ t('admin.accountsQuench.toolsImport') }}</button>
            <button class="apv-ditem" @click="showToolsMenu=false; showExportDialog=true">{{ t('admin.accountsQuench.toolsExport') }}</button>
            <div class="apv-dsep"></div>
            <button class="apv-ditem" @click="showToolsMenu=false; showErrorPassthrough=true">{{ t('admin.accountsQuench.toolsErrorPassthrough') }}</button>
            <button class="apv-ditem" @click="showToolsMenu=false; showTLSProfiles=true">{{ t('admin.accountsQuench.toolsTLSProfiles') }}</button>
          </div>
        </div>

        <!-- 视图模式 -->
        <div class="apv-seg" role="group" :aria-label="t('admin.accountsQuench.viewModeLabel')">
          <button class="apv-seg-btn" :class="{ 'apv-seg-on': viewMode === 'matrix' }" :title="t('admin.accountsQuench.viewMatrix')" :aria-label="t('admin.accountsQuench.viewMatrix')" :aria-pressed="viewMode === 'matrix'" @click="viewMode = 'matrix'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button class="apv-seg-btn" :class="{ 'apv-seg-on': viewMode === 'table' }" :title="t('admin.accountsQuench.viewTable')" :aria-label="t('admin.accountsQuench.viewTable')" :aria-pressed="viewMode === 'table'" @click="viewMode = 'table'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25M3.375 4.5h17.25M6 12h12"/></svg>
          </button>
        </div>

        <button class="apv-btn-primary" @click="router.push('/admin/accounts/legacy')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          {{ t('admin.accountsQuench.addAccountBtn') }}
        </button>
      </div>

      <!-- ── 高级筛选栏 ── -->
      <div class="apv-filter-row">
        <AdvancedFilter
          :fields="filterFields"
          v-model="filterValues"
          @apply="onFilterApply"
          @clear="onFilterClear"
        />
      </div>

      <!-- ── 供给总览条（锻面卡）── -->
      <div class="apv-summary">
        <div class="apv-stat">
          <span class="apv-sdot apv-sdot-total"></span>
          <div class="apv-stat-inner">
            <span class="apv-num">{{ summary.total }}</span>
            <span class="apv-lbl">{{ t('admin.accountsQuench.summaryTotal') }}</span>
          </div>
        </div>
        <div class="apv-div"></div>
        <div class="apv-stat">
          <span class="apv-sdot apv-sdot-ok"></span>
          <div class="apv-stat-inner">
            <span class="apv-num apv-ok">{{ summary.active }}</span>
            <span class="apv-lbl">{{ t('admin.accountsQuench.summaryActive') }}</span>
          </div>
        </div>
        <div class="apv-stat">
          <span class="apv-sdot apv-sdot-off"></span>
          <div class="apv-stat-inner">
            <span class="apv-num apv-off">{{ summary.inactive }}</span>
            <span class="apv-lbl">{{ t('admin.accountsQuench.summaryInactive') }}</span>
          </div>
        </div>
        <div class="apv-stat" :class="{ 'apv-stat-alert': summary.error > 0 }">
          <span class="apv-sdot apv-sdot-bad" :class="{ 'apv-sdot-pulse': summary.error > 0 }"></span>
          <div class="apv-stat-inner">
            <span class="apv-num" :class="summary.error > 0 ? 'apv-bad' : 'apv-off'">{{ summary.error }}</span>
            <span class="apv-lbl">{{ t('admin.accountsQuench.summaryError') }}</span>
          </div>
        </div>
        <div class="apv-stat" :class="{ 'apv-stat-alert': summary.rate_limited > 0 }">
          <span class="apv-sdot apv-sdot-warn" :class="{ 'apv-sdot-pulse': summary.rate_limited > 0 }"></span>
          <div class="apv-stat-inner">
            <span class="apv-num" :class="summary.rate_limited > 0 ? 'apv-warn' : 'apv-off'">{{ summary.rate_limited }}</span>
            <span class="apv-lbl">{{ t('admin.accountsQuench.summaryRateLimited') }}</span>
          </div>
        </div>
      </div>

      <!-- ── 主体 ── -->
      <div class="apv-body">
        <AccountCardWall
          v-if="viewMode === 'matrix'"
          :accounts="accounts"
          :groups="groups"
          :loading="loading"
          :operating="operatingSet"
          @toggle-status="handleToggleStatus"
          @refresh="handleRefreshOne"
          @delete="openDeleteDialog"
          @add-account="router.push('/admin/accounts/legacy')"
        />
        <AccountPoolTablePanel
          v-else
          :accounts="accounts"
          :groups="groups"
          :total="pagination.total"
          :loading="loading"
          :page="pagination.page"
          :page-size="pagination.page_size"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          :selected-ids="selectedIds"
          :bulk-delete-progress="bulkDeleteProgress"
          :today-stats-by-account-id="todayStatsByAccountId"
          :today-stats-loading="todayStatsLoading"
          :manual-refresh-token="manualRefreshToken"
          :toggling-schedulable="togglingSchedulable"
          @edit="openEdit"
          @delete="openDeleteDialog"
          @more="openActionMenu"
          @show-temp-unsched="a => { tempUnschedAcc = a; showTempUnsched = true }"
          @toggle-schedulable="handleToggleSchedulable"
          @update:selected-ids="selectedIds = $event"
          @update:page="handlePageChange"
          @update:sort="sortBy = $event; load()"
          @update:order="sortOrder = $event; load()"
          @bulk-delete="handleBulkDelete(selectedIds, () => { selectedIds = [] }); reload()"
          @bulk-reset-status="handleBulkResetStatus(selectedIds, () => { selectedIds = [] }); reload()"
          @bulk-refresh-token="handleBulkRefreshToken(selectedIds, () => { selectedIds = [] }); reload()"
          @bulk-toggle-schedulable="(v: boolean) => { handleBulkToggleSchedulable(selectedIds, v, () => { selectedIds = [] }); reload() }"
          @bulk-edit-selected="handleBulkEditSelected(selectedIds)"
          @select-page="selectedIds = accounts.map(a => a.id)"
          @clear-selection="selectedIds = []"
        />
      </div>

      <!-- 分页（表格模式） -->
      <div v-if="viewMode === 'table' && pagination.total > pagination.page_size" class="apv-pg-row">
        <button class="apv-pg" :disabled="pagination.page <= 1" @click="handlePageChange(pagination.page - 1)">‹</button>
        <span class="apv-pg-info">{{ pagination.page }} / {{ Math.max(1, Math.ceil(pagination.total / pagination.page_size)) }}</span>
        <button class="apv-pg" :disabled="pagination.page >= Math.ceil(pagination.total / pagination.page_size)" @click="handlePageChange(pagination.page + 1)">›</button>
      </div>
    </div>

    <!-- ── 模态框 ── -->
    <EditAccountModal    v-if="showEdit"     :show="showEdit"     :account="editingAcc"    :proxies="proxies" :groups="groups" @close="showEdit=false"     @updated="handleAccountUpdated" />
    <ReAuthAccountModal  v-if="showReAuth"   :show="showReAuth"   :account="reAuthAcc"     @close="showReAuth=false; reAuthAcc=null" @reauthorized="handleAccountUpdated" />
    <AccountTestModal    v-if="showTest"     :show="showTest"     :account="testingAcc"    @close="showTest=false; testingAcc=null" />
    <AccountStatsModal   v-if="showStats"    :show="showStats"    :account="statsAcc"      @close="showStats=false; statsAcc=null" />
    <TempUnschedModal    v-if="showTempUnsched" :show="showTempUnsched" :account="tempUnschedAcc" @close="showTempUnsched=false" @reset="a => { showTempUnsched=false; patchInList(a) }" />
    <AccountActionMenu   :show="actionMenu.show" :account="actionMenu.acc" :position="actionMenu.pos" @close="actionMenu.show=false" @test="a=>{testingAcc=a;showTest=true}" @stats="a=>{statsAcc=a;showStats=true}" @reauth="a=>{reAuthAcc=a;showReAuth=true}" @refresh-token="handleRefreshOne" @recover-state="handleRecoverState" @reset-quota="handleResetQuota" @set-privacy="handleSetPrivacy" @schedule="a=>router.push({ path:'/admin/accounts/legacy', query:{ schedule_id: a.id } })" />
    <SyncFromCrsModal    v-if="showSync"     :show="showSync"     @close="showSync=false"  @synced="reload" />
    <ImportDataModal     v-if="showImportData" :show="showImportData" @close="showImportData=false" @imported="() => { showImportData=false; reload() }" />
    <ConfirmDialog :show="showDeleteDialog" :title="t('admin.accountsQuench.deleteTitle')" :message="t('admin.accountsQuench.deleteConfirmFmt', { name: deletingAcc?.name })" :confirm-text="t('common.delete')" :cancel-text="t('admin.accountsQuench.cancelBtn')" :danger="true" @confirm="confirmDelete" @cancel="showDeleteDialog=false" />
    <ConfirmDialog :show="showExportDialog" :title="t('admin.accountsQuench.exportTitle')" :message="t('admin.accountsQuench.exportMsg')" :confirm-text="t('admin.accountsQuench.exportConfirmBtn')" :cancel-text="t('admin.accountsQuench.cancelBtn')" @confirm="doExport" @cancel="showExportDialog=false" />
    <ErrorPassthroughRulesModal v-if="showErrorPassthrough" :show="showErrorPassthrough" @close="showErrorPassthrough=false" />
    <TLSFingerprintProfilesModal v-if="showTLSProfiles" :show="showTLSProfiles" @close="showTLSProfiles=false" />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { adminAPI } from '@/api/admin'
import { useTableLoader } from '@/composables/useTableLoader'
import AppLayout from '@/components/layout/AppLayout.vue'
import AccountCardWall from './AccountCardWall.vue'
import AccountPoolTablePanel from './AccountPoolTablePanel.vue'
import AccountActionMenu from '@/components/admin/account/AccountActionMenu.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { AdvancedFilter } from '@/components/datatable'
import type { FilterFieldDef, AdvancedFilterValues } from '@/components/datatable'
import { useAccountPoolActions } from './useAccountPoolActions'
import type { Account, Proxy as AccountProxy, AdminGroup } from '@/types'

const EditAccountModal            = defineAsyncComponent(() => import('@/components/account/EditAccountModal.vue'))
const ReAuthAccountModal          = defineAsyncComponent(() => import('@/components/admin/account/ReAuthAccountModal.vue'))
const AccountTestModal            = defineAsyncComponent(() => import('@/components/admin/account/AccountTestModal.vue'))
const AccountStatsModal           = defineAsyncComponent(() => import('@/components/admin/account/AccountStatsModal.vue'))
const TempUnschedModal            = defineAsyncComponent(() => import('@/components/account/TempUnschedStatusModal.vue'))
const SyncFromCrsModal            = defineAsyncComponent(() => import('@/components/account/SyncFromCrsModal.vue'))
const ImportDataModal             = defineAsyncComponent(() => import('@/components/admin/account/ImportDataModal.vue'))
const ErrorPassthroughRulesModal  = defineAsyncComponent(() => import('@/components/admin/ErrorPassthroughRulesModal.vue'))
const TLSFingerprintProfilesModal = defineAsyncComponent(() => import('@/components/admin/TLSFingerprintProfilesModal.vue'))

const { t } = useI18n()
const router = useRouter()
const viewMode = ref<'matrix' | 'table'>('matrix')
const proxies = ref<AccountProxy[]>([]), groups = ref<AdminGroup[]>([])
const selectedIds = ref<number[]>([]), sortBy = ref('name'), sortOrder = ref<'asc' | 'desc'>('asc')

// 模态框开关
const showEdit = ref(false), showReAuth = ref(false), showTest = ref(false)
const showStats = ref(false), showTempUnsched = ref(false), showDeleteDialog = ref(false)
const showExportDialog = ref(false), showSync = ref(false), showImportData = ref(false)
const showErrorPassthrough = ref(false), showTLSProfiles = ref(false), showToolsMenu = ref(false)
const toolsMenuRef = ref<HTMLElement | null>(null)

// 当前操作指针
const editingAcc = ref<Account | null>(null), reAuthAcc = ref<Account | null>(null)
const testingAcc = ref<Account | null>(null), statsAcc = ref<Account | null>(null)
const tempUnschedAcc = ref<Account | null>(null), deletingAcc = ref<Account | null>(null)

const actionMenu = reactive<{ show: boolean; acc: Account | null; pos: any }>({ show: false, acc: null, pos: null })

// ── 高级筛选状态 ──────────────────────────────────────────────────
const filterValues = ref<AdvancedFilterValues>({})

// ── 高级筛选字段定义（由 computed 驱动，groups 异步加载后自动更新 group 选项）──
const filterFields = computed<FilterFieldDef[]>(() => [
  {
    key: 'platform',
    label: t('admin.accountsQuench.filterPlatform'),
    type: 'select',
    options: [
      { value: 'anthropic',   label: 'Anthropic' },
      { value: 'openai',      label: 'OpenAI' },
      { value: 'gemini',      label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
  },
  {
    key: 'type',
    label: t('admin.accountsQuench.filterType'),
    type: 'select',
    options: [
      { value: 'api_key',     label: t('admin.accountsQuench.typeApiKey') },
      { value: 'oauth',       label: t('admin.accountsQuench.typeOAuth') },
      { value: 'setup_token', label: t('admin.accountsQuench.typeSetupToken') },
    ],
  },
  {
    key: 'status',
    label: t('admin.accountsQuench.filterStatus'),
    type: 'select',
    options: [
      { value: 'active',       label: t('admin.accountsQuench.statusActive') },
      { value: 'inactive',     label: t('admin.accountsQuench.statusInactive') },
      { value: 'error',        label: t('admin.accountsQuench.statusError') },
      { value: 'rate_limited', label: t('admin.accountsQuench.statusRateLimited') },
    ],
  },
  {
    key: 'group',
    label: t('admin.accountsQuench.filterGroup'),
    type: 'select',
    options: [
      { value: 'ungrouped', label: t('admin.accountsQuench.ungrouped') },
      ...groups.value.map(g => ({ value: String(g.id), label: g.name })),
    ],
  },
  {
    key: 'privacy_mode',
    label: t('admin.accountsQuench.filterPrivacyMode'),
    type: 'boolean',
  },
])

// ── 把 filterValues → params（提前映射，不丢字段）──────────────────
function applyFiltersToParams(vals: AdvancedFilterValues) {
  const p = params as any
  p.platform     = typeof vals.platform     === 'string' ? vals.platform     : ''
  p.type         = typeof vals.type         === 'string' ? vals.type         : ''
  p.status       = typeof vals.status       === 'string' ? vals.status       : ''
  p.group        = typeof vals.group        === 'string' ? vals.group        : ''
  p.privacy_mode = typeof vals.privacy_mode === 'boolean'
    ? (vals.privacy_mode ? '1' : '0')
    : ''
}

function onFilterApply(vals: AdvancedFilterValues) {
  filterValues.value = vals
  applyFiltersToParams(vals)
  reload()
}

function onFilterClear() {
  filterValues.value = {}
  applyFiltersToParams({})
  reload()
}

// 表格加载器
const { items: accounts, loading, params, pagination, load: baseLoad, reload: baseReload, debouncedReload, handlePageChange: basePageChange } = useTableLoader<Account, any>({
  fetchFn: adminAPI.accounts.list,
  initialParams: { platform: '', type: '', status: '', group: '', privacy_mode: '', search: '', sort_by: 'name', sort_order: 'asc' }
})

const {
  operatingSet, togglingSchedulable, todayStatsByAccountId, todayStatsLoading, manualRefreshToken,
  bulkDeleteProgress, refreshTodayStats, patchInList,
  handleToggleStatus, handleRefreshOne, handleRecoverState, handleResetQuota, handleSetPrivacy,
  handleToggleSchedulable, handleBulkDelete, handleBulkResetStatus, handleBulkRefreshToken,
  handleBulkToggleSchedulable, handleBulkEditSelected, handleExportData
} = useAccountPoolActions(accounts)

const load = async () => { await baseLoad(); await refreshTodayStats() }
const reload = async () => { await baseReload(); await refreshTodayStats() }
const handleManualRefresh = async () => { await reload(); manualRefreshToken.value++ }
const handlePageChange = (page: number) => { basePageChange(page) }

const summary = computed(() => {
  const now = Date.now()
  let active = 0, inactive = 0, error = 0, rate_limited = 0
  for (const a of accounts.value) {
    const rl = a.rate_limit_reset_at ? new Date(a.rate_limit_reset_at).getTime() > now : false
    if (rl) { rate_limited++; continue }
    if (a.status === 'error') { error++; continue }
    if (a.status === 'active' && a.schedulable) active++
    else inactive++
  }
  return { total: accounts.value.length, active, inactive, error, rate_limited }
})

const openEdit = (a: Account) => { editingAcc.value = a; showEdit.value = true }
const handleAccountUpdated = (updated?: Account) => {
  showEdit.value = false; showReAuth.value = false; reAuthAcc.value = null
  if (updated) patchInList(updated); else reload()
}
const openDeleteDialog = (a: Account) => { deletingAcc.value = a; showDeleteDialog.value = true }
const confirmDelete = async () => {
  if (!deletingAcc.value) return
  try {
    await adminAPI.accounts.delete(deletingAcc.value.id)
    showDeleteDialog.value = false; deletingAcc.value = null; reload()
  } catch { /* 静默 */ }
}
const openActionMenu = (a: Account, e: MouseEvent) => {
  actionMenu.acc = a
  const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect()
  actionMenu.pos = rect ? { top: rect.bottom + 4, left: Math.max(8, rect.right - 200) } : { top: e.clientY, left: e.clientX - 200 }
  actionMenu.show = true
}
const doExport = () => {
  const p = params as any
  handleExportData(
    { platform: p.platform || undefined, type: p.type || undefined, status: p.status || undefined, group: p.group || undefined, privacy_mode: p.privacy_mode || undefined, search: p.search || undefined },
    sortBy.value, sortOrder.value
  )
  showExportDialog.value = false
}

const onClickOutside = (e: MouseEvent) => {
  const t = e.target as HTMLElement
  if (toolsMenuRef.value && !toolsMenuRef.value.contains(t)) showToolsMenu.value = false
  if (!t.closest('.apm-wrap')) actionMenu.show = false
}

onMounted(async () => {
  load()
  try {
    const [p, g] = await Promise.all([adminAPI.proxies.getAll(), adminAPI.groups.getAll()])
    proxies.value = p; groups.value = g
  } catch { /* 静默 */ }
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<style scoped>
.apv-root  { display:flex; flex-direction:column; gap:12px; height:100%; padding:16px; }
.apv-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.apv-filter-row { display:flex; align-items:flex-start; }
.apv-search { flex:1; min-width:160px; max-width:240px; height:32px; padding:0 10px; font-size:13px; border-radius:8px; border:1px solid var(--line-0); background:var(--bg-1); color:var(--ink-0); outline:none; }
.apv-search:focus { border-color:var(--azure); box-shadow:var(--glow-focus); }
.apv-search:focus-visible { border-color:var(--azure); box-shadow:var(--glow-focus); }
.apv-icon-btn { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; border:1px solid var(--line-0); background:var(--bg-1); color:var(--ink-1); cursor:pointer; }
.apv-icon-btn:hover { background:var(--bg-2); color:var(--ink-0); }
.apv-icon-btn:focus-visible { outline:none; box-shadow:var(--glow-focus); }
.apv-spin svg { animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.apv-menu-wrap { position:relative; }
.apv-dropdown { position:absolute; right:0; top:calc(100% + 4px); z-index:60; min-width:150px; background:var(--bg-1); border:1px solid var(--line-1); border-radius:10px; padding:4px; box-shadow:0 8px 24px rgba(0,0,0,.28); }
.apv-ditem { display:flex; align-items:center; gap:8px; width:100%; padding:7px 10px; font-size:13px; color:var(--ink-1); background:none; border:none; border-radius:6px; cursor:pointer; text-align:left; }
.apv-ditem:hover { background:var(--bg-2); color:var(--ink-0); }
.apv-ditem:focus-visible { outline:none; background:var(--bg-2); color:var(--ink-0); box-shadow:var(--glow-focus); }
.apv-dsep { height:1px; background:var(--line-0); margin:4px 0; }
.apv-seg { display:flex; border:1px solid var(--line-0); border-radius:8px; overflow:hidden; }
.apv-seg-btn { display:flex; align-items:center; justify-content:center; width:32px; height:32px; background:var(--bg-1); border:none; color:var(--ink-2); cursor:pointer; }
.apv-seg-btn:first-child { border-right:1px solid var(--line-0); }
.apv-seg-btn:hover { background:var(--bg-2); color:var(--ink-0); }
.apv-seg-btn:focus-visible { outline:none; box-shadow:var(--glow-focus); }
.apv-seg-on { background:var(--azure-dim) !important; color:var(--azure) !important; }
.apv-btn-primary { display:flex; align-items:center; gap:5px; height:32px; padding:0 14px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #3A4250; background:var(--metal-raised); color:var(--ink-0); cursor:pointer; margin-left:auto; box-shadow:var(--edge-hi), 0 2px 10px rgba(0,0,0,.4); }
.apv-btn-primary:hover { border-color:rgba(92,168,255,.55); box-shadow:var(--edge-hi), 0 0 16px rgba(92,168,255,.22), 0 2px 10px rgba(0,0,0,.4); }
.apv-btn-primary:focus-visible { outline:none; box-shadow:var(--glow-focus), 0 2px 10px rgba(0,0,0,.4); }
/* 总览条（锻面卡）*/
.apv-summary { display:flex; align-items:center; gap:2px; padding:10px 16px; background:var(--metal); border:1px solid var(--line-0); border-radius:10px; box-shadow:var(--edge-hi), 0 6px 18px rgba(0,0,0,.22); }
.apv-stat { display:flex; flex-direction:row; align-items:center; gap:6px; padding:4px 14px; position:relative; }
/* 告警态：background tint */
.apv-stat-alert { background:rgba(242,92,105,.05); border-radius:8px; }
.apv-stat-alert .apv-lbl { color:var(--ink-1); }
.apv-div  { width:1px; height:28px; background:var(--line-0); margin:0 4px; align-self:center; }
/* 语义色点 */
.apv-sdot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.apv-sdot-total { background:var(--ink-2); }
.apv-sdot-ok    { background:var(--ok); }
.apv-sdot-off   { background:var(--ink-2); }
.apv-sdot-bad   { background:var(--bad); }
.apv-sdot-warn  { background:var(--warn); }
/* 告警脉冲（error/rate_limited > 0 时激活）*/
.apv-sdot-pulse { animation:sdot-pulse 1.8s ease-in-out infinite; }
@keyframes sdot-pulse { 0%,100%{ box-shadow:0 0 0 0 rgba(242,92,105,.55);} 50%{ box-shadow:0 0 0 4px rgba(242,92,105,0);} }
.apv-sdot-warn.apv-sdot-pulse { animation:sdot-pulse-w 1.8s ease-in-out infinite; }
@keyframes sdot-pulse-w { 0%,100%{ box-shadow:0 0 0 0 rgba(224,179,78,.55);} 50%{ box-shadow:0 0 0 4px rgba(224,179,78,0);} }
/* 数字与标签纵向叠 */
.apv-stat-inner { display:flex; flex-direction:column; }
.apv-num  { font-size:20px; font-weight:700; font-family:monospace; font-variant-numeric:tabular-nums; color:var(--ink-0); line-height:1.2; }
.apv-lbl  { font-size:10px; color:var(--ink-2); letter-spacing:.04em; white-space:nowrap; }
.apv-ok { color:var(--ok); } .apv-off { color:var(--ink-2); } .apv-bad { color:var(--bad); } .apv-warn { color:var(--warn); }
.apv-body { flex:1; overflow-y:auto; min-height:0; }
.apv-pg-row { display:flex; align-items:center; justify-content:center; gap:12px; padding:8px 0; }
.apv-pg { width:28px; height:28px; border-radius:6px; border:1px solid var(--line-0); background:var(--bg-1); color:var(--ink-1); cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
.apv-pg:hover:not(:disabled) { background:var(--bg-2); } .apv-pg:disabled { opacity:.35; cursor:not-allowed; }
.apv-pg:focus-visible { outline:none; box-shadow:var(--glow-focus); }
.apv-pg-info { font-size:12px; color:var(--ink-2); font-family:monospace; }
@media (prefers-reduced-motion: reduce) { .apv-spin svg { animation:none; } .apv-sdot-pulse, .apv-sdot-warn.apv-sdot-pulse { animation:none; } }
</style>
