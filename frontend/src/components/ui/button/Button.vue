<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { type ButtonVariants, buttonVariants } from '.'
import { cn } from '@/lib/utils'

// 显式声明 as/asChild 为真 prop（不用 extends PrimitiveProps + @vue-ignore，
// 否则 as 默认失效，Primitive 退回 'div'，type=submit 无法提交表单）
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    class?: HTMLAttributes['class']
    as?: PrimitiveProps['as']
    asChild?: boolean
  }>(),
  { as: 'button' }
)
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
