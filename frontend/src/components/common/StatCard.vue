<template>
  <Card
    class="flex items-start gap-4 p-5 transition-colors duration-150"
  >
    <div
      :class="[
        'flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary text-xl',
        iconClass
      ]"
    >
      <component v-if="icon" :is="icon" class="h-6 w-6" aria-hidden="true" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm text-muted-foreground">{{ title }}</p>
      <div class="mt-1 flex items-baseline gap-2">
        <p class="truncate text-2xl font-bold text-foreground" :title="String(formattedValue)">{{ formattedValue }}</p>
        <span v-if="change !== undefined" :class="['mt-1 flex items-center gap-1 text-xs font-medium', trendClass]">
          <Icon
            v-if="changeType !== 'neutral'"
            name="arrowUp"
            size="xs"
            :class="changeType === 'down' && 'rotate-180'"
          />
          {{ formattedChange }}
        </span>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import { Card } from '@/components/ui/card'

type ChangeType = 'up' | 'down' | 'neutral'
type IconVariant = 'primary' | 'success' | 'warning' | 'danger'

interface Props {
  title: string
  value: number | string
  icon?: Component
  iconVariant?: IconVariant
  change?: number
  changeType?: ChangeType
  formatValue?: (value: number | string) => string
}

const props = withDefaults(defineProps<Props>(), {
  changeType: 'neutral',
  iconVariant: 'primary'
})

const formattedValue = computed(() => {
  if (props.formatValue) {
    return props.formatValue(props.value)
  }
  if (typeof props.value === 'number') {
    return props.value.toLocaleString()
  }
  return props.value
})

const formattedChange = computed(() => {
  if (props.change === undefined) return ''
  const absChange = Math.abs(props.change)
  return `${absChange}%`
})

const iconClass = computed(() => {
  const classes: Record<IconVariant, string> = {
    primary: 'text-primary',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500'
  }
  return classes[props.iconVariant]
})

const trendClass = computed(() => {
  const classes: Record<ChangeType, string> = {
    up: 'text-emerald-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground'
  }
  return classes[props.changeType]
})
</script>
