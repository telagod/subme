<script setup lang="ts">
import { PopoverAnchor, type PopoverAnchorProps } from 'reka-ui'
import { type HTMLAttributes, computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<PopoverAnchorProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <PopoverAnchor v-bind="delegatedProps" :class="cn(props.class)">
    <slot />
  </PopoverAnchor>
</template>
