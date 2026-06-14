<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { SelectScrollDownButton, type SelectScrollDownButtonProps } from 'reka-ui'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = defineProps<SelectScrollDownButtonProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <SelectScrollDownButton
    v-bind="delegatedProps"
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <ChevronDown class="h-4 w-4" />
  </SelectScrollDownButton>
</template>
