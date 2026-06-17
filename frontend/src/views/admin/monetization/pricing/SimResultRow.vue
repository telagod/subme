<template>
  <div class="flex items-center justify-between gap-2">
    <span class="text-[11px] text-muted-foreground">{{ label }}</span>
    <span :class="large ? 'text-[13px] font-semibold text-foreground' : 'text-[11px] text-foreground'">
      {{ fmtUSD(value) }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value: number
  large?: boolean
}>()

function fmtUSD(v: number): string {
  return `$${v.toFixed(6)}`
}
</script>
