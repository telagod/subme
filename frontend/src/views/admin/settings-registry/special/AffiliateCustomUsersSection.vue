<template>
  <div class="flex flex-col gap-3 px-5 py-4">
    <!-- Disabled state: affiliate feature not enabled -->
    <div
      v-if="!affiliateEnabled"
      class="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
    >
      {{ t('admin.settings.features.affiliate.customUsers.disabledHint') }}
    </div>

    <template v-else>
    <!-- toolbar -->
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model="state.search"
        type="text"
        class="h-9 min-w-[160px] flex-1"
        :placeholder="t('admin.settings.features.affiliate.customUsers.searchPlaceholder')"
        @input="onSearchInput"
      />
      <Button
        v-if="state.selected.length > 0"
        type="button"
        variant="outline"
        size="sm"
        @click="openBatchModal"
      >
        {{ t('admin.settings.features.affiliate.customUsers.batchButton', { count: state.selected.length }) }}
      </Button>
      <Button
        type="button"
        size="sm"
        @click="openAddModal"
      >
        + {{ t('admin.settings.features.affiliate.customUsers.addButton') }}
      </Button>
    </div>

    <!-- table -->
    <div class="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-9">
              <input
                type="checkbox"
                class="cursor-pointer accent-primary"
                :checked="state.entries.length > 0 && state.selected.length === state.entries.length"
                @change="toggleSelectAll"
              />
            </TableHead>
            <TableHead>{{ t('admin.settings.features.affiliate.customUsers.col.email') }}</TableHead>
            <TableHead>{{ t('admin.settings.features.affiliate.customUsers.col.username') }}</TableHead>
            <TableHead>{{ t('admin.settings.features.affiliate.customUsers.col.code') }}</TableHead>
            <TableHead>{{ t('admin.settings.features.affiliate.customUsers.col.rate') }}</TableHead>
            <TableHead>{{ t('admin.settings.features.affiliate.customUsers.col.actions') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="state.loading">
            <TableCell colspan="6" class="py-6 text-center text-muted-foreground">{{ t('common.loading') }}</TableCell>
          </TableRow>
          <TableRow v-else-if="state.entries.length === 0">
            <TableCell colspan="6" class="py-6 text-center text-muted-foreground">
              {{ t('admin.settings.features.affiliate.customUsers.empty') }}
            </TableCell>
          </TableRow>
          <TableRow v-for="entry in state.entries" :key="entry.user_id">
            <TableCell class="w-9">
              <Checkbox
                :checked="state.selected.includes(entry.user_id)"
                @update:checked="toggleSelect(entry.user_id)"
              />
            </TableCell>
            <TableCell>{{ entry.email }}</TableCell>
            <TableCell class="text-muted-foreground">{{ entry.username }}</TableCell>
            <TableCell class="font-mono text-xs">
              {{ entry.aff_code }}
              <Badge v-if="entry.aff_code_custom" variant="secondary" class="ml-1 align-middle">
                {{ t('admin.settings.features.affiliate.customUsers.customBadge') }}
              </Badge>
            </TableCell>
            <TableCell>
              <span v-if="entry.aff_rebate_rate_percent != null">{{ entry.aff_rebate_rate_percent }}%</span>
              <span v-else class="text-muted-foreground">{{ t('admin.settings.features.affiliate.customUsers.useGlobal') }}</span>
            </TableCell>
            <TableCell>
              <div class="flex items-center gap-2.5">
                <Button type="button" variant="link" size="sm" class="h-auto p-0" @click="openEditModal(entry)">
                  {{ t('common.edit') }}
                </Button>
                <Button type="button" variant="link" size="sm" class="h-auto p-0 text-destructive hover:text-destructive/80" @click="askReset(entry)">
                  {{ t('common.delete') }}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- pagination -->
    <div v-if="state.total > state.pageSize" class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">
        {{ t('admin.settings.features.affiliate.customUsers.totalLabel', { total: state.total }) }}
      </span>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="state.page <= 1"
          @click="changePage(state.page - 1)"
        >
          {{ t('pagination.previous') }}
        </Button>
        <span class="min-w-[48px] text-center text-xs text-muted-foreground">
          {{ state.page }} / {{ Math.max(1, Math.ceil(state.total / state.pageSize)) }}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="state.page >= Math.ceil(state.total / state.pageSize)"
          @click="changePage(state.page + 1)"
        >
          {{ t('pagination.next') }}
        </Button>
      </div>
    </div>

    <!-- add/edit modal -->
    <div
      v-if="modal.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      @click.self="closeModal"
    >
      <div class="flex w-full max-w-[440px] flex-col gap-4 rounded-xl border border-border bg-popover p-6 shadow-2xl">
        <h3 class="m-0 text-[15px] font-semibold text-foreground">
          {{ modal.mode === 'add'
            ? t('admin.settings.features.affiliate.modal.addTitle')
            : t('admin.settings.features.affiliate.modal.editTitle') }}
        </h3>

        <div class="flex flex-col gap-3.5">
          <!-- user picker (add mode) -->
          <div v-if="modal.mode === 'add'" class="flex flex-col gap-1.5">
            <Label>{{ t('admin.settings.features.affiliate.modal.userLabel') }}</Label>
            <!-- selected chip -->
            <div v-if="modal.selectedUser" class="flex items-center justify-between rounded-lg border border-input bg-accent px-3 py-2">
              <div class="flex items-baseline gap-1">
                <span class="text-sm font-medium text-foreground">{{ modal.selectedUser.email }}</span>
                <span class="text-xs text-muted-foreground">({{ modal.selectedUser.username }})</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-muted-foreground hover:text-destructive"
                :title="t('admin.settings.features.affiliate.modal.changeUser')"
                @click="clearSelectedUser"
              >×</Button>
            </div>
            <!-- search input + dropdown -->
            <template v-else>
              <Input
                v-model="modal.userQuery"
                type="text"
                class="h-9"
                :placeholder="t('admin.settings.features.affiliate.modal.userPlaceholder')"
                @input="onUserSearchInput"
              />
              <div v-if="modal.userResults.length > 0" class="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover">
                <Button
                  v-for="u in modal.userResults"
                  :key="u.id"
                  type="button"
                  variant="ghost"
                  class="block h-auto w-full justify-start px-3 py-2 text-sm text-foreground"
                  @click="selectUser(u)"
                >
                  {{ u.email }}
                  <span class="text-xs text-muted-foreground">({{ u.username }})</span>
                </Button>
              </div>
            </template>
          </div>

          <!-- display user (edit mode) -->
          <div v-else class="flex flex-col gap-1.5">
            <Label>{{ t('admin.settings.features.affiliate.modal.userLabel') }}</Label>
            <Input
              type="text"
              class="h-9"
              :value="modal.editingEntry?.email ?? ''"
              disabled
            />
          </div>

          <!-- invite code -->
          <div class="flex flex-col gap-1.5">
            <Label>{{ t('admin.settings.features.affiliate.modal.codeLabel') }}</Label>
            <Input
              v-model="modal.code"
              type="text"
              class="h-9 font-mono"
              :placeholder="t('admin.settings.features.affiliate.modal.codePlaceholder')"
              maxlength="32"
            />
            <p class="m-0 text-[11px] leading-normal text-muted-foreground">{{ t('admin.settings.features.affiliate.modal.codeHint') }}</p>
          </div>

          <!-- rebate rate -->
          <div class="flex flex-col gap-1.5">
            <Label>{{ t('admin.settings.features.affiliate.modal.rateLabel') }}</Label>
            <div class="relative">
              <Input
                v-model="modal.rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                class="h-9 pr-8"
                :placeholder="t('admin.settings.features.affiliate.modal.ratePlaceholder')"
              />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p class="m-0 text-[11px] leading-normal text-muted-foreground">{{ t('admin.settings.features.affiliate.modal.rateHint') }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1">
          <p v-if="!modalCanSubmit" class="m-0 text-[11.5px] text-destructive">
            {{ t('admin.settings.features.affiliate.modal.errorEmpty') }}
          </p>
          <span v-else />
          <div class="flex gap-2">
            <Button type="button" variant="outline" size="sm" @click="closeModal">
              {{ t('common.cancel') }}
            </Button>
            <Button
              type="button"
              size="sm"
              :disabled="modal.saving || !modalCanSubmit"
              @click="submitModal"
            >
              {{ modal.saving ? t('common.saving') : t('common.save') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- batch rate modal -->
    <div
      v-if="batchModal.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      @click.self="batchModal.open = false"
    >
      <div class="flex w-full max-w-[440px] flex-col gap-4 rounded-xl border border-border bg-popover p-6 shadow-2xl">
        <h3 class="m-0 text-[15px] font-semibold text-foreground">
          {{ t('admin.settings.features.affiliate.batchModal.title', { count: state.selected.length }) }}
        </h3>
        <p class="m-0 text-xs leading-relaxed text-muted-foreground">
          {{ t('admin.settings.features.affiliate.batchModal.hint') }}
        </p>
        <div class="relative">
          <Input
            v-model="batchModal.rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            class="h-9 pr-8"
            :placeholder="t('admin.settings.features.affiliate.batchModal.placeholder')"
          />
          <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
        <p class="m-0 text-[11px] leading-normal text-muted-foreground">{{ t('admin.settings.features.affiliate.batchModal.clearHint') }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-1">
          <Button type="button" variant="outline" size="sm" @click="batchModal.open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button
            type="button"
            size="sm"
            :disabled="batchModal.saving"
            @click="submitBatchModal"
          >
            {{ batchModal.saving ? t('common.saving') : t('common.save') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- confirm dialog -->
    <ConfirmDialog
      :show="confirmDialog.show"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      danger
      @confirm="handleConfirm"
      @cancel="cancelConfirm"
    />
    </template><!-- /v-else affiliate enabled -->
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { affiliatesAPI, type AffiliateAdminEntry, type SimpleUser } from '@/api/admin/affiliates'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'

const props = defineProps<{
  settings?: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const { t } = useI18n()
const appStore = useAppStore()

// Guard: mirror the SettingsView v-if="form.affiliate_enabled" condition.
// formValues reflects the current (possibly unsaved) form state; settings is the
// saved snapshot. Fall back to settings when formValues is absent.
const affiliateEnabled = computed(() => {
  const source = props.formValues ?? props.settings ?? {}
  return source['affiliate_enabled'] === true
})

// ── List state ─────────────────────────────────────────────────────────────

interface ListState {
  loading: boolean
  entries: AffiliateAdminEntry[]
  total: number
  page: number
  pageSize: number
  search: string
  selected: number[]
  searchTimer: number | null
}

const state = reactive<ListState>({
  loading: false,
  entries: [],
  total: 0,
  page: 1,
  pageSize: 20,
  search: '',
  selected: [],
  searchTimer: null,
})

// ── Add / edit modal ───────────────────────────────────────────────────────

interface ModalState {
  open: boolean
  mode: 'add' | 'edit'
  saving: boolean
  userQuery: string
  userResults: SimpleUser[]
  selectedUser: SimpleUser | null
  editingEntry: AffiliateAdminEntry | null
  code: string
  // string|number because <input type="number"> coerces v-model to Number
  rate: string | number
  searchTimer: number | null
}

const modal = reactive<ModalState>({
  open: false,
  mode: 'add',
  saving: false,
  userQuery: '',
  userResults: [],
  selectedUser: null,
  editingEntry: null,
  code: '',
  rate: '',
  searchTimer: null,
})

// ── Batch rate modal ───────────────────────────────────────────────────────

const batchModal = reactive<{
  open: boolean
  saving: boolean
  rate: string | number
}>({
  open: false,
  saving: false,
  rate: '',
})

// ── Confirm dialog ─────────────────────────────────────────────────────────

const confirmDialog = reactive<{
  show: boolean
  title: string
  message: string
  confirmText: string
  pending: (() => Promise<unknown>) | null
}>({
  show: false,
  title: '',
  message: '',
  confirmText: '',
  pending: null,
})

// ── Helpers ────────────────────────────────────────────────────────────────

function debounce(slot: { searchTimer: number | null }, ms: number, fn: () => void) {
  if (slot.searchTimer != null) window.clearTimeout(slot.searchTimer)
  slot.searchTimer = window.setTimeout(fn, ms)
}

// parseRebateRate validates 0-100 numeric input.
// Returns: parsed number on success, null when empty (caller decides semantics),
//          or undefined on bad input (toast already shown).
function parseRebateRate(raw: unknown): number | null | undefined {
  const s = String(raw ?? '').trim()
  if (s === '') return null
  const v = Number(s)
  if (Number.isNaN(v) || v < 0 || v > 100) {
    appStore.showError(t('admin.settings.features.affiliate.modal.errorBadRate'))
    return undefined
  }
  return v
}

// ── Load ───────────────────────────────────────────────────────────────────

async function load() {
  state.loading = true
  try {
    const res = await affiliatesAPI.listUsers({
      page: state.page,
      page_size: state.pageSize,
      search: state.search,
    })
    state.entries = res.items ?? []
    state.total = res.total ?? 0
    // Drop selections that are no longer visible
    const visible = new Set(state.entries.map((e) => e.user_id))
    state.selected = state.selected.filter((id) => visible.has(id))
  } catch (err) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    state.loading = false
  }
}

// Load on mount only when affiliate is already enabled; also react to the
// toggle turning on (mirrors the watch in SettingsView.vue ~9633-9640).
onMounted(() => {
  if (affiliateEnabled.value) load()
})

watch(affiliateEnabled, (enabled, prev) => {
  if (enabled && !prev) load()
})

// ── Table interactions ─────────────────────────────────────────────────────

function onSearchInput() {
  debounce(state, 300, () => {
    state.page = 1
    load()
  })
}

function changePage(page: number) {
  if (page < 1) return
  state.page = page
  load()
}

function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  state.selected = checked ? state.entries.map((e) => e.user_id) : []
}

function toggleSelect(userId: number) {
  const idx = state.selected.indexOf(userId)
  if (idx >= 0) state.selected.splice(idx, 1)
  else state.selected.push(userId)
}

// ── Add/edit modal ─────────────────────────────────────────────────────────

function openAddModal() {
  modal.open = true
  modal.mode = 'add'
  modal.saving = false
  modal.userQuery = ''
  modal.userResults = []
  modal.selectedUser = null
  modal.editingEntry = null
  modal.code = ''
  modal.rate = ''
}

function openEditModal(entry: AffiliateAdminEntry) {
  modal.open = true
  modal.mode = 'edit'
  modal.saving = false
  modal.userQuery = ''
  modal.userResults = []
  modal.selectedUser = null
  modal.editingEntry = entry
  modal.code = entry.aff_code_custom ? entry.aff_code : ''
  modal.rate = entry.aff_rebate_rate_percent != null ? String(entry.aff_rebate_rate_percent) : ''
}

function closeModal() {
  modal.open = false
  if (modal.searchTimer != null) {
    window.clearTimeout(modal.searchTimer)
    modal.searchTimer = null
  }
}

function onUserSearchInput() {
  const q = modal.userQuery.trim()
  if (!q) {
    modal.userResults = []
    return
  }
  debounce(modal, 300, async () => {
    try {
      modal.userResults = await affiliatesAPI.lookupUsers(q)
    } catch (err) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    }
  })
}

function selectUser(user: SimpleUser) {
  modal.selectedUser = user
  modal.userQuery = ''
  modal.userResults = []
}

function clearSelectedUser() {
  modal.selectedUser = null
}

// Guard: add mode needs a user picked; at least one field must be filled.
// Edit mode with empty rate field = clear the custom rate (valid if one exists).
const modalCanSubmit = computed(() => {
  if (modal.mode === 'add') {
    if (!modal.selectedUser) return false
  } else if (!modal.editingEntry) {
    return false
  }
  const codeFilled = modal.code.trim() !== ''
  const rateFilled = String(modal.rate ?? '').trim() !== ''
  if (codeFilled || rateFilled) return true
  return modal.mode === 'edit' && modal.editingEntry?.aff_rebate_rate_percent != null
})

async function submitModal() {
  if (!modalCanSubmit.value) {
    appStore.showError(t('admin.settings.features.affiliate.modal.errorEmpty'))
    return
  }

  const userId = modal.mode === 'add' ? modal.selectedUser!.id : modal.editingEntry!.user_id
  const payload: Parameters<typeof affiliatesAPI.updateUserSettings>[1] = {}

  const codeRaw = modal.code.trim()
  if (codeRaw) payload.aff_code = codeRaw.toUpperCase()

  const rateInput = parseRebateRate(modal.rate)
  if (rateInput === undefined) return // toast shown
  if (rateInput === null) {
    if (modal.mode === 'edit' && modal.editingEntry?.aff_rebate_rate_percent != null) {
      payload.clear_rebate_rate = true
    }
  } else {
    payload.aff_rebate_rate_percent = rateInput
  }

  modal.saving = true
  try {
    await affiliatesAPI.updateUserSettings(userId, payload)
    appStore.showSuccess(t('common.saved'))
    closeModal()
    state.page = 1
    await load()
  } catch (err) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    modal.saving = false
  }
}

// ── Batch modal ────────────────────────────────────────────────────────────

function openBatchModal() {
  if (state.selected.length === 0) return
  batchModal.open = true
  batchModal.rate = ''
}

async function submitBatchModal() {
  const rateInput = parseRebateRate(batchModal.rate)
  if (rateInput === undefined) return
  const userIDs = [...state.selected]
  const payload: Parameters<typeof affiliatesAPI.batchSetRate>[0] =
    rateInput === null
      ? { user_ids: userIDs, clear: true }
      : { user_ids: userIDs, aff_rebate_rate_percent: rateInput }

  batchModal.saving = true
  try {
    await affiliatesAPI.batchSetRate(payload)
    appStore.showSuccess(t('common.saved'))
    batchModal.open = false
    state.selected = []
    await load()
  } catch (err) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    batchModal.saving = false
  }
}

// ── Confirm / reset ────────────────────────────────────────────────────────

function askReset(entry: AffiliateAdminEntry) {
  confirmDialog.title = t('admin.settings.features.affiliate.customUsers.resetTitle')
  confirmDialog.message = t('admin.settings.features.affiliate.customUsers.resetMessage', {
    email: entry.email || `#${entry.user_id}`,
  })
  confirmDialog.confirmText = t('common.delete')
  confirmDialog.pending = () => affiliatesAPI.clearUserSettings(entry.user_id)
  confirmDialog.show = true
}

async function handleConfirm() {
  const fn = confirmDialog.pending
  confirmDialog.show = false
  confirmDialog.pending = null
  if (!fn) return
  try {
    await fn()
    appStore.showSuccess(t('common.saved'))
    await load()
  } catch (err) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  }
}

function cancelConfirm() {
  confirmDialog.show = false
  confirmDialog.pending = null
}
</script>
