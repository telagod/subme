<template>
  <BaseDialog :show="show" :title="title" width="full" :close-on-click-outside="true" @close="close">
    <div v-if="loading" class="flex flex-col items-center justify-center gap-2.5 py-14" role="status" :aria-label="t('admin.ops.errorDetail.loading')">
      <div class="h-7 w-7 animate-spin rounded-full border-2 border-transparent border-b-primary" aria-hidden="true"></div>
      <div class="text-[13px] text-muted-foreground" aria-hidden="true">{{ t('admin.ops.errorDetail.loading') }}</div>
    </div>

    <div v-else-if="!detail" class="py-9 text-center text-[13px] text-muted-foreground">{{ emptyText }}</div>

    <div v-else class="flex flex-col gap-4 p-5">
      <!-- Summary grid -->
      <div class="grid grid-cols-4 gap-2.5">
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.requestId') }}</div>
          <div class="mt-0.5 text-base font-black font-mono tabular-nums" style="word-break:break-all;">{{ requestId || '—' }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.time') }}</div>
          <div class="mt-0.5 text-base font-black">{{ formatDateTime(detail.created_at) }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ isUpstreamError(detail) ? t('admin.ops.errorDetail.account') : t('admin.ops.errorDetail.user') }}</div>
          <div class="mt-0.5 text-base font-black">
            <template v-if="isUpstreamError(detail)">{{ detail.account_name || (detail.account_id != null ? String(detail.account_id) : '—') }}</template>
            <template v-else>{{ detail.user_email || (detail.user_id != null ? String(detail.user_id) : '—') }}</template>
          </div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.platform') }}</div>
          <div class="mt-0.5 text-base font-black">{{ detail.platform || '—' }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.group') }}</div>
          <div class="mt-0.5 text-base font-black">{{ detail.group_name || (detail.group_id != null ? String(detail.group_id) : '—') }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.model') }}</div>
          <div class="mt-0.5 text-base font-black">
            <template v-if="hasModelMapping(detail)">
              <span class="font-mono tabular-nums">{{ detail.requested_model }}</span>
              <span class="mx-1 text-muted-foreground">→</span>
              <span class="font-mono tabular-nums text-primary">{{ detail.upstream_model }}</span>
            </template>
            <template v-else>{{ displayModel(detail) || '—' }}</template>
          </div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.inboundEndpoint') }}</div>
          <div class="mt-0.5 text-base font-black font-mono tabular-nums" style="word-break:break-all;">{{ detail.inbound_endpoint || '—' }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.upstreamEndpoint') }}</div>
          <div class="mt-0.5 text-base font-black font-mono tabular-nums" style="word-break:break-all;">{{ detail.upstream_endpoint || '—' }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.status') }}</div>
          <div class="mt-1">
            <Badge :class="statusBadgeClass">{{ detail.status_code }}</Badge>
          </div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.requestType') }}</div>
          <div class="mt-0.5 text-base font-black">{{ formatRequestTypeLabel(detail.request_type) }}</div>
        </div>
        <div class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.message') }}</div>
          <div class="mt-0.5 text-base font-black overflow-hidden text-ellipsis whitespace-nowrap" :title="detail.message">{{ detail.message || '—' }}</div>
        </div>
        <div v-if="detail.api_key_prefix" class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.apiKeyPrefix') }}</div>
          <div class="mt-0.5 text-base font-black font-mono tabular-nums">{{ detail.api_key_prefix }}</div>
        </div>
        <div v-if="detail.attempted_key_prefix" class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.attemptedKeyPrefix') }}</div>
          <div class="mt-0.5 text-base font-black font-mono tabular-nums">{{ detail.attempted_key_prefix }}</div>
        </div>
        <div v-if="detail.deleted_key_owner_email" class="rounded-[10px] border border-border bg-card p-3">
          <div class="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorDetail.deletedKeyOwner') }}</div>
          <div class="mt-0.5 text-base font-black">
            {{ detail.deleted_key_owner_email }}
            <span v-if="detail.deleted_key_name" class="ml-1 text-[11px] text-muted-foreground">({{ detail.deleted_key_name }})</span>
            <Badge variant="destructive" class="ml-1.5 text-[10px]">{{ t('admin.ops.errorDetail.keyDeletedBadge') }}</Badge>
          </div>
        </div>
      </div>

      <!-- Response Body -->
      <div class="rounded-xl border border-border bg-card p-4">
        <h3 class="text-[11.5px] font-bold uppercase tracking-[.05em] text-foreground">{{ t('admin.ops.errorDetail.responseBody') }}</h3>
        <pre class="mt-3 max-h-[480px] overflow-auto rounded-md border border-border bg-muted p-3.5 text-[11.5px] text-muted-foreground"><code>{{ prettyJSON(primaryResponseBody || '') }}</code></pre>
      </div>

      <!-- Upstream errors -->
      <div v-if="showUpstreamList" class="rounded-xl border border-border bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-[11.5px] font-bold uppercase tracking-[.05em] text-foreground">{{ t('admin.ops.errorDetails.upstreamErrors') }}</h3>
          <div v-if="correlatedUpstreamLoading" class="text-[11px] text-muted-foreground">{{ t('common.loading') }}</div>
        </div>
        <div v-if="!correlatedUpstreamLoading && !correlatedUpstreamErrors.length" class="mt-2.5 text-[13px] text-muted-foreground">{{ t('common.noData') }}</div>
        <div v-else class="mt-3 flex flex-col gap-2.5">
          <div v-for="(ev, idx) in correlatedUpstreamErrors" :key="ev.id" class="rounded-xl border border-border bg-card p-3.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-[12px] font-bold text-foreground">
                #{{ idx + 1 }}
                <Badge v-if="ev.type" variant="outline" class="ml-1.5 text-[10px] font-mono tabular-nums">{{ ev.type }}</Badge>
              </div>
              <div class="flex items-center gap-2">
                <div class="font-mono tabular-nums text-[11.5px] text-muted-foreground">{{ ev.status_code ?? '—' }}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px]"
                  :disabled="!getUpstreamResponsePreview(ev)"
                  :title="getUpstreamResponsePreview(ev) ? '' : t('common.noData')"
                  @click="toggleUpstreamDetail(ev.id)"
                >
                  <Icon :name="expandedUpstreamDetailIds.has(ev.id) ? 'chevronDown' : 'chevronRight'" size="xs" :stroke-width="2" />
                  {{ expandedUpstreamDetailIds.has(ev.id) ? t('admin.ops.errorDetail.responsePreview.collapse') : t('admin.ops.errorDetail.responsePreview.expand') }}
                </Button>
              </div>
            </div>
            <div class="mt-2.5 grid grid-cols-2 gap-1.5 text-[11.5px] text-muted-foreground">
              <div><span class="text-muted-foreground">{{ t('admin.ops.errorDetail.upstreamEvent.status') }}:</span><span class="ml-1 font-mono tabular-nums">{{ ev.status_code ?? '—' }}</span></div>
              <div><span class="text-muted-foreground">{{ t('admin.ops.errorDetail.upstreamEvent.requestId') }}:</span><span class="ml-1 font-mono tabular-nums">{{ ev.request_id || ev.client_request_id || '—' }}</span></div>
            </div>
            <div v-if="ev.message" class="mt-2 break-words text-[13px] font-medium text-foreground">{{ ev.message }}</div>
            <pre v-if="expandedUpstreamDetailIds.has(ev.id)" class="mt-2.5 max-h-[200px] overflow-auto rounded-md border border-border bg-muted p-2.5 text-[11px] text-muted-foreground"><code>{{ prettyJSON(getUpstreamResponsePreview(ev)) }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores'
import { opsAPI, type OpsErrorDetail } from '@/api/admin/ops'
import { formatDateTime } from '@/utils/format'
import { resolvePrimaryResponseBody, resolveUpstreamPayload } from '../utils/errorDetailResponse'

interface Props {
  show: boolean
  errorId: number | null
  errorType?: 'request' | 'upstream'
}

interface Emits {
  (e: 'update:show', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(false)
const detail = ref<OpsErrorDetail | null>(null)

const showUpstreamList = computed(() => props.errorType === 'request')

const requestId = computed(() => detail.value?.request_id || detail.value?.client_request_id || '')

const primaryResponseBody = computed(() => {
  return resolvePrimaryResponseBody(detail.value, props.errorType)
})




const title = computed(() => {
  if (!props.errorId) return t('admin.ops.errorDetail.title')
  return t('admin.ops.errorDetail.titleWithId', { id: String(props.errorId) })
})

const emptyText = computed(() => t('admin.ops.errorDetail.noErrorSelected'))

function isUpstreamError(d: OpsErrorDetail | null): boolean {
  if (!d) return false
  const phase = String(d.phase || '').toLowerCase()
  const owner = String(d.error_owner || '').toLowerCase()
  return phase === 'upstream' && owner === 'provider'
}

function formatRequestTypeLabel(type: number | null | undefined): string {
  switch (type) {
    case 1: return t('admin.ops.errorDetail.requestTypeSync')
    case 2: return t('admin.ops.errorDetail.requestTypeStream')
    case 3: return t('admin.ops.errorDetail.requestTypeWs')
    default: return t('admin.ops.errorDetail.requestTypeUnknown')
  }
}

function hasModelMapping(d: OpsErrorDetail | null): boolean {
  if (!d) return false
  const requested = String(d.requested_model || '').trim()
  const upstream = String(d.upstream_model || '').trim()
  return !!requested && !!upstream && requested !== upstream
}

function displayModel(d: OpsErrorDetail | null): string {
  if (!d) return ''
  const upstream = String(d.upstream_model || '').trim()
  if (upstream) return upstream
  const requested = String(d.requested_model || '').trim()
  if (requested) return requested
  return String(d.model || '').trim()
}

const correlatedUpstream = ref<OpsErrorDetail[]>([])
const correlatedUpstreamLoading = ref(false)

const correlatedUpstreamErrors = computed<OpsErrorDetail[]>(() => correlatedUpstream.value)

const expandedUpstreamDetailIds = ref(new Set<number>())

function getUpstreamResponsePreview(ev: OpsErrorDetail): string {
  const upstreamPayload = resolveUpstreamPayload(ev)
  if (upstreamPayload) return upstreamPayload
  return String(ev.error_body || '').trim()
}

function toggleUpstreamDetail(id: number) {
  const next = new Set(expandedUpstreamDetailIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedUpstreamDetailIds.value = next
}

async function fetchCorrelatedUpstreamErrors(requestErrorId: number) {
  correlatedUpstreamLoading.value = true
  try {
    const res = await opsAPI.listRequestErrorUpstreamErrors(
      requestErrorId,
      { page: 1, page_size: 100, view: 'all' },
      { include_detail: true }
    )
    correlatedUpstream.value = res.items || []
  } catch (err) {
    console.error('[OpsErrorDetailModal] Failed to load correlated upstream errors', err)
    correlatedUpstream.value = []
  } finally {
    correlatedUpstreamLoading.value = false
  }
}

function close() {
  emit('update:show', false)
}

function prettyJSON(raw?: string): string {
  if (!raw) return 'N/A'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

async function fetchDetail(id: number) {
  loading.value = true
  try {
    const kind = props.errorType || (detail.value?.phase === 'upstream' ? 'upstream' : 'request')
    const d = kind === 'upstream' ? await opsAPI.getUpstreamErrorDetail(id) : await opsAPI.getRequestErrorDetail(id)
    detail.value = d
  } catch (err: any) {
    detail.value = null
    appStore.showError(err?.message || t('admin.ops.failedToLoadErrorDetail'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.show, props.errorId] as const,
  ([show, id]) => {
    if (!show) {
      detail.value = null
      return
    }
    if (typeof id === 'number' && id > 0) {
      expandedUpstreamDetailIds.value = new Set()
      fetchDetail(id)
      if (props.errorType === 'request') {
        fetchCorrelatedUpstreamErrors(id)
      } else {
        correlatedUpstream.value = []
      }
    }
  },
  { immediate: true }
)

const statusBadgeClass = computed(() => {
  const code = detail.value?.status_code ?? 0
  if (code >= 500) return 'bg-destructive/10 border border-destructive/40 text-destructive'
  if (code === 429) return 'bg-amber-500/10 border border-amber-500/40 text-amber-500'
  if (code >= 400) return 'bg-amber-500/10 border border-amber-500/40 text-amber-500'
  return 'bg-muted border-border text-muted-foreground'
})

</script>
