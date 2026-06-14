<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="px-6 py-4 flex-shrink-0">
      <div class="flex flex-wrap items-end gap-4">
        <div class="min-w-[180px]">
          <Label class="mb-1 block">{{ t('usage.errors.model') }}</Label>
          <Select
            v-model="localModel"
            :options="modelOptions"
            searchable
            creatable
            clearable
            :placeholder="t('usage.errors.modelPlaceholder')"
            @change="apply"
          />
        </div>
        <div class="min-w-[160px]">
          <Label class="mb-1 block">{{ t('usage.errors.keyName') }}</Label>
          <Select
            v-model="localApiKeyId"
            :options="keyOptions"
            :placeholder="t('usage.errors.allKeys')"
            @change="apply"
          />
        </div>
        <div class="min-w-[140px]">
          <Label class="mb-1 block">{{ t('usage.errors.category') }}</Label>
          <Select
            v-model="localCategory"
            :options="categoryOptions"
            :placeholder="t('usage.errors.allCategories')"
            @change="apply"
          />
        </div>
        <Button variant="default" size="sm" @click="apply">
          <Icon name="search" size="sm" />
          {{ t('common.search') }}
        </Button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <Table class="min-w-full text-sm">
        <TableHeader>
          <TableRow>
            <TableHead class="text-left">{{ t('usage.errors.model') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.keyName') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.endpoint') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.status') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.category') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.message') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.platform') }}</TableHead>
            <TableHead class="text-left">{{ t('usage.errors.time') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="(row, i) in rows"
            :key="i"
            class="cursor-pointer"
            @click="openDetail(row.id)"
          >
            <TableCell>{{ row.model || '-' }}</TableCell>
            <TableCell>
              <span>{{ row.key_name || '-' }}</span>
              <Badge
                v-if="row.key_deleted"
                variant="outline"
                class="ml-1 text-[10px] font-medium leading-tight text-muted-foreground"
              >{{ t('usage.errors.keyDeleted') }}</Badge>
            </TableCell>
            <TableCell>{{ row.inbound_endpoint || '-' }}</TableCell>
            <TableCell>
              <Badge
                :variant="row.status_code >= 500 ? 'destructive' : row.status_code === 429 ? 'secondary' : 'outline'"
              >{{ row.status_code || '-' }}</Badge>
            </TableCell>
            <TableCell>{{ t('usage.errors.categories.' + row.category) }}</TableCell>
            <TableCell class="max-w-[280px] truncate" :title="row.message">{{ row.message || '-' }}</TableCell>
            <TableCell>{{ row.platform || '-' }}</TableCell>
            <TableCell>{{ formatDateTime(row.created_at) }}</TableCell>
          </TableRow>
          <TableRow v-if="!loading && rows.length === 0">
            <TableCell colspan="8" class="px-4 py-8 text-center text-muted-foreground">{{ t('usage.errors.empty') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div class="flex-shrink-0">
      <Pagination :page="page" :page-size="pageSize" :total="total"
        @update:page="$emit('update:page', $event)"
        @update:pageSize="$emit('update:pageSize', $event)" />
    </div>

    <UserErrorDetailModal v-model:show="showDetail" :error-id="selectedId" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Pagination from '@/components/common/Pagination.vue'
import Select from '@/components/common/Select.vue'
import Icon from '@/components/icons/Icon.vue'
import UserErrorDetailModal from '@/components/user/UserErrorDetailModal.vue'
import { formatDateTime } from '@/utils/format'
import type { UserErrorRequest, ApiKey } from '@/types'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

const props = defineProps<{
  rows: UserErrorRequest[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  apiKeys?: ApiKey[]
}>()

const emit = defineEmits<{
  (e: 'update:page', v: number): void
  (e: 'update:pageSize', v: number): void
  (e: 'filter', v: { model: string; category: string; api_key_id: number | null }): void
}>()

const { t } = useI18n()
// string | null:clearable 清空时 Select 回传 null,apply 中归一为空串
const localModel = ref<string | null>('')
const localCategory = ref<string>('')
const localApiKeyId = ref<number | null>(null)

const categoryCodes = ['auth', 'rate_limit', 'quota', 'invalid_request', 'service_unavailable', 'upstream', 'internal']

const categoryOptions = computed(() => [
  { value: '', label: t('usage.errors.allCategories') },
  ...categoryCodes.map((c) => ({ value: c, label: t('usage.errors.categories.' + c) })),
])

// 首项 value: null 表示不按 key 过滤；其余项取自父组件传入的 apiKeys 候选列表。
const keyOptions = computed(() => [
  { value: null, label: t('usage.errors.allKeys') },
  ...(props.apiKeys ?? []).map((k) => ({ value: k.id, label: k.name })),
])

// 模型候选取自当前已加载错误中出现过的模型；creatable 允许输入任意片段做后端模糊。
const modelOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of props.rows) {
    if (r.model && !seen.has(r.model)) {
      seen.add(r.model)
      opts.push({ value: r.model, label: r.model })
    }
  }
  return opts
})

const showDetail = ref(false)
const selectedId = ref<number | null>(null)

function openDetail(id: number) {
  selectedId.value = id
  showDetail.value = true
}

function apply() {
  emit('filter', {
    model: (localModel.value ?? '').trim(),
    category: localCategory.value || '',
    api_key_id: localApiKeyId.value,
  })
}

</script>
