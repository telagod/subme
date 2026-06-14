<template>
  <!-- 抽屉遮罩 -->
  <Transition name="ps-fade">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 bg-black/45"
      @click="$emit('close')"
    />
  </Transition>

  <!-- 抽屉面板 -->
  <Transition name="ps-slide">
    <div
      v-if="visible"
      class="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-y-auto border-l border-border bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04),-8px_0_32px_rgba(0,0,0,0.4)]"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4">
        <div class="flex items-center gap-2">
          <CalculatorIcon class="h-[18px] w-[18px] shrink-0 text-primary" />
          <h2 class="m-0 text-sm font-semibold text-foreground">{{ t('admin.pricingDesk.simTitle') }}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('admin.pricingDesk.simClose')"
          @click="$emit('close')"
        >
          <XIcon class="h-4 w-4" />
        </Button>
      </div>

      <!-- 表单区 -->
      <div class="flex flex-col gap-[18px] p-5">
        <!-- 选模型 -->
        <div class="flex flex-col gap-[5px]">
          <Label class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.pricingDesk.simModelLabel') }}</Label>
          <Select v-model="selectedModel">
            <SelectTrigger class="w-full text-[12.5px]">
              <SelectValue :placeholder="t('admin.pricingDesk.simModelPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{{ t('admin.pricingDesk.simModelPlaceholder') }}</SelectItem>
              <template v-for="platform in platforms" :key="platform">
                <SelectGroup>
                  <SelectLabel>{{ platform }}</SelectLabel>
                  <SelectItem
                    v-for="model in modelsByPlatform[platform]"
                    :key="model"
                    :value="model"
                  >
                    {{ model }}
                  </SelectItem>
                </SelectGroup>
              </template>
            </SelectContent>
          </Select>
        </div>

        <!-- 选分组 -->
        <div class="flex flex-col gap-[5px]">
          <Label class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.pricingDesk.simGroupLabel') }}</Label>
          <Select
            :model-value="selectedGroupId === null ? '' : String(selectedGroupId)"
            @update:model-value="(v) => selectedGroupId = v === '' ? null : Number(v)"
          >
            <SelectTrigger class="w-full text-[12.5px]">
              <SelectValue :placeholder="t('admin.pricingDesk.simGroupPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{{ t('admin.pricingDesk.simGroupPlaceholder') }}</SelectItem>
              <SelectItem v-for="g in activeGroups" :key="g.id" :value="String(g.id)">
                {{ g.name }} (×{{ g.rate_multiplier.toFixed(2) }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Token 量 -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-[5px]">
            <Label class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.pricingDesk.simInputTokens') }}</Label>
            <Input
              v-model.number="inputTokens"
              type="number"
              min="0"
              placeholder="1000000"
            />
          </div>
          <div class="flex flex-col gap-[5px]">
            <Label class="text-[11.5px] font-semibold text-muted-foreground">{{ t('admin.pricingDesk.simOutputTokens') }}</Label>
            <Input
              v-model.number="outputTokens"
              type="number"
              min="0"
              placeholder="200000"
            />
          </div>
        </div>

        <!-- Cache 命中滑杆 -->
        <div class="flex flex-col gap-[5px]">
          <Label class="flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
            <span>{{ t('admin.pricingDesk.simCacheHit') }}</span>
            <span class="font-mono tabular-nums text-primary">{{ (cacheHitRatio * 100).toFixed(0) }}%</span>
          </Label>
          <input
            v-model.number="cacheHitRatio"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="ps-range w-full cursor-pointer"
          />
          <div class="mt-[3px] flex justify-between text-[10.5px] text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        <!-- 结果展示 -->
        <div
          v-if="selectedModel && selectedGroupId !== null && cell"
          class="flex flex-col gap-[10px] rounded-xl border border-border bg-muted/40 p-[14px]"
        >
          <div class="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {{ t('admin.pricingDesk.simResultTitle') }}
          </div>
          <div class="flex flex-col gap-[7px]">
            <SimResultRow :label="t('admin.pricingDesk.simInputCost')" :value="inputCost" />
            <SimResultRow :label="t('admin.pricingDesk.simOutputCost')" :value="outputCost" />
            <SimResultRow v-if="cacheHitRatio > 0" :label="t('admin.pricingDesk.simCacheCost')" :value="cacheCost" />
            <div class="mt-[2px] border-t border-border pt-2">
              <SimResultRow :label="t('admin.pricingDesk.simTotal')" :value="totalCost" :large="true" />
            </div>
          </div>

          <!-- 对比官方价 -->
          <div
            v-if="officialTotal !== null"
            class="flex flex-col gap-1 rounded-lg p-[10px_12px]"
            :class="totalCost <= officialTotal ? 'bg-emerald-500/10' : 'bg-destructive/10'"
          >
            <div class="text-[11px] text-muted-foreground">
              {{ t('admin.pricingDesk.simOfficialTotal') }}<span class="font-mono tabular-nums text-foreground">{{ fmtUSD(officialTotal) }}</span>
            </div>
            <div
              class="text-xs font-semibold"
              :class="totalCost <= officialTotal ? 'text-emerald-500' : 'text-destructive'"
            >
              {{ totalCost <= officialTotal
                ? t('admin.pricingDesk.simCheaper', { diff: fmtUSD(officialTotal - totalCost), pct: ((1 - totalCost / officialTotal) * 100).toFixed(1) })
                : t('admin.pricingDesk.simDearer', { diff: fmtUSD(totalCost - officialTotal), pct: ((totalCost / officialTotal - 1) * 100).toFixed(1) }) }}
            </div>
          </div>
          <p v-else class="m-0 text-[11px] text-muted-foreground">{{ t('admin.pricingDesk.simNoOfficialRef') }}</p>
        </div>

        <!-- 未选模型/分组提示 -->
        <div
          v-else
          class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center"
        >
          <CalculatorIcon class="h-8 w-8 text-muted-foreground opacity-35" />
          <p class="m-0 text-[12.5px] text-muted-foreground">{{ t('admin.pricingDesk.simSelectHint') }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalculatorIcon, XIcon } from 'lucide-vue-next'
import SimResultRow from './SimResultRow.vue'
import type { MatrixRow, OfficialPricing } from './usePricingMatrix'
import type { AdminGroup } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps<{
  visible: boolean
  platforms: string[]
  matrix: MatrixRow[]
  activeGroups: AdminGroup[]
  officialPricingCache: Record<string, OfficialPricing | 'loading'>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'need-official-pricing', model: string): void
}>()

const { t } = useI18n()
const selectedModel = ref('')
const selectedGroupId = ref<number | null>(null)
const inputTokens = ref(1_000_000)
const outputTokens = ref(200_000)
const cacheHitRatio = ref(0)

const modelsByPlatform = computed(() => {
  const map: Record<string, string[]> = {}
  for (const row of props.matrix) {
    if (!map[row.platform]) map[row.platform] = []
    map[row.platform].push(row.model)
  }
  return map
})

const cell = computed(() => {
  if (!selectedModel.value || selectedGroupId.value === null) return null
  const row = props.matrix.find(r => r.model === selectedModel.value)
  return row?.cells[selectedGroupId.value] ?? null
})

// 当选中模型变化时触发官方价加载
watch(selectedModel, (model) => {
  if (model) emit('need-official-pricing', model)
})

const inputCost = computed(() => {
  const c = cell.value
  if (!c || c.inputPrice == null) return 0
  const nonCache = inputTokens.value * (1 - cacheHitRatio.value)
  return nonCache * c.inputPrice
})

const outputCost = computed(() => {
  const c = cell.value
  if (!c || c.outputPrice == null) return 0
  return outputTokens.value * c.outputPrice
})

const cacheCost = computed(() => {
  const c = cell.value
  if (!c) return 0
  return inputTokens.value * cacheHitRatio.value * (c.cacheReadPrice ?? c.inputPrice ?? 0)
})

const totalCost = computed(() => inputCost.value + outputCost.value + cacheCost.value)

const officialPricing = computed<OfficialPricing | null>(() => {
  if (!selectedModel.value) return null
  const op = props.officialPricingCache[selectedModel.value]
  if (!op || op === 'loading' || !op.found) return null
  return op
})

const officialTotal = computed<number | null>(() => {
  const op = officialPricing.value
  if (!op) return null
  const inputP = op.inputPrice ?? 0
  const outputP = op.outputPrice ?? 0
  const cacheP = op.cacheReadPrice ?? inputP * 0.1
  const cacheRead = inputTokens.value * cacheHitRatio.value
  const nonCache = inputTokens.value - cacheRead
  return nonCache * inputP + cacheRead * cacheP + outputTokens.value * outputP
})

function fmtUSD(v: number): string {
  return `$${v.toFixed(6)}`
}
</script>

<style scoped>
/* range slider accent color — no Tailwind equivalent */
.ps-range {
  accent-color: hsl(var(--primary));
}

/* ── 入/出场动画 ── */
.ps-fade-enter-active,
.ps-fade-leave-active { transition: opacity .2s; }
.ps-fade-enter-from,
.ps-fade-leave-to { opacity: 0; }

.ps-slide-enter-active,
.ps-slide-leave-active { transition: transform .25s cubic-bezier(.22,.68,0,1.2); }
.ps-slide-enter-from,
.ps-slide-leave-to { transform: translateX(100%); }

@media (prefers-reduced-motion: reduce) {
  .ps-fade-enter-active,
  .ps-fade-leave-active,
  .ps-slide-enter-active,
  .ps-slide-leave-active { transition: none; }
}
</style>
