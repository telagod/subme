<template>
  <div class="flex items-start gap-2 rounded border p-2"
       :class="isEmpty ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-card'">
    <!-- Token mode: context range + prices ($/MTok) -->
    <template v-if="mode === 'token'">
      <div class="w-20">
        <label class="text-xs text-muted-foreground">Min</label>
        <Input :value="interval.min_tokens" @input="emitField('min_tokens', toInt(($event.target as HTMLInputElement).value))"
          type="number" min="0"  class="mt-0.5 text-xs" />
      </div>
      <div class="w-20">
        <label class="text-xs text-muted-foreground">Max <span class="text-muted-foreground/60">(含)</span></label>
        <Input :value="interval.max_tokens ?? ''" @input="emitField('max_tokens', toIntOrNull(($event.target as HTMLInputElement).value))"
          type="number" min="0"  class="mt-0.5 text-xs" :placeholder="'∞'" />
      </div>
      <div class="flex-1">
        <label class="text-xs text-muted-foreground">{{ t('admin.channels.form.inputPrice', '输入') }} <span v-if="isEmpty" class="text-red-400">*</span> <span class="text-muted-foreground/60">$/M</span></label>
        <Input :value="interval.input_price" @input="emitField('input_price', ($event.target as HTMLInputElement).value)"
          type="number" step="any" min="0"  class="mt-0.5 text-xs" />
      </div>
      <div class="flex-1">
        <label class="text-xs text-muted-foreground">{{ t('admin.channels.form.outputPrice', '输出') }} <span v-if="isEmpty" class="text-red-400">*</span> <span class="text-muted-foreground/60">$/M</span></label>
        <Input :value="interval.output_price" @input="emitField('output_price', ($event.target as HTMLInputElement).value)"
          type="number" step="any" min="0"  class="mt-0.5 text-xs" />
      </div>
      <div class="flex-1">
        <label class="text-xs text-muted-foreground">{{ t('admin.channels.form.cacheWritePrice', '缓存W') }} <span class="text-muted-foreground/60">$/M</span></label>
        <Input :value="interval.cache_write_price" @input="emitField('cache_write_price', ($event.target as HTMLInputElement).value)"
          type="number" step="any" min="0"  class="mt-0.5 text-xs" />
      </div>
      <div class="flex-1">
        <label class="text-xs text-muted-foreground">{{ t('admin.channels.form.cacheReadPrice', '缓存R') }} <span class="text-muted-foreground/60">$/M</span></label>
        <Input :value="interval.cache_read_price" @input="emitField('cache_read_price', ($event.target as HTMLInputElement).value)"
          type="number" step="any" min="0"  class="mt-0.5 text-xs" />
      </div>
    </template>

    <!-- Per-request / Image mode: tier label + context range + price -->
    <template v-else>
      <div class="w-24">
        <label class="text-xs text-muted-foreground">
          {{ mode === 'image' ? t('admin.channels.form.resolution', '分辨率') : t('admin.channels.form.tierLabel', '层级') }}
        </label>
        <Input :value="interval.tier_label" @input="emitField('tier_label', ($event.target as HTMLInputElement).value)"
          type="text"  class="mt-0.5 text-xs" :placeholder="mode === 'image' ? '1K / 2K / 4K' : ''" />
      </div>
      <div class="w-20">
        <label class="text-xs text-muted-foreground">Min</label>
        <Input :value="interval.min_tokens" @input="emitField('min_tokens', toInt(($event.target as HTMLInputElement).value))"
          type="number" min="0"  class="mt-0.5 text-xs" />
      </div>
      <div class="w-20">
        <label class="text-xs text-muted-foreground">Max <span class="text-muted-foreground/60">(含)</span></label>
        <Input :value="interval.max_tokens ?? ''" @input="emitField('max_tokens', toIntOrNull(($event.target as HTMLInputElement).value))"
          type="number" min="0"  class="mt-0.5 text-xs" :placeholder="'∞'" />
      </div>
      <div class="flex-1">
        <label class="text-xs text-muted-foreground">{{ t('admin.channels.form.perRequestPrice', '单次价格') }} <span v-if="isEmpty" class="text-red-400">*</span> <span class="text-muted-foreground/60">$</span></label>
        <Input :value="interval.per_request_price" @input="emitField('per_request_price', ($event.target as HTMLInputElement).value)"
          type="number" step="any" min="0"  class="mt-0.5 text-xs" />
      </div>
    </template>

    <button type="button" @click="emit('remove')" class="mt-4 rounded p-0.5 text-muted-foreground hover:text-red-400">
      <Icon name="x" size="sm" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import type { IntervalFormEntry } from './types'
import type { BillingMode } from '@/api/admin/channels'

const { t } = useI18n()

const props = defineProps<{
  interval: IntervalFormEntry
  mode: BillingMode
}>()

const emit = defineEmits<{
  update: [interval: IntervalFormEntry]
  remove: []
}>()

// 检测所有价格字段是否都为空
const isEmpty = computed(() => {
  const iv = props.interval
  return (iv.input_price == null || iv.input_price === '') &&
    (iv.output_price == null || iv.output_price === '') &&
    (iv.cache_write_price == null || iv.cache_write_price === '') &&
    (iv.cache_read_price == null || iv.cache_read_price === '') &&
    (iv.per_request_price == null || iv.per_request_price === '')
})

function emitField(field: keyof IntervalFormEntry, value: string | number | null) {
  emit('update', { ...props.interval, [field]: value === '' ? null : value })
}

function toInt(val: string): number {
  const n = parseInt(val, 10)
  return isNaN(n) ? 0 : n
}

function toIntOrNull(val: string): number | null {
  if (val === '') return null
  const n = parseInt(val, 10)
  return isNaN(n) ? null : n
}
</script>
