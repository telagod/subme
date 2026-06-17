<template>
  <div class="flex flex-col gap-3.5">
    <!-- 汇总卡 -->
    <div class="grid grid-cols-3 gap-2" v-if="!statsLoading && !statsError">
      <Card class="flex flex-col gap-[3px] px-3.5 py-[11px] shadow-none">
        <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userTabs.usageTotalRequests') }}</span>
        <span class="text-sm font-bold text-foreground">{{ stats.total_requests.toLocaleString() }}</span>
      </Card>
      <Card class="flex flex-col gap-[3px] px-3.5 py-[11px] shadow-none">
        <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userTabs.usageTotalCost') }}</span>
        <span class="text-sm font-bold text-emerald-500">${{ stats.total_cost.toFixed(4) }}</span>
      </Card>
      <Card class="flex flex-col gap-[3px] px-3.5 py-[11px] shadow-none">
        <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userTabs.usageTotalTokens') }}</span>
        <span class="text-sm font-bold text-foreground">{{ stats.total_tokens.toLocaleString() }}</span>
      </Card>
    </div>

    <div v-if="loading" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.loading') }}</div>
    <div v-else-if="error" class="text-[12.5px] text-destructive">{{ error }}</div>
    <div v-else-if="!items.length" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.usageNoRecords') }}</div>
    <div v-else class="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="whitespace-nowrap text-[10.5px]">{{ t('admin.userTabs.usageColTime') }}</TableHead>
            <TableHead class="whitespace-nowrap text-[10.5px]">{{ t('admin.userTabs.usageColModel') }}</TableHead>
            <TableHead class="whitespace-nowrap text-[10.5px]">{{ t('admin.userTabs.usageColCost') }}</TableHead>
            <TableHead class="whitespace-nowrap text-[10.5px]">{{ t('admin.userTabs.usageColToken') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in items" :key="row.id">
            <TableCell class="text-[11.5px] text-muted-foreground">{{ fmt(row.created_at) }}</TableCell>
            <TableCell class="text-[11.5px] font-mono">{{ row.model }}</TableCell>
            <TableCell class="text-[11.5px] text-emerald-500">${{ row.total_cost?.toFixed(6) ?? '-' }}</TableCell>
            <TableCell class="text-[11.5px]">{{ ((row.input_tokens || 0) + (row.output_tokens || 0)).toLocaleString() }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <div v-if="total > items.length" class="text-center text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.totalCountPartial', { total, shown: items.length }) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser, AdminUsageLog } from '@/types'
import type { AdminUsageStatsResponse } from '@/api/admin/usage'
import { formatDateTime } from '@/utils/format'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card } from '@/components/ui/card'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser; active: boolean }>()

const loading = ref(false)
const error = ref<string | null>(null)
const statsLoading = ref(false)
const statsError = ref<string | null>(null)
const items = ref<AdminUsageLog[]>([])
const total = ref(0)
const loaded = ref(false)
const stats = ref<AdminUsageStatsResponse>({
  total_requests: 0, total_input_tokens: 0, total_output_tokens: 0,
  total_cache_tokens: 0, total_tokens: 0, total_cost: 0,
  total_actual_cost: 0, total_account_cost: 0, average_duration_ms: 0
})

function fmt(iso: string | null | undefined) { return iso ? formatDateTime(iso) : '-' }

async function load() {
  if (loaded.value) return
  loading.value = true; error.value = null
  statsLoading.value = true; statsError.value = null
  try {
    const [listRes, statsRes] = await Promise.all([
      adminAPI.usage.list({ user_id: props.user.id, page: 1, page_size: 20 }),
      adminAPI.usage.getStats({ user_id: props.user.id })
    ])
    items.value = listRes.items; total.value = listRes.total
    stats.value = statsRes
    loaded.value = true
  } catch { error.value = t('admin.userTabs.loadFailed'); statsError.value = t('admin.userTabs.usageStatsFailed') } finally {
    loading.value = false; statsLoading.value = false
  }
}

watch(() => props.active, (v) => { if (v) load() })
onMounted(() => { if (props.active) load() })
</script>
