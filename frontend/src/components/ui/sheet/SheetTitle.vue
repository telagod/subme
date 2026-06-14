<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { DialogTitle, type DialogTitleProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <DialogTitle
    v-bind="delegatedProps"
    :class="cn('text-lg font-semibold text-foreground', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
