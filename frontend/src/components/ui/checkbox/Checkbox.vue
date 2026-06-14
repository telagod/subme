<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { CheckboxRoot, CheckboxIndicator, type CheckboxRootProps, useForwardProps } from 'reka-ui'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

// 同时兼容 shadcn 契约(modelValue / v-model)与 radix 风格(checked / @update:checked)
const props = defineProps<
  CheckboxRootProps & {
    class?: HTMLAttributes['class']
    checked?: boolean | 'indeterminate'
  }
>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean | 'indeterminate'): void
  (e: 'update:checked', value: boolean | 'indeterminate'): void
}>()

const delegatedProps = computed(() => {
  const { class: _, checked: __, modelValue: ___, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegatedProps)

const model = computed<boolean | 'indeterminate'>({
  get: () => props.modelValue ?? props.checked ?? false,
  set: (v) => {
    emits('update:modelValue', v)
    emits('update:checked', v)
  }
})
</script>

<template>
  <CheckboxRoot
    v-bind="forwarded"
    :model-value="model"
    :class="
      cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        props.class
      )
    "
    @update:model-value="model = $event"
  >
    <CheckboxIndicator class="flex h-full w-full items-center justify-center text-current">
      <Check class="h-4 w-4" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
