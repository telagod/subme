<template>
  <div class="flex flex-col gap-2.5">
    <div v-if="loading" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.loading') }}</div>
    <div v-else-if="error" class="text-[12.5px] text-destructive">{{ error }}</div>
    <div v-else-if="!items.length" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.noRiskLogs') }}</div>
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="log in items"
        :key="log.id"
        class="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-[11px]"
        :class="{ 'border-destructive/35 bg-destructive/[0.04]': log.flagged }"
      >
        <div class="flex items-center justify-between">
          <div class="text-[11.5px] text-muted-foreground">{{ fmt(log.created_at) }}</div>
          <div class="flex gap-1.5">
            <Badge v-if="log.flagged" variant="destructive" class="rounded-md px-1.5 py-0.5 text-[10.5px]">{{ t('admin.userTabs.riskFlagged') }}</Badge>
            <Badge v-if="log.auto_banned" variant="destructive" class="rounded-md px-1.5 py-0.5 text-[10.5px]">{{ t('admin.userTabs.riskAutoBanned') }}</Badge>
            <Badge v-if="!log.flagged" variant="secondary" class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-500">{{ t('admin.userTabs.riskPassed') }}</Badge>
          </div>
        </div>
        <div class="flex flex-wrap gap-3">
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.riskMode') }}{{ log.mode }}</span>
          <span class="text-[11.5px] text-muted-foreground" v-if="log.highest_category">{{ t('admin.userTabs.riskCategory') }}{{ log.highest_category }}</span>
          <span class="text-[11.5px] text-muted-foreground" v-if="log.highest_score">{{ t('admin.userTabs.riskScore') }}{{ (log.highest_score * 100).toFixed(1) }}%</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.riskModel') }}{{ log.model || '-' }}</span>
        </div>
        <div v-if="log.input_excerpt" class="max-h-12 overflow-hidden break-all whitespace-pre-wrap font-mono text-[11px] leading-[1.5] text-muted-foreground">{{ log.input_excerpt }}</div>
      </div>
    </div>
    <div v-if="total > items.length" class="text-center text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.totalCountPartial', { total, shown: items.length }) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser } from '@/types'
import type { ContentModerationLog } from '@/api/admin/riskControl'
import { formatDateTime } from '@/utils/format'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser; active: boolean }>()

const loading = ref(false)
const error = ref<string | null>(null)
const items = ref<ContentModerationLog[]>([])
const total = ref(0)
const loaded = ref(false)

function fmt(iso: string | null | undefined) { return iso ? formatDateTime(iso) : '-' }

async function load() {
  if (loaded.value) return
  loading.value = true; error.value = null
  try {
    const res = await adminAPI.riskControl.listLogs({ search: String(props.user.id), page: 1, page_size: 20 })
    // filter to this user since the API searches by email/id text
    items.value = res.items.filter(l => l.user_id === props.user.id)
    total.value = items.value.length
    loaded.value = true
  } catch { error.value = t('admin.userTabs.loadFailed') } finally { loading.value = false }
}

watch(() => props.active, (v) => { if (v) load() })
onMounted(() => { if (props.active) load() })
</script>
