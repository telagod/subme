<template>
  <Button
    variant="ghost"
    type="button"
    class="group text-left p-5 rounded-lg min-h-[280px] w-full bg-card border border-border hover:-translate-y-1 hover:border-border transition-all duration-300 ease-out flex flex-col h-auto items-start"
    @click="emit('click')"
  >
    <!-- Header: icon + name/model + status chip -->
    <div class="flex items-start gap-3 w-full">
      <span
        class="w-9 h-9 rounded-md ring-1 ring-border grid place-items-center flex-shrink-0"
        :class="[providerGradient(item.provider), providerTintClass]"
      >
        <ProviderIcon :provider="item.provider" :size="20" />
      </span>
      <div class="flex-1 min-w-0">
        <div class="text-base font-semibold truncate text-foreground">
          {{ item.name }}
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 min-w-0">
          <Badge
            variant="outline"
            class="px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 border-transparent"
            :class="providerBadgeClass(item.provider)"
          >
            {{ providerLabel(item.provider) }}
          </Badge>
          <span class="font-mono text-xs truncate text-muted-foreground">
            {{ item.primary_model }}
          </span>
          <Badge
            v-if="item.group_name"
            variant="secondary"
            class="px-1.5 py-0.5 text-[10px] font-medium border border-border text-muted-foreground flex-shrink-0"
          >
            {{ item.group_name }}
          </Badge>
        </div>
      </div>
      <Badge
        variant="outline"
        class="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 border-transparent"
        :class="statusBadgeClass(item.primary_status)"
      >
        {{ statusLabel(item.primary_status) }}
      </Badge>
    </div>

    <!-- Metrics -->
    <MonitorMetricPair
      primary-icon="bolt"
      :primary-label="t('monitorCommon.dialogLatency')"
      :primary-value="formatLatency(item.primary_latency_ms)"
      primary-unit="ms"
      secondary-icon="globe"
      :secondary-label="t('monitorCommon.endpointPing')"
      :secondary-value="formatLatency(item.primary_ping_latency_ms)"
      secondary-unit="ms"
    />

    <!-- Divider -->
    <div class="mt-4 border-t border-border"></div>

    <!-- Availability row -->
    <MonitorAvailabilityRow
      :window-label="availabilityLabel"
      :value="availabilityValue"
      :samples-label="extraModelsCountLabel"
    />

    <!-- Timeline -->
    <MonitorTimeline
      :buckets="item.timeline"
      :countdown-seconds="countdownSeconds"
    />
  </Button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserMonitorView } from '@/api/channelMonitor'
import {
  useChannelMonitorFormat,
  providerGradient,
} from '@/composables/useChannelMonitorFormat'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ProviderIcon from './ProviderIcon.vue'
import MonitorMetricPair from './MonitorMetricPair.vue'
import MonitorAvailabilityRow from './MonitorAvailabilityRow.vue'
import MonitorTimeline from './MonitorTimeline.vue'

const PROVIDER_TINT: Record<string, string> = {
  openai: 'text-emerald-400',
  anthropic: 'text-orange-300',
  gemini: 'text-sky-300',
}

const props = defineProps<{
  item: UserMonitorView
  window: '7d' | '15d' | '30d'
  availabilityValue: number | null
  countdownSeconds: number
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

const { t } = useI18n()
const {
  statusLabel,
  statusBadgeClass,
  providerLabel,
  providerBadgeClass,
  formatLatency,
} = useChannelMonitorFormat()

const providerTintClass = computed(() =>
  PROVIDER_TINT[props.item.provider] ?? 'text-muted-foreground'
)

const availabilityLabel = computed(() => {
  const win = t(`channelStatus.windowTab.${props.window}`)
  return `${t('monitorCommon.availabilityPrefix')} · ${win}`
})

const extraModelsCountLabel = computed(() => {
  const count = props.item.extra_models?.length ?? 0
  if (count === 0) return undefined
  return t('monitorCommon.extraModelsCount', { n: count })
})
</script>
