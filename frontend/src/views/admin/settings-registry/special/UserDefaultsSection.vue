<template>
  <div class="flex flex-col gap-0 px-5 py-4">
    <!-- ══ Block 1: default_subscriptions ══ -->
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <Label class="block text-[13px] font-semibold text-foreground mb-0.5">{{ t('admin.settings.defaults.defaultSubscriptions') }}</Label>
          <p class="text-[11.5px] text-muted-foreground leading-relaxed m-0">{{ t('admin.settings.defaults.defaultSubscriptionsHint') }}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="subscriptionGroups.length === 0"
          class="flex-shrink-0 text-[11.5px]"
          @click="addDefaultSubscription"
        >
          {{ t('admin.settings.defaults.addDefaultSubscription') }}
        </Button>
      </div>

      <div
        v-if="localSubscriptions.length === 0"
        class="border border-dashed border-border rounded-lg px-4 py-3 text-[12.5px] text-muted-foreground"
      >
        {{ t('admin.settings.defaults.defaultSubscriptionsEmpty') }}
      </div>

      <div v-else class="flex flex-col gap-2">
        <div
          v-for="(item, index) in localSubscriptions"
          :key="`default-sub-${index}`"
          class="grid gap-2.5 items-end border border-border rounded-lg px-3 py-2.5 [grid-template-columns:1fr_160px_auto] max-[640px]:[grid-template-columns:1fr]"
        >
          <!-- Group selector -->
          <div class="flex flex-col">
            <Label class="block text-[11px] font-medium text-muted-foreground mb-1">{{ t('admin.settings.defaults.subscriptionGroup') }}</Label>
            <Select
              v-model="item.group_id"
              class="default-sub-group-select"
              :options="groupOptions"
              :placeholder="t('admin.settings.defaults.subscriptionGroup')"
              @update:model-value="emitSubscriptions"
            >
              <template #selected="{ option }">
                <GroupBadge
                  v-if="option"
                  :name="(option as GroupOption).label"
                  :platform="(option as GroupOption).platform"
                  :subscription-type="(option as GroupOption).subscriptionType"
                  :rate-multiplier="(option as GroupOption).rate"
                />
                <span v-else class="text-muted-foreground">{{ t('admin.settings.defaults.subscriptionGroup') }}</span>
              </template>
              <template #option="{ option, selected }">
                <GroupOptionItem
                  :name="(option as GroupOption).label"
                  :platform="(option as GroupOption).platform"
                  :subscription-type="(option as GroupOption).subscriptionType"
                  :rate-multiplier="(option as GroupOption).rate"
                  :description="(option as GroupOption).description"
                  :selected="selected"
                />
              </template>
            </Select>
          </div>

          <!-- Validity days -->
          <div class="flex flex-col">
            <Label class="block text-[11px] font-medium text-muted-foreground mb-1">{{ t('admin.settings.defaults.subscriptionValidityDays') }}</Label>
            <Input
              v-model.number="item.validity_days"
              type="number"
              min="1"
              max="36500"
              class="h-[42px]"
              @change="emitSubscriptions"
            />
          </div>

          <!-- Delete -->
          <div class="flex items-end">
            <Button
              type="button"
              variant="outline"
              class="w-full text-destructive/80 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
              @click="removeDefaultSubscription(index)"
            >
              {{ t('common.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ Block 2: default_platform_quotas matrix ══ -->
    <div class="flex flex-col gap-3 border-t border-border pt-5 mt-5">
      <div class="flex flex-col items-start gap-0">
        <Label class="block text-[13px] font-semibold text-foreground mb-0.5">{{ t('admin.settings.defaults.defaultPlatformQuotas') }}</Label>
        <p class="text-[11.5px] text-muted-foreground leading-relaxed m-0">{{ t('admin.settings.defaults.defaultPlatformQuotasHint') }}</p>
        <p class="text-[11px] text-amber-400 mt-1">{{ t('admin.settings.defaults.platformQuotaNotice') }}</p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th class="text-left pr-[14px] pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('admin.settings.platformQuota.platform') }}</th>
              <th class="text-left pr-[14px] pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('admin.settings.platformQuota.daily') }}</th>
              <th class="text-left pr-[14px] pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('admin.settings.platformQuota.weekly') }}</th>
              <th class="text-left pr-[14px] pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('admin.settings.platformQuota.monthly') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in PLATFORMS"
              :key="p"
              class="align-top"
            >
              <td class="pr-[14px] py-1 align-middle">
                <span class="font-mono text-[12px] text-foreground opacity-85">{{ p }}</span>
              </td>
              <td class="pr-[14px] py-1">
                <Input
                  v-model.number="localQuotas[p]!.daily"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-8 w-[112px] text-[12.5px] px-2"
                  :placeholder="t('admin.settings.platformQuota.placeholder')"
                  @change="emitQuotas"
                />
              </td>
              <td class="pr-[14px] py-1">
                <Input
                  v-model.number="localQuotas[p]!.weekly"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-8 w-[112px] text-[12.5px] px-2"
                  :placeholder="t('admin.settings.platformQuota.placeholder')"
                  @change="emitQuotas"
                />
              </td>
              <td class="pr-[14px] py-1">
                <Input
                  v-model.number="localQuotas[p]!.monthly"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-8 w-[112px] text-[12.5px] px-2"
                  :placeholder="t('admin.settings.platformQuota.placeholder')"
                  @change="emitQuotas"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/common/Select.vue'
import GroupBadge from '@/components/common/GroupBadge.vue'
import GroupOptionItem from '@/components/common/GroupOptionItem.vue'
import { adminAPI } from '@/api'
import {
  sanitizePlatformQuotasMap,
  normalizePlatformQuotasMap,
  normalizeDefaultSubscriptionSettings,
} from '@/api/admin/settings'
import type {
  DefaultSubscriptionSetting,
  DefaultPlatformQuotasMap,
  PlatformType,
} from '@/api/admin/settings'
import type { AdminGroup } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PLATFORMS: PlatformType[] = ['anthropic', 'openai', 'gemini', 'antigravity']

// ── Component interface ────────────────────────────────────────────────────
const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

// ── Local state: subscriptions ─────────────────────────────────────────────
const localSubscriptions = ref<DefaultSubscriptionSetting[]>([])

// ── Local state: platform quotas ───────────────────────────────────────────
// Fully-normalized 4×3 object, always non-null for template binding
const localQuotas = reactive<Record<PlatformType, { daily: number | null; weekly: number | null; monthly: number | null }>>(
  normalizePlatformQuotasMap() as Record<PlatformType, { daily: number | null; weekly: number | null; monthly: number | null }>
)

// ── Groups (loaded once on mount) ──────────────────────────────────────────
const subscriptionGroups = ref<AdminGroup[]>([])

interface GroupOption {
  value: number
  label: string
  description: string | null
  platform: AdminGroup['platform']
  subscriptionType: AdminGroup['subscription_type']
  rate: number
  [key: string]: unknown
}

const groupOptions = computed<GroupOption[]>(() =>
  subscriptionGroups.value.map((g) => ({
    value: g.id,
    label: g.name,
    description: g.description ?? null,
    platform: g.platform,
    subscriptionType: g.subscription_type,
    rate: g.rate_multiplier,
  }))
)

onMounted(async () => {
  // Load groups
  try {
    const all = await adminAPI.groups.getAll()
    subscriptionGroups.value = all.filter(
      (g) => g.subscription_type === 'subscription' && g.status === 'active'
    )
  } catch {
    subscriptionGroups.value = []
  }
  // Sync from props.settings (initial load)
  syncFromSettings(props.settings)
})

// ── Sync on settings prop change (global discard / reload) ─────────────────
watch(
  () => props.settings,
  (next) => syncFromSettings(next),
  { deep: true }
)

function syncFromSettings(s: Record<string, unknown>) {
  // subscriptions
  const rawSubs = s['default_subscriptions']
  localSubscriptions.value = normalizeDefaultSubscriptionSettings(
    Array.isArray(rawSubs) ? (rawSubs as DefaultSubscriptionSetting[]) : []
  )

  // platform quotas
  const rawQuotas = s['default_platform_quotas'] as DefaultPlatformQuotasMap | undefined
  const normalized = normalizePlatformQuotasMap(rawQuotas) as Record<
    PlatformType,
    { daily: number | null; weekly: number | null; monthly: number | null }
  >
  for (const p of PLATFORMS) {
    localQuotas[p] = { ...normalized[p]! }
  }
}

// ── Emit helpers ───────────────────────────────────────────────────────────
function emitSubscriptions() {
  emit('update:field', 'default_subscriptions', normalizeDefaultSubscriptionSettings(localSubscriptions.value))
}

function emitQuotas() {
  emit('update:field', 'default_platform_quotas', sanitizePlatformQuotasMap(localQuotas as DefaultPlatformQuotasMap))
}

// ── Add / remove subscriptions ─────────────────────────────────────────────
function findNextAvailableGroup(existingIds: number[]): AdminGroup | undefined {
  const set = new Set(existingIds)
  return subscriptionGroups.value.find((g) => !set.has(g.id))
}

function addDefaultSubscription() {
  if (subscriptionGroups.value.length === 0) return
  const candidate = findNextAvailableGroup(localSubscriptions.value.map((s) => s.group_id))
  if (!candidate) return
  localSubscriptions.value.push({ group_id: candidate.id, validity_days: 30 })
  emitSubscriptions()
}

function removeDefaultSubscription(index: number) {
  localSubscriptions.value.splice(index, 1)
  emitSubscriptions()
}
</script>
