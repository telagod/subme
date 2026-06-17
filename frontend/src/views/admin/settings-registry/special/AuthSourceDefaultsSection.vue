<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- Require email on third-party signup toggle -->
    <div class="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div>
        <Label class="mb-0.5 block text-sm font-medium text-foreground">{{ t('admin.settings.authSourceDefaults.requireEmailLabel') }}</Label>
        <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.authSourceDefaults.requireEmailHint') }}</p>
      </div>
      <Toggle
        :model-value="localForceEmail"
        @update:model-value="onForceEmailChange"
      />
    </div>

    <!-- Auth source cards -->
    <div class="flex flex-col gap-3">
      <div
        v-for="meta in sourceMeta"
        :key="meta.source"
        class="flex flex-col rounded-[10px] border border-border px-4 py-3.5"
      >
        <!-- Card header: title + description + grant_on_signup toggle -->
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-[13.5px] font-semibold text-foreground">{{ meta.title }}</div>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ meta.description }}</p>
          </div>
          <Toggle
            v-model="localState[meta.source].grant_on_signup"
            :data-testid="`auth-source-${meta.source}-enabled`"
            @update:model-value="emitAll"
          />
        </div>

        <!-- Expanded panel (shown only when grant_on_signup = true) -->
        <div
          v-if="localState[meta.source].grant_on_signup"
          :data-testid="`auth-source-${meta.source}-panel`"
          class="mt-3.5 flex flex-col gap-4 border-t border-border pt-3.5"
        >
          <p class="m-0 mb-1 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.authSourceDefaults.enabledHint') }}</p>

          <!-- Balance + Concurrency -->
          <div class="grid grid-cols-2 gap-3 max-[540px]:grid-cols-1">
            <div class="flex flex-col">
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.defaults.defaultBalance') }}</Label>
              <Input
                v-model.number="localState[meta.source].balance"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                @change="emitAll"
              />
            </div>
            <div class="flex flex-col">
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.defaults.defaultConcurrency') }}</Label>
              <Input
                v-model.number="localState[meta.source].concurrency"
                type="number"
                min="1"
                placeholder="5"
                @change="emitAll"
              />
            </div>
          </div>

          <!-- grant_on_first_bind -->
          <div class="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label class="mb-0.5 block text-sm font-medium text-foreground">{{ t('admin.settings.authSourceDefaults.grantOnFirstBindLabel') }}</Label>
              <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.authSourceDefaults.grantOnFirstBindHint') }}</p>
            </div>
            <Toggle
              v-model="localState[meta.source].grant_on_first_bind"
              @update:model-value="emitAll"
            />
          </div>

          <!-- Default subscriptions -->
          <div class="flex flex-col gap-2.5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <Label class="mb-0.5 block text-[13px] font-semibold text-foreground">{{ t('admin.settings.authSourceDefaults.defaultSubscriptionsLabel') }}</Label>
                <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.authSourceDefaults.defaultSubscriptionsHint') }}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="shrink-0 text-[11.5px]"
                :disabled="subscriptionGroups.length === 0"
                @click="addSubscription(meta.source)"
              >
                {{ t('admin.settings.defaults.addDefaultSubscription') }}
              </Button>
            </div>

            <div
              v-if="localState[meta.source].subscriptions.length === 0"
              class="rounded-lg border border-dashed border-border px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
            >
              {{ t('admin.settings.authSourceDefaults.noSourceSubscriptions') }}
            </div>

            <div v-else class="flex flex-col gap-2">
              <div
                v-for="(item, index) in localState[meta.source].subscriptions"
                :key="`${meta.source}-sub-${index}`"
                class="grid grid-cols-[1fr_160px_auto] items-end gap-2.5 rounded-lg border border-border px-3 py-2.5 max-[640px]:grid-cols-1"
              >
                <div class="flex flex-col">
                  <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.defaults.subscriptionGroup') }}</Label>
                  <Select
                    v-model="item.group_id"
                    class="default-sub-group-select"
                    :options="groupOptions"
                    :placeholder="t('admin.settings.defaults.subscriptionGroup')"
                    @update:model-value="emitAll"
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
                <div class="flex flex-col">
                  <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.defaults.subscriptionValidityDays') }}</Label>
                  <Input
                    v-model.number="item.validity_days"
                    type="number"
                    min="1"
                    max="36500"
                    class="h-[42px]"
                    @change="emitAll"
                  />
                </div>
                <div class="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="w-full text-destructive hover:border-destructive/30 hover:bg-destructive/7 hover:text-destructive"
                    @click="removeSubscription(meta.source, index)"
                  >
                    {{ t('common.delete') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- Platform quotas override matrix -->
          <div class="flex flex-col gap-2.5">
            <div class="flex flex-col gap-0.5">
              <Label class="block text-[13px] font-semibold text-foreground">{{ t('admin.settings.authSourceDefaults.platformQuotasOverride') }}</Label>
              <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.authSourceDefaults.platformQuotasOverrideHint') }}</p>
            </div>
            <div class="overflow-x-auto">
              <Table class="w-full text-[12.5px]">
                <TableHeader>
                  <TableRow>
                    <TableHead class="pb-2 pr-3.5 pt-0 text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{{ t('admin.settings.platformQuota.platform') }}</TableHead>
                    <TableHead class="pb-2 pr-3.5 pt-0 text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{{ t('admin.settings.platformQuota.daily') }}</TableHead>
                    <TableHead class="pb-2 pr-3.5 pt-0 text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{{ t('admin.settings.platformQuota.weekly') }}</TableHead>
                    <TableHead class="pb-2 pr-3.5 pt-0 text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{{ t('admin.settings.platformQuota.monthly') }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="p in PLATFORMS"
                    :key="`${meta.source}-pq-${p}`"
                    class="align-top"
                  >
                    <TableCell class="py-1 pr-3.5 align-middle">
                      <span class="font-mono text-xs text-foreground opacity-85">{{ p }}</span>
                    </TableCell>
                    <TableCell class="py-1 pr-3.5">
                      <Input
                        v-model.number="localState[meta.source].platform_quotas[p]!.daily"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-8 w-28 px-2 text-[12.5px]"
                        :placeholder="t('admin.settings.platformQuota.placeholder')"
                        @change="emitAll"
                      />
                    </TableCell>
                    <TableCell class="py-1 pr-3.5">
                      <Input
                        v-model.number="localState[meta.source].platform_quotas[p]!.weekly"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-8 w-28 px-2 text-[12.5px]"
                        :placeholder="t('admin.settings.platformQuota.placeholder')"
                        @change="emitAll"
                      />
                    </TableCell>
                    <TableCell class="py-1 pr-3.5">
                      <Input
                        v-model.number="localState[meta.source].platform_quotas[p]!.monthly"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-8 w-28 px-2 text-[12.5px]"
                        :placeholder="t('admin.settings.platformQuota.placeholder')"
                        @change="emitAll"
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import Select from '@/components/common/Select.vue'
import GroupBadge from '@/components/common/GroupBadge.vue'
import GroupOptionItem from '@/components/common/GroupOptionItem.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { adminAPI } from '@/api'
import {
  buildAuthSourceDefaultsState,
  appendAuthSourceDefaultsToUpdateRequest,
  normalizePlatformQuotasMap,
} from '@/api/admin/settings'
import type {
  AuthSourceType,
  AuthSourceDefaultsState,
  DefaultSubscriptionSetting,
  PlatformType,
  DefaultPlatformQuotasMap,
} from '@/api/admin/settings'
import type { AdminGroup } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────
const PLATFORMS: PlatformType[] = ['anthropic', 'openai', 'gemini', 'antigravity']

// ── Props / emits ──────────────────────────────────────────────────────────
const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t, locale } = useI18n()

const isZhLocale = computed(() => locale.value.startsWith('zh'))
function localText(zh: string, en: string): string {
  return isZhLocale.value ? zh : en
}

// ── Auth source meta (title + description per source) ─────────────────────
const sourceMeta = computed<Array<{ source: AuthSourceType; title: string; description: string }>>(() => [
  {
    source: 'email',
    title: t('admin.settings.authSourceDefaults.sources.email.title'),
    description: t('admin.settings.authSourceDefaults.sources.email.description'),
  },
  {
    source: 'linuxdo',
    title: t('admin.settings.authSourceDefaults.sources.linuxdo.title'),
    description: t('admin.settings.authSourceDefaults.sources.linuxdo.description'),
  },
  {
    source: 'oidc',
    title: t('admin.settings.authSourceDefaults.sources.oidc.title'),
    description: t('admin.settings.authSourceDefaults.sources.oidc.description'),
  },
  {
    source: 'wechat',
    title: t('admin.settings.authSourceDefaults.sources.wechat.title'),
    description: t('admin.settings.authSourceDefaults.sources.wechat.description'),
  },
  {
    source: 'github',
    title: 'GitHub',
    description: localText(
      '通过 GitHub 已验证邮箱首次注册或首次绑定时应用。',
      'Applied on first signup or first bind through a verified GitHub email.',
    ),
  },
  {
    source: 'google',
    title: 'Google',
    description: localText(
      '通过 Google 已验证邮箱首次注册或首次绑定时应用。',
      'Applied on first signup or first bind through a verified Google email.',
    ),
  },
  {
    source: 'dingtalk',
    title: localText('钉钉', 'DingTalk'),
    description: localText(
      '通过钉钉首次注册或首次绑定时应用。',
      'Applied on first signup or first bind through DingTalk.',
    ),
  },
])

// ── Local state: force_email_on_third_party_signup ────────────────────────
// This flat boolean lives in the same card in SettingsView (line 3356)
const localForceEmail = ref<boolean>(false)

function onForceEmailChange(val: boolean) {
  localForceEmail.value = val
  emit('update:field', 'force_email_on_third_party_signup', val)
}

// ── Local reactive state (mirrors authSourceDefaults in SettingsView) ──────
const localState = reactive<AuthSourceDefaultsState>(
  buildAuthSourceDefaultsState({})
)

function syncFromSettings(s: Record<string, unknown>) {
  // force_email_on_third_party_signup
  localForceEmail.value = s['force_email_on_third_party_signup'] === true

  const built = buildAuthSourceDefaultsState(s)
  for (const source of Object.keys(built) as AuthSourceType[]) {
    const src = built[source]
    const dst = localState[source]
    dst.balance = src.balance
    dst.concurrency = src.concurrency
    dst.grant_on_signup = src.grant_on_signup
    dst.grant_on_first_bind = src.grant_on_first_bind
    // deep-replace subscriptions
    dst.subscriptions.splice(0, dst.subscriptions.length, ...src.subscriptions)
    // deep-replace platform_quotas (normalizePlatformQuotasMap ensures all 4 entries exist)
    const normalized = normalizePlatformQuotasMap(src.platform_quotas as DefaultPlatformQuotasMap | undefined)
    for (const p of PLATFORMS) {
      dst.platform_quotas[p] = { ...normalized[p]! }
    }
  }
}

// ── Subscription groups ────────────────────────────────────────────────────
const subscriptionGroups = reactive<AdminGroup[]>([])

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
  subscriptionGroups.map((g) => ({
    value: g.id,
    label: g.name,
    description: g.description ?? null,
    platform: g.platform,
    subscriptionType: g.subscription_type,
    rate: g.rate_multiplier,
  }))
)

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  // Load active subscription groups
  try {
    const all = await adminAPI.groups.getAll()
    const active = all.filter(
      (g) => g.subscription_type === 'subscription' && g.status === 'active'
    )
    subscriptionGroups.splice(0, subscriptionGroups.length, ...active)
  } catch {
    subscriptionGroups.splice(0, subscriptionGroups.length)
  }
  // Sync initial state from saved settings
  syncFromSettings(props.settings)
})

// Re-sync when parent discards changes (settings prop flips to saved snapshot)
watch(
  () => props.settings,
  (next) => syncFromSettings(next),
  { deep: true }
)

// ── Emit all flat auth-source keys via the API helper ─────────────────────
function emitAll() {
  const payload = appendAuthSourceDefaultsToUpdateRequest({}, localState) as Record<string, unknown>
  for (const [key, value] of Object.entries(payload)) {
    emit('update:field', key, value)
  }
}

// ── Subscription CRUD ──────────────────────────────────────────────────────
function findNextAvailableGroup(existingIds: number[]): AdminGroup | undefined {
  const set = new Set(existingIds)
  return subscriptionGroups.find((g) => !set.has(g.id))
}

function addSubscription(source: AuthSourceType) {
  if (subscriptionGroups.length === 0) return
  const candidate = findNextAvailableGroup(
    localState[source].subscriptions.map((s: DefaultSubscriptionSetting) => s.group_id)
  )
  if (!candidate) return
  localState[source].subscriptions.push({ group_id: candidate.id, validity_days: 30 })
  emitAll()
}

function removeSubscription(source: AuthSourceType, index: number) {
  localState[source].subscriptions.splice(index, 1)
  emitAll()
}
</script>
