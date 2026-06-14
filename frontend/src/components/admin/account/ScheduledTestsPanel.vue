<template>
  <BaseDialog
    :show="show"
    :title="t('admin.scheduledTests.title')"
    width="wide"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <!-- Add Plan Button -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted-foreground">
          {{ t('admin.scheduledTests.title') }}
        </p>
        <Button
          @click="showAddForm = !showAddForm"
          class="flex items-center gap-1.5 text-sm"
        >
          <Icon name="plus" size="sm" :stroke-width="2" />
          {{ t('admin.scheduledTests.addPlan') }}
        </Button>
      </div>

      <!-- Add Plan Form -->
      <div
        v-if="showAddForm"
        class="rounded-md border border-border bg-card p-4"
      >
        <div class="mb-3 text-sm font-medium text-foreground/85">
          {{ t('admin.scheduledTests.addPlan') }}
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label class="mb-1 block text-xs font-medium text-muted-foreground">
              {{ t('admin.scheduledTests.model') }}
            </Label>
            <Select
              v-model="newPlan.model_id"
              :options="modelOptions"
              :placeholder="t('admin.scheduledTests.model')"
              :searchable="modelOptions.length > 5"
            />
          </div>
          <div>
            <Label class="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {{ t('admin.scheduledTests.cronExpression') }}
              <HelpTooltip>
                <template #trigger>
                  <span class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    ?
                  </span>
                </template>
                <div class="space-y-1.5">
                  <p class="font-medium">{{ t('admin.scheduledTests.cronTooltipTitle') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipMeaning') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipExampleEvery30Min') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipExampleHourly') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipExampleDaily') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipExampleWeekly') }}</p>
                  <p>{{ t('admin.scheduledTests.cronTooltipRange') }}</p>
                </div>
              </HelpTooltip>
            </Label>
            <Input
              v-model="newPlan.cron_expression"
              :placeholder="'*/30 * * * *'"
              :hint="t('admin.scheduledTests.cronHelp')"
            />
          </div>
          <div>
            <Label class="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {{ t('admin.scheduledTests.maxResults') }}
              <HelpTooltip>
                <template #trigger>
                  <span class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    ?
                  </span>
                </template>
                <div class="space-y-1.5">
                  <p class="font-medium">{{ t('admin.scheduledTests.maxResultsTooltipTitle') }}</p>
                  <p>{{ t('admin.scheduledTests.maxResultsTooltipMeaning') }}</p>
                  <p>{{ t('admin.scheduledTests.maxResultsTooltipBody') }}</p>
                  <p>{{ t('admin.scheduledTests.maxResultsTooltipExample') }}</p>
                  <p>{{ t('admin.scheduledTests.maxResultsTooltipRange') }}</p>
                </div>
              </HelpTooltip>
            </Label>
            <Input
              v-model="newPlan.max_results"
              type="number"
              placeholder="100"
            />
          </div>
          <div class="flex items-end">
            <Label class="flex items-center gap-2 text-sm text-foreground/85">
              <Switch v-model="newPlan.enabled" />
              {{ t('admin.scheduledTests.enabled') }}
            </Label>
          </div>
          <div class="flex items-end">
            <div>
              <Label class="flex items-center gap-2 text-sm text-foreground/85">
                <Switch v-model="newPlan.auto_recover" />
                {{ t('admin.scheduledTests.autoRecover') }}
              </Label>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ t('admin.scheduledTests.autoRecoverHelp') }}
              </p>
            </div>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            @click="showAddForm = false; resetNewPlan()"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            @click="handleCreate"
            :disabled="!newPlan.model_id || !newPlan.cron_expression || creating"
            class="flex items-center gap-1.5"
          >
            <Icon v-if="creating" name="refresh" size="sm" class="animate-spin" :stroke-width="2" />
            {{ t('common.save') }}
          </Button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Icon name="refresh" size="md" class="animate-spin text-muted-foreground" :stroke-width="2" />
        <span class="ml-2 text-sm text-muted-foreground">{{ t('common.loading') }}...</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="plans.length === 0"
        class="rounded-md border border-dashed border-border py-10 text-center"
      >
        <Icon name="calendar" size="lg" class="mx-auto mb-2 text-muted-foreground" :stroke-width="1.5" />
        <p class="text-sm text-muted-foreground">
          {{ t('admin.scheduledTests.noPlans') }}
        </p>
      </div>

      <!-- Plans List -->
      <div v-else class="space-y-3">
        <div
          v-for="plan in plans"
          :key="plan.id"
          class="rounded-md border border-border bg-card transition-all"
        >
          <!-- Plan Header -->
          <div
            class="flex cursor-pointer items-center justify-between px-4 py-3"
            @click="toggleExpand(plan.id)"
          >
            <div class="flex flex-1 items-center gap-4">
              <!-- Model -->
              <div class="min-w-0">
                <div class="text-sm font-medium text-foreground">
                  {{ plan.model_id }}
                </div>
                <div class="mt-0.5 font-mono text-xs text-muted-foreground">
                  {{ plan.cron_expression }}
                </div>
              </div>

              <!-- Enabled Toggle -->
              <div class="flex items-center gap-1.5" @click.stop>
                <Switch
                  :model-value="plan.enabled"
                  @update:model-value="(val: boolean) => handleToggleEnabled(plan, val)"
                />
                <span class="text-xs text-muted-foreground">
                  {{ plan.enabled ? t('admin.scheduledTests.enabled') : '' }}
                </span>
              </div>

              <!-- Auto Recover Badge -->
              <Badge
                v-if="plan.auto_recover"
                variant="outline"
                class="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              >
                {{ t('admin.scheduledTests.autoRecover') }}
              </Badge>
            </div>

            <div class="flex items-center gap-3">
              <!-- Last Run -->
              <div v-if="plan.last_run_at" class="hidden text-right text-xs text-muted-foreground sm:block">
                <div>{{ t('admin.scheduledTests.lastRun') }}</div>
                <div>{{ formatDateTime(plan.last_run_at) }}</div>
              </div>

              <!-- Next Run -->
              <div v-if="plan.next_run_at" class="hidden text-right text-xs text-muted-foreground sm:block">
                <div>{{ t('admin.scheduledTests.nextRun') }}</div>
                <div>{{ formatDateTime(plan.next_run_at) }}</div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1" @click.stop>
                <Button
                  variant="ghost"
                  size="icon"
                  @click="startEdit(plan)"
                  :title="t('admin.scheduledTests.editPlan')"
                >
                  <Icon name="edit" size="sm" :stroke-width="2" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  @click="confirmDeletePlan(plan)"
                  class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  :title="t('admin.scheduledTests.deletePlan')"
                >
                  <Icon name="trash" size="sm" :stroke-width="2" />
                </Button>
              </div>

              <!-- Expand indicator -->
              <Icon
                name="chevronDown"
                size="sm"
                :class="[
                  'text-muted-foreground transition-transform duration-200',
                  expandedPlanId === plan.id ? 'rotate-180' : ''
                ]"
              />
            </div>
          </div>

          <!-- Edit Form -->
          <div
            v-if="editingPlanId === plan.id"
            class="border-t border-border bg-card px-4 py-3"
            @click.stop
          >
            <div class="mb-2 text-xs font-medium text-muted-foreground">
              {{ t('admin.scheduledTests.editPlan') }}
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label class="mb-1 block text-xs font-medium text-muted-foreground">
                  {{ t('admin.scheduledTests.model') }}
                </Label>
                <Select
                  v-model="editForm.model_id"
                  :options="modelOptions"
                  :placeholder="t('admin.scheduledTests.model')"
                  :searchable="modelOptions.length > 5"
                />
              </div>
              <div>
                <Label class="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {{ t('admin.scheduledTests.cronExpression') }}
                  <HelpTooltip>
                    <template #trigger>
                      <span class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                        ?
                      </span>
                    </template>
                    <div class="space-y-1.5">
                      <p class="font-medium">{{ t('admin.scheduledTests.cronTooltipTitle') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipMeaning') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipExampleEvery30Min') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipExampleHourly') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipExampleDaily') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipExampleWeekly') }}</p>
                      <p>{{ t('admin.scheduledTests.cronTooltipRange') }}</p>
                    </div>
                  </HelpTooltip>
                </Label>
                <Input
                  v-model="editForm.cron_expression"
                  :placeholder="'*/30 * * * *'"
                  :hint="t('admin.scheduledTests.cronHelp')"
                />
              </div>
              <div>
                <Label class="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {{ t('admin.scheduledTests.maxResults') }}
                  <HelpTooltip>
                    <template #trigger>
                      <span class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                        ?
                      </span>
                    </template>
                    <div class="space-y-1.5">
                      <p class="font-medium">{{ t('admin.scheduledTests.maxResultsTooltipTitle') }}</p>
                      <p>{{ t('admin.scheduledTests.maxResultsTooltipMeaning') }}</p>
                      <p>{{ t('admin.scheduledTests.maxResultsTooltipBody') }}</p>
                      <p>{{ t('admin.scheduledTests.maxResultsTooltipExample') }}</p>
                      <p>{{ t('admin.scheduledTests.maxResultsTooltipRange') }}</p>
                    </div>
                  </HelpTooltip>
                </Label>
                <Input
                  v-model="editForm.max_results"
                  type="number"
                  placeholder="100"
                />
              </div>
              <div class="flex items-end">
                <Label class="flex items-center gap-2 text-sm text-foreground/85">
                  <Switch v-model="editForm.enabled" />
                  {{ t('admin.scheduledTests.enabled') }}
                </Label>
              </div>
              <div class="flex items-end">
                <div>
                  <Label class="flex items-center gap-2 text-sm text-foreground/85">
                    <Switch v-model="editForm.auto_recover" />
                    {{ t('admin.scheduledTests.autoRecover') }}
                  </Label>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {{ t('admin.scheduledTests.autoRecoverHelp') }}
                  </p>
                </div>
              </div>
            </div>
            <div class="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                @click="cancelEdit"
              >
                {{ t('common.cancel') }}
              </Button>
              <Button
                @click="handleEdit"
                :disabled="!editForm.model_id || !editForm.cron_expression || updating"
                class="flex items-center gap-1.5"
              >
                <Icon v-if="updating" name="refresh" size="sm" class="animate-spin" :stroke-width="2" />
                {{ t('common.save') }}
              </Button>
            </div>
          </div>

          <!-- Expanded Results Section -->
          <div
            v-if="expandedPlanId === plan.id"
            class="border-t border-border px-4 py-3"
          >
            <div class="mb-2 text-xs font-medium text-muted-foreground">
              {{ t('admin.scheduledTests.results') }}
            </div>

            <!-- Results Loading -->
            <div v-if="loadingResults" class="flex items-center justify-center py-4">
              <Icon name="refresh" size="sm" class="animate-spin text-muted-foreground" :stroke-width="2" />
              <span class="ml-2 text-xs text-muted-foreground">{{ t('common.loading') }}...</span>
            </div>

            <!-- No Results -->
            <div
              v-else-if="results.length === 0"
              class="py-4 text-center text-xs text-muted-foreground"
            >
              {{ t('admin.scheduledTests.noResults') }}
            </div>

            <!-- Results List -->
            <div v-else class="max-h-64 space-y-2 overflow-y-auto">
              <div
                v-for="result in results"
                :key="result.id"
                class="rounded-md border border-border bg-muted p-3"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <!-- Status Badge -->
                    <Badge
                      variant="outline"
                      :class="[
                        result.status === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : result.status === 'running'
                            ? 'bg-accent text-foreground/85 border-border'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                      ]"
                    >
                      {{
                        result.status === 'success'
                          ? t('admin.scheduledTests.success')
                          : result.status === 'running'
                            ? t('admin.scheduledTests.running')
                            : t('admin.scheduledTests.failed')
                      }}
                    </Badge>

                    <!-- Latency -->
                    <span v-if="result.latency_ms > 0" class="text-xs text-muted-foreground">
                      {{ result.latency_ms }}ms
                    </span>
                  </div>

                  <!-- Started At -->
                  <span class="text-xs text-muted-foreground">
                    {{ formatDateTime(result.started_at) }}
                  </span>
                </div>

                <!-- Response / Error (collapsible) -->
                <div v-if="result.error_message" class="mt-2">
                  <div
                    class="cursor-pointer text-xs font-medium text-red-400"
                    @click="toggleResultDetail(result.id)"
                  >
                    {{ t('admin.scheduledTests.errorMessage') }}
                    <Icon
                      name="chevronDown"
                      size="sm"
                      :class="[
                        'inline transition-transform duration-200',
                        expandedResultIds.has(result.id) ? 'rotate-180' : ''
                      ]"
                    />
                  </div>
                  <pre
                    v-if="expandedResultIds.has(result.id)"
                    class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400"
                  >{{ result.error_message }}</pre>
                </div>
                <div v-else-if="result.response_text" class="mt-2">
                  <div
                    class="cursor-pointer text-xs font-medium text-muted-foreground"
                    @click="toggleResultDetail(result.id)"
                  >
                    {{ t('admin.scheduledTests.responseText') }}
                    <Icon
                      name="chevronDown"
                      size="sm"
                      :class="[
                        'inline transition-transform duration-200',
                        expandedResultIds.has(result.id) ? 'rotate-180' : ''
                      ]"
                    />
                  </div>
                  <pre
                    v-if="expandedResultIds.has(result.id)"
                    class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs text-foreground/85"
                  >{{ result.response_text }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      :title="t('admin.scheduledTests.deletePlan')"
      :message="t('admin.scheduledTests.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import Select, { type SelectOption } from '@/components/common/Select.vue'
import Input from '@/components/common/Input.vue'
import { Icon } from '@/components/icons'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/format'
import type { ScheduledTestPlan, ScheduledTestResult } from '@/types'

const { t } = useI18n()
const appStore = useAppStore()

const props = defineProps<{
  show: boolean
  accountId: number | null
  modelOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// State
const loading = ref(false)
const creating = ref(false)
const loadingResults = ref(false)
const plans = ref<ScheduledTestPlan[]>([])
const results = ref<ScheduledTestResult[]>([])
const expandedPlanId = ref<number | null>(null)
const expandedResultIds = reactive(new Set<number>())
const showAddForm = ref(false)
const showDeleteConfirm = ref(false)
const deletingPlan = ref<ScheduledTestPlan | null>(null)
const editingPlanId = ref<number | null>(null)
const updating = ref(false)
const editForm = reactive({
  model_id: '' as string,
  cron_expression: '' as string,
  max_results: '100' as string,
  enabled: true,
  auto_recover: false
})

const newPlan = reactive({
  model_id: '' as string,
  cron_expression: '' as string,
  max_results: '100' as string,
  enabled: true,
  auto_recover: false
})

const resetNewPlan = () => {
  newPlan.model_id = ''
  newPlan.cron_expression = ''
  newPlan.max_results = '100'
  newPlan.enabled = true
  newPlan.auto_recover = false
}

// Load plans when dialog opens
watch(
  () => props.show,
  async (visible) => {
    if (visible && props.accountId) {
      await loadPlans()
    } else {
      plans.value = []
      results.value = []
      expandedPlanId.value = null
      expandedResultIds.clear()
      showAddForm.value = false
      showDeleteConfirm.value = false
    }
  }
)

const loadPlans = async () => {
  if (!props.accountId) return
  loading.value = true
  try {
    plans.value = await adminAPI.scheduledTests.listByAccount(props.accountId)
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to load plans')
  } finally {
    loading.value = false
  }
}

const handleCreate = async () => {
  if (!props.accountId || !newPlan.model_id || !newPlan.cron_expression) return
  creating.value = true
  try {
    const maxResults = Number(newPlan.max_results) || 100
    await adminAPI.scheduledTests.create({
      account_id: props.accountId,
      model_id: newPlan.model_id,
      cron_expression: newPlan.cron_expression,
      enabled: newPlan.enabled,
      max_results: maxResults,
      auto_recover: newPlan.auto_recover
    })
    appStore.showSuccess(t('admin.scheduledTests.createSuccess'))
    showAddForm.value = false
    resetNewPlan()
    await loadPlans()
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to create plan')
  } finally {
    creating.value = false
  }
}

const handleToggleEnabled = async (plan: ScheduledTestPlan, enabled: boolean) => {
  try {
    const updated = await adminAPI.scheduledTests.update(plan.id, { enabled })
    const index = plans.value.findIndex((p) => p.id === plan.id)
    if (index !== -1) {
      plans.value[index] = updated
    }
    appStore.showSuccess(t('admin.scheduledTests.updateSuccess'))
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to update plan')
  }
}

const startEdit = (plan: ScheduledTestPlan) => {
  editingPlanId.value = plan.id
  editForm.model_id = plan.model_id
  editForm.cron_expression = plan.cron_expression
  editForm.max_results = String(plan.max_results)
  editForm.enabled = plan.enabled
  editForm.auto_recover = plan.auto_recover
}

const cancelEdit = () => {
  editingPlanId.value = null
}

const handleEdit = async () => {
  if (!editingPlanId.value || !editForm.model_id || !editForm.cron_expression) return
  updating.value = true
  try {
    const updated = await adminAPI.scheduledTests.update(editingPlanId.value, {
      model_id: editForm.model_id,
      cron_expression: editForm.cron_expression,
      max_results: Number(editForm.max_results) || 100,
      enabled: editForm.enabled,
      auto_recover: editForm.auto_recover
    })
    const index = plans.value.findIndex((p) => p.id === editingPlanId.value)
    if (index !== -1) {
      plans.value[index] = updated
    }
    appStore.showSuccess(t('admin.scheduledTests.updateSuccess'))
    editingPlanId.value = null
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to update plan')
  } finally {
    updating.value = false
  }
}

const confirmDeletePlan = (plan: ScheduledTestPlan) => {
  deletingPlan.value = plan
  showDeleteConfirm.value = true
}

const handleDelete = async () => {
  if (!deletingPlan.value) return
  try {
    await adminAPI.scheduledTests.delete(deletingPlan.value.id)
    appStore.showSuccess(t('admin.scheduledTests.deleteSuccess'))
    plans.value = plans.value.filter((p) => p.id !== deletingPlan.value!.id)
    if (expandedPlanId.value === deletingPlan.value.id) {
      expandedPlanId.value = null
      results.value = []
    }
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to delete plan')
  } finally {
    showDeleteConfirm.value = false
    deletingPlan.value = null
  }
}

const toggleExpand = async (planId: number) => {
  if (expandedPlanId.value === planId) {
    expandedPlanId.value = null
    results.value = []
    expandedResultIds.clear()
    return
  }

  expandedPlanId.value = planId
  expandedResultIds.clear()
  loadingResults.value = true
  try {
    results.value = await adminAPI.scheduledTests.listResults(planId, 20)
  } catch (error: any) {
    appStore.showError(error?.message || 'Failed to load results')
    results.value = []
  } finally {
    loadingResults.value = false
  }
}

const toggleResultDetail = (resultId: number) => {
  if (expandedResultIds.has(resultId)) {
    expandedResultIds.delete(resultId)
  } else {
    expandedResultIds.add(resultId)
  }
}
</script>
