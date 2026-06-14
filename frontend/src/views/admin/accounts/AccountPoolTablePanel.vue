<template>
  <!-- 表格模式面板，对齐旧视图全量列能力 -->
  <div class="flex flex-col gap-2">
    <!-- 批量操作 Bar（进度条 + 快捷按钮） -->
    <div
      v-if="selectedIds.length > 0 || bulkDeleteProgress"
      class="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-2.5 shadow-sm"
    >
      <div class="flex items-center gap-2 text-[13px] text-foreground">
        {{ t('admin.accountTablePanel.bulkSelected', { n: selectedIds.length }) }}
        <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="$emit('select-page')">{{ t('admin.accountTablePanel.bulkSelectPage') }}</Button>
        <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="$emit('clear-selection')">{{ t('admin.accountTablePanel.bulkClear') }}</Button>
      </div>
      <div class="ml-auto flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          class="text-destructive border-destructive/40 hover:bg-destructive/10"
          @click="$emit('bulk-delete')"
        >{{ t('admin.accountTablePanel.bulkDelete') }}</Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          @click="$emit('bulk-reset-status')"
        >{{ t('admin.accountTablePanel.bulkResetStatus') }}</Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          @click="$emit('bulk-refresh-token')"
        >{{ t('admin.accountTablePanel.bulkRefreshToken') }}</Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          @click="$emit('bulk-toggle-schedulable', true)"
        >{{ t('admin.accountTablePanel.bulkEnableSchedule') }}</Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          @click="$emit('bulk-toggle-schedulable', false)"
        >{{ t('admin.accountTablePanel.bulkDisableSchedule') }}</Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!!bulkDeleteProgress"
          class="text-primary border-primary/40 hover:bg-primary/10"
          @click="$emit('bulk-edit-selected')"
        >{{ t('admin.accountTablePanel.bulkEdit') }}</Button>
      </div>
      <!-- 进度条 -->
      <div v-if="bulkDeleteProgress" class="mt-0.5 flex w-full items-center gap-2">
        <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-destructive transition-[width] duration-300"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <span class="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{{ bulkDeleteProgress.current }}/{{ bulkDeleteProgress.total }}</span>
      </div>
    </div>

    <!-- DataTableV2 -->
    <DataTableV2
      :columns="(columns as any)"
      :rows="(accounts as any[])"
      :total="total"
      :loading="loading"
      :selectable="true"
      row-key="id"
      :page="page"
      :page-size="pageSize"
      :sort="sortBy"
      :order="sortOrder"
      @update:page="$emit('update:page', $event)"
      @update:sort="$emit('update:sort', $event)"
      @update:order="$emit('update:order', $event)"
      @update:selected="onSelected"
    >
      <!-- 账号名 + 平台 chip -->
      <template #cell-name="{ row }">
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate text-[13px] font-medium text-foreground">{{ row.name }}</span>
            <PlatformTypeBadge
              :platform="(row as any).platform"
              :type="(row as any).type"
              :plan-type="(row as any).credentials?.plan_type"
              :privacy-mode="(row as any).extra?.privacy_mode"
              :compact="true"
            />
          </div>
          <span v-if="accountEmail(row)" class="truncate text-[10px] text-muted-foreground">{{ accountEmail(row) }}</span>
        </div>
      </template>

      <!-- 容量 -->
      <template #cell-capacity="{ row }">
        <AccountCapacityCell :account="(row as any)" />
      </template>

      <!-- 状态 -->
      <template #cell-status="{ row }">
        <AccountStatusIndicator
          :account="(row as any)"
          @show-temp-unsched="$emit('show-temp-unsched', $event)"
        />
      </template>

      <!-- 调度开关 -->
      <template #cell-schedulable="{ row }">
        <Switch
          :checked="row.schedulable"
          :disabled="togglingSchedulable === row.id"
          :title="row.schedulable ? t('admin.accountTablePanel.scheduleEnabled') : t('admin.accountTablePanel.scheduleDisabled')"
          @click="$emit('toggle-schedulable', row)"
        />
      </template>

      <!-- 分组 -->
      <template #cell-groups="{ row }">
        <AccountGroupsCell :groups="(row as any).groups" :max-display="3" />
      </template>

      <!-- 用量窗口 -->
      <template #cell-usage="{ row }">
        <AccountUsageCell
          :account="(row as any)"
          :today-stats="todayStatsByAccountId[String(row.id)] ?? null"
          :today-stats-loading="todayStatsLoading"
          :manual-refresh-token="manualRefreshToken"
        />
      </template>

      <!-- 今日统计 -->
      <template #cell-today_stats="{ row }">
        <AccountTodayStatsCell
          :stats="todayStatsByAccountId[String(row.id)] ?? null"
          :loading="todayStatsLoading"
          :error="null"
        />
      </template>

      <!-- 代理 -->
      <template #cell-proxy="{ row }">
        <div v-if="row.proxy" class="flex items-center gap-1 text-[12px] text-foreground">
          <span>{{ (row.proxy as any).name }}</span>
          <span v-if="(row.proxy as any).country_code" class="text-muted-foreground">({{ (row.proxy as any).country_code }})</span>
        </div>
        <span v-else class="text-[12px] text-muted-foreground">-</span>
      </template>

      <!-- 优先级 -->
      <template #cell-priority="{ value }">
        <span class="font-mono text-[12px] text-foreground">{{ value }}</span>
      </template>

      <!-- 倍率 -->
      <template #cell-rate_multiplier="{ value }">
        <span class="font-mono text-[12px] text-foreground">{{ ((value as number | null) ?? 1).toFixed(2) }}x</span>
      </template>

      <!-- 最后使用 -->
      <template #cell-last_used_at="{ value }">
        <span class="text-[11px] text-muted-foreground">{{ formatRelativeTime(value as string | null) }}</span>
      </template>

      <!-- 创建时间 -->
      <template #cell-created_at="{ value }">
        <span class="text-[11px] text-muted-foreground">{{ formatDateTime(value as string | Date | null | undefined) }}</span>
      </template>

      <!-- 操作列 -->
      <template #cell-actions="{ row }">
        <div class="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" class="h-[26px] w-[26px]" :title="t('admin.accountTablePanel.editBtn')" :aria-label="t('admin.accountTablePanel.editBtn')" @click="$emit('edit', row)">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </Button>
          <Button variant="ghost" size="icon" class="h-[26px] w-[26px] hover:bg-destructive/10 hover:text-destructive" :title="t('admin.accountTablePanel.deleteBtn')" :aria-label="t('admin.accountTablePanel.deleteBtn')" @click="$emit('delete', row)">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </Button>
          <Button variant="ghost" size="icon" class="h-[26px] w-[26px]" :title="t('admin.accountTablePanel.moreBtn')" :aria-label="t('admin.accountTablePanel.moreBtn')" @click="$emit('more', row, $event)">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>
          </Button>
        </div>
      </template>
    </DataTableV2>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account, AdminGroup, WindowStats } from '@/types'
import { DataTableV2 } from '@/components/datatable'
import type { ColumnDef } from '@/components/datatable'
import PlatformTypeBadge from '@/components/common/PlatformTypeBadge.vue'
import AccountCapacityCell from '@/components/account/AccountCapacityCell.vue'
import AccountStatusIndicator from '@/components/account/AccountStatusIndicator.vue'
import AccountUsageCell from '@/components/account/AccountUsageCell.vue'
import AccountTodayStatsCell from '@/components/account/AccountTodayStatsCell.vue'
import AccountGroupsCell from '@/components/account/AccountGroupsCell.vue'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  accounts: Account[]
  groups: AdminGroup[]
  total: number
  loading?: boolean
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  selectedIds: number[]
  bulkDeleteProgress: { current: number; total: number } | null
  todayStatsByAccountId: Record<string, WindowStats>
  todayStatsLoading?: boolean
  manualRefreshToken?: number
  togglingSchedulable: number | null
}>()

const emit = defineEmits<{
  'edit': [account: any]
  'delete': [account: any]
  'more': [account: any, event: MouseEvent]
  'show-temp-unsched': [account: Account]
  'toggle-schedulable': [account: any]
  'update:selectedIds': [ids: number[]]
  'update:page': [page: number]
  'update:sort': [sort: string]
  'update:order': [order: 'asc' | 'desc']
  'bulk-delete': []
  'bulk-reset-status': []
  'bulk-refresh-token': []
  'bulk-toggle-schedulable': [schedulable: boolean]
  'bulk-edit-selected': []
  'select-page': []
  'clear-selection': []
}>()

const { t } = useI18n()

const columns = computed<ColumnDef<Record<string, unknown>>[]>(() => [
  { key: 'name',            title: t('admin.accountTablePanel.colName'),        sortable: true  },
  { key: 'capacity',        title: t('admin.accountTablePanel.colCapacity')                     },
  { key: 'status',          title: t('admin.accountTablePanel.colStatus'),      sortable: true,  width: '90px' },
  { key: 'schedulable',     title: '⚙',                                         sortable: true,  width: '44px' },
  { key: 'groups',          title: t('admin.accountTablePanel.colGroups')                       },
  { key: 'usage',           title: t('admin.accountTablePanel.colUsage'),                       width: '280px' },
  { key: 'today_stats',     title: t('admin.accountTablePanel.colTodayStats')                   },
  { key: 'proxy',           title: t('admin.accountTablePanel.colProxy')                        },
  { key: 'priority',        title: t('admin.accountTablePanel.colPriority'),    sortable: true,  width: '70px', align: 'right' },
  { key: 'rate_multiplier', title: t('admin.accountTablePanel.colMultiplier'),  sortable: true,  width: '70px', align: 'right' },
  { key: 'last_used_at',    title: t('admin.accountTablePanel.colLastUsed'),    sortable: true,  width: '110px' },
  { key: 'created_at',      title: t('admin.accountTablePanel.colCreatedAt'),   sortable: true,  width: '110px' },
  { key: 'actions',         title: '',                                                           width: '88px' },
])

const progressPercent = computed(() => {
  if (!props.bulkDeleteProgress) return 0
  const { current, total } = props.bulkDeleteProgress
  if (total <= 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
})

function accountEmail(row: any): string {
  return row.extra?.email_address || row.extra?.email || row.credentials?.email || ''
}

function onSelected(rows: Record<string, unknown>[]) {
  const ids = rows.map(r => r['id'] as number)
  emit('update:selectedIds', ids)
}
</script>
