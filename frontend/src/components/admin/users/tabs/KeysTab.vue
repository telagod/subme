<template>
  <div class="flex flex-col gap-2.5">
    <div v-if="loading" class="py-5 text-center text-xs text-muted-foreground">{{ t('admin.userTabs.loading') }}</div>
    <div v-else-if="error" class="text-xs text-destructive">{{ error }}</div>
    <div v-else-if="!items.length" class="py-5 text-center text-xs text-muted-foreground">{{ t('admin.userTabs.noKeys') }}</div>
    <div v-else class="flex flex-col gap-2">
      <div v-for="key in items" :key="key.id" class="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3">
        <div class="flex items-center justify-between">
          <div class="text-[13px] font-semibold text-foreground">{{ key.name }}</div>
          <Badge
            variant="outline"
            :class="{
              'border-emerald-500/30 bg-emerald-500/10 text-emerald-600': key.status === 'active',
              'border-destructive/30 bg-destructive/10 text-destructive': key.status !== 'active'
            }"
          >{{ key.status === 'active' ? t('admin.userTabs.keyActive') : key.status }}</Badge>
        </div>
        <div class="break-all font-mono text-[11px] text-muted-foreground">
          {{ key.key.substring(0, 20) }}…{{ key.key.substring(key.key.length - 6) }}
        </div>
        <div class="flex flex-wrap gap-3">
          <span class="text-[11.5px] text-muted-foreground" v-if="key.group?.name">{{ t('admin.userTabs.keyGroup', { name: key.group.name }) }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.keyQuota') }}{{ key.quota === 0 ? t('admin.userTabs.keyQuotaUnlimited') : ('$' + key.quota.toFixed(2)) }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.keyUsed') }}${{ key.quota_used.toFixed(4) }}</span>
          <span class="text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.keyCreated') }}{{ fmt(key.created_at) }}</span>
          <span class="text-[11.5px] text-muted-foreground" v-if="key.last_used_at">{{ t('admin.userTabs.keyLastUsed') }}{{ fmt(key.last_used_at) }}</span>
        </div>
      </div>
    </div>
    <div v-if="total > items.length" class="text-center text-[11.5px] text-muted-foreground">{{ t('admin.userTabs.totalCount', { total }) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser, ApiKey } from '@/types'
import { formatDateTime } from '@/utils/format'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()
const props = defineProps<{ user: AdminUser; active: boolean }>()

const loading = ref(false)
const error = ref<string | null>(null)
const items = ref<ApiKey[]>([])
const total = ref(0)
const loaded = ref(false)

function fmt(iso: string | null | undefined) { return iso ? formatDateTime(iso) : '-' }

async function load() {
  if (loaded.value) return
  loading.value = true; error.value = null
  try {
    const res = await adminAPI.users.getUserApiKeys(props.user.id)
    items.value = res.items; total.value = res.total; loaded.value = true
  } catch { error.value = t('admin.userTabs.loadFailed') } finally { loading.value = false }
}

watch(() => props.active, (v) => { if (v) load() })
onMounted(() => { if (props.active) load() })
</script>
