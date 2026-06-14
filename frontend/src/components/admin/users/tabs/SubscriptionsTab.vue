<template>
  <div class="flex flex-col gap-2.5">
    <div v-if="loading" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.loading') }}</div>
    <div v-else-if="error" class="text-[12.5px] text-destructive">{{ error }}</div>
    <div v-else-if="!items.length" class="py-5 text-center text-[12.5px] text-muted-foreground">{{ t('admin.userTabs.noSubscriptions') }}</div>
    <div v-else class="flex flex-col gap-2">
      <Card v-for="sub in items" :key="sub.id" class="flex flex-col gap-1.5 rounded-[10px] px-3.5 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-[12.5px]">
            <span class="font-mono text-[11.5px] text-foreground">#{{ sub.id }}</span>
            <span v-if="sub.group?.name" class="text-foreground">{{ sub.group.name }}</span>
          </div>
          <Badge
            :class="{
              'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': sub.status === 'active',
              'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400': sub.status === 'expired',
              'border-destructive/30 bg-destructive/10 text-destructive': sub.status === 'revoked'
            }"
            variant="outline"
          >{{ statusLabel(sub.status) }}</Badge>
        </div>
        <div class="flex flex-wrap gap-4">
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.subStart') }}{{ fmt(sub.starts_at) }}</span>
          <span class="text-[11.5px] text-muted-foreground" v-if="sub.expires_at">{{ t('admin.userTabs.subExpires') }}{{ fmt(sub.expires_at) }}</span>
          <span class="text-[11.5px] text-muted-foreground" v-else>{{ t('admin.userTabs.subPermanent') }}</span>
        </div>
        <div class="flex flex-wrap gap-4">
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.subDailyCost') }} ${{ fmtCost(sub.daily_usage_usd) }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.subMonthlyCost') }} ${{ fmtCost(sub.monthly_usage_usd) }}</span>
        </div>
      </Card>
    </div>
    <div v-if="total > items.length" class="text-center text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.totalCountPartial', { total, shown: items.length }) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser, UserSubscription } from '@/types'
import { formatDateTime } from '@/utils/format'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser; active: boolean }>()

const loading = ref(false)
const error = ref<string | null>(null)
const items = ref<UserSubscription[]>([])
const total = ref(0)
const loaded = ref(false)

function fmt(iso: string | null | undefined) { return iso ? formatDateTime(iso) : '-' }
function fmtCost(v: number) { return v.toFixed(4) }
function statusLabel(s: string) {
  return s === 'active' ? t('admin.userTabs.subStatusActive') : s === 'expired' ? t('admin.userTabs.subStatusExpired') : t('admin.userTabs.subStatusRevoked')
}

async function load() {
  if (loaded.value) return
  loading.value = true; error.value = null
  try {
    const res = await adminAPI.subscriptions.listByUser(props.user.id, 1, 20)
    items.value = res.items; total.value = res.total; loaded.value = true
  } catch { error.value = t('admin.userTabs.loadFailed') } finally { loading.value = false }
}

watch(() => props.active, (v) => { if (v) load() })
onMounted(() => { if (props.active) load() })
</script>
