<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  RadioGroupRoot,
  type RadioGroupRootProps,
  type RadioGroupRootEmits,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<RadioGroupRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<RadioGroupRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...rest } = props
  return rest
})
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <RadioGroupRoot v-bind="forwarded" :class="cn('grid gap-2', props.class)">
    <slot />
  </RadioGroupRoot>
</template>
