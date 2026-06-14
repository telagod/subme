<template>
  <!-- 空态 -->
  <div
    v-if="!loading && platforms.length === 0"
    class="rise flex flex-col items-center justify-center gap-[10px] rounded-xl border border-dashed border-border bg-card px-6 py-[72px] shadow-inner"
  >
    <div class="text-4xl leading-none opacity-20">⬡</div>
    <p class="m-0 text-sm font-semibold text-foreground">{{ t('admin.pricingDesk.noData') }}</p>
    <p class="m-0 text-center text-xs text-muted-foreground">{{ t('admin.pricingDesk.noDataHint') }}</p>
    <RouterLink
      to="/admin/channels/pricing"
      class="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-4 py-[7px] text-[12.5px] font-semibold text-foreground no-underline transition-colors hover:border-primary/40 hover:shadow-[0_0_12px_rgba(0,0,0,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <CalculatorIcon class="h-3.5 w-3.5 text-primary" />
      {{ t('admin.pricingDesk.goConfigBtn') }}
    </RouterLink>
  </div>

  <!-- 矩阵面板 -->
  <div v-else class="rise flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md">
    <!-- 图例 + 同步目录按钮 -->
    <div class="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
      <span class="inline-flex items-center gap-[5px] text-[10.5px] text-muted-foreground">
        <span class="inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full bg-emerald-500"></span>
        {{ t('admin.pricingDesk.legendBelow') }}
      </span>
      <span class="text-[10px] text-muted-foreground/40">·</span>
      <span class="inline-flex items-center gap-[5px] text-[10.5px] text-muted-foreground">
        <span class="inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full bg-muted-foreground/50"></span>
        {{ t('admin.pricingDesk.legendEqual') }}
      </span>
      <span class="text-[10px] text-muted-foreground/40">·</span>
      <span class="inline-flex items-center gap-[5px] text-[10.5px] text-muted-foreground">
        <span class="inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full bg-destructive"></span>
        {{ t('admin.pricingDesk.legendAbove') }}
      </span>
      <span class="flex-1"></span>
      <Button
        variant="outline"
        size="sm"
        :disabled="syncLoading"
        :title="t('admin.pricingDesk.syncCatalogTitle')"
        class="h-7 gap-[5px] whitespace-nowrap px-[11px] text-[11px] font-semibold"
        @click="$emit('sync-catalog')"
      >
        <RefreshCwIcon class="h-3 w-3 flex-shrink-0" :class="syncLoading ? 'animate-spin' : ''" />
        {{ t('admin.pricingDesk.syncCatalogBtn') }}
      </Button>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-xs">
        <!-- 表头 -->
        <thead>
          <tr class="border-b border-border bg-muted/50">
            <th
              class="sticky left-0 z-[2] min-w-[200px] bg-muted/50 px-3 py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted-foreground"
            >
              {{ t('admin.pricingDesk.colModel') }}
            </th>
            <th
              v-for="group in activeGroups"
              :key="group.id"
              class="min-w-[130px] whitespace-nowrap px-3 py-[10px] text-center text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted-foreground"
            >
              <div class="flex flex-col items-center gap-1">
                <span class="text-[11px] font-semibold normal-case tracking-normal text-foreground">{{ group.name }}</span>
                <!-- ×倍率就地编辑 -->
                <div class="flex items-center justify-center">
                  <span
                    v-if="editingGroupId !== group.id"
                    class="cursor-pointer rounded border border-transparent px-[5px] py-px text-[10.5px] text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
                    :title="t('admin.pricingDesk.dblClickToEdit')"
                    @dblclick="startEditMultiplier(group)"
                  >×{{ group.rate_multiplier.toFixed(2) }}</span>
                  <template v-else>
                    <Input
                      :ref="(el) => { if (group.id === editingGroupId) { multiplierInputRef = el as HTMLInputElement } }"
                      v-model.number="editingMultiplierValue"
                      type="number"
                      step="0.01"
                      min="0"
                      class="h-6 w-[62px] px-1 py-0.5 text-center text-[11px]"
                      @keydown.enter="commitMultiplier(group.id)"
                      @keydown.esc="cancelEditMultiplier"
                      @blur="commitMultiplier(group.id)"
                    />
                  </template>
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <!-- 按 platform 分组折叠 -->
        <tbody>
          <template v-for="platform in platforms" :key="platform">
            <!-- platform 行组标题 -->
            <tr
              class="cursor-pointer select-none border-t border-border bg-muted/50 transition-colors hover:bg-muted"
              @click="togglePlatform(platform)"
            >
              <td
                :colspan="activeGroups.length + 1"
                class="px-4 py-[7px]"
              >
                <div class="flex items-center gap-2">
                  <ChevronDownIcon
                    class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200"
                    :class="collapsedPlatforms.has(platform) ? '-rotate-90' : ''"
                  />
                  <span class="text-[10.5px] font-bold uppercase tracking-[.08em] text-foreground/80">{{ platform }}</span>
                  <span class="text-[10.5px] text-muted-foreground">
                    {{ t('admin.pricingDesk.modelCount', { n: rowsByPlatform[platform]?.length ?? 0 }) }}
                  </span>
                </div>
              </td>
            </tr>

            <!-- 模型行 -->
            <template v-if="!collapsedPlatforms.has(platform)">
              <tr
                v-for="row in rowsByPlatform[platform]"
                :key="row.model"
                class="border-b border-border transition-colors hover:bg-accent/30"
                @mouseenter="onRowHover(row.model)"
              >
                <!-- 模型名列 -->
                <td class="sticky left-0 z-[2] bg-card px-4 py-[5px] align-middle hover:bg-accent/30">
                  <span class="block whitespace-nowrap font-mono text-[11.5px] text-foreground">{{ row.model }}</span>
                  <!-- 官方价基准条 -->
                  <template v-if="officialPricingCache[row.model] && officialPricingCache[row.model] !== 'loading' && (officialPricingCache[row.model] as OfficialPricing).found">
                    <div class="mt-0.5 flex flex-nowrap items-center gap-1 whitespace-nowrap">
                      <span class="text-[9px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{{ t('admin.pricingDesk.officialStripLabel') }}</span>
                      <span class="text-[10px] text-foreground/70">{{ fmtPrice((officialPricingCache[row.model] as OfficialPricing).inputPrice) }}</span>
                      <span class="text-[9px] text-muted-foreground/50">/</span>
                      <span class="text-[10px] text-foreground/70">{{ fmtPrice((officialPricingCache[row.model] as OfficialPricing).outputPrice) }}</span>
                      <span class="text-[9px] text-muted-foreground">{{ t('admin.pricingDesk.officialStripPerM') }}</span>
                      <!-- 来源 chip（可点击打开供应商核对抽屉） -->
                      <Badge
                        v-if="(officialPricingCache[row.model] as OfficialPricing).slug"
                        variant="outline"
                        class="h-[14px] cursor-pointer select-none rounded border-primary/25 bg-primary/10 px-[5px] text-[8.5px] font-bold uppercase tracking-[.05em] text-primary transition-colors hover:border-primary/50 hover:bg-primary/20"
                        :title="t('admin.pricingDesk.sourceChipTitle')"
                        @click.stop="$emit('open-detail', { slug: (officialPricingCache[row.model] as OfficialPricing).slug!, model: row.model })"
                      >{{ (officialPricingCache[row.model] as OfficialPricing).source || 'openrouter' }}</Badge>
                    </div>
                  </template>
                </td>

                <!-- 每个分组的单元格 -->
                <td
                  v-for="group in activeGroups"
                  :key="group.id"
                  class="px-2 py-[5px] text-center align-middle"
                >
                  <MatrixCell
                    v-if="row.cells[group.id]"
                    :cell="row.cells[group.id]"
                    :model="row.model"
                    :official-pricing="officialPricingCache[row.model]"
                  />
                  <span v-else class="text-[11px] text-muted-foreground">—</span>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>

      <!-- 加载骨架 -->
      <div v-if="loading" class="flex flex-col gap-2 px-4 py-3">
        <div v-for="i in 6" :key="i" class="h-[38px] animate-pulse rounded-md bg-muted"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronDownIcon, CalculatorIcon, RefreshCwIcon } from 'lucide-vue-next'
import MatrixCell from './MatrixCell.vue'
import type { MatrixRow, OfficialPricing } from './usePricingMatrix'
import type { AdminGroup } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  loading: boolean
  platforms: string[]
  activeGroups: AdminGroup[]
  matrix: MatrixRow[]
  officialPricingCache: Record<string, OfficialPricing | 'loading'>
  syncLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'hover-model', model: string): void
  (e: 'update-multiplier', groupId: number, value: number): void
  (e: 'sync-catalog'): void
  (e: 'open-detail', payload: { slug: string; model: string }): void
}>()

const { t } = useI18n()

const collapsedPlatforms = ref(new Set<string>())
function togglePlatform(p: string) {
  if (collapsedPlatforms.value.has(p)) {
    collapsedPlatforms.value.delete(p)
  } else {
    collapsedPlatforms.value.add(p)
  }
}

const rowsByPlatform = computed(() => {
  const map: Record<string, MatrixRow[]> = {}
  for (const row of props.matrix) {
    if (!map[row.platform]) map[row.platform] = []
    map[row.platform].push(row)
  }
  return map
})

function onRowHover(model: string) {
  emit('hover-model', model)
}

const editingGroupId = ref<number | null>(null)
const editingMultiplierValue = ref(1)
const multiplierInputRef = ref<HTMLInputElement | null>(null)

function startEditMultiplier(group: AdminGroup) {
  editingGroupId.value = group.id
  editingMultiplierValue.value = group.rate_multiplier
  nextTick(() => multiplierInputRef.value?.select())
}

function cancelEditMultiplier() {
  editingGroupId.value = null
}

async function commitMultiplier(groupId: number) {
  if (editingGroupId.value !== groupId) return
  editingGroupId.value = null
  const v = Number(editingMultiplierValue.value)
  if (!isNaN(v) && v > 0) {
    emit('update-multiplier', groupId, v)
  }
}

/** 価格格式化 per-token → /M */
function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  const perM = v * 1_000_000
  const decimals = perM >= 1 ? 2 : perM >= 0.1 ? 3 : 4
  return `$${perM.toFixed(decimals)}`
}
</script>

<style scoped>
/* ── 入场动画 ── */
.rise { opacity: 0; transform: translateY(8px); animation: rise .45s cubic-bezier(.22,.68,0,1.2) forwards; }
@keyframes rise { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } }
</style>
