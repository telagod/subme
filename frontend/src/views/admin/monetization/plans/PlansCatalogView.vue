<template>
  <AppLayout>
    <div class="flex flex-col gap-0 px-7 pb-16 pt-6 text-foreground">
      <!-- Header -->
      <div class="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h1 class="m-0 mb-1 text-xl font-bold tracking-tight text-foreground">{{ t('admin.plansCatalog.title') }}</h1>
          <p class="m-0 text-xs text-muted-foreground">{{ t('admin.plansCatalog.desc') }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" @click="loadAll" :disabled="loading" :title="t('common.refresh')">
            <Icon name="refresh" size="sm" :class="loading ? 'animate-spin' : ''" />
          </Button>
          <Button type="button" size="sm" @click="openCreate">
            <Icon name="plus" size="sm" />
            {{ t('payment.admin.createPlan') }}
          </Button>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="mb-5 flex items-center gap-5 rounded-xl border border-border bg-card px-[18px] py-3 shadow-sm">
        <div class="flex items-baseline gap-[7px]">
          <span class="font-mono text-[22px] font-bold tabular-nums text-foreground">{{ plans.length }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.plansCatalog.statTotal') }}</span>
        </div>
        <div class="h-6 w-px bg-border" />
        <div class="flex items-baseline gap-[7px]">
          <span class="font-mono text-[22px] font-bold tabular-nums text-emerald-500">{{ activePlans }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.plansCatalog.statOnSale') }}</span>
        </div>
        <div class="h-6 w-px bg-border" />
        <div class="flex items-baseline gap-[7px]">
          <span class="font-mono text-[22px] font-bold tabular-nums text-muted-foreground">{{ plans.length - activePlans }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.plansCatalog.statOffSale') }}</span>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]">
        <div v-for="i in 4" :key="i" class="flex min-h-[220px] animate-pulse flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div class="h-4 w-[70%] rounded-md bg-muted" />
          <div class="mt-1 h-7 w-[40%] rounded-md bg-muted" />
          <div class="h-3 w-[55%] rounded-md bg-muted" />
          <div class="h-3 w-[35%] rounded-md bg-muted" />
        </div>
      </div>

      <!-- Card grid -->
      <div v-else-if="plans.length" class="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-[18px]">
        <PlanCard
          v-for="(plan, idx) in plans"
          :key="plan.id"
          :plan="plan"
          :group="getGroup(plan.group_id)"
          :group-missing="isGroupMissing(plan.group_id)"
          :is-first="idx === 0 || sortLoading"
          :is-last="idx === plans.length - 1 || sortLoading"
          @toggle-sale="toggleForSale(plan)"
          @edit="openEdit(plan)"
          @delete="confirmDelete(plan)"
          @move-up="moveUp(idx)"
          @move-down="moveDown(idx)"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
        <Icon name="cube" size="xl" class="h-10 w-10 text-muted-foreground" />
        <p class="m-0 text-[13px]">{{ t('admin.plansCatalog.emptyText') }}</p>
      </div>
    </div>

    <!-- Dialogs -->
    <PlanEditDialog
      :show="showDialog"
      :plan="editingPlan"
      :groups="groups"
      @close="showDialog = false"
      @saved="loadAll"
    />
    <ConfirmDialog
      :show="showDeleteDialog"
      :title="t('payment.admin.deletePlan')"
      :message="t('payment.admin.deletePlanConfirm')"
      :confirm-text="t('common.delete')"
      danger
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminPaymentAPI } from '@/api/admin/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import adminAPI from '@/api/admin'
import type { SubscriptionPlan } from '@/types/payment'
import type { AdminGroup } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import PlanEditDialog from '@/views/admin/orders/PlanEditDialog.vue'
import PlanCard from './PlanCard.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()

// ── Groups ───────────────────────────────────────────────────────────────────

const groups = ref<AdminGroup[]>([])

async function loadGroups() {
  try { groups.value = await adminAPI.groups.getAll() } catch { /* ignore */ }
}

function getGroup(id: number): AdminGroup | undefined {
  return groups.value.find(g => g.id === id)
}

function isGroupMissing(id: number): boolean {
  return id > 0 && !groups.value.find(g => g.id === id)
}

// ── Plans ────────────────────────────────────────────────────────────────────

const loading = ref(false)
const sortLoading = ref(false)
const plans = ref<SubscriptionPlan[]>([])
const showDialog = ref(false)
const editingPlan = ref<SubscriptionPlan | null>(null)
const showDeleteDialog = ref(false)
const deletingId = ref<number | null>(null)

const activePlans = computed(() => plans.value.filter(p => p.for_sale).length)

async function loadPlans() {
  loading.value = true
  try {
    const res = await adminPaymentAPI.getPlans()
    plans.value = (res.data || [])
      .map((p: Omit<SubscriptionPlan, 'features'> & { features: string | string[] }) => ({
        ...p,
        features: typeof p.features === 'string'
          ? p.features.split('\n').map((f: string) => f.trim()).filter(Boolean)
          : (p.features || []),
      }))
      .sort((a: SubscriptionPlan, b: SubscriptionPlan) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadGroups(), loadPlans()])
}

function openCreate() { editingPlan.value = null; showDialog.value = true }
function openEdit(plan: SubscriptionPlan) { editingPlan.value = plan; showDialog.value = true }

async function toggleForSale(plan: SubscriptionPlan) {
  try {
    await adminPaymentAPI.updatePlan(plan.id, { for_sale: !plan.for_sale })
    plan.for_sale = !plan.for_sale
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  }
}

function confirmDelete(plan: SubscriptionPlan) { deletingId.value = plan.id; showDeleteDialog.value = true }

async function handleDelete() {
  if (!deletingId.value) return
  try {
    await adminPaymentAPI.deletePlan(deletingId.value)
    appStore.showSuccess(t('common.deleted'))
    showDeleteDialog.value = false
    loadPlans()
  } catch (err: unknown) {
    appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
  }
}

// ── Sort ─────────────────────────────────────────────────────────────────────

async function moveUp(idx: number) {
  if (idx === 0) return
  const list = [...plans.value];
  [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]
  await persistOrder(list)
}

async function moveDown(idx: number) {
  if (idx === plans.value.length - 1) return
  const list = [...plans.value];
  [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
  await persistOrder(list)
}

async function persistOrder(ordered: SubscriptionPlan[]) {
  if (sortLoading.value) return
  sortLoading.value = true
  plans.value = ordered
  try {
    await Promise.allSettled(
      ordered.map((p, i) => adminPaymentAPI.updatePlan(p.id, { sort_order: i }))
    )
    await loadPlans()
  } finally {
    sortLoading.value = false
  }
}

onMounted(loadAll)
</script>
