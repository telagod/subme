<template>
  <AppLayout>
    <div class="flex flex-col gap-3 h-full p-4">
      <!-- ── 工具栏 ── -->
      <div class="flex items-center gap-2 flex-wrap">
        <Input
          v-model="params.search"
          class="flex-1 min-w-[160px] max-w-[240px] h-8 text-[13px]"
          :placeholder="t('admin.accountsQuench.searchPlaceholder')"
          @input="debouncedReload"
        />

        <!-- 刷新分裂按钮: 点击=手动刷新, 旁边小箭头=自动刷新设置 -->
        <div class="flex items-stretch">
          <Button
            variant="outline"
            size="icon"
            class="w-8 h-8 rounded-r-none border-r-0"
            :class="[
              { 'apv-spin': loading || autoRefresh.fetching.value },
              autoRefresh.enabled.value && 'border-primary/50',
            ]"
            :title="t('admin.accountsQuench.refresh')"
            :aria-label="t('admin.accountsQuench.refresh')"
            @click="handleManualRefresh"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          </Button>
          <DropdownMenu v-model:open="showAutoRefreshDropdown">
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-6 rounded-l-none px-0.5"
                :class="autoRefresh.enabled.value && 'border-primary/50 text-primary'"
                :aria-label="t('admin.accountsQuench.autoRefreshTitle')"
              >
                <span v-if="autoRefresh.enabled.value && autoRefresh.countdown.value > 0" class="font-mono text-[10px] tabular-nums">{{ autoRefresh.countdown.value }}</span>
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel class="text-[11px] text-muted-foreground">{{ t('admin.accountsQuench.autoRefreshTitle') }}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                :model-value="autoRefresh.enabled.value"
                @select="(e) => { e.preventDefault(); autoRefresh.setEnabled(!autoRefresh.enabled.value) }"
                class="text-[12px]"
              >
                {{ t('admin.accountsQuench.enableAutoRefresh') }}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                v-for="sec in autoRefresh.intervals"
                :key="sec"
                :model-value="autoRefresh.intervalSeconds.value === sec"
                @select="(e) => { e.preventDefault(); autoRefresh.setIntervalSeconds(sec) }"
                class="text-[12px]"
              >
                {{ autoRefreshIntervalLabel(sec) }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <!-- 工具菜单 -->
        <div class="relative" ref="toolsMenuRef">
          <Button
            variant="outline"
            size="icon"
            class="w-8 h-8 rounded-lg"
            :aria-label="t('admin.accountsQuench.moreTools')"
            :aria-expanded="showToolsMenu"
            aria-haspopup="menu"
            @click="showToolsMenu = !showToolsMenu"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>
          </Button>
          <div v-if="showToolsMenu" class="absolute right-0 top-[calc(100%+4px)] z-60 min-w-[150px] bg-popover border border-border rounded-[10px] p-1 shadow-[0_8px_24px_rgba(0,0,0,.28)]">
            <Button variant="ghost" class="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] justify-start h-auto font-normal" @click="showToolsMenu=false; showSync=true">{{ t('admin.accountsQuench.toolsSync') }}</Button>
            <Button variant="ghost" class="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] justify-start h-auto font-normal" @click="showToolsMenu=false; showImportData=true">{{ t('admin.accountsQuench.toolsImport') }}</Button>
            <Button variant="ghost" class="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] justify-start h-auto font-normal" @click="showToolsMenu=false; showExportDialog=true">{{ t('admin.accountsQuench.toolsExport') }}</Button>
            <Separator class="my-1" />
            <Button variant="ghost" class="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] justify-start h-auto font-normal" @click="showToolsMenu=false; showErrorPassthrough=true">{{ t('admin.accountsQuench.toolsErrorPassthrough') }}</Button>
            <Button variant="ghost" class="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] justify-start h-auto font-normal" @click="showToolsMenu=false; showTLSProfiles=true">{{ t('admin.accountsQuench.toolsTLSProfiles') }}</Button>
          </div>
        </div>

        <!-- 视图模式 -->
        <div class="flex border border-border rounded-lg overflow-hidden" role="group" :aria-label="t('admin.accountsQuench.viewModeLabel')">
          <Button
            variant="ghost"
            size="icon"
            class="w-8 h-8 rounded-none border-r border-border"
            :class="viewMode === 'matrix' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
            :title="t('admin.accountsQuench.viewMatrix')"
            :aria-label="t('admin.accountsQuench.viewMatrix')"
            :aria-pressed="viewMode === 'matrix'"
            @click="viewMode = 'matrix'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="w-8 h-8 rounded-none"
            :class="viewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
            :title="t('admin.accountsQuench.viewTable')"
            :aria-label="t('admin.accountsQuench.viewTable')"
            :aria-pressed="viewMode === 'table'"
            @click="viewMode = 'table'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25M3.375 4.5h17.25M6 12h12"/></svg>
          </Button>
        </div>

        <Separator orientation="vertical" class="h-6" />

        <!-- 高级筛选（带折叠记忆 + activeCount badge） -->
        <div class="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-[12px]"
            :class="filtersCollapsed ? 'text-muted-foreground' : 'border-primary/40 text-primary bg-primary/5'"
            :aria-expanded="!filtersCollapsed"
            @click="toggleFiltersCollapsed"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18M6 12h12m-9 7.5h6"/>
            </svg>
            {{ filtersCollapsed ? t('admin.accountsQuench.filtersToggleShow') : t('admin.accountsQuench.filtersToggleHide') }}
            <span
              v-if="accountActiveFilterCount > 0"
              class="ml-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-1 font-mono text-[10px] text-primary"
            >{{ accountActiveFilterCount }}</span>
          </Button>
          <Button
            v-if="accountActiveFilterCount > 0"
            variant="ghost"
            size="sm"
            class="h-8 px-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            @click="clearAccountFilters"
          >{{ t('admin.accountsQuench.filtersClearAll') }}</Button>
          <AdvancedFilter
            v-if="!filtersCollapsed"
            :fields="filterFields"
            v-model="filterValues"
            @apply="onFilterApply"
            @clear="onFilterClear"
          />
        </div>

        <Separator orientation="vertical" class="h-6" />

        <!-- 供给总览条（inline strip,移入 toolbar） -->
        <div class="inline-flex items-center gap-2.5 px-3 h-8 bg-card border border-border rounded-md shadow-sm text-xs">
          <span class="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span class="text-muted-foreground">{{ t('admin.accountsQuench.summaryTotal') }}</span>
            <span class="text-sm font-semibold font-mono tabular-nums text-foreground">{{ summary.total }}</span>
          </span>
          <span class="text-border select-none" aria-hidden="true">·</span>
          <span class="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span class="text-muted-foreground">{{ t('admin.accountsQuench.summaryActive') }}</span>
            <span
              class="text-sm font-semibold font-mono tabular-nums"
              :class="summary.active > 0 ? 'text-emerald-500' : 'text-muted-foreground'"
            >{{ summary.active }}</span>
          </span>
          <span class="text-border select-none" aria-hidden="true">·</span>
          <span class="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span class="text-muted-foreground">{{ t('admin.accountsQuench.summaryInactive') }}</span>
            <span class="text-sm font-semibold font-mono tabular-nums text-foreground">{{ summary.inactive }}</span>
          </span>
          <span class="text-border select-none" aria-hidden="true">·</span>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span class="text-muted-foreground">{{ t('admin.accountsQuench.summaryError') }}</span>
            <span
              class="text-sm font-semibold font-mono tabular-nums"
              :class="summary.error > 0 ? 'text-destructive' : 'text-muted-foreground'"
            >{{ summary.error }}</span>
            <span
              v-if="summary.error > 0"
              class="apv-sdot-pulse w-[6px] h-[6px] rounded-full flex-shrink-0 bg-destructive"
              aria-hidden="true"
            ></span>
          </span>
          <span class="text-border select-none" aria-hidden="true">·</span>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span class="text-muted-foreground">{{ t('admin.accountsQuench.summaryRateLimited') }}</span>
            <span
              class="text-sm font-semibold font-mono tabular-nums"
              :class="summary.rate_limited > 0 ? 'text-amber-500' : 'text-muted-foreground'"
            >{{ summary.rate_limited }}</span>
            <span
              v-if="summary.rate_limited > 0"
              class="apv-sdot-pulse-warn w-[6px] h-[6px] rounded-full flex-shrink-0 bg-amber-500"
              aria-hidden="true"
            ></span>
          </span>
        </div>

        <Button variant="outline" size="sm" class="ml-auto gap-1.5 font-semibold" @click="showCreate = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          {{ t('admin.accountsQuench.addAccountBtn') }}
        </Button>
      </div>

      <!-- ── 列表待同步提示条 ── -->
      <div
        v-if="autoRefresh.hasPendingListSync.value"
        class="flex w-fit items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
        <span>{{ t('admin.accountsQuench.listPendingSyncHint') }}</span>
        <Button
          variant="ghost"
          size="sm"
          class="h-auto px-1.5 py-0.5 text-xs text-amber-500 hover:bg-amber-500/15 hover:text-amber-500"
          @click="syncPendingListChanges"
        >{{ t('admin.accountsQuench.listPendingSyncAction') }}</Button>
      </div>

      <!-- ── 主体 ── -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <AccountCardWall
          v-if="viewMode === 'matrix'"
          :accounts="accounts"
          :groups="groups"
          :loading="loading"
          :operating="operatingSet"
          @toggle-status="handleToggleStatus"
          @refresh="handleRefreshOne"
          @delete="openDeleteDialog"
          @add-account="showCreate = true"
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
          :hidden-columns="hiddenColumns"
          :toggle-column="toggleColumn"
          :reset-columns="resetColumns"
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
          @bulk-toggle-schedulable="(v: boolean) => onBulkToggleSchedulable(v)"
          @bulk-edit-selected="handleBulkEditSelected(selectedIds)"
          @bulk-delete-filtered="openBulkDeleteFilteredConfirm"
          @bulk-edit-filtered="onBulkEditFiltered"
          @bulk-retry-failed="onBulkRetryFailed"
          @revert-proxy-fallback="onRevertProxyFallback"
          :active-filter-count="accountActiveFilterCount"
          :last-failed-delete-ids="lastFailedDeleteIds"
          @select-page="selectedIds = accounts.map(a => a.id)"
          @clear-selection="selectedIds = []"
        />
      </div>

      <!-- 分页（表格模式） -->
      <div v-if="viewMode === 'table' && pagination.total > pagination.page_size" class="flex items-center justify-center gap-3 py-2">
        <Button
          variant="outline"
          size="icon"
          class="w-7 h-7 text-base"
          :disabled="pagination.page <= 1"
          @click="handlePageChange(pagination.page - 1)"
        >‹</Button>
        <span class="text-xs text-muted-foreground font-mono">{{ pagination.page }} / {{ Math.max(1, Math.ceil(pagination.total / pagination.page_size)) }}</span>
        <Button
          variant="outline"
          size="icon"
          class="w-7 h-7 text-base"
          :disabled="pagination.page >= Math.ceil(pagination.total / pagination.page_size)"
          @click="handlePageChange(pagination.page + 1)"
        >›</Button>
      </div>
    </div>

    <!-- ── 模态框 ── -->
    <CreateAccountModal  v-if="showCreate"   :show="showCreate"   :proxies="proxies" :groups="groups" @close="showCreate=false" @created="onAccountCreated" />
    <EditAccountModal    v-if="showEdit"     :show="showEdit"     :account="editingAcc"    :proxies="proxies" :groups="groups" @close="showEdit=false"     @updated="handleAccountUpdated" />
    <ReAuthAccountModal  v-if="showReAuth"   :show="showReAuth"   :account="reAuthAcc"     @close="showReAuth=false; reAuthAcc=null" @reauthorized="handleAccountUpdated" />
    <AccountTestModal    v-if="showTest"     :show="showTest"     :account="testingAcc"    @close="showTest=false; testingAcc=null" />
    <AccountStatsModal   v-if="showStats"    :show="showStats"    :account="statsAcc"      @close="showStats=false; statsAcc=null" />
    <TempUnschedModal    v-if="showTempUnsched" :show="showTempUnsched" :account="tempUnschedAcc" @close="showTempUnsched=false" @reset="a => { showTempUnsched=false; patchInList(a) }" />
    <AccountActionMenu   :show="actionMenu.show" :account="actionMenu.acc" :position="actionMenu.pos" @close="actionMenu.show=false" @test="a=>{testingAcc=a;showTest=true}" @stats="a=>{statsAcc=a;showStats=true}" @reauth="a=>{reAuthAcc=a;showReAuth=true}" @refresh-token="handleRefreshOne" @recover-state="handleRecoverState" @reset-quota="handleResetQuota" @set-privacy="handleSetPrivacy" @schedule="openSchedule" />
    <BulkEditAccountModal
      v-if="showBulkEdit"
      :show="showBulkEdit"
      :account-ids="bulkEditTarget && bulkEditTarget.mode === 'selected' ? bulkEditTarget.accountIds : []"
      :selected-platforms="bulkEditTarget?.selectedPlatforms ?? []"
      :selected-types="bulkEditTarget?.selectedTypes ?? []"
      :target="bulkEditTarget ?? undefined"
      :proxies="proxies"
      :groups="groups"
      @close="closeBulkEdit"
      @updated="onBulkEditSaved"
    />
    <ScheduledTestsPanel
      v-if="showSchedule"
      :show="showSchedule"
      :account-id="scheduleAccount?.id ?? null"
      :model-options="scheduleModelOptions"
      @close="closeSchedule"
    />
    <SyncFromCrsModal    v-if="showSync"     :show="showSync"     @close="showSync=false"  @synced="reload" />
    <ImportDataModal     v-if="showImportData" :show="showImportData" @close="showImportData=false" @imported="() => { showImportData=false; reload() }" />
    <ConfirmDialog :show="showDeleteDialog" :title="t('admin.accountsQuench.deleteTitle')" :message="t('admin.accountsQuench.deleteConfirmFmt', { name: deletingAcc?.name })" :confirm-text="t('common.delete')" :cancel-text="t('admin.accountsQuench.cancelBtn')" :danger="true" @confirm="confirmDelete" @cancel="showDeleteDialog=false" />
    <ConfirmDialog
      :show="showBulkDeleteFilteredDialog"
      :title="t('admin.accountsQuench.bulkDeleteFilteredTitle')"
      :message="t('admin.accountsQuench.bulkDeleteFilteredMsg', { count: bulkDeleteFilteredPreviewCount })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('admin.accountsQuench.cancelBtn')"
      :danger="true"
      @confirm="confirmBulkDeleteFiltered"
      @cancel="showBulkDeleteFilteredDialog=false"
    />
    <ConfirmDialog :show="showExportDialog" :title="t('admin.accountsQuench.exportTitle')" :message="t('admin.accountsQuench.exportMsg')" :confirm-text="t('admin.accountsQuench.exportConfirmBtn')" :cancel-text="t('admin.accountsQuench.cancelBtn')" @confirm="doExport" @cancel="showExportDialog=false">
      <label class="flex cursor-pointer items-center gap-2 text-xs text-foreground">
        <Checkbox v-model:checked="includeProxyOnExport" />
        <span>{{ t('admin.accountsQuench.exportIncludeProxies') }}</span>
      </label>
    </ConfirmDialog>
    <ErrorPassthroughRulesModal v-if="showErrorPassthrough" :show="showErrorPassthrough" @close="showErrorPassthrough=false" />
    <TLSFingerprintProfilesModal v-if="showTLSProfiles" :show="showTLSProfiles" @close="showTLSProfiles=false" />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
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
import { useAccountAutoRefresh } from './useAccountAutoRefresh'
import { useColumnVisibility } from '@/composables/useColumnVisibility'
import type { Account, ClaudeModel, Proxy as AccountProxy, AdminGroup } from '@/types'
import type { SelectOption } from '@/components/common/Select.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

const CreateAccountModal          = defineAsyncComponent(() => import('@/components/account/CreateAccountModal.vue'))
const EditAccountModal            = defineAsyncComponent(() => import('@/components/account/EditAccountModal.vue'))
const ReAuthAccountModal          = defineAsyncComponent(() => import('@/components/admin/account/ReAuthAccountModal.vue'))
const AccountTestModal            = defineAsyncComponent(() => import('@/components/admin/account/AccountTestModal.vue'))
const AccountStatsModal           = defineAsyncComponent(() => import('@/components/admin/account/AccountStatsModal.vue'))
const TempUnschedModal            = defineAsyncComponent(() => import('@/components/account/TempUnschedStatusModal.vue'))
const SyncFromCrsModal            = defineAsyncComponent(() => import('@/components/account/SyncFromCrsModal.vue'))
const ImportDataModal             = defineAsyncComponent(() => import('@/components/admin/account/ImportDataModal.vue'))
const ErrorPassthroughRulesModal  = defineAsyncComponent(() => import('@/components/admin/ErrorPassthroughRulesModal.vue'))
const TLSFingerprintProfilesModal = defineAsyncComponent(() => import('@/components/admin/TLSFingerprintProfilesModal.vue'))
const BulkEditAccountModal        = defineAsyncComponent(() => import('@/components/account/BulkEditAccountModal.vue'))
const ScheduledTestsPanel         = defineAsyncComponent(() => import('@/components/admin/account/ScheduledTestsPanel.vue'))

const { t } = useI18n()
const appStore = useAppStore()
const viewMode = ref<'matrix' | 'table'>('matrix')
const proxies = ref<AccountProxy[]>([]), groups = ref<AdminGroup[]>([])
const selectedIds = ref<number[]>([]), sortBy = ref('name'), sortOrder = ref<'asc' | 'desc'>('asc')

// 模态框开关
const showCreate = ref(false)
const showEdit = ref(false), showReAuth = ref(false), showTest = ref(false)
const showStats = ref(false), showTempUnsched = ref(false), showDeleteDialog = ref(false)
const showExportDialog = ref(false), showSync = ref(false), showImportData = ref(false)
const showErrorPassthrough = ref(false), showTLSProfiles = ref(false), showToolsMenu = ref(false)
const toolsMenuRef = ref<HTMLElement | null>(null)

// 导出对话框: 是否包含 proxy 完整 URL+credentials (默认勾选,与 legacy 一致)
const includeProxyOnExport = ref(true)

// 当前操作指针
const editingAcc = ref<Account | null>(null), reAuthAcc = ref<Account | null>(null)
const testingAcc = ref<Account | null>(null), statsAcc = ref<Account | null>(null)
const tempUnschedAcc = ref<Account | null>(null), deletingAcc = ref<Account | null>(null)

const actionMenu = reactive<{ show: boolean; acc: Account | null; pos: any }>({ show: false, acc: null, pos: null })

// ── ScheduledTests 状态（直接挂模态，不再 router.push 旧页）──
const showSchedule = ref(false)
const scheduleAccount = ref<Account | null>(null)
const scheduleModelOptions = ref<SelectOption[]>([])

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
  {
    key: 'schedulable',
    label: t('admin.accountsQuench.filterSchedulable'),
    type: 'select',
    // 严禁空 value (reka-ui crash) — 用显式 'true'/'false' 字符串哨兵
    options: [
      { value: 'true',  label: t('admin.accountsQuench.filterSchedulableYes') },
      { value: 'false', label: t('admin.accountsQuench.filterSchedulableNo') },
    ],
  },
  {
    key: 'has_proxy',
    label: t('admin.accountsQuench.filterHasProxy'),
    type: 'select',
    options: [
      { value: 'true',  label: t('admin.accountsQuench.filterHasProxyYes') },
      { value: 'false', label: t('admin.accountsQuench.filterHasProxyNo') },
    ],
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
  p.schedulable  = typeof vals.schedulable  === 'string' ? vals.schedulable  : ''
  p.has_proxy    = typeof vals.has_proxy    === 'string' ? vals.has_proxy    : ''
}

// ── 折叠态记忆 (localStorage) + 计数 badge ─────────────────────────
const FILTERS_COLLAPSED_KEY = 'account-pool-filters-collapsed'
const filtersCollapsed = ref<boolean>((() => {
  try { return localStorage.getItem(FILTERS_COLLAPSED_KEY) === '1' } catch { return false }
})())
function toggleFiltersCollapsed() {
  filtersCollapsed.value = !filtersCollapsed.value
  try { localStorage.setItem(FILTERS_COLLAPSED_KEY, filtersCollapsed.value ? '1' : '0') } catch { /* noop */ }
}

// ── 激活字段计数 + 一键清空 ─────────────────────────────────────────
const accountActiveFilterCount = computed(() => {
  const p = params as any
  let n = 0
  for (const k of ['platform', 'type', 'status', 'group', 'privacy_mode', 'schedulable', 'has_proxy']) {
    const v = p[k]
    if (v != null && v !== '' && v !== 'all') n++
  }
  return n
})

function clearAccountFilters() {
  filterValues.value = {}
  applyFiltersToParams({})
  reload()
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
  initialParams: { platform: '', type: '', status: '', group: '', privacy_mode: '', schedulable: '', has_proxy: '', search: '', sort_by: 'name', sort_order: 'asc' }
})

const {
  operatingSet, togglingSchedulable, todayStatsByAccountId, todayStatsLoading, manualRefreshToken,
  bulkDeleteProgress, refreshTodayStats, patchInList,
  handleToggleStatus, handleRefreshOne, handleRecoverState, handleResetQuota, handleSetPrivacy,
  handleToggleSchedulable, handleBulkDelete, handleBulkResetStatus, handleBulkRefreshToken,
  handleBulkToggleSchedulable, handleBulkEditSelected,
  handleBulkDeleteFiltered, handleBulkEditFiltered,
  handleExportData,
  showBulkEdit, bulkEditTarget, closeBulkEdit,
} = useAccountPoolActions(accounts, {
  params,
  pagination,
  // 行被本地移除（filter 不匹配）→ 标记列表待同步
  onLocalListMutation: () => { autoRefresh?.markPendingListSync() },
})

// ── 列可见性（仅 table 模式生效，但 composable 可复用到其它表）──────────
const DEFAULT_HIDDEN_COLUMNS = [
  'today_stats', 'groups', 'proxy', 'priority',
  'rate_multiplier', 'last_used_at', 'created_at',
  // GAP-11 新列默认隐藏，与 legacy 一致
  'notes', 'expires_at', 'antigravity_tier', 'openai_compact_meta',
]
const {
  hiddenColumns,
  toggleColumn,
  resetToDefault: resetColumns,
} = useColumnVisibility('account-pool-hidden-columns', DEFAULT_HIDDEN_COLUMNS)

// 首次列表请求带 lite=1（后端跳过非关键字段,加速首屏）；后续 reload / autoRefresh 不带
const isFirstLoad = ref(true)
const withLiteFirstLoad = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = params as any
  if (isFirstLoad.value) {
    p.lite = '1'
    try {
      return await fn()
    } finally {
      // 无论成败,首次后清掉 lite 哨兵,避免污染后续请求
      isFirstLoad.value = false
      p.lite = ''
    }
  }
  return fn()
}
const load = async () => { await withLiteFirstLoad(baseLoad); await refreshTodayStats() }
const reload = async () => { await withLiteFirstLoad(baseReload); await refreshTodayStats() }
const handleManualRefresh = async () => {
  await reload()
  // 节流: AccountUsageCell watch 这个 token 才会重拉 /usage,避免每次 patchAccountInList 触发
  manualRefreshToken.value++
  autoRefresh?.clearPendingListSync()
}
const handlePageChange = (page: number) => { basePageChange(page) }

// ── 自动刷新（ETag 增量 + silent window + modal 暂停）──────────────────
const showAutoRefreshDropdown = ref(false)
const isAnyAccountModalOpen = () =>
  showCreate.value || showEdit.value || showReAuth.value || showTest.value
  || showStats.value || showTempUnsched.value || showDeleteDialog.value
  || showExportDialog.value || showSync.value || showImportData.value
  || showErrorPassthrough.value || showTLSProfiles.value
  || showBulkEdit.value || showSchedule.value

const autoRefresh = useAccountAutoRefresh({
  accountsRef: accounts,
  params,
  pagination,
  loading,
  isModalOpen: isAnyAccountModalOpen,
  shouldPause: () => showToolsMenu.value || showAutoRefreshDropdown.value || actionMenu.show,
  onAfterRefresh: refreshTodayStats,
  // 增量 merge 替换了某行，若该行正被其它 ref 引用则同步（避免 modal 数据残旧）
  onAccountReplaced: (next) => {
    if (editingAcc.value?.id === next.id) editingAcc.value = next
    if (reAuthAcc.value?.id === next.id) reAuthAcc.value = next
    if (testingAcc.value?.id === next.id) testingAcc.value = next
    if (statsAcc.value?.id === next.id) statsAcc.value = next
    if (tempUnschedAcc.value?.id === next.id) tempUnschedAcc.value = next
    if (actionMenu.acc?.id === next.id) actionMenu.acc = next
  },
})

const autoRefreshIntervalLabel = (sec: number) => t(`admin.accountsQuench.refreshInterval${sec}s`)

const syncPendingListChanges = async () => {
  autoRefresh.clearPendingListSync()
  await reload()
  manualRefreshToken.value++
}

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

const onAccountCreated = () => {
  showCreate.value = false
  autoRefresh.enterSilentWindow()
  reload()
}
const openEdit = (a: Account) => { editingAcc.value = a; showEdit.value = true }
const handleAccountUpdated = (updated?: Account) => {
  showEdit.value = false; showReAuth.value = false; reAuthAcc.value = null
  if (updated) patchInList(updated)
  else reload()
  autoRefresh.enterSilentWindow()
}
const openDeleteDialog = (a: Account) => { deletingAcc.value = a; showDeleteDialog.value = true }
const confirmDelete = async () => {
  if (!deletingAcc.value) return
  try {
    await adminAPI.accounts.delete(deletingAcc.value.id)
    showDeleteDialog.value = false; deletingAcc.value = null; reload()
  } catch { /* 静默 */ }
}
const openSchedule = async (a: Account) => {
  scheduleAccount.value = a
  scheduleModelOptions.value = []
  showSchedule.value = true
  try {
    const models = await adminAPI.accounts.getAvailableModels(a.id)
    scheduleModelOptions.value = models.map((m: ClaudeModel) => ({ value: m.id, label: m.display_name || m.id }))
  } catch {
    scheduleModelOptions.value = []
  }
}
const closeSchedule = () => {
  showSchedule.value = false
  scheduleAccount.value = null
  scheduleModelOptions.value = []
}

const onBulkEditSaved = () => {
  closeBulkEdit()
  selectedIds.value = []
  autoRefresh.enterSilentWindow()
  reload()
}

// ── filtered 操作：批量删除（T3 红线，显式 ConfirmDialog） ────────────
const showBulkDeleteFilteredDialog = ref(false)
const bulkDeleteFilteredPreviewCount = ref(0)
// 失败 ids（提供「重试失败」按钮）
const lastFailedDeleteIds = ref<number[]>([])

const buildFilterSnapshot = () => {
  const p = params as any
  return {
    platform: p.platform || '',
    type: p.type || '',
    status: p.status || '',
    group: p.group || '',
    privacy_mode: p.privacy_mode || '',
    schedulable: p.schedulable || '',
    has_proxy: p.has_proxy || '',
    search: p.search || '',
    sort_by: sortBy.value,
    sort_order: sortOrder.value,
  }
}

const openBulkDeleteFilteredConfirm = async () => {
  try {
    const filters = buildFilterSnapshot()
    const preview = await adminAPI.accounts.list(1, 1, filters)
    bulkDeleteFilteredPreviewCount.value = preview.total
    if (preview.total === 0) {
      // 用 status 文案 + appStore 风格统一
      autoRefresh.enterSilentWindow()
      return
    }
    showBulkDeleteFilteredDialog.value = true
  } catch { /* 静默 */ }
}

const confirmBulkDeleteFiltered = async () => {
  showBulkDeleteFilteredDialog.value = false
  const filters = buildFilterSnapshot()
  autoRefresh.enterSilentWindow()
  const result = await handleBulkDeleteFiltered(filters, () => { selectedIds.value = [] })
  lastFailedDeleteIds.value = result?.failedIds ?? []
  await reload()
}

const onBulkEditFiltered = async () => {
  const filters = buildFilterSnapshot()
  autoRefresh.enterSilentWindow()
  await handleBulkEditFiltered(filters)
}

const onBulkRetryFailed = async () => {
  if (lastFailedDeleteIds.value.length === 0) return
  const ids = [...lastFailedDeleteIds.value]
  lastFailedDeleteIds.value = []
  autoRefresh.enterSilentWindow()
  await handleBulkDelete(ids, () => { selectedIds.value = [] })
  await reload()
}

// 批量调度切换包装：失败时保留 failedIds 在 selection 中（legacy 行为）
const onBulkToggleSchedulable = async (v: boolean) => {
  await handleBulkToggleSchedulable(
    selectedIds.value,
    v,
    () => { selectedIds.value = [] },
    (ids: number[]) => { selectedIds.value = ids },
    () => { reload() },
  )
}

const onRevertProxyFallback = async (a: Account) => {
  try {
    await adminAPI.accounts.revertProxyFallback(a.id)
    appStore.showSuccess(t('admin.accountsQuench.proxyRevertSuccess'))
    // 拉新行替换；server 已切回原 proxy
    try {
      const fresh = await adminAPI.accounts.getById(a.id)
      patchInList(fresh)
    } catch { /* 失败回退到 reload */ await reload() }
  } catch (err: any) {
    appStore.showError(err?.response?.data?.message || t('admin.accountsQuench.proxyRevertFailed'))
  }
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
    {
      platform: p.platform || undefined,
      type: p.type || undefined,
      status: p.status || undefined,
      group: p.group || undefined,
      privacy_mode: p.privacy_mode || undefined,
      schedulable: p.schedulable || undefined,
      has_proxy: p.has_proxy || undefined,
      search: p.search || undefined,
    },
    sortBy.value, sortOrder.value,
    includeProxyOnExport.value,
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
/* spin animation for refresh button */
.apv-spin svg { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* error dot pulse */
.apv-sdot-pulse {
  animation: sdot-pulse 1.8s ease-in-out infinite;
}
@keyframes sdot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(242, 92, 105, .55); }
  50%       { box-shadow: 0 0 0 4px rgba(242, 92, 105, 0); }
}

/* rate-limited dot pulse */
.apv-sdot-pulse-warn {
  animation: sdot-pulse-w 1.8s ease-in-out infinite;
}
@keyframes sdot-pulse-w {
  0%, 100% { box-shadow: 0 0 0 0 rgba(224, 179, 78, .55); }
  50%       { box-shadow: 0 0 0 4px rgba(224, 179, 78, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .apv-spin svg,
  .apv-sdot-pulse,
  .apv-sdot-pulse-warn { animation: none; }
}
</style>
