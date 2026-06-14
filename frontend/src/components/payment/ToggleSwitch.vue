<template>
  <label class="flex cursor-pointer flex-col items-center gap-0.5">
    <span class="whitespace-nowrap text-xs text-muted-foreground">{{ label }}</span>
    <Switch :model-value="checked" @update:model-value="emit('toggle')" />
  </label>
</template>

<script setup lang="ts">
import { Switch } from '@/components/ui/switch'

defineProps<{ label: string; checked: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>
