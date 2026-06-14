<template>
  <AppLayout>
    <div class="relative px-7 pb-32 pt-6 text-foreground">
      <!-- Loading splash -->
      <div v-if="loading" class="flex h-[60vh] items-center justify-center">
        <div class="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>

      <template v-else>
        <div class="flex gap-6 items-start">
          <!-- Left anchor nav -->
          <aside class="w-[200px] shrink-0 sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div class="mb-3">
              <Input
                v-model="searchQuery"
                type="search"
                class="text-[12.5px]"
                :placeholder="t('admin.settingsRegistry.searchPlaceholder')"
                @input="onSearch"
              />
            </div>
            <nav class="flex flex-col gap-1">
              <template v-for="[tab, sections] in visibleSectionsByTab" :key="tab">
                <div class="mb-2 flex flex-col gap-px">
                  <span class="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{{ tabLabel(tab) }}</span>
                  <a
                    v-for="section in sections"
                    :key="section.id"
                    :href="`#sr-section-${section.id}`"
                    class="block overflow-hidden text-ellipsis whitespace-nowrap rounded-md border-l-2 border-transparent px-2 py-1.5 pl-2.5 text-xs text-muted-foreground no-underline transition-colors duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    :class="{
                      'border-l-primary bg-primary/8 text-foreground': activeSection === section.id,
                      'font-medium text-primary': matchingSections.has(section.id)
                    }"
                    @click.prevent="scrollToSection(section.id)"
                  >{{ resolveLabel(section.title) }}</a>
                </div>
              </template>
            </nav>
          </aside>

          <!-- Right scroll area -->
          <main class="min-w-0 flex-1 flex flex-col gap-4" ref="mainEl" @scroll="onMainScroll">
            <template v-for="[, sections] in visibleSectionsByTab" :key="sections[0]?.tab">
              <SectionRenderer
                v-for="section in sections"
                :key="section.id"
                :section="section"
                :form="form"
                :settings="savedSettings"
                class="transition-[outline] duration-150"
                :class="{ 'outline outline-1 outline-primary/35': matchingSections.has(section.id) }"
                @update:field="onFieldUpdate"
              />
            </template>
          </main>
        </div>

        <!-- Sticky save bar -->
        <Transition name="srg-bar">
          <div
            v-if="dirtyCount > 0"
            class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-xl border border-border bg-card px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,.45)]"
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
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api'
import type { TabId } from './types'
import { allSections, getSectionsByTab } from './registry'
import SectionRenderer from './SectionRenderer.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()

// ── state ──────────────────────────────────────────────────────────────────
const loading = ref(true)
const saving = ref(false)
const savedSettings = ref<Record<string, unknown>>({})
const form = ref<Record<string, unknown>>({})
const searchQuery = ref('')
const activeSection = ref('')
const mainEl = ref<HTMLElement | null>(null)
const matchingSections = ref<Set<string>>(new Set())

// ── load ───────────────────────────────────────────────────────────────────
async function loadSettings() {
  loading.value = true
  try {
    const data = await adminAPI.settings.getSettings() as unknown as Record<string, unknown>
    savedSettings.value = { ...data }
    form.value = { ...data }
  } catch (err) {
    appStore.showError(String(err))
  } finally {
    loading.value = false
  }
}

onMounted(loadSettings)

// ── dirty tracking ─────────────────────────────────────────────────────────
const dirtyCount = computed(() => {
  let count = 0
  for (const key of Object.keys(form.value)) {
    if (JSON.stringify(form.value[key]) !== JSON.stringify(savedSettings.value[key])) {
      count++
    }
  }
  return count
})

function onFieldUpdate(key: string, value: unknown) {
  form.value = { ...form.value, [key]: value }
}

// 默认订阅/认证源订阅：同一分组不可重复（迁自旧 SettingsView 的
// findDuplicateDefaultSubscription 保存前校验，重复则拦截不提交）。
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

// ── save / discard ─────────────────────────────────────────────────────────
async function saveChanges() {
  // 重复订阅校验：default_subscriptions 与各认证源 *_subscriptions 数组。
  for (const key of Object.keys(form.value)) {
    if (key === 'default_subscriptions' || key.endsWith('_subscriptions')) {
      const dup = duplicateGroupId(form.value[key])
      if (dup != null) {
        appStore.showError(t('admin.settings.defaults.defaultSubscriptionsDuplicate', { groupId: dup }))
        return
      }
    }
  }
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(form.value)) {
    if (JSON.stringify(form.value[key]) !== JSON.stringify(savedSettings.value[key])) {
      patch[key] = form.value[key]
    }
  }
  saving.value = true
  try {
    await adminAPI.settings.updateSettings(patch as Parameters<typeof adminAPI.settings.updateSettings>[0])
    savedSettings.value = { ...form.value }
    appStore.showSuccess(t('common.saved'))
  } catch (err) {
    appStore.showError(String(err))
  } finally {
    saving.value = false
  }
}

function discardChanges() {
  // Reassign both refs so that components watching props.settings also re-sync
  // (their watch fires only when the savedSettings reference changes).
  const snapshot = { ...savedSettings.value }
  savedSettings.value = snapshot
  form.value = snapshot
}

// ── search ─────────────────────────────────────────────────────────────────
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
      (f) =>
        f.key.toLowerCase().includes(q) ||
        resolveLabel(f.label).toLowerCase().includes(q),
    )
    if (titleMatch || fieldMatch) hits.add(section.id)
  }
  matchingSections.value = hits
}

// ── visible sections (filtered by search) ──────────────────────────────────
const visibleSectionsByTab = computed<Map<TabId, typeof allSections>>(() => {
  const byTab = getSectionsByTab()
  if (matchingSections.value.size === 0) return byTab
  const filtered = new Map<TabId, typeof allSections>()
  for (const [tab, sections] of byTab) {
    const visible = sections.filter((s) => matchingSections.value.has(s.id))
    if (visible.length > 0) filtered.set(tab, visible)
  }
  return filtered
})

// ── scroll tracking (throttled via rAF) ────────────────────────────────────────
let scrollRafId: number | null = null

function onMainScroll() {
  if (scrollRafId !== null) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (!mainEl.value) return
    const cards = mainEl.value.querySelectorAll<HTMLElement>('[id^="sr-section-"]')
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      if (rect.top <= 160) activeSection.value = card.id.replace('sr-section-', '')
    }
  })
}

onUnmounted(() => {
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId)
})

async function scrollToSection(id: string) {
  await nextTick()
  const el = document.getElementById(`sr-section-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeSection.value = id
}

// ── label helpers ──────────────────────────────────────────────────────────
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
</script>

<style scoped>
/* bar transition */
.srg-bar-enter-active, .srg-bar-leave-active { transition: opacity .2s, transform .2s; }
.srg-bar-enter-from, .srg-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .srg-bar-enter-active, .srg-bar-leave-active { transition: none; }
}
</style>
