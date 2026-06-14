<script setup lang="ts">
import { QUOTA_THRESHOLD_TYPE_FIXED, QUOTA_THRESHOLD_TYPE_PERCENTAGE, type QuotaThresholdType } from '@/constants/account'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

defineProps<{
  enabled: boolean | null
  threshold: number | null
  thresholdType: QuotaThresholdType | null
}>()

const emit = defineEmits<{
  'update:enabled': [value: boolean | null]
  'update:threshold': [value: number | null]
  'update:thresholdType': [value: QuotaThresholdType | null]
}>()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <Switch
      :checked="enabled ?? false"
      @update:checked="emit('update:enabled', $event)"
    />
    <template v-if="enabled">
      <Input
        :value="threshold ?? ''"
        @input="emit('update:threshold', parseFloat(($event.target as HTMLInputElement).value) || null)"
        type="number"
        min="0"
        :max="thresholdType === QUOTA_THRESHOLD_TYPE_PERCENTAGE ? 100 : undefined"
        :step="thresholdType === QUOTA_THRESHOLD_TYPE_PERCENTAGE ? 1 : 0.01"
        class="h-8 flex-1 min-w-0 py-1 text-sm"
      />
      <Select
        :model-value="thresholdType || QUOTA_THRESHOLD_TYPE_FIXED"
        @update:model-value="emit('update:thresholdType', $event as QuotaThresholdType)"
      >
        <SelectTrigger class="h-8 w-[4.5rem] flex-shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="QUOTA_THRESHOLD_TYPE_FIXED">$</SelectItem>
          <SelectItem :value="QUOTA_THRESHOLD_TYPE_PERCENTAGE">%</SelectItem>
        </SelectContent>
      </Select>
    </template>
  </div>
</template>
