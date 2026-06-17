<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div v-if="loading" class="flex flex-1 items-center justify-center py-7" role="status" aria-label="加载中">
      <div class="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true"></div>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-auto border-b border-border">
        <table class="w-full border-collapse text-[11.5px]">
          <thead class="sticky top-0 z-10 bg-muted">
            <tr>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.time') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.type') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.endpoint') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.platform') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.model') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.group') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.user') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.apiKey') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.account') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.status') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.message') }}</th>
              <th class="border-b border-border px-3 py-[7px] text-right text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.ops.errorLog.action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td colspan="12" class="px-9 py-9 text-center text-[13px] text-muted-foreground">{{ t('admin.ops.errorLog.noErrors') }}</td>
            </tr>
            <tr v-for="log in rows" :key="log.id" class="cursor-pointer border-b border-border last:border-b-0" @click="emit('openErrorDetail', log.id)">
              <!-- Time -->
              <td class="whitespace-nowrap px-3 py-[7px]">
                <TooltipProvider>
                  <Tooltip :delay-duration="500">
                    <TooltipTrigger as-child>
                      <span class="font-mono tabular-nums text-[11px] text-foreground">{{ formatDateTime(log.created_at).split(' ')[1] }}</span>
                    </TooltipTrigger>
                    <TooltipContent>{{ log.request_id || log.client_request_id }}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>
              <!-- Type -->
              <td class="whitespace-nowrap px-3 py-[7px]">
                <span :class="getTypeBadge(log).className">{{ getTypeBadge(log).label }}</span>
              </td>
              <!-- Endpoint -->
              <td class="px-3 py-[7px]">
                <div class="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                  <TooltipProvider v-if="log.inbound_endpoint">
                    <Tooltip :delay-duration="500">
                      <TooltipTrigger as-child>
                        <span class="font-mono tabular-nums text-[10.5px] text-muted-foreground">{{ log.inbound_endpoint }}</span>
                      </TooltipTrigger>
                      <TooltipContent>{{ formatEndpointTooltip(log) }}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span v-else class="text-muted-foreground">-</span>
                </div>
              </td>
              <!-- Platform -->
              <td class="whitespace-nowrap px-3 py-[7px]">
                <Badge variant="outline" class="rounded-full text-[9.5px] font-semibold uppercase text-muted-foreground bg-muted border-border">{{ log.platform || '-' }}</Badge>
              </td>
              <!-- Model -->
              <td class="px-3 py-[7px]">
                <div class="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                  <template v-if="hasModelMapping(log)">
                    <TooltipProvider>
                      <Tooltip :delay-duration="500">
                        <TooltipTrigger as-child>
                          <span class="flex items-center gap-[3px] font-mono tabular-nums text-[10.5px] text-muted-foreground">
                            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ log.requested_model }}</span>
                            <span class="shrink-0 text-muted-foreground">→</span>
                            <span class="overflow-hidden text-ellipsis whitespace-nowrap text-primary">{{ log.upstream_model }}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{{ modelMappingTooltip(log) }}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </template>
                  <template v-else>
                    <span v-if="displayModel(log)" class="block overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[10.5px] text-muted-foreground" :title="displayModel(log)">{{ displayModel(log) }}</span>
                    <span v-else class="text-muted-foreground">-</span>
                  </template>
                </div>
              </td>
              <!-- Group -->
              <td class="px-3 py-[7px]">
                <TooltipProvider v-if="log.group_id">
                  <Tooltip :delay-duration="500">
                    <TooltipTrigger as-child>
                      <span class="block max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium text-foreground">{{ log.group_name || '-' }}</span>
                    </TooltipTrigger>
                    <TooltipContent>{{ t('admin.ops.errorLog.id') + ' ' + log.group_id }}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span v-else class="text-muted-foreground">-</span>
              </td>
              <!-- User -->
              <td class="px-3 py-[7px]">
                <TooltipProvider v-if="log.user_id">
                  <Tooltip :delay-duration="500">
                    <TooltipTrigger as-child>
                      <span class="block max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium text-foreground">{{ log.user_email || '-' }}</span>
                    </TooltipTrigger>
                    <TooltipContent>{{ t('admin.ops.errorLog.userId') + ' ' + log.user_id }}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span v-else class="text-muted-foreground">-</span>
              </td>
              <!-- API Key -->
              <td class="px-3 py-[7px]">
                <div v-if="log.api_key_id || log.api_key_name" class="flex max-w-[140px] items-center gap-1">
                  <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium text-foreground" :title="log.api_key_name || ('#' + log.api_key_id)">{{ log.api_key_name || ('#' + log.api_key_id) }}</span>
                  <Badge v-if="log.api_key_deleted" variant="outline" class="shrink-0 rounded-full text-[9px] font-semibold bg-destructive/15 text-destructive border-transparent">{{ t('admin.ops.errorLog.keyDeletedBadge') }}</Badge>
                </div>
                <span v-else class="text-muted-foreground">-</span>
              </td>
              <!-- Account -->
              <td class="px-3 py-[7px]">
                <TooltipProvider v-if="log.account_id">
                  <Tooltip :delay-duration="500">
                    <TooltipTrigger as-child>
                      <span class="block max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium text-foreground">{{ log.account_name || '-' }}</span>
                    </TooltipTrigger>
                    <TooltipContent>{{ t('admin.ops.errorLog.accountId') + ' ' + log.account_id }}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span v-else class="text-muted-foreground">-</span>
              </td>
              <!-- Status -->
              <td class="whitespace-nowrap px-3 py-[7px]">
                <div class="flex items-center gap-1">
                  <span :class="getStatusClass(log.status_code)">{{ log.status_code }}</span>
                  <span v-if="log.severity" :class="['od-badge', getSeverityClass(log.severity)]">{{ log.severity }}</span>
                  <Badge v-if="log.request_type != null && log.request_type > 0" variant="outline" class="rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border-border">{{ formatRequestType(log.request_type) }}</Badge>
                </div>
              </td>
              <!-- Message -->
              <td class="px-3 py-[7px]">
                <div class="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                  <p class="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] font-medium text-muted-foreground" :title="log.message">{{ formatSmartMessage(log.message) || '-' }}</p>
                </div>
              </td>
              <!-- Actions -->
              <td class="whitespace-nowrap px-3 py-[7px] text-right" @click.stop>
                <Button type="button" variant="ghost" size="sm" class="h-auto px-2 py-0.5 text-[10px] text-primary" @click="emit('openErrorDetail', log.id)">{{ t('admin.ops.errorLog.details') }}</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bg-muted">
        <Pagination v-if="total > 0" :total="total" :page="page" :page-size="pageSize" @update:page="emit('update:page', $event)" @update:pageSize="emit('update:pageSize', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* od-badge* classes are returned by script functions (getStatusClass / getTypeBadge / getSeverityClass)
   and cannot be changed without touching the script block. Redefined here using semantic tokens — no QUENCH vars. */
.od-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 100px;
  font-size: 10px;
  font-weight: 600;
}
.od-badge-ok {
  background: hsl(var(--success) / 0.12);
  border: 1px solid hsl(var(--success) / 0.35);
  color: hsl(var(--success));
}
.od-badge-warn {
  background: hsl(38 92% 60% / 0.12);
  border: 1px solid hsl(38 92% 60% / 0.35);
  color: hsl(38 92% 50%);
}
.od-badge-bad {
  background: hsl(var(--destructive) / 0.12);
  border: 1px solid hsl(var(--destructive) / 0.35);
  color: hsl(var(--destructive));
}
.od-badge-dim {
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--muted-foreground));
}
.od-badge-azure {
  background: hsl(var(--primary) / 0.12);
  border: 1px solid hsl(var(--primary) / 0.35);
  color: hsl(var(--primary));
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Pagination from '@/components/common/Pagination.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { OpsErrorLog } from '@/api/admin/ops'
import { getSeverityClass, formatDateTime } from '../utils/opsFormatters'

const { t } = useI18n()

function isUpstreamRow(log: OpsErrorLog): boolean {
  const phase = String(log.phase || '').toLowerCase()
  const owner = String(log.error_owner || '').toLowerCase()
  return phase === 'upstream' && owner === 'provider'
}

function formatEndpointTooltip(log: OpsErrorLog): string {
  const parts: string[] = []
  if (log.inbound_endpoint) parts.push(`Inbound: ${log.inbound_endpoint}`)
  if (log.upstream_endpoint) parts.push(`Upstream: ${log.upstream_endpoint}`)
  return parts.join('\n') || ''
}

function hasModelMapping(log: OpsErrorLog): boolean {
  const requested = String(log.requested_model || '').trim()
  const upstream = String(log.upstream_model || '').trim()
  return !!requested && !!upstream && requested !== upstream
}

function modelMappingTooltip(log: OpsErrorLog): string {
  const requested = String(log.requested_model || '').trim()
  const upstream = String(log.upstream_model || '').trim()
  if (!requested && !upstream) return ''
  if (requested && upstream) return `${requested} → ${upstream}`
  return upstream || requested
}

function displayModel(log: OpsErrorLog): string {
  const upstream = String(log.upstream_model || '').trim()
  if (upstream) return upstream
  const requested = String(log.requested_model || '').trim()
  if (requested) return requested
  return String(log.model || '').trim()
}

function formatRequestType(type: number | null | undefined): string {
  switch (type) {
    case 1: return t('admin.ops.errorLog.requestTypeSync')
    case 2: return t('admin.ops.errorLog.requestTypeStream')
    case 3: return t('admin.ops.errorLog.requestTypeWs')
    default: return ''
  }
}

function getTypeBadge(log: OpsErrorLog): { label: string; className: string } {
  const phase = String(log.phase || '').toLowerCase()
  const owner = String(log.error_owner || '').toLowerCase()

  if (isUpstreamRow(log)) {
    return { label: t('admin.ops.errorLog.typeUpstream'), className: 'od-badge od-badge-bad' }
  }
  if (phase === 'request' && owner === 'client') {
    return { label: t('admin.ops.errorLog.typeRequest'), className: 'od-badge od-badge-warn' }
  }
  if (phase === 'auth' && owner === 'client') {
    return { label: t('admin.ops.errorLog.typeAuth'), className: 'od-badge od-badge-azure' }
  }
  if (phase === 'routing' && owner === 'platform') {
    return { label: t('admin.ops.errorLog.typeRouting'), className: 'od-badge od-badge-dim' }
  }
  if (phase === 'internal' && owner === 'platform') {
    return { label: t('admin.ops.errorLog.typeInternal'), className: 'od-badge od-badge-dim' }
  }

  const fallback = phase || owner || t('common.unknown')
  return { label: fallback, className: 'od-badge od-badge-dim' }
}

interface Props {
  rows: OpsErrorLog[]
  total: number
  loading: boolean
  page: number
  pageSize: number
}

interface Emits {
  (e: 'openErrorDetail', id: number): void
  (e: 'update:page', value: number): void
  (e: 'update:pageSize', value: number): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

function getStatusClass(code: number): string {
  if (code >= 500) return 'od-badge od-badge-bad'
  if (code === 429) return 'od-badge od-badge-warn'
  if (code >= 400) return 'od-badge od-badge-warn'
  return 'od-badge od-badge-dim'
}

function formatSmartMessage(msg: string): string {
  if (!msg) return ''

  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const obj = JSON.parse(msg)
      if (obj?.error?.message) return String(obj.error.message)
      if (obj?.message) return String(obj.message)
      if (obj?.detail) return String(obj.detail)
      if (typeof obj === 'object') return JSON.stringify(obj).substring(0, 150)
    } catch {
      // ignore parse error
    }
  }

  if (msg.includes('context deadline exceeded')) return t('admin.ops.errorLog.commonErrors.contextDeadlineExceeded')
  if (msg.includes('connection refused')) return t('admin.ops.errorLog.commonErrors.connectionRefused')
  if (msg.toLowerCase().includes('rate limit')) return t('admin.ops.errorLog.commonErrors.rateLimit')

  return msg.length > 200 ? msg.substring(0, 200) + '...' : msg

}
</script>
