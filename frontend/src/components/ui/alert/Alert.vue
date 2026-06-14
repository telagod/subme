<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { type AlertVariants, alertVariants } from '.'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  variant?: AlertVariants['variant']
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})
</script>

<template>
  <div
    role="alert"
    :class="cn(alertVariants({ variant }), props.class)"
  >
    <slot />
  </div>
</template>
