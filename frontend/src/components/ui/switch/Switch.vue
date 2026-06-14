<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { SwitchRoot, SwitchThumb, type SwitchRootProps, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

// 同时兼容 shadcn 契约(modelValue / v-model)与 radix 风格(checked / @update:checked)
const props = defineProps<
  SwitchRootProps & {
    class?: HTMLAttributes['class']
    checked?: boolean
  }
>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:checked', value: boolean): void
}>()

const delegatedProps = computed(() => {
  const { class: _, checked: __, modelValue: ___, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegatedProps)

const model = computed<boolean>({
  get: () => (props.modelValue ?? props.checked ?? false) as boolean,
  set: (v) => {
    emits('update:modelValue', v)
    emits('update:checked', v)
  }
})
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :model-value="model"
    :class="
      cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class
      )
    "
    @update:model-value="model = $event"
  >
    <SwitchThumb
      :class="
        cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
        )
      "
    />
  </SwitchRoot>
</template>
