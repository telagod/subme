<template>
  <Transition name="pvd-fade"><div v-if="open" class="pvd-overlay" aria-hidden="true" @click="$emit('close')" /></Transition>
  <Transition name="pvd-slide">
    <div v-if="open" class="pvd-drawer" role="dialog" aria-modal="true" @keydown.esc="$emit('close')">
      <div class="pvd-head">
        <div class="pvd-head-left">
          <LayersIcon class="pvd-head-ico" />
          <div class="pvd-head-text">
            <h2 class="pvd-head-title">{{ detail?.name || modelName || slug || '—' }}</h2>
            <span v-if="detail?.id || slug" class="pvd-head-slug">{{ detail?.id || slug }}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" :aria-label="t('admin.providerVerify.close')" @click="$emit('close')"><XIcon class="w-4 h-4" /></Button>
      </div>

      <div v-if="loading" class="pvd-body">
        <div class="pvd-skel-block"></div><div class="pvd-skel-short"></div>
        <div class="pvd-skel-table"><div v-for="i in 4" :key="i" class="pvd-skel-row"></div></div>
      </div>
      <div v-else-if="error" class="pvd-body"><div class="pvd-error">{{ t('admin.providerVerify.loadError') }}{{ error }}</div></div>
      <div v-else-if="detail" class="pvd-body">
        <div class="pvd-meta-row">
          <Badge v-if="detail.context_len" variant="outline" class="gap-1 text-[10.5px] font-semibold"><HashIcon class="w-2.5 h-2.5" />{{ fmtCtx(detail.context_len) }} ctx</Badge>
          <Badge v-for="cap in filteredCaps" :key="cap" variant="outline" class="bg-primary/10 border-primary/30 text-primary text-[10.5px] font-semibold">{{ capLabel(cap) }}</Badge>
          <!-- 已覆盖徽章 -->
          <Badge v-if="detail.overridden" variant="outline" class="gap-1 bg-primary/15 border-primary/40 text-primary text-[10.5px] font-bold">
            <ShieldCheckIcon class="w-2.5 h-2.5" />{{ t('admin.providerVerify.overriddenBadge') }}
          </Badge>
        </div>
        <div v-if="detail.description" class="pvd-desc-block">
          <p class="pvd-desc-text" :class="descExpanded ? '' : 'pvd-desc-clamp'">{{ detail.description }}</p>
          <Button variant="link" class="mt-1.5 h-auto p-0 text-xs font-semibold" @click="descExpanded = !descExpanded">{{ descExpanded ? t('admin.providerVerify.showLess') : t('admin.providerVerify.showMore') }}</Button>
        </div>
        <div v-if="detail.baseline" class="pvd-baseline-note" :class="detail.overridden ? 'pvd-baseline-note--overridden' : ''">
          <InfoIcon class="pvd-note-ico" />
          <span>{{ t('admin.providerVerify.baselineNote') }}</span>
          <span v-if="detail.baseline.source" class="pvd-note-source">{{ detail.baseline.source }}</span>
          <span v-if="detail.overridden" class="pvd-note-manual-tag">{{ t('admin.providerVerify.overriddenLabel') }}</span>
        </div>
        <!-- B3: 同步失败 inline 提示 + 重试，避免静默展示空 providers -->
        <div v-if="syncFailed && !syncing" class="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
          <InfoIcon class="w-3.5 h-3.5 flex-shrink-0" />
          <span class="flex-1 min-w-0">{{ t('admin.providerVerify.syncFailed') }}</span>
          <Button variant="outline" size="sm" :disabled="syncing" class="h-7 px-2 text-xs font-semibold" @click="retrySync">
            <RefreshCwIcon class="w-3 h-3 mr-1" :class="syncing ? 'animate-spin' : ''" />{{ t('admin.providerVerify.retry') }}
          </Button>
        </div>
        <div class="pvd-table-wrap">
          <div v-if="syncing" class="pvd-sync-overlay"><RefreshCwIcon class="pvd-sync-ico" /><span class="pvd-sync-txt">{{ t('admin.providerVerify.syncing') }}</span></div>
          <table v-if="sortedProviders.length" class="pvd-table">
            <thead><tr class="pvd-thead-row">
              <th class="pvd-th pvd-th-provider">{{ t('admin.providerVerify.colProvider') }}</th>
              <th class="pvd-th pvd-th-r">{{ t('admin.providerVerify.colIn') }}</th>
              <th class="pvd-th pvd-th-r">{{ t('admin.providerVerify.colOut') }}</th>
              <th class="pvd-th pvd-th-r">{{ t('admin.providerVerify.colCacheRead') }}</th>
              <th class="pvd-th pvd-th-r">{{ t('admin.providerVerify.colCacheWrite') }}</th>
              <th class="pvd-th pvd-th-r">{{ t('admin.providerVerify.colUptime') }}</th>
              <th class="pvd-th pvd-th-c">{{ t('admin.providerVerify.colQuant') }}</th>
            </tr></thead>
            <tbody>
              <tr v-for="prov in sortedProviders" :key="prov.tag" class="pvd-tr" :class="[isBaseline(prov) ? 'pvd-tr-bl' : '', isPinned(prov) ? 'pvd-tr-pinned' : '']">
                <td class="pvd-td">
                  <div class="pvd-prov-cell">
                    <span v-if="isBaseline(prov)" class="pvd-bl-edge" aria-hidden="true"></span>
                    <span class="pvd-prov-name">{{ prov.provider || prov.tag }}</span>
                    <Badge v-if="isBaseline(prov) && !detail.overridden" variant="outline" class="bg-primary/15 border-primary/30 text-primary text-[9px] font-bold uppercase tracking-wide px-1 py-0">{{ t('admin.providerVerify.baselineBadge') }}</Badge>
                    <Badge v-if="isPinned(prov)" variant="outline" class="bg-primary/20 border-primary/45 text-primary text-[9px] font-bold uppercase tracking-wide px-1 py-0">{{ t('admin.providerVerify.pinnedBadge') }}</Badge>
                  </div>
                </td>
                <td class="pvd-td pvd-td-r"><span class="pvd-price">{{ fmtP(prov.input) }}</span></td>
                <td class="pvd-td pvd-td-r"><span class="pvd-price">{{ fmtP(prov.output) }}</span></td>
                <td class="pvd-td pvd-td-r"><span class="pvd-price pvd-muted">{{ fmtP(prov.cache_read) }}</span></td>
                <td class="pvd-td pvd-td-r"><span class="pvd-price pvd-muted">{{ fmtP(prov.cache_write) }}</span></td>
                <td class="pvd-td pvd-td-r"><span class="pvd-uptime" :class="uptimeCls(prov.uptime_1d)">{{ fmtUp(prov.uptime_1d) }}</span></td>
                <td class="pvd-td pvd-td-c"><span v-if="prov.quant" class="pvd-quant">{{ prov.quant }}</span><span v-else class="pvd-muted">—</span></td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!syncing" class="pvd-empty-prov"><PackageSearchIcon class="pvd-empty-ico" /><p class="pvd-empty-txt">{{ t('admin.providerVerify.noProviders') }}</p></div>
        </div>

        <!-- 编辑覆盖价区域 -->
        <div class="pvd-foot">
          <Button variant="outline" :class="editOpen ? 'border-primary text-primary bg-primary/8' : ''" class="gap-1.5 text-xs font-semibold" @click="toggleEdit">
            <EditIcon class="w-3 h-3" />{{ t('admin.providerVerify.editBtn') }}
            <ChevronDownIcon class="w-3 h-3 flex-shrink-0 transition-transform" :class="editOpen ? 'rotate-180' : ''" />
          </Button>
        </div>

        <!-- 覆盖编辑面板（展开） -->
        <Transition name="pvd-panel">
          <div v-if="editOpen" class="pvd-edit-panel">
            <p class="pvd-panel-title">{{ t('admin.providerVerify.panelTitle') }}</p>

            <!-- 三态单选 -->
            <RadioGroup v-model="overrideMode" class="flex flex-col gap-1">
              <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors" :class="overrideMode === 'auto' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'">
                <RadioGroupItem value="auto" />
                <span class="text-sm font-medium text-foreground">{{ t('admin.providerVerify.modeAuto') }}</span>
                <span class="text-xs text-muted-foreground">{{ t('admin.providerVerify.modeAutoHint') }}</span>
              </label>
              <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors" :class="overrideMode === 'pinned' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'">
                <RadioGroupItem value="pinned" />
                <span class="text-sm font-medium text-foreground">{{ t('admin.providerVerify.modePinned') }}</span>
              </label>
              <!-- 指定供应商下拉 -->
              <div v-if="overrideMode === 'pinned'" class="pb-1 pl-9 pr-3">
                <Select v-model="pinnedTag">
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="t('admin.providerVerify.selectProviderPlaceholder')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="p in detail.providers" :key="p.tag" :value="p.tag">
                      {{ p.provider || p.tag }} ({{ fmtP(p.input) }} / {{ fmtP(p.output) }})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors" :class="overrideMode === 'manual' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'">
                <RadioGroupItem value="manual" />
                <span class="text-sm font-medium text-foreground">{{ t('admin.providerVerify.modeManual') }}</span>
                <span class="text-xs text-muted-foreground">{{ t('admin.providerVerify.modeManualHint') }}</span>
              </label>
              <!-- 手动输入框（per-MTok） -->
              <div v-if="overrideMode === 'manual'" class="pvd-manual-grid">
                <div class="pvd-manual-field">
                  <Label class="pvd-field-label">{{ t('admin.providerVerify.fieldInput') }}</Label>
                  <div class="flex items-center rounded-lg border border-input bg-card overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-r border-border flex-shrink-0 leading-8">$</span>
                    <Input v-model="manualInputMtok" type="number" min="0" step="0.001" class="flex-1 border-0 rounded-none bg-transparent text-xs tabular-nums font-mono focus-visible:ring-0 focus-visible:ring-offset-0 px-2 min-w-0" :placeholder="t('admin.providerVerify.fieldPlaceholder')" />
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-l border-border flex-shrink-0 leading-8">/M</span>
                  </div>
                </div>
                <div class="pvd-manual-field">
                  <Label class="pvd-field-label">{{ t('admin.providerVerify.fieldOutput') }}</Label>
                  <div class="flex items-center rounded-lg border border-input bg-card overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-r border-border flex-shrink-0 leading-8">$</span>
                    <Input v-model="manualOutputMtok" type="number" min="0" step="0.001" class="flex-1 border-0 rounded-none bg-transparent text-xs tabular-nums font-mono focus-visible:ring-0 focus-visible:ring-offset-0 px-2 min-w-0" :placeholder="t('admin.providerVerify.fieldPlaceholder')" />
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-l border-border flex-shrink-0 leading-8">/M</span>
                  </div>
                </div>
                <div class="pvd-manual-field">
                  <Label class="pvd-field-label">{{ t('admin.providerVerify.fieldCacheRead') }}</Label>
                  <div class="flex items-center rounded-lg border border-input bg-card overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-r border-border flex-shrink-0 leading-8">$</span>
                    <Input v-model="manualCacheReadMtok" type="number" min="0" step="0.001" class="flex-1 border-0 rounded-none bg-transparent text-xs tabular-nums font-mono focus-visible:ring-0 focus-visible:ring-offset-0 px-2 min-w-0" :placeholder="t('admin.providerVerify.fieldPlaceholder')" />
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-l border-border flex-shrink-0 leading-8">/M</span>
                  </div>
                </div>
                <div class="pvd-manual-field">
                  <Label class="pvd-field-label">{{ t('admin.providerVerify.fieldCacheWrite') }}</Label>
                  <div class="flex items-center rounded-lg border border-input bg-card overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-r border-border flex-shrink-0 leading-8">$</span>
                    <Input v-model="manualCacheWriteMtok" type="number" min="0" step="0.001" class="flex-1 border-0 rounded-none bg-transparent text-xs tabular-nums font-mono focus-visible:ring-0 focus-visible:ring-offset-0 px-2 min-w-0" :placeholder="t('admin.providerVerify.fieldPlaceholder')" />
                    <span class="px-1.5 text-[11.5px] text-muted-foreground bg-muted border-l border-border flex-shrink-0 leading-8">/M</span>
                  </div>
                </div>
              </div>
            </RadioGroup>

            <!-- 备注 -->
            <div class="pvd-note-field">
              <Label class="pvd-field-label">{{ t('admin.providerVerify.noteLabel') }}</Label>
              <Input v-model="noteText" type="text" maxlength="200" :placeholder="t('admin.providerVerify.notePlaceholder')" />
            </div>

            <!-- 保存/恢复操作栏 -->
            <div class="pvd-action-row">
              <span v-if="saveError" class="pvd-save-error">{{ saveError }}</span>
              <span v-if="saveOk" class="pvd-save-ok">{{ t('admin.providerVerify.saveSuccess') }}</span>
              <Button v-if="overrideMode === 'auto'" variant="destructive" :disabled="saving || !detail.overridden" class="gap-1.5 text-xs font-semibold" @click="handleRestore">
                <Trash2Icon class="w-3 h-3" />{{ t('admin.providerVerify.restoreBtn') }}
              </Button>
              <Button v-else :disabled="saving || !canSave" class="gap-1.5 text-xs font-semibold" @click="handleSave">
                <SaveIcon v-if="!saving" class="w-3 h-3" />
                <RefreshCwIcon v-else class="w-3 h-3 animate-spin" />
                {{ saving ? t('admin.providerVerify.saving') : t('admin.providerVerify.saveBtn') }}
              </Button>
            </div>
          </div>
        </Transition>
      </div>
      <div v-else class="pvd-body pvd-empty-state"><PackageSearchIcon class="pvd-empty-ico" /><p class="pvd-empty-txt">{{ t('admin.providerVerify.noSlug') }}</p></div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  XIcon, LayersIcon, HashIcon, InfoIcon, RefreshCwIcon, EditIcon,
  PackageSearchIcon, ChevronDownIcon, SaveIcon, Trash2Icon, ShieldCheckIcon
} from 'lucide-vue-next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import modelCatalogAPI from '@/api/admin/modelCatalog'
import type { CatalogModelDetail, CatalogProvider } from '@/api/admin/modelCatalog'

const props = defineProps<{ open: boolean; slug: string | null; modelName?: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  /** 覆盖保存或删除后通知父组件失效官方价缓存 */
  (e: 'override-saved', modelId: string): void
}>()
const { t } = useI18n()

const detail = ref<CatalogModelDetail | null>(null)
const loading = ref(false)
const syncing = ref(false)
const error = ref<string | null>(null)
const descExpanded = ref(false)
// B3: sync 失败时给 UI 一个明确信号 + 重试入口，避免 console.warn 后静默展示空 providers
const syncFailed = ref(false)

// ── 编辑面板状态 ──
const editOpen = ref(false)
type OverrideMode = 'auto' | 'pinned' | 'manual'
const overrideMode = ref<OverrideMode>('auto')
const pinnedTag = ref('')
const manualInputMtok = ref<string>('')
const manualOutputMtok = ref<string>('')
const manualCacheReadMtok = ref<string>('')
const manualCacheWriteMtok = ref<string>('')
const noteText = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveOk = ref(false)

watch(() => [props.open, props.slug] as const, ([nowOpen, nowSlug]) => {
  if (nowOpen && nowSlug) { void load(nowSlug) }
  else if (!nowOpen) {
    detail.value = null
    error.value = null
    descExpanded.value = false
    editOpen.value = false
  }
}, { immediate: true })

async function load(slug: string) {
  loading.value = true; error.value = null; detail.value = null; syncFailed.value = false
  editOpen.value = false
  try {
    const d = await modelCatalogAPI.getModelCatalogDetail(slug)
    if (d.providers.length === 0) {
      detail.value = d; loading.value = false; syncing.value = true
      try {
        await modelCatalogAPI.syncModelEndpoints(slug)
        detail.value = await modelCatalogAPI.getModelCatalogDetail(slug)
        syncFailed.value = false
      } catch (e) {
        syncFailed.value = true
        console.warn('[ProviderVerifyDrawer] sync failed', e)
      } finally { syncing.value = false }
    } else { detail.value = d }
    // 用现有 override 填充表单
    seedFormFromDetail(detail.value)
  } catch (e: unknown) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}

async function retrySync() {
  if (!detail.value || syncing.value) return
  const slug = detail.value.id
  syncing.value = true
  syncFailed.value = false
  try {
    await modelCatalogAPI.syncModelEndpoints(slug)
    detail.value = await modelCatalogAPI.getModelCatalogDetail(slug)
    seedFormFromDetail(detail.value)
  } catch (e) {
    syncFailed.value = true
    console.warn('[ProviderVerifyDrawer] sync retry failed', e)
  } finally {
    syncing.value = false
  }
}

function seedFormFromDetail(d: CatalogModelDetail | null) {
  const ov = d?.override
  if (!ov) {
    overrideMode.value = 'auto'
    pinnedTag.value = ''
    manualInputMtok.value = ''
    manualOutputMtok.value = ''
    manualCacheReadMtok.value = ''
    manualCacheWriteMtok.value = ''
    noteText.value = ''
    return
  }
  noteText.value = ov.note ?? ''
  // 判断模式
  const hasManual = ov.manual_input != null || ov.manual_output != null ||
    ov.manual_cache_read != null || ov.manual_cache_write != null
  if (hasManual) {
    overrideMode.value = 'manual'
    manualInputMtok.value = ov.manual_input != null ? String(ov.manual_input * 1e6) : ''
    manualOutputMtok.value = ov.manual_output != null ? String(ov.manual_output * 1e6) : ''
    manualCacheReadMtok.value = ov.manual_cache_read != null ? String(ov.manual_cache_read * 1e6) : ''
    manualCacheWriteMtok.value = ov.manual_cache_write != null ? String(ov.manual_cache_write * 1e6) : ''
    pinnedTag.value = ''
  } else if (ov.pinned_provider_tag) {
    overrideMode.value = 'pinned'
    pinnedTag.value = ov.pinned_provider_tag
  } else {
    overrideMode.value = 'auto'
    pinnedTag.value = ''
  }
}

function toggleEdit() {
  editOpen.value = !editOpen.value
  saveError.value = null
  saveOk.value = false
}

const canSave = computed(() => {
  if (overrideMode.value === 'pinned') return !!pinnedTag.value
  if (overrideMode.value === 'manual') {
    return !!(manualInputMtok.value || manualOutputMtok.value ||
      manualCacheReadMtok.value || manualCacheWriteMtok.value)
  }
  return false
})

function parseMtok(v: string): number | null {
  if (!v && v !== '0') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n / 1e6
}

async function handleSave() {
  if (!detail.value || saving.value) return
  saving.value = true
  saveError.value = null
  saveOk.value = false
  try {
    const payload: Parameters<typeof modelCatalogAPI.putModelOverride>[0] = {
      model_id: detail.value.id,
      note: noteText.value || undefined
    }
    if (overrideMode.value === 'pinned') {
      payload.pinned_provider_tag = pinnedTag.value
    } else if (overrideMode.value === 'manual') {
      payload.manual_input = parseMtok(manualInputMtok.value)
      payload.manual_output = parseMtok(manualOutputMtok.value)
      payload.manual_cache_read = parseMtok(manualCacheReadMtok.value)
      payload.manual_cache_write = parseMtok(manualCacheWriteMtok.value)
    }
    await modelCatalogAPI.putModelOverride(payload)
    // 重拉详情以刷新 overridden / baseline
    detail.value = await modelCatalogAPI.getModelCatalogDetail(detail.value.id)
    saveOk.value = true
    setTimeout(() => { saveOk.value = false }, 3000)
    emit('override-saved', props.modelName ?? detail.value.id)
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

async function handleRestore() {
  if (!detail.value || saving.value) return
  saving.value = true
  saveError.value = null
  saveOk.value = false
  try {
    await modelCatalogAPI.deleteModelOverride(detail.value.id)
    detail.value = await modelCatalogAPI.getModelCatalogDetail(detail.value.id)
    seedFormFromDetail(detail.value)
    saveOk.value = true
    setTimeout(() => { saveOk.value = false }, 3000)
    emit('override-saved', props.modelName ?? detail.value.id)
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

const sortedProviders = computed<CatalogProvider[]>(() => {
  if (!detail.value) return []
  const src = detail.value.baseline?.source
  return [...detail.value.providers].sort((a, b) => {
    if (a.tag === src && b.tag !== src) return -1
    if (a.tag !== src && b.tag === src) return 1
    return (a.input ?? Infinity) - (b.input ?? Infinity)
  })
})

const SHOW_CAPS = ['reasoning', 'tools', 'structured_outputs', 'vision', 'image-generation']
const CAP_LABELS: Record<string, string> = {
  reasoning: 'Reasoning', tools: 'Tool Use', structured_outputs: 'Structured Out',
  vision: 'Vision', 'image-generation': 'Image Gen'
}
const filteredCaps = computed(() => detail.value?.capabilities?.filter(c => SHOW_CAPS.includes(c)) ?? [])
function capLabel(c: string) { return CAP_LABELS[c] ?? c }
function isBaseline(p: CatalogProvider) { return p.tag === detail.value?.baseline?.source }
function isPinned(p: CatalogProvider) {
  return !!(detail.value?.override?.pinned_provider_tag && p.tag === detail.value.override.pinned_provider_tag)
}

function fmtP(v?: number | null): string {
  if (v == null) return '—'
  const m = v * 1e6
  return `$${m.toFixed(m >= 1 ? 2 : m >= 0.1 ? 3 : 4)}`
}
function fmtCtx(n: number) { return n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}k` : String(n) }
function fmtUp(u?: number) { return u == null ? '—' : `${u.toFixed(1)}%` }
function uptimeCls(u?: number) { return u == null ? 'pvd-up-muted' : u < 95 ? 'pvd-up-warn' : 'pvd-up-ok' }
</script>

<style scoped>
.pvd-overlay { position:fixed;inset:0;z-index:49;background:rgba(0,0,0,.45); }
.pvd-drawer {
  position:fixed;right:0;top:0;z-index:50;width:100%;max-width:560px;height:100%;overflow-y:auto;
  display:flex;flex-direction:column;
  background:hsl(var(--card));
  border-left:1px solid hsl(var(--border));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),-8px 0 40px rgba(0,0,0,.5);
}
.pvd-head { display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid hsl(var(--border));background:hsl(var(--muted));flex-shrink:0; }
.pvd-head-left { display:flex;align-items:center;gap:10px;min-width:0; }
.pvd-head-ico { width:18px;height:18px;color:hsl(var(--primary));flex-shrink:0; }
.pvd-head-text { display:flex;flex-direction:column;gap:2px;min-width:0; }
.pvd-head-title { font-size:14px;font-weight:700;color:hsl(var(--foreground));margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.pvd-head-slug { font-size:10.5px;color:hsl(var(--muted-foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'IBM Plex Mono','ui-monospace','SFMono-Regular','Menlo',monospace;font-variant-numeric:tabular-nums; }
.pvd-body { display:flex;flex-direction:column;gap:14px;padding:18px 20px;flex:1; }
.pvd-skel-block,.pvd-skel-short,.pvd-skel-row { background:hsl(var(--muted));border-radius:8px;animation:pvd-skel 1.4s ease-in-out infinite; }
.pvd-skel-block { height:44px; }
.pvd-skel-short { height:20px;width:60%; }
.pvd-skel-table { display:flex;flex-direction:column;gap:6px; }
.pvd-skel-row { height:34px; }
@keyframes pvd-skel { 0%,100%{opacity:.5}50%{opacity:.9} }
@media (prefers-reduced-motion:reduce){.pvd-skel-block,.pvd-skel-short,.pvd-skel-row{animation:none}}
.pvd-error { padding:10px 14px;border-radius:10px;font-size:12.5px;background:hsl(var(--destructive) / 0.15);border:1px solid hsl(var(--destructive));color:hsl(var(--destructive)); }
.pvd-meta-row { display:flex;flex-wrap:wrap;gap:6px;align-items:center; }
.pvd-desc-block { padding:12px 14px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:10px; }
.pvd-desc-text { font-size:12px;line-height:1.65;color:hsl(var(--muted-foreground));margin:0; }
.pvd-desc-clamp { display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden; }
.pvd-baseline-note { display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:hsl(var(--primary) / 0.08);border:1px solid hsl(var(--primary) / 0.2);font-size:11.5px;color:hsl(var(--muted-foreground)); }
.pvd-baseline-note--overridden { background:hsl(var(--primary) / 0.13);border-color:hsl(var(--primary) / 0.35); }
.pvd-note-ico { width:13px;height:13px;color:hsl(var(--primary));flex-shrink:0; }
.pvd-note-source { font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:hsl(var(--primary));font-weight:600;padding:1px 5px;border-radius:4px;background:hsl(var(--primary) / 0.12);border:1px solid hsl(var(--primary) / 0.25); }
.pvd-note-manual-tag { font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:1px 5px;border-radius:4px;background:hsl(var(--primary) / 0.2);border:1px solid hsl(var(--primary) / 0.4);color:hsl(var(--primary)); }
.pvd-table-wrap { position:relative;border:1px solid hsl(var(--border));border-radius:10px;overflow:hidden; }
.pvd-sync-overlay { position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:hsl(var(--background) / 0.72);border-radius:10px; }
.pvd-sync-ico { width:22px;height:22px;color:hsl(var(--primary));animation:pvd-spin 1s linear infinite; }
@keyframes pvd-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.pvd-sync-ico{animation:none}}
.pvd-sync-txt { font-size:11.5px;color:hsl(var(--muted-foreground)); }
.pvd-table { width:100%;border-collapse:collapse;font-size:12px; }
.pvd-thead-row { background:hsl(var(--muted));border-bottom:1px solid hsl(var(--border)); }
.pvd-th { padding:8px 10px;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:hsl(var(--muted-foreground));white-space:nowrap;text-align:left; }
.pvd-th-r { text-align:right; }.pvd-th-c { text-align:center; }.pvd-th-provider { min-width:140px; }
.pvd-tr { border-top:1px solid hsl(var(--border));transition:background .12s; }
.pvd-tr:hover { background:hsl(var(--accent) / 0.5); }
.pvd-tr-bl { background:hsl(var(--primary) / 0.07); }
.pvd-tr-bl:hover { background:hsl(var(--primary) / 0.12); }
.pvd-tr-pinned { background:hsl(var(--primary) / 0.09); }
.pvd-tr-pinned:hover { background:hsl(var(--primary) / 0.14); }
.pvd-td { padding:9px 10px;vertical-align:middle; }
.pvd-td-r { text-align:right; }.pvd-td-c { text-align:center; }
.pvd-prov-cell { display:flex;align-items:center;gap:7px; }
.pvd-bl-edge { display:inline-block;width:3px;height:20px;border-radius:2px;background:hsl(var(--primary));flex-shrink:0; }
.pvd-prov-name { font-size:12px;font-weight:500;color:hsl(var(--foreground)); }
.pvd-price { font-size:11.5px;font-variant-numeric:tabular-nums;font-family:'IBM Plex Mono','ui-monospace','SFMono-Regular','Menlo',monospace;color:hsl(var(--foreground)); }
.pvd-muted { color:hsl(var(--muted-foreground))!important; }
.pvd-uptime { font-size:11px;font-variant-numeric:tabular-nums; }
.pvd-up-ok { color:#46C98C; }.pvd-up-warn { color:#F4A64A; }.pvd-up-muted { color:hsl(var(--muted-foreground)); }
.pvd-quant { display:inline-block;padding:1px 5px;border-radius:4px;font-size:9.5px;font-weight:600;letter-spacing:.04em;background:hsl(var(--muted));border:1px solid hsl(var(--input));color:hsl(var(--muted-foreground)); }
.pvd-empty-prov,.pvd-empty-state { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:36px 16px;background:hsl(var(--muted)); }
.pvd-empty-ico { width:32px;height:32px;color:hsl(var(--muted-foreground));opacity:.3; }
.pvd-empty-txt { font-size:12px;color:hsl(var(--muted-foreground));margin:0;text-align:center; }

/* 编辑按钮 */
.pvd-foot { display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid hsl(var(--border)); }

/* 编辑面板 */
.pvd-edit-panel {
  padding:16px;border:1px solid hsl(var(--primary) / 0.22);border-radius:12px;
  background:hsl(var(--primary) / 0.04);
  display:flex;flex-direction:column;gap:14px;
}
.pvd-panel-title { font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:hsl(var(--primary));margin:0; }
.pvd-radio-group { display:flex;flex-direction:column;gap:8px; }
.pvd-radio-item {
  display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:9px;
  border:1px solid hsl(var(--border));background:hsl(var(--muted));cursor:pointer;
  transition:border-color .14s,background .14s;
}
.pvd-radio-item:hover { border-color:hsl(var(--input));background:hsl(var(--card)); }
.pvd-radio-item--active { border-color:hsl(var(--primary) / 0.4);background:hsl(var(--primary) / 0.07); }
.pvd-radio-input { position:absolute;opacity:0;width:0;height:0; }
.pvd-radio-dot {
  width:14px;height:14px;border-radius:50%;border:2px solid hsl(var(--input));flex-shrink:0;
  transition:border-color .14s,background .14s;
}
.pvd-radio-item--active .pvd-radio-dot { border-color:hsl(var(--primary));background:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--primary) / 0.18); }
.pvd-radio-label { font-size:12.5px;font-weight:600;color:hsl(var(--foreground)); }
.pvd-radio-hint { font-size:10.5px;color:hsl(var(--muted-foreground));margin-left:auto; }

/* 手动输入网格 */
.pvd-manual-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 12px 4px 35px; }
.pvd-manual-field { display:flex;flex-direction:column;gap:4px; }
.pvd-field-label { font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:hsl(var(--muted-foreground)); }

/* 备注 */
.pvd-note-field { display:flex;flex-direction:column;gap:5px; }

/* 操作栏 */
.pvd-action-row { display:flex;align-items:center;gap:10px;justify-content:flex-end; }
.pvd-save-error { font-size:11.5px;color:hsl(var(--destructive));margin-right:auto;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.pvd-save-ok { font-size:11.5px;color:#46C98C;margin-right:auto; }

/* 面板折叠动画 */
.pvd-panel-enter-active,.pvd-panel-leave-active { transition:opacity .2s,transform .22s cubic-bezier(.22,.68,0,1.1),max-height .25s ease; max-height:600px; overflow:hidden; }
.pvd-panel-enter-from,.pvd-panel-leave-to { opacity:0;transform:translateY(-6px);max-height:0; }
@media(prefers-reduced-motion:reduce){.pvd-panel-enter-active,.pvd-panel-leave-active{transition:none}}

.pvd-fade-enter-active,.pvd-fade-leave-active{transition:opacity .2s}
.pvd-fade-enter-from,.pvd-fade-leave-to{opacity:0}
.pvd-slide-enter-active,.pvd-slide-leave-active{transition:transform .28s cubic-bezier(.22,.68,0,1.2)}
.pvd-slide-enter-from,.pvd-slide-leave-to{transform:translateX(100%)}
@media(prefers-reduced-motion:reduce){.pvd-fade-enter-active,.pvd-fade-leave-active,.pvd-slide-enter-active,.pvd-slide-leave-active{transition:none}}
</style>
