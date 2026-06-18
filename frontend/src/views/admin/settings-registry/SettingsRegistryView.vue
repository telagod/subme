<template>
  <AppLayout>
    <div class="text-foreground">
      <div v-if="loading" class="flex h-[60vh] items-center justify-center">
        <div class="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>

      <div v-else class="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <!-- Secondary nav: settings categories -->
        <aside class="lg:w-[196px] lg:shrink-0">
          <div class="lg:sticky lg:top-1">
            <!-- search -->
            <div class="relative mb-3">
              <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                type="search"
                class="h-9 pl-8 text-[13px]"
                :placeholder="t('admin.settingsRegistry.searchPlaceholder')"
                @input="onSearch"
              />
            </div>
            <!-- nav: vertical on lg, horizontal scroll on mobile -->
            <nav class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                v-for="tab in activeTabs"
                :key="tab"
                class="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors"
                :class="activeTab === tab
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'"
                @click="activeTab = tab"
              >
                <component :is="tabIcon(tab)" class="h-4 w-4 shrink-0 opacity-80" />
                <span class="whitespace-nowrap">{{ tabLabel(tab) }}</span>
              </button>
            </nav>
          </div>
        </aside>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <div class="max-w-3xl">
            <!-- section heading -->
            <div class="mb-6">
              <h1 class="text-xl font-semibold tracking-tight text-foreground">{{ tabLabel(activeTab) }}</h1>
            </div>

            <!-- section cards -->
            <div class="flex flex-col gap-6">
              <SectionRenderer
                v-for="section in currentSections"
                :key="section.id"
                :section="section"
                :form="form"
                :settings="savedSettings"
                :class="{ 'ring-1 ring-primary/40': matchingSections.has(section.id) }"
                @update:field="onFieldUpdate"
              />
              <div v-if="currentSections.length === 0" class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                <p class="text-sm text-muted-foreground">{{ searchQuery ? t('admin.settingsRegistry.noSearchResults') : t('empty.noData') }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky save bar (centered over content column) -->
      <Transition name="srg-bar">
        <div
          v-if="dirtyCount > 0"
          class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg lg:left-[calc(50%_+_114px)]"
        >
          <span class="font-mono text-[12.5px] tabular-nums text-muted-foreground">{{ t('admin.settingsRegistry.dirtyCount', { n: dirtyCount }) }}</span>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" :disabled="saving" @click="discardChanges">{{ t('admin.settingsRegistry.discardBtn') }}</Button>
            <Button variant="default" size="sm" :disabled="saving" @click="saveChanges">
              <span v-if="saving" class="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary-foreground align-[-3px]" />
              {{ saving ? t('admin.settingsRegistry.savingBtn') : t('admin.settingsRegistry.saveBtn') }}
            </Button>
          </div>
        </div>
      </Transition>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Search,
  SlidersHorizontal,
  ShieldCheck,
  Users,
  Sparkles,
  Network,
  CreditCard,
  Mail,
  ScrollText,
  Archive,
} from 'lucide-vue-next'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api'
import type { TabId } from './types'
import { allSections, getSectionsByTab, getActiveTabs } from './registry'
import SectionRenderer from './SectionRenderer.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)
const savedSettings = ref<Record<string, unknown>>({})
const form = ref<Record<string, unknown>>({})
const searchQuery = ref('')
const matchingSections = ref<Set<string>>(new Set())
const activeTab = ref<TabId>('general')

/**
 * Dirty key tracker — replaces O(n) JSON.stringify deep-compare on every keystroke.
 *
 * Why: dirtyCount was iterating all ~200 settings keys and serializing each
 * via JSON.stringify on every form mutation, quadrupling cost during typing.
 *
 * How: every onFieldUpdate adds the key to a Set. dirtyCount is just the set size.
 * Save / discard reset the set. The JSON.stringify comparison still runs at
 * save-time to filter no-op mutations (e.g., toggle on→off→on), but only over
 * keys actually touched — bounded by user interactions, not by total schema size.
 */
const dirtyKeys = ref<Set<string>>(new Set())

/** Semantic tab order (overrides glob discovery order); icons per tab */
const TAB_ORDER: TabId[] = [
  'general', 'security', 'users', 'features',
  'gateway', 'payment', 'email', 'agreement', 'backup',
]
const TAB_ICONS: Record<TabId, Component> = {
  general: SlidersHorizontal,
  security: ShieldCheck,
  users: Users,
  features: Sparkles,
  gateway: Network,
  payment: CreditCard,
  email: Mail,
  agreement: ScrollText,
  backup: Archive,
}

const activeTabs = computed<TabId[]>(() => {
  const present = getActiveTabs()
  const presentSet = new Set(present)
  const ordered = TAB_ORDER.filter(tab => presentSet.has(tab))
  // Append any active tab not covered by TAB_ORDER (forward-compat safety)
  for (const tab of present) if (!ordered.includes(tab)) ordered.push(tab)
  return ordered
})

// Memoized at module scope — sections are static (collected from import.meta.glob),
// no need to recompute per render. Avoids re-running getSectionsByTab + filter
// for every form mutation as the previous computed did.
const SECTIONS_BY_TAB = getSectionsByTab()

const currentSections = computed(() => {
  const sections = SECTIONS_BY_TAB.get(activeTab.value) ?? []
  if (matchingSections.value.size === 0) return sections
  return sections.filter(s => matchingSections.value.has(s.id))
})

async function loadSettings() {
  loading.value = true
  try {
    const data = await adminAPI.settings.getSettings() as unknown as Record<string, unknown>
    savedSettings.value = { ...data }
    form.value = { ...data }
    dirtyKeys.value = new Set()
    const tabs = activeTabs.value
    if (tabs.length > 0) activeTab.value = tabs[0]
  } catch (err) {
    appStore.showError(String(err))
  } finally {
    loading.value = false
  }
}

onMounted(loadSettings)

const dirtyCount = computed(() => dirtyKeys.value.size)

function onFieldUpdate(key: string, value: unknown) {
  form.value = { ...form.value, [key]: value }
  if (!dirtyKeys.value.has(key)) {
    // Cheap path: just record this key as touched. Save will re-verify against
    // savedSettings to skip no-op patches (e.g., toggle on→off→on).
    const next = new Set(dirtyKeys.value)
    next.add(key)
    dirtyKeys.value = next
  }
}

function duplicateGroupId(list: unknown): unknown {
  if (!Array.isArray(list)) return undefined
  const seen = new Set<unknown>()
  for (const item of list) {
    const gid = (item as { group_id?: unknown } | null)?.group_id
    if (gid == null) continue
    if (seen.has(gid)) return gid
    seen.add(gid)
  }
  return undefined
}

async function saveChanges() {
  // Only validate / diff keys actually touched by the user — bounded by
  // dirtyKeys, not by total schema size.
  const touchedKeys = Array.from(dirtyKeys.value)
  for (const key of touchedKeys) {
    if (key === 'default_subscriptions' || key.endsWith('_subscriptions')) {
      const dup = duplicateGroupId(form.value[key])
      if (dup != null) {
        appStore.showError(t('admin.settings.defaults.defaultSubscriptionsDuplicate', { groupId: dup }))
        return
      }
    }
  }
  const patch: Record<string, unknown> = {}
  for (const key of touchedKeys) {
    // Re-verify against savedSettings so toggle-and-revert sequences don't
    // generate spurious patches.
    if (JSON.stringify(form.value[key]) !== JSON.stringify(savedSettings.value[key])) {
      patch[key] = form.value[key]
    }
  }
  if (Object.keys(patch).length === 0) {
    // All "dirty" keys reverted to original — nothing to save.
    dirtyKeys.value = new Set()
    appStore.showSuccess(t('common.saved'))
    return
  }
  saving.value = true
  try {
    await adminAPI.settings.updateSettings(patch as Parameters<typeof adminAPI.settings.updateSettings>[0])
    savedSettings.value = { ...form.value }
    dirtyKeys.value = new Set()
    appStore.showSuccess(t('common.saved'))
  } catch (err) {
    appStore.showError(String(err))
  } finally {
    saving.value = false
  }
}

function discardChanges() {
  const snapshot = { ...savedSettings.value }
  savedSettings.value = snapshot
  form.value = snapshot
  dirtyKeys.value = new Set()
}

function onSearch() {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    matchingSections.value = new Set()
    return
  }
  const hits = new Set<string>()
  for (const section of allSections) {
    const titleMatch = resolveLabel(section.title).toLowerCase().includes(q)
    const fieldMatch = section.fields.some(
      f => f.key.toLowerCase().includes(q) || resolveLabel(f.label).toLowerCase().includes(q),
    )
    if (titleMatch || fieldMatch) hits.add(section.id)
  }
  matchingSections.value = hits
  if (hits.size > 0) {
    const first = allSections.find(s => hits.has(s.id))
    if (first) activeTab.value = first.tab
  }
}

function resolveLabel(key: string): string {
  try {
    const r = t(key)
    return r === key ? key : r
  } catch { return key }
}

function tabLabel(tab: string): string {
  const key = `admin.settingsRegistry.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as any
  const result = t(key)
  return result === key ? tab : result
}

function tabIcon(tab: string): Component {
  return TAB_ICONS[tab as TabId] ?? SlidersHorizontal
}
</script>

<style scoped>
.srg-bar-enter-active, .srg-bar-leave-active { transition: opacity .2s, transform .2s; }
.srg-bar-enter-from, .srg-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .srg-bar-enter-active, .srg-bar-leave-active { transition: none; }
}
</style>
