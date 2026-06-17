<template>
  <AppLayout>
    <div class="flex flex-col gap-3">
      <!-- 页头 -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <h1 class="m-0 text-base font-semibold tracking-tight text-foreground">
            {{ t('admin.pricingList.title') }}
          </h1>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t('admin.pricingList.subtitle') }}
          </p>
          <p class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              {{ t('admin.pricingList.mainstreamSummary', {
                models: visibleTotalCount,
                providers: mainstreamProviders.length
              }) }}
            </span>
            <span aria-hidden="true" class="text-border">|</span>
            <span>{{ t('admin.pricingList.sourceHint') }}</span>
            <template v-if="lastSyncedText">
              <span aria-hidden="true" class="text-border">|</span>
              <span>{{ t('admin.pricingList.lastSynced', { time: lastSyncedText }) }}</span>
            </template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="loading || syncLoading"
            @click="handleRefresh"
          >
            <RefreshCwIcon class="h-3.5 w-3.5 flex-shrink-0" :class="loading ? 'pml-spin' : ''" />
            {{ t('admin.pricingList.refresh') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="syncLoading"
            @click="handleSync"
          >
            <CloudDownloadIcon class="h-3.5 w-3.5 flex-shrink-0" :class="syncLoading ? 'pml-spin' : ''" />
            {{ t('admin.pricingList.syncCatalog') }}
          </Button>
        </div>
      </div>

      <!-- 同步成功提示 -->
      <Transition name="pml-toast">
        <div
          v-if="syncToast != null"
          class="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-foreground"
        >
          {{ t('admin.pricingList.syncSuccess', { n: syncToast }) }}
        </div>
      </Transition>

      <!-- 错误提示 -->
      <div
        v-if="error"
        class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        {{ t('admin.pricingList.loadFailed') }}{{ error }}
      </div>

      <!-- 过滤栏：search + sort + onlyOverridden -->
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
        <div class="relative max-w-xs flex-1">
          <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            class="h-8 pl-8 text-xs"
            :placeholder="t('admin.pricingList.search.placeholder')"
          />
        </div>

        <div class="flex items-center gap-1.5">
          <Label class="whitespace-nowrap text-[11px] text-muted-foreground">
            {{ t('admin.pricingList.sort.label') }}
          </Label>
          <Select v-model="sortKey">
            <SelectTrigger class="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alpha-asc">{{ t('admin.pricingList.sort.alphaAsc') }}</SelectItem>
              <SelectItem value="input-asc">{{ t('admin.pricingList.sort.inputAsc') }}</SelectItem>
              <SelectItem value="input-desc">{{ t('admin.pricingList.sort.inputDesc') }}</SelectItem>
              <SelectItem value="output-asc">{{ t('admin.pricingList.sort.outputAsc') }}</SelectItem>
              <SelectItem value="output-desc">{{ t('admin.pricingList.sort.outputDesc') }}</SelectItem>
              <SelectItem value="context-desc">{{ t('admin.pricingList.sort.contextDesc') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center gap-1.5">
          <Switch id="pml-only-overridden" v-model:checked="showOnlyOverridden" />
          <Label for="pml-only-overridden" class="cursor-pointer whitespace-nowrap text-[11px] text-muted-foreground">
            {{ t('admin.pricingList.onlyOverridden') }}
          </Label>
        </div>

        <span class="ml-auto whitespace-nowrap text-[10.5px] italic text-muted-foreground/80">
          {{ t('admin.pricingList.mainstreamHint') }}
        </span>
      </div>

      <!-- Provider pill tabs -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="tab in providerTabs"
          :key="tab.key"
          type="button"
          class="pml-pill"
          :class="activeProvider === tab.key
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-secondary text-foreground border-border hover:bg-muted'"
          @click="activeProvider = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span
            class="ml-1 text-[10px] tabular-nums"
            :class="activeProvider === tab.key ? 'opacity-80' : 'opacity-60'"
          >{{ tab.count }}</span>
        </button>
      </div>

      <!-- 主体 -->
      <div v-if="loading" class="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <RefreshCwIcon class="pml-spin mx-auto h-5 w-5 flex-shrink-0" />
        <div class="mt-2">{{ t('admin.pricingList.loading') }}</div>
      </div>

      <div
        v-else-if="sortedModels.length === 0"
        class="rounded-md border border-dashed border-border bg-card p-10 text-center"
      >
        <PackageSearchIcon class="mx-auto h-7 w-7 flex-shrink-0 text-muted-foreground" />
        <p class="mt-3 text-sm font-medium text-foreground">{{ t('admin.pricingList.empty.title') }}</p>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.pricingList.empty.hint') }}</p>
        <Button
          variant="outline"
          size="sm"
          class="mt-4"
          :disabled="syncLoading"
          @click="handleSync"
        >
          <CloudDownloadIcon class="h-3.5 w-3.5 flex-shrink-0" :class="syncLoading ? 'pml-spin' : ''" />
          {{ t('admin.pricingList.empty.action') }}
        </Button>
      </div>

      <!-- 单表（紧凑） -->
      <div v-else class="overflow-hidden rounded-md border border-border bg-card">
        <Table class="pml-table">
          <TableHeader>
            <TableRow class="pml-row-head">
              <TableHead class="pml-th w-[30%]">
                {{ t('admin.pricingList.columns.model') }}
              </TableHead>
              <TableHead class="pml-th w-[11%]">
                {{ t('admin.pricingList.columns.provider') }}
              </TableHead>
              <TableHead class="pml-th w-[11%] text-right">
                <div>{{ t('admin.pricingList.columns.input') }}</div>
                <div class="pml-unit">{{ t('admin.pricingList.columns.unit') }}</div>
              </TableHead>
              <TableHead class="pml-th w-[11%] text-right">
                <div>{{ t('admin.pricingList.columns.output') }}</div>
                <div class="pml-unit">{{ t('admin.pricingList.columns.unit') }}</div>
              </TableHead>
              <TableHead class="pml-th w-[11%] text-right">
                <div>{{ t('admin.pricingList.columns.cacheRead') }}</div>
                <div class="pml-unit">{{ t('admin.pricingList.columns.unit') }}</div>
              </TableHead>
              <TableHead class="pml-th w-[10%] text-right">
                {{ t('admin.pricingList.columns.context') }}
              </TableHead>
              <TableHead class="pml-th w-[10%]">
                {{ t('admin.pricingList.columns.source') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="m in sortedModels"
              :key="m.id"
              class="pml-row cursor-pointer hover:bg-muted/40"
              @click="openDetail(m)"
            >
              <TableCell class="pml-td">
                <div class="flex items-center gap-1.5">
                  <span class="font-medium text-foreground">{{ m.name || m.id }}</span>
                  <TooltipProvider v-if="m.has_override" :delay-duration="200">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <SquarePenIcon class="h-3 w-3 flex-shrink-0 text-primary" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {{ t('admin.pricingList.overrideTooltip') }}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">{{ m.id }}</div>
              </TableCell>
              <TableCell class="pml-td text-xs text-muted-foreground">
                {{ extractProvider(m.id) || '—' }}
              </TableCell>
              <TableCell class="pml-td text-right font-mono text-xs tabular-nums">
                {{ fmtPriceMTok(m.baseline?.input) }}
              </TableCell>
              <TableCell class="pml-td text-right font-mono text-xs tabular-nums">
                {{ fmtPriceMTok(m.baseline?.output) }}
              </TableCell>
              <TableCell class="pml-td text-right font-mono text-xs tabular-nums text-muted-foreground">
                {{ fmtPriceMTok(m.baseline?.cache_read) }}
              </TableCell>
              <TableCell class="pml-td text-right font-mono text-xs tabular-nums text-muted-foreground">
                {{ fmtCtx(m.context_len) }}
              </TableCell>
              <TableCell class="pml-td">
                <Badge variant="outline" class="px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide">
                  {{ sourceLabel(m.baseline?.source) }}
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 详情抽屉 -->
      <ProviderVerifyDrawer
        :open="detailOpen"
        :slug="detailSlug"
        :model-name="detailModelName"
        @close="detailOpen = false"
        @override-saved="onOverrideSaved"
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  RefreshCwIcon,
  CloudDownloadIcon,
  SearchIcon,
  PackageSearchIcon,
  SquarePenIcon
} from 'lucide-vue-next'
import AppLayout from '@/components/layout/AppLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import ProviderVerifyDrawer from './ProviderVerifyDrawer.vue'
import modelCatalogAPI, {
  type CatalogModelListItem
} from '@/api/admin/modelCatalog'

const { t } = useI18n()

/** Sentinel for "all mainstream providers" pill tab. */
const ALL_SENTINEL = '__all__'

/**
 * 主流供应商白名单（按产品价值，不按模型数）。
 *
 * 每条 = OpenRouter slug 第一段的可能写法（小写，case-insensitive 匹配）。
 * `tag` 是主显示用 tag（pill label 经 prettifyProvider 美化）；
 * `aliases` 是同义匹配 tag 列表（OpenRouter 不同时期 slug 可能不一）。
 *
 * Pill 渲染按声明顺序，不按 count desc。catalog 中 count = 0 的不显示。
 */
const MAINSTREAM_PROVIDER_WHITELIST: ReadonlyArray<{
  tag: string
  aliases: ReadonlyArray<string>
}> = [
  { tag: 'anthropic', aliases: ['anthropic'] },
  { tag: 'openai', aliases: ['openai'] },
  { tag: 'google', aliases: ['google', 'google-vertex'] },
  { tag: 'x-ai', aliases: ['x-ai', 'xai'] },
  { tag: 'deepseek', aliases: ['deepseek'] },
  { tag: 'qwen', aliases: ['qwen', 'alibaba', 'tongyi'] },
  { tag: 'z-ai', aliases: ['z-ai', 'zhipu', 'zhipuai', 'glm'] },
  { tag: 'minimax', aliases: ['minimax'] },
  { tag: 'moonshotai', aliases: ['moonshotai', 'moonshot'] }
]

type SortKey =
  | 'alpha-asc'
  | 'input-asc'
  | 'input-desc'
  | 'output-asc'
  | 'output-desc'
  | 'context-desc'

// ── 状态 ──
const models = ref<CatalogModelListItem[]>([])
const lastUpdated = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)

const searchQuery = ref('')
const activeProvider = ref<string>(ALL_SENTINEL)
const sortKey = ref<SortKey>('alpha-asc')
const showOnlyOverridden = ref(false)

const syncLoading = ref(false)
const syncToast = ref<number | null>(null)
let syncToastTimer: ReturnType<typeof setTimeout> | null = null

const detailOpen = ref(false)
const detailSlug = ref<string | null>(null)
const detailModelName = ref<string | null>(null)

// ── 加载 ──
onMounted(() => {
  void fetchList()
})

async function fetchList() {
  loading.value = true
  error.value = null
  try {
    const resp = await modelCatalogAPI.listModelCatalog()
    models.value = resp.models ?? []
    lastUpdated.value = resp.last_updated ?? ''
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  await fetchList()
}

async function handleSync() {
  if (syncLoading.value) return
  syncLoading.value = true
  try {
    const result = await modelCatalogAPI.syncCatalog()
    syncToast.value = result.synced
    if (syncToastTimer) clearTimeout(syncToastTimer)
    syncToastTimer = setTimeout(() => {
      syncToast.value = null
    }, 3500)
    await fetchList()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    syncLoading.value = false
  }
}

function openDetail(m: CatalogModelListItem) {
  detailSlug.value = m.id
  detailModelName.value = m.name || m.id
  detailOpen.value = true
}

function onOverrideSaved(_modelId: string) {
  // 覆盖保存或删除后，刷新列表拉最新基准 + has_override 状态
  void fetchList()
}

// ── 衍生：主流 provider（白名单聚合，不按 count 排序）──
interface ProviderEntry {
  /** 白名单 tag（pill key + label 源） */
  tag: string
  /** 该白名单条目下所有 alias 的命中模型总数 */
  count: number
  /** 全部 alias（小写），用于过滤匹配 */
  aliases: ReadonlyArray<string>
}

/**
 * 按白名单声明顺序聚合 catalog 计数。
 *
 * - alias 匹配用 `toLowerCase().trim()` 防 case / 空格漂移。
 * - 仅当 count > 0 时入列表 → 避免空 tab。
 * - **不**按 count 排序：按白名单声明顺序，anthropic 在最前 / moonshotai 在最后。
 */
const mainstreamProviders = computed<ProviderEntry[]>(() => {
  // 1) 先聚合模型按 provider key 的计数
  const counts = new Map<string, number>()
  for (const m of models.value) {
    const raw = extractProvider(m.id)
    if (!raw) continue
    const key = raw.toLowerCase().trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  // 2) 按白名单声明顺序生成 entry，单条 count = 所有 alias 命中之和
  const out: ProviderEntry[] = []
  for (const wl of MAINSTREAM_PROVIDER_WHITELIST) {
    const aliases = wl.aliases.map((a) => a.toLowerCase().trim())
    let count = 0
    for (const a of aliases) {
      count += counts.get(a) ?? 0
    }
    if (count > 0) {
      out.push({ tag: wl.tag, count, aliases })
    }
  }
  return out
})

/** 全部白名单 alias 的扁平集合（小写），用于模型过滤命中。 */
const mainstreamTagSet = computed<Set<string>>(() => {
  const s = new Set<string>()
  for (const p of mainstreamProviders.value) {
    for (const a of p.aliases) s.add(a)
  }
  return s
})

/** 单 provider tab 选中后，把 pill key 映射回它包含的 alias 集合，用于过滤命中。 */
const activeAliasSet = computed<Set<string> | null>(() => {
  if (activeProvider.value === ALL_SENTINEL) return null
  const entry = mainstreamProviders.value.find((p) => p.tag === activeProvider.value)
  if (!entry) return null
  return new Set(entry.aliases)
})

// ── 衍生：pill tabs（含「全部」）──
interface ProviderTab {
  key: string
  label: string
  count: number
}

const providerTabs = computed<ProviderTab[]>(() => {
  const mainstream = mainstreamProviders.value
  // 「全部」count = 所有 alias 命中模型合计。
  // 白名单每个 alias 在不同 provider 字符串域中，不会重叠，简单求和即可。
  const total = mainstream.reduce((acc, p) => acc + p.count, 0)
  const tabs: ProviderTab[] = [
    {
      key: ALL_SENTINEL,
      label: t('admin.pricingList.providerTabs.all'),
      count: total
    }
  ]
  // 按白名单声明顺序渲染（mainstreamProviders 已保持声明顺序）
  for (const p of mainstream) {
    tabs.push({ key: p.tag, label: prettifyProvider(p.tag), count: p.count })
  }
  return tabs
})

// ── 衍生：过滤后的模型 ──
const filteredModels = computed<CatalogModelListItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const tagSet = mainstreamTagSet.value
  const aliasSet = activeAliasSet.value
  return models.value.filter((m) => {
    const provKey = extractProvider(m.id).toLowerCase().trim()
    // 1. 必须命中主流白名单（任一 alias）
    if (!provKey || !tagSet.has(provKey)) return false
    // 2. 单 provider tab 过滤：命中所选 pill 的任一 alias
    if (aliasSet && !aliasSet.has(provKey)) return false
    // 3. 仅覆盖
    if (showOnlyOverridden.value && !m.has_override) return false
    // 4. 搜索
    if (q) {
      const id = m.id.toLowerCase()
      const name = (m.name || '').toLowerCase()
      if (!id.includes(q) && !name.includes(q)) return false
    }
    return true
  })
})

const visibleTotalCount = computed(() => {
  const tagSet = mainstreamTagSet.value
  return models.value.reduce((acc, m) => {
    const key = extractProvider(m.id).toLowerCase().trim()
    return key && tagSet.has(key) ? acc + 1 : acc
  }, 0)
})

// ── 衍生：排序 ──
const sortedModels = computed<CatalogModelListItem[]>(() => {
  const list = [...filteredModels.value]
  switch (sortKey.value) {
    case 'input-asc':
      return list.sort((a, b) => priceOf(a, 'input') - priceOf(b, 'input'))
    case 'input-desc':
      return list.sort((a, b) => priceOf(b, 'input') - priceOf(a, 'input'))
    case 'output-asc':
      return list.sort((a, b) => priceOf(a, 'output') - priceOf(b, 'output'))
    case 'output-desc':
      return list.sort((a, b) => priceOf(b, 'output') - priceOf(a, 'output'))
    case 'context-desc':
      return list.sort((a, b) => (b.context_len ?? 0) - (a.context_len ?? 0))
    case 'alpha-asc':
    default:
      return list.sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })
      )
  }
})

// ── 衍生：最近同步时间 ──
const lastSyncedText = computed<string | null>(() => {
  if (!lastUpdated.value) return null
  const ts = Date.parse(lastUpdated.value)
  if (Number.isNaN(ts)) return null
  const diffMs = Date.now() - ts
  if (diffMs < 0) return formatAbs(ts)
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return t('admin.pricingList.justNow')
  if (min < 60) return t('admin.pricingList.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('admin.pricingList.hoursAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 30) return t('admin.pricingList.daysAgo', { n: day })
  return formatAbs(ts)
})

function formatAbs(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString()
  } catch {
    return ''
  }
}

// ── 工具：从 slug 提取 provider 前缀 ──
function extractProvider(id: string): string {
  const idx = id.indexOf('/')
  return idx > 0 ? id.slice(0, idx) : ''
}

function prettifyProvider(raw: string): string {
  if (!raw) return raw
  return raw
    .split(/[-_]/)
    .map((part) => {
      if (!part) return part
      if (part.length <= 3 && /^[a-z]+$/i.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function priceOf(m: CatalogModelListItem, kind: 'input' | 'output'): number {
  const b = m.baseline
  if (!b) return Number.POSITIVE_INFINITY
  const v = kind === 'input' ? b.input : b.output
  return v && v > 0 ? v : Number.POSITIVE_INFINITY
}

function fmtPriceMTok(perToken: number | undefined | null): string {
  if (perToken == null || !Number.isFinite(perToken) || perToken <= 0) return '—'
  const perM = perToken * 1e6
  let digits = 2
  if (perM < 0.01) digits = 4
  else if (perM < 1) digits = 3
  return `$${perM.toFixed(digits)}`
}

function fmtCtx(ctx: number | undefined | null): string {
  if (ctx == null || ctx <= 0) return '—'
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`
  return String(ctx)
}

function sourceLabel(source: string | undefined | null): string {
  const s = (source || '').trim()
  if (!s) return '—'
  return s
    .split(/[-/_]/)
    .map((part) => {
      if (!part) return part
      if (part.length <= 3 && /^[a-z]+$/.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}
</script>

<style scoped>
.pml-spin {
  animation: pml-spin 1s linear infinite;
}
@keyframes pml-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pml-spin {
    animation: none;
  }
}

.pml-toast-enter-active {
  transition: opacity 0.22s, transform 0.22s;
}
.pml-toast-leave-active {
  transition: opacity 0.35s;
}
.pml-toast-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.pml-toast-leave-to {
  opacity: 0;
}

/* Provider pill tab */
.pml-pill {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 0.625rem;
  border-radius: 9999px;
  border-width: 1px;
  border-style: solid;
  font-size: 11.5px;
  line-height: 1;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  cursor: pointer;
  white-space: nowrap;
}
.pml-pill:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.5);
}

/* Compact table */
.pml-table :deep(thead tr) {
  height: auto;
}
.pml-th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
  padding: 0.5rem 0.75rem;
  position: sticky;
  top: 0;
  background: hsl(var(--card));
  z-index: 1;
}
.pml-unit {
  font-size: 9px;
  text-transform: none;
  letter-spacing: normal;
  opacity: 0.6;
  margin-top: 1px;
  font-weight: 400;
}
.pml-row {
  min-height: 30px;
}
.pml-td {
  padding: 0.375rem 0.75rem;
  vertical-align: middle;
}
</style>
