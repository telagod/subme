<script setup lang="ts">
import { PopoverTrigger, type PopoverTriggerProps } from 'reka-ui'
import { type HTMLAttributes, computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<PopoverTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <PopoverTrigger v-bind="delegatedProps" :class="cn(props.class)">
    <slot />
  </PopoverTrigger>
</template>
