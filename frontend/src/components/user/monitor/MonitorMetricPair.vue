<template>
  <div class="mt-5 grid grid-cols-2 gap-2">
    <Card class="shadow-none">
      <CardContent class="p-3">
        <div
          class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <Icon :name="primaryIcon" size="xs" />
          <span>{{ primaryLabel }}</span>
        </div>
        <div class="mt-1.5 text-lg font-bold font-mono tabular-nums text-foreground">
          {{ primaryValue }}<span class="text-xs font-normal text-muted-foreground ml-0.5">{{ primaryUnit }}</span>
        </div>
      </CardContent>
    </Card>
    <Card class="shadow-none">
      <CardContent class="p-3">
        <div
          class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <Icon :name="secondaryIcon" size="xs" />
          <span>{{ secondaryLabel }}</span>
        </div>
        <div class="mt-1.5 text-lg font-bold font-mono tabular-nums text-foreground">
          {{ secondaryValue }}<span class="text-xs font-normal text-muted-foreground ml-0.5">{{ secondaryUnit }}</span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'
import { Card, CardContent } from '@/components/ui/card'

defineProps<{
  primaryLabel: string
  primaryValue: string
  primaryUnit: string
  primaryIcon: 'bolt' | 'globe' | 'clock' | 'link'
  secondaryLabel: string
  secondaryValue: string
  secondaryUnit: string
  secondaryIcon: 'bolt' | 'globe' | 'clock' | 'link'
}>()
</script>
