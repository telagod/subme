<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Select from '@/components/common/Select.vue'
import OpsErrorLogTable from './OpsErrorLogTable.vue'
import { opsAPI, type OpsErrorLog } from '@/api/admin/ops'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  show: boolean
  timeRange: string
  platform?: string
  groupId?: number | null
  errorType: 'request' | 'upstream'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'openErrorDetail', errorId: number): void
}>()

const { t } = useI18n()


const loading = ref(false)
const rows = ref<OpsErrorLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const q = ref('')
const statusCode = ref<number | 'other' | null>(null)
const phase = ref<string>('')
const errorOwner = ref<string>('')
const viewMode = ref<'errors' | 'excluded' | 'all'>('errors')


const modalTitle = computed(() => {
  return props.errorType === 'upstream' ? t('admin.ops.errorDetails.upstreamErrors') : t('admin.ops.errorDetails.requestErrors')
})

const statusCodeSelectOptions = computed(() => {
  const codes = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504, 529]
  return [
    { value: null, label: t('common.all') },
    ...codes.map((c) => ({ value: c, label: String(c) })),
    { value: 'other', label: t('admin.ops.errorDetails.statusCodeOther') || 'Other' }
  ]
})

const ownerSelectOptions = computed(() => {
  return [
    { value: '', label: t('common.all') },
    { value: 'provider', label: t('admin.ops.errorDetails.owner.provider') || 'provider' },
    { value: 'client', label: t('admin.ops.errorDetails.owner.client') || 'client' },
    { value: 'platform', label: t('admin.ops.errorDetails.owner.platform') || 'platform' }
  ]
})


const viewModeSelectOptions = computed(() => {
  return [
    { value: 'errors', label: t('admin.ops.errorDetails.viewErrors') || 'errors' },
    { value: 'excluded', label: t('admin.ops.errorDetails.viewExcluded') || 'excluded' },
    { value: 'all', label: t('common.all') }
  ]
})

const phaseSelectOptions = computed(() => {
  const options = [
    { value: '', label: t('common.all') },
    { value: 'request', label: t('admin.ops.errorDetails.phase.request') || 'request' },
    { value: 'auth', label: t('admin.ops.errorDetails.phase.auth') || 'auth' },
    { value: 'routing', label: t('admin.ops.errorDetails.phase.routing') || 'routing' },
    { value: 'upstream', label: t('admin.ops.errorDetails.phase.upstream') || 'upstream' },
    { value: 'network', label: t('admin.ops.errorDetails.phase.network') || 'network' },
    { value: 'internal', label: t('admin.ops.errorDetails.phase.internal') || 'internal' }
  ]
  return options
})

function close() {
  emit('update:show', false)
}

async function fetchErrorLogs() {
  if (!props.show) return

  loading.value = true
  try {
    const params: Record<string, any> = {
      page: page.value,
      page_size: pageSize.value,
      time_range: props.timeRange,
      view: viewMode.value
    }

    const platform = String(props.platform || '').trim()
    if (platform) params.platform = platform
    if (typeof props.groupId === 'number' && props.groupId > 0) params.group_id = props.groupId

    if (q.value.trim()) params.q = q.value.trim()
    if (statusCode.value === 'other') params.status_codes_other = '1'
    else if (typeof statusCode.value === 'number') params.status_codes = String(statusCode.value)

    const phaseVal = String(phase.value || '').trim()
    if (phaseVal) params.phase = phaseVal

    const ownerVal = String(errorOwner.value || '').trim()
    if (ownerVal) params.error_owner = ownerVal


    const res = props.errorType === 'upstream'
      ? await opsAPI.listUpstreamErrors(params)
      : await opsAPI.listRequestErrors(params)
    rows.value = res.items || []
    total.value = res.total || 0
  } catch (err) {
    console.error('[OpsErrorDetailsModal] Failed to fetch error logs', err)
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

  function resetFilters() {
    q.value = ''
    statusCode.value = null
    phase.value = props.errorType === 'upstream' ? 'upstream' : ''
    errorOwner.value = ''
    viewMode.value = 'errors'
    page.value = 1
    fetchErrorLogs()
  }


watch(
  () => props.show,
  (open) => {
    if (!open) return
    page.value = 1
    pageSize.value = 10
    resetFilters()
  }
)

watch(
  () => [props.timeRange, props.platform, props.groupId] as const,
  () => {
    if (!props.show) return
    page.value = 1
    fetchErrorLogs()
  }
)

watch(
  () => [page.value, pageSize.value] as const,
  () => {
    if (!props.show) return
    fetchErrorLogs()
  }
)

let searchTimeout: number | null = null
watch(
  () => q.value,
  () => {
    if (!props.show) return
    if (searchTimeout) window.clearTimeout(searchTimeout)
    searchTimeout = window.setTimeout(() => {
      page.value = 1
      fetchErrorLogs()
    }, 350)
  }
)

watch(
  () => [statusCode.value, phase.value, errorOwner.value, viewMode.value] as const,
  () => {
    if (!props.show) return
    page.value = 1
    fetchErrorLogs()
  }
)
</script>

<template>
  <BaseDialog :show="show" :title="modalTitle" width="full" @close="close">
    <div style="display:flex;height:100%;min-height:0;flex-direction:column;">
      <!-- Filters -->
      <div class="mb-3 flex-shrink-0 border-b border-border pb-3">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;align-items:center;">
          <div style="position:relative;">
            <div style="pointer-events:none;position:absolute;inset-y:0;left:0;display:flex;align-items:center;padding-left:10px;">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="text-muted-foreground"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <Input v-model="q" type="text" class="h-[30px] pl-[30px] text-[11.5px]" :placeholder="t('admin.ops.errorDetails.searchPlaceholder')" />
          </div>
          <Select :model-value="statusCode" :options="statusCodeSelectOptions" @update:model-value="statusCode = $event as any" />
          <Select :model-value="phase" :options="phaseSelectOptions" @update:model-value="phase = String($event ?? '')" />
          <Select :model-value="errorOwner" :options="ownerSelectOptions" @update:model-value="errorOwner = String($event ?? '')" />
          <Select :model-value="viewMode" :options="viewModeSelectOptions" @update:model-value="viewMode = $event as any" />
          <Button type="button" variant="outline" size="sm" class="whitespace-nowrap text-[11px]" @click="resetFilters">{{ t('common.reset') }}</Button>
        </div>
      </div>

      <!-- Body -->
      <div style="display:flex;min-height:0;flex:1;flex-direction:column;">
        <div class="mb-1.5 flex-shrink-0 text-[11px] text-muted-foreground">{{ t('admin.ops.errorDetails.total') }} {{ total }}</div>
        <OpsErrorLogTable
          style="min-height:0;flex:1;"
          :rows="rows"
          :total="total"
          :loading="loading"
          :page="page"
          :page-size="pageSize"
          @openErrorDetail="emit('openErrorDetail', $event)"
          @update:page="page = $event"
          @update:pageSize="pageSize = $event"
        />
      </div>
    </div>
  </BaseDialog>
</template>

