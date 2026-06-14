<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <CollapsibleFilters
          :active-count="promoActiveFilterCount"
          storage-key="promo-codes"
          @clear="clearPromoFilters"
        >
          <template #search>
            <SearchInput
              v-model="searchQuery"
              :placeholder="t('admin.promo.searchCodes')"
              class="w-full sm:w-64"
              @search="handleSearchInput"
            />
          </template>
          <template #filters>
            <Select
              v-model="filters.status"
              :options="filterStatusOptions"
              class="w-36"
              @change="loadCodes"
            />
          </template>
          <template #actions>
            <Button
              variant="outline"
              size="icon"
              @click="loadCodes"
              :disabled="loading"
              :title="t('common.refresh')"
            >
              <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
            </Button>
            <Button @click="showCreateDialog = true">
              <Icon name="plus" size="md" class="mr-1" />
              {{ t('admin.promo.createCode') }}
            </Button>
          </template>
        </CollapsibleFilters>
      </template>

      <template #table>
        <DataTable
          :columns="columns"
          :data="codes"
          :loading="loading"
          :server-side-sort="true"
          default-sort-key="created_at"
          default-sort-order="desc"
          @sort="handleSort"
        >
          <template #cell-code="{ value }">
            <div class="flex items-center space-x-2">
              <code class="font-mono text-sm text-foreground">{{ value }}</code>
              <Button
                variant="ghost"
                size="icon"
                @click="copyToClipboard(value)"
                :class="[
                  'h-6 w-6',
                  copiedCode === value
                    ? 'text-emerald-500'
                    : 'text-muted-foreground hover:text-foreground'
                ]"
                :title="copiedCode === value ? t('admin.promo.copied') : t('keys.copyToClipboard')"
              >
                <Icon v-if="copiedCode !== value" name="copy" size="sm" :stroke-width="2" />
                <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </Button>
            </div>
          </template>

          <template #cell-bonus_amount="{ value }">
            <span class="text-sm font-medium text-foreground">
              ${{ value.toFixed(2) }}
            </span>
          </template>

          <template #cell-usage="{ row }">
            <span class="text-sm text-foreground/85">
              {{ row.used_count }} / {{ row.max_uses === 0 ? '∞' : row.max_uses }}
            </span>
          </template>

          <template #cell-status="{ value, row }">
            <Badge
              variant="outline"
              :class="{
                'badge-success': 'border-emerald-500/35 bg-emerald-500/10 text-emerald-500',
                'badge-gray': 'text-muted-foreground',
                'badge-danger': 'border-destructive/35 bg-destructive/10 text-destructive'
              }[getStatusClass(value, row)]"
            >
              {{ getStatusLabel(value, row) }}
            </Badge>
          </template>

          <template #cell-expires_at="{ value }">
            <span class="text-sm text-muted-foreground">
              {{ value ? formatDateTime(value) : t('admin.promo.neverExpires') }}
            </span>
          </template>

          <template #cell-created_at="{ value }">
            <span class="text-sm text-muted-foreground">
              {{ formatDateTime(value) }}
            </span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="icon"
                @click="copyRegisterLink(row)"
                class="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-emerald-500"
                :title="t('admin.promo.copyRegisterLink')"
              >
                <Icon name="link" size="sm" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="handleViewUsages(row)"
                class="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground"
                :title="t('admin.promo.viewUsages')"
              >
                <Icon name="eye" size="sm" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="handleEdit(row)"
                class="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground"
                :title="t('common.edit')"
              >
                <Icon name="edit" size="sm" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="handleDelete(row)"
                class="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-destructive"
                :title="t('common.delete')"
              >
                <Icon name="trash" size="sm" />
              </Button>
            </div>
          </template>
        </DataTable>
      </template>

      <template #pagination>
        <Pagination
          v-if="pagination.total > 0"
          :page="pagination.page"
          :total="pagination.total"
          :page-size="pagination.page_size"
          @update:page="handlePageChange"
          @update:pageSize="handlePageSizeChange"
        />
      </template>
    </TablePageLayout>

    <!-- Create Dialog -->
    <BaseDialog
      :show="showCreateDialog"
      :title="t('admin.promo.createCode')"
      width="normal"
      @close="showCreateDialog = false"
    >
      <form id="create-promo-form" @submit.prevent="handleCreate" class="space-y-4">
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.code') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('admin.promo.autoGenerate') }})</span>
          </Label>
          <Input
            v-model="createForm.code"
            type="text"
            class="font-mono uppercase"
            :placeholder="t('admin.promo.codePlaceholder')"
          />
        </div>
        <div>
          <Label class="mb-2 block">{{ t('admin.promo.bonusAmount') }}</Label>
          <Input
            v-model.number="createForm.bonus_amount"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.maxUses') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('admin.promo.zeroUnlimited') }})</span>
          </Label>
          <Input
            v-model.number="createForm.max_uses"
            type="number"
            min="0"
          />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.expiresAt') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('common.optional') }})</span>
          </Label>
          <Input
            v-model="createForm.expires_at_str"
            type="datetime-local"
          />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.notes') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('common.optional') }})</span>
          </Label>
          <Textarea
            v-model="createForm.notes"
            rows="2"
            :placeholder="t('admin.promo.notesPlaceholder')"
          />
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button type="button" variant="outline" @click="showCreateDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" form="create-promo-form" :disabled="creating">
            {{ creating ? t('common.creating') : t('common.create') }}
          </Button>
        </div>
      </template>
    </BaseDialog>

    <!-- Edit Dialog -->
    <BaseDialog
      :show="showEditDialog"
      :title="t('admin.promo.editCode')"
      width="normal"
      @close="closeEditDialog"
    >
      <form id="edit-promo-form" @submit.prevent="handleUpdate" class="space-y-4">
        <div>
          <Label class="mb-2 block">{{ t('admin.promo.code') }}</Label>
          <Input
            v-model="editForm.code"
            type="text"
            class="font-mono uppercase"
          />
        </div>
        <div>
          <Label class="mb-2 block">{{ t('admin.promo.bonusAmount') }}</Label>
          <Input
            v-model.number="editForm.bonus_amount"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.maxUses') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('admin.promo.zeroUnlimited') }})</span>
          </Label>
          <Input
            v-model.number="editForm.max_uses"
            type="number"
            min="0"
          />
        </div>
        <div>
          <Label class="mb-2 block">{{ t('admin.promo.status') }}</Label>
          <Select v-model="editForm.status" :options="statusOptions" />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.expiresAt') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('common.optional') }})</span>
          </Label>
          <Input
            v-model="editForm.expires_at_str"
            type="datetime-local"
          />
        </div>
        <div>
          <Label class="mb-2 block">
            {{ t('admin.promo.notes') }}
            <span class="ml-1 text-xs font-normal text-muted-foreground">({{ t('common.optional') }})</span>
          </Label>
          <Textarea
            v-model="editForm.notes"
            rows="2"
          />
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button type="button" variant="outline" @click="closeEditDialog">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" form="edit-promo-form" :disabled="updating">
            {{ updating ? t('common.saving') : t('common.save') }}
          </Button>
        </div>
      </template>
    </BaseDialog>

    <!-- Usages Dialog -->
    <BaseDialog
      :show="showUsagesDialog"
      :title="t('admin.promo.usageRecords')"
      width="wide"
      @close="showUsagesDialog = false"
    >
      <div v-if="usagesLoading" class="flex items-center justify-center py-8">
        <Icon name="refresh" size="lg" class="animate-spin text-muted-foreground" />
      </div>
      <div v-else-if="usages.length === 0" class="py-8 text-center text-muted-foreground">
        {{ t('admin.promo.noUsages') }}
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="usage in usages"
          :key="usage.id"
          class="flex items-center justify-between rounded-lg border border-border p-3"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <Icon name="user" size="sm" class="text-emerald-500" />
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">
                {{ usage.user?.email || t('admin.promo.userPrefix', { id: usage.user_id }) }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ formatDateTime(usage.used_at) }}
              </p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-sm font-medium text-emerald-500">
              +${{ usage.bonus_amount.toFixed(2) }}
            </span>
          </div>
        </div>
        <!-- Usages Pagination -->
        <div v-if="usagesTotal > usagesPageSize" class="mt-4">
          <Pagination
            :page="usagesPage"
            :total="usagesTotal"
            :page-size="usagesPageSize"
            @update:page="handleUsagesPageChange"
            @update:page-size="(size: number) => { usagesPageSize = size; usagesPage = 1; loadUsages() }"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end">
          <Button type="button" variant="outline" @click="showUsagesDialog = false">
            {{ t('common.close') }}
          </Button>
        </div>
      </template>
    </BaseDialog>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      :show="showDeleteDialog"
      :title="t('admin.promo.deleteCode')"
      :message="t('admin.promo.deleteCodeConfirm')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      danger
      @confirm="confirmDelete"
      @cancel="showDeleteDialog = false"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useClipboard } from '@/composables/useClipboard'
import { getPersistedPageSize } from '@/composables/usePersistedPageSize'
import { adminAPI } from '@/api/admin'
import { formatDateTime } from '@/utils/format'
import type { PromoCode, PromoCodeUsage } from '@/types'
import type { Column } from '@/components/common/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import DataTable from '@/components/common/DataTable.vue'
import Pagination from '@/components/common/Pagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Select from '@/components/common/Select.vue'
import CollapsibleFilters from '@/components/common/CollapsibleFilters.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()
const appStore = useAppStore()
const { copyToClipboard: clipboardCopy } = useClipboard()

// State
const codes = ref<PromoCode[]>([])
const loading = ref(false)
const creating = ref(false)
const updating = ref(false)
const searchQuery = ref('')
const copiedCode = ref<string | null>(null)

const filters = reactive({
  status: ''
})

const promoActiveFilterCount = computed(() => {
  let count = 0
  if (filters.status) count++
  return count
})

const clearPromoFilters = () => {
  filters.status = ''
  loadCodes()
}

const pagination = reactive({
  page: 1,
  page_size: getPersistedPageSize(),
  total: 0
})
const sortState = reactive({
  sort_by: 'created_at',
  sort_order: 'desc' as 'asc' | 'desc'
})

// Dialogs
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showUsagesDialog = ref(false)

const editingCode = ref<PromoCode | null>(null)
const deletingCode = ref<PromoCode | null>(null)

// Usages
const usages = ref<PromoCodeUsage[]>([])
const usagesLoading = ref(false)
const currentViewingCode = ref<PromoCode | null>(null)
const usagesPage = ref(1)
const usagesPageSize = ref(20)
const usagesTotal = ref(0)

// Forms
const createForm = reactive({
  code: '',
  bonus_amount: 1,
  max_uses: 0,
  expires_at_str: '',
  notes: ''
})

const editForm = reactive({
  code: '',
  bonus_amount: 0,
  max_uses: 0,
  status: 'active' as 'active' | 'disabled',
  expires_at_str: '',
  notes: ''
})

// Options
const filterStatusOptions = computed(() => [
  { value: '', label: t('admin.promo.allStatus') },
  { value: 'active', label: t('admin.promo.statusActive') },
  { value: 'disabled', label: t('admin.promo.statusDisabled') }
])

const statusOptions = computed(() => [
  { value: 'active', label: t('admin.promo.statusActive') },
  { value: 'disabled', label: t('admin.promo.statusDisabled') }
])

const columns = computed<Column[]>(() => [
  { key: 'code', label: t('admin.promo.columns.code') },
  { key: 'bonus_amount', label: t('admin.promo.columns.bonusAmount'), sortable: true },
  { key: 'usage', label: t('admin.promo.columns.usage') },
  { key: 'status', label: t('admin.promo.columns.status'), sortable: true },
  { key: 'expires_at', label: t('admin.promo.columns.expiresAt'), sortable: true },
  { key: 'created_at', label: t('admin.promo.columns.createdAt'), sortable: true },
  { key: 'actions', label: t('admin.promo.columns.actions') }
])

// Helpers
const getStatusClass = (status: string, row: PromoCode) => {
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return 'badge-danger'
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return 'badge-gray'
  }
  return status === 'active' ? 'badge-success' : 'badge-gray'
}

const getStatusLabel = (status: string, row: PromoCode) => {
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return t('admin.promo.statusExpired')
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return t('admin.promo.statusMaxUsed')
  }
  return status === 'active' ? t('admin.promo.statusActive') : t('admin.promo.statusDisabled')
}

// API calls
let abortController: AbortController | null = null

const loadCodes = async () => {
  if (abortController) {
    abortController.abort()
  }
  const currentController = new AbortController()
  abortController = currentController
  loading.value = true

  try {
    const response = await adminAPI.promo.list(
      pagination.page,
      pagination.page_size,
      {
        status: filters.status || undefined,
        search: searchQuery.value || undefined,
        sort_by: sortState.sort_by,
        sort_order: sortState.sort_order
      },
      { signal: currentController.signal }
    )
    if (currentController.signal.aborted || abortController !== currentController) return

    codes.value = response.items
    pagination.total = response.total
  } catch (error: any) {
    if (
      currentController.signal.aborted ||
      abortController !== currentController ||
      error?.name === 'AbortError' ||
      error?.code === 'ERR_CANCELED'
    ) {
      return
    }
    appStore.showError(t('admin.promo.failedToLoad'))
    console.error('Error loading promo codes:', error)
  } finally {
    if (abortController === currentController) {
      loading.value = false
      abortController = null
    }
  }
}

const handleSearchInput = () => {
  pagination.page = 1
  loadCodes()
}

const handlePageChange = (page: number) => {
  pagination.page = page
  loadCodes()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.page_size = pageSize
  pagination.page = 1
  loadCodes()
}

const handleSort = (key: string, order: 'asc' | 'desc') => {
  sortState.sort_by = key
  sortState.sort_order = order
  pagination.page = 1
  loadCodes()
}

const copyToClipboard = async (text: string) => {
  const success = await clipboardCopy(text, t('admin.promo.copied'))
  if (success) {
    copiedCode.value = text
    setTimeout(() => {
      copiedCode.value = null
    }, 2000)
  }
}

// Create
const handleCreate = async () => {
  creating.value = true
  try {
    await adminAPI.promo.create({
      code: createForm.code || undefined,
      bonus_amount: createForm.bonus_amount,
      max_uses: createForm.max_uses,
      expires_at: createForm.expires_at_str ? Math.floor(new Date(createForm.expires_at_str).getTime() / 1000) : undefined,
      notes: createForm.notes || undefined
    })
    appStore.showSuccess(t('admin.promo.codeCreated'))
    showCreateDialog.value = false
    resetCreateForm()
    loadCodes()
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.promo.failedToCreate'))
  } finally {
    creating.value = false
  }
}

const resetCreateForm = () => {
  createForm.code = ''
  createForm.bonus_amount = 1
  createForm.max_uses = 0
  createForm.expires_at_str = ''
  createForm.notes = ''
}

// Edit
const handleEdit = (code: PromoCode) => {
  editingCode.value = code
  editForm.code = code.code
  editForm.bonus_amount = code.bonus_amount
  editForm.max_uses = code.max_uses
  editForm.status = code.status
  editForm.expires_at_str = code.expires_at ? new Date(code.expires_at).toISOString().slice(0, 16) : ''
  editForm.notes = code.notes || ''
  showEditDialog.value = true
}

const closeEditDialog = () => {
  showEditDialog.value = false
  editingCode.value = null
}

const handleUpdate = async () => {
  if (!editingCode.value) return

  updating.value = true
  try {
    await adminAPI.promo.update(editingCode.value.id, {
      code: editForm.code,
      bonus_amount: editForm.bonus_amount,
      max_uses: editForm.max_uses,
      status: editForm.status,
      expires_at: editForm.expires_at_str ? Math.floor(new Date(editForm.expires_at_str).getTime() / 1000) : 0,
      notes: editForm.notes
    })
    appStore.showSuccess(t('admin.promo.codeUpdated'))
    closeEditDialog()
    loadCodes()
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.promo.failedToUpdate'))
  } finally {
    updating.value = false
  }
}

// Copy Register Link
const copyRegisterLink = async (code: PromoCode) => {
  const baseUrl = window.location.origin
  const registerLink = `${baseUrl}/register?promo=${encodeURIComponent(code.code)}`

  try {
    await navigator.clipboard.writeText(registerLink)
    appStore.showSuccess(t('admin.promo.registerLinkCopied'))
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = registerLink
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    appStore.showSuccess(t('admin.promo.registerLinkCopied'))
  }
}

// Delete
const handleDelete = (code: PromoCode) => {
  deletingCode.value = code
  showDeleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingCode.value) return

  try {
    await adminAPI.promo.delete(deletingCode.value.id)
    appStore.showSuccess(t('admin.promo.codeDeleted'))
    showDeleteDialog.value = false
    deletingCode.value = null
    loadCodes()
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.promo.failedToDelete'))
  }
}

// View Usages
const handleViewUsages = async (code: PromoCode) => {
  currentViewingCode.value = code
  showUsagesDialog.value = true
  usagesPage.value = 1
  await loadUsages()
}

const loadUsages = async () => {
  if (!currentViewingCode.value) return
  usagesLoading.value = true
  usages.value = []

  try {
    const response = await adminAPI.promo.getUsages(
      currentViewingCode.value.id,
      usagesPage.value,
      usagesPageSize.value
    )
    usages.value = response.items
    usagesTotal.value = response.total
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.promo.failedToLoadUsages'))
  } finally {
    usagesLoading.value = false
  }
}

const handleUsagesPageChange = (page: number) => {
  usagesPage.value = page
  loadUsages()
}

onMounted(() => {
  loadCodes()
})

onUnmounted(() => {
  abortController?.abort()
})
</script>
