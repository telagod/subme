<template>
  <div class="rounded-md border border-border bg-muted p-3">
    <!-- Collapsed summary header (clickable) -->
    <div
      class="flex cursor-pointer select-none items-center gap-2"
      @click="collapsed = !collapsed"
    >
      <Icon
        :name="collapsed ? 'chevronRight' : 'chevronDown'"
        size="sm"
        :stroke-width="2"
        class="flex-shrink-0 text-muted-foreground transition-transform duration-200"
      />

      <!-- Summary: model tags + billing badge -->
      <div v-if="collapsed" class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <!-- Compact model tags (show first 3) -->
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <span
            v-for="(m, i) in entry.models.slice(0, 3)"
            :key="i"
            class="inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs"
            :class="getPlatformTagClass(props.platform || '')"
          >
            {{ m }}
          </span>
          <span
            v-if="entry.models.length > 3"
            class="whitespace-nowrap text-xs text-muted-foreground"
          >
            +{{ entry.models.length - 3 }}
          </span>
          <span
            v-if="entry.models.length === 0"
            class="text-xs italic text-muted-foreground"
          >
            {{ t('admin.channels.form.noModels', '未添加模型') }}
          </span>
        </div>

        <!-- Billing mode badge -->
        <Badge variant="secondary" class="flex-shrink-0">
          {{ billingModeLabel }}
        </Badge>
      </div>

      <!-- Expanded: show the label "Pricing Entry" or similar -->
      <div v-else class="flex-1 text-xs font-medium text-muted-foreground">
        {{ t('admin.channels.form.pricingEntry', '定价配置') }}
      </div>

      <!-- Remove button (always visible, stop propagation) -->
      <Button
        type="button"
        variant="ghost"
        size="icon"
        @click.stop="emit('remove')"
        class="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
      >
        <Icon name="trash" size="sm" />
      </Button>
    </div>

    <!-- Expandable content with transition -->
    <div
      class="collapsible-content"
      :class="{ 'collapsible-content--collapsed': collapsed }"
    >
      <div class="collapsible-inner">
        <!-- Header: Models + Billing Mode -->
        <div class="mt-3 flex items-start gap-2">
          <div class="flex-1">
            <Label class="text-xs font-medium text-muted-foreground">
              {{ t('admin.channels.form.models', '模型列表') }} <span class="text-destructive">*</span>
            </Label>
            <ModelTagInput
              :models="entry.models"
              :platform="props.platform"
              @update:models="onModelsUpdate($event)"
              :placeholder="t('admin.channels.form.modelsPlaceholder', '输入模型名后按回车添加，支持通配符 *')"
              class="mt-1"
            />
          </div>
          <div class="w-40">
            <Label class="text-xs font-medium text-muted-foreground">
              {{ t('admin.channels.form.billingMode', '计费模式') }}
            </Label>
            <Select
              :modelValue="entry.billing_mode"
              @update:modelValue="emit('update', { ...entry, billing_mode: $event as BillingMode, intervals: [] })"
              :options="billingModeOptions"
              class="mt-1"
            />
          </div>
        </div>

        <!-- Token mode -->
        <div v-if="entry.billing_mode === 'token'">
          <!-- Default prices (fallback when no interval matches) -->
          <Label class="mt-3 block text-xs font-medium text-muted-foreground">
            {{ t('admin.channels.form.defaultPrices', '默认价格（未命中区间时使用）') }}
            <span class="ml-1 font-normal text-muted-foreground">$/MTok</span>
          </Label>
          <div class="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('admin.channels.form.inputPrice', '输入') }}</Label>
              <Input
                :model-value="entry.input_price"
                @update:model-value="emitField('input_price', String($event ?? ''))"
                type="number" step="any" min="0"
                class="mt-0.5 text-sm"
                :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
              />
            </div>
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('admin.channels.form.outputPrice', '输出') }}</Label>
              <Input
                :model-value="entry.output_price"
                @update:model-value="emitField('output_price', String($event ?? ''))"
                type="number" step="any" min="0"
                class="mt-0.5 text-sm"
                :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
              />
            </div>
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('admin.channels.form.cacheWritePrice', '缓存写入') }}</Label>
              <Input
                :model-value="entry.cache_write_price"
                @update:model-value="emitField('cache_write_price', String($event ?? ''))"
                type="number" step="any" min="0"
                class="mt-0.5 text-sm"
                :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
              />
            </div>
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('admin.channels.form.cacheReadPrice', '缓存读取') }}</Label>
              <Input
                :model-value="entry.cache_read_price"
                @update:model-value="emitField('cache_read_price', String($event ?? ''))"
                type="number" step="any" min="0"
                class="mt-0.5 text-sm"
                :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
              />
            </div>
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('admin.channels.form.imageTokenPrice', '图片输出') }}</Label>
              <Input
                :model-value="entry.image_output_price"
                @update:model-value="emitField('image_output_price', String($event ?? ''))"
                type="number" step="any" min="0"
                class="mt-0.5 text-sm"
                :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
              />
            </div>
          </div>

          <!-- Token intervals -->
          <div class="mt-3">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-medium text-muted-foreground">
                {{ t('admin.channels.form.intervals', '上下文区间定价（可选）') }}
                <span class="ml-1 font-normal text-muted-foreground">(min, max]</span>
              </Label>
              <Button type="button" variant="ghost" size="sm" @click="addInterval" class="h-auto px-2 py-0.5 text-xs text-primary hover:text-primary/80">
                + {{ t('admin.channels.form.addInterval', '添加区间') }}
              </Button>
            </div>
            <div v-if="entry.intervals && entry.intervals.length > 0" class="mt-2 space-y-2">
              <IntervalRow
                v-for="(iv, idx) in entry.intervals"
                :key="idx"
                :interval="iv"
                :mode="entry.billing_mode"
                @update="updateInterval(idx, $event)"
                @remove="removeInterval(idx)"
              />
            </div>
          </div>
        </div>

        <!-- Per-request mode -->
        <div v-else-if="entry.billing_mode === 'per_request'">
          <!-- Default per-request price -->
          <Label class="mt-3 block text-xs font-medium text-muted-foreground">
            {{ t('admin.channels.form.defaultPerRequestPrice', '默认单次价格（未命中层级时使用）') }}
            <span class="ml-1 font-normal text-muted-foreground">$</span>
          </Label>
          <div class="mt-1 w-48">
            <Input
              :model-value="entry.per_request_price"
              @update:model-value="emitField('per_request_price', String($event ?? ''))"
              type="number" step="any" min="0"
              class="text-sm"
              :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
            />
          </div>

          <!-- Tiers -->
          <div class="mt-3 flex items-center justify-between">
            <Label class="text-xs font-medium text-muted-foreground">
              {{ t('admin.channels.form.requestTiers', '按次计费层级') }}
            </Label>
            <Button type="button" variant="ghost" size="sm" @click="addInterval" class="h-auto px-2 py-0.5 text-xs text-primary hover:text-primary/80">
              + {{ t('admin.channels.form.addTier', '添加层级') }}
            </Button>
          </div>
          <div v-if="entry.intervals && entry.intervals.length > 0" class="mt-2 space-y-2">
            <IntervalRow
              v-for="(iv, idx) in entry.intervals"
              :key="idx"
              :interval="iv"
              :mode="entry.billing_mode"
              @update="updateInterval(idx, $event)"
              @remove="removeInterval(idx)"
            />
          </div>
          <div v-else class="mt-2 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            {{ t('admin.channels.form.noTiersYet', '暂无层级，点击添加配置按次计费价格') }}
          </div>
        </div>

        <!-- Image mode -->
        <div v-else-if="entry.billing_mode === 'image'">
          <!-- Default image price (per-request, same as per_request mode) -->
          <Label class="mt-3 block text-xs font-medium text-muted-foreground">
            {{ t('admin.channels.form.defaultImagePrice', '默认图片价格（未命中层级时使用）') }}
            <span class="ml-1 font-normal text-muted-foreground">$</span>
          </Label>
          <div class="mt-1 w-48">
            <Input
              :model-value="entry.per_request_price"
              @update:model-value="emitField('per_request_price', String($event ?? ''))"
              type="number" step="any" min="0"
              class="text-sm"
              :placeholder="t('admin.channels.form.pricePlaceholder', '默认')"
            />
          </div>

          <!-- Image tiers -->
          <div class="mt-3 flex items-center justify-between">
            <Label class="text-xs font-medium text-muted-foreground">
              {{ t('admin.channels.form.imageTiers', '图片计费层级（按次）') }}
            </Label>
            <Button type="button" variant="ghost" size="sm" @click="addImageTier" class="h-auto px-2 py-0.5 text-xs text-primary hover:text-primary/80">
              + {{ t('admin.channels.form.addTier', '添加层级') }}
            </Button>
          </div>
          <div v-if="entry.intervals && entry.intervals.length > 0" class="mt-2 space-y-2">
            <IntervalRow
              v-for="(iv, idx) in entry.intervals"
              :key="idx"
              :interval="iv"
              :mode="entry.billing_mode"
              @update="updateInterval(idx, $event)"
              @remove="removeInterval(idx)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/common/Select.vue'
import Icon from '@/components/icons/Icon.vue'
import IntervalRow from './IntervalRow.vue'
import ModelTagInput from './ModelTagInput.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PricingFormEntry, IntervalFormEntry } from './types'
import { perTokenToMTok, getPlatformTagClass } from './types'
import type { BillingMode } from '@/api/admin/channels'
import channelsAPI from '@/api/admin/channels'

const { t } = useI18n()

const props = defineProps<{
  entry: PricingFormEntry
  platform?: string
}>()

const emit = defineEmits<{
  update: [entry: PricingFormEntry]
  remove: []
}>()

// Collapse state: entries with existing models default to collapsed
const collapsed = ref(props.entry.models.length > 0)

const billingModeOptions = computed(() => [
  { value: 'token', label: 'Token' },
  { value: 'per_request', label: t('admin.channels.billingMode.perRequest', '按次') },
  { value: 'image', label: t('admin.channels.billingMode.image', '图片（按次）') }
])

const billingModeLabel = computed(() => {
  const opt = billingModeOptions.value.find(o => o.value === props.entry.billing_mode)
  return opt ? opt.label : props.entry.billing_mode
})

function emitField(field: keyof PricingFormEntry, value: string) {
  emit('update', { ...props.entry, [field]: value === '' ? null : value })
}

function addInterval() {
  const intervals = [...(props.entry.intervals || [])]
  intervals.push({
    min_tokens: 0, max_tokens: null, tier_label: '',
    input_price: null, output_price: null, cache_write_price: null,
    cache_read_price: null, per_request_price: null,
    sort_order: intervals.length
  })
  emit('update', { ...props.entry, intervals })
}

function addImageTier() {
  const intervals = [...(props.entry.intervals || [])]
  const labels = ['1K', '2K', '4K', 'HD']
  intervals.push({
    min_tokens: 0, max_tokens: null, tier_label: labels[intervals.length] || '',
    input_price: null, output_price: null, cache_write_price: null,
    cache_read_price: null, per_request_price: null,
    sort_order: intervals.length
  })
  emit('update', { ...props.entry, intervals })
}

function updateInterval(idx: number, updated: IntervalFormEntry) {
  const intervals = [...(props.entry.intervals || [])]
  intervals[idx] = updated
  emit('update', { ...props.entry, intervals })
}

function removeInterval(idx: number) {
  const intervals = [...(props.entry.intervals || [])]
  intervals.splice(idx, 1)
  emit('update', { ...props.entry, intervals })
}

async function onModelsUpdate(newModels: string[]) {
  const oldModels = props.entry.models
  emit('update', { ...props.entry, models: newModels })

  // 只在新增模型且当前无价格时自动填充
  const addedModels = newModels.filter(m => !oldModels.includes(m))
  if (addedModels.length === 0) return

  // 检查是否所有价格字段都为空
  const e = props.entry
  const hasPrice = e.input_price != null || e.output_price != null ||
                   e.cache_write_price != null || e.cache_read_price != null
  if (hasPrice) return

  // 查询第一个新增模型的默认价格
  try {
    const result = await channelsAPI.getModelDefaultPricing(addedModels[0])
    if (result.found) {
      emit('update', {
        ...props.entry,
        models: newModels,
        input_price: perTokenToMTok(result.input_price ?? null),
        output_price: perTokenToMTok(result.output_price ?? null),
        cache_write_price: perTokenToMTok(result.cache_write_price ?? null),
        cache_read_price: perTokenToMTok(result.cache_read_price ?? null),
        image_output_price: perTokenToMTok(result.image_output_price ?? null),
      })
    }
  } catch {
    // 查询失败不影响用户操作
  }
}
</script>

<style scoped>
.collapsible-content {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.25s ease;
}

.collapsible-content--collapsed {
  grid-template-rows: 0fr;
}

.collapsible-inner {
  overflow: hidden;
}
</style>
