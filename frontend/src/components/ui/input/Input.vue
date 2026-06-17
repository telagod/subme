<script setup lang="ts">
import { type HTMLAttributes, computed, ref } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  defaultValue?: string | number | null
  modelValue?: string | number | null
  // 支持 v-model 修饰符：.number 把数字字符串转 number（空→null），.trim 去首尾空格
  modelModifiers?: { number?: boolean; trim?: boolean }
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number | null): void
}>()

const model = computed<string | number | null | undefined>({
  get: () => props.modelValue ?? props.defaultValue,
  set: (v) => {
    let out: string | number | null = (v ?? null) as string | number | null
    if (typeof out === 'string') {
      if (props.modelModifiers?.trim) out = out.trim()
      if (props.modelModifiers?.number) {
        const n = parseFloat(out)
        out = out === '' ? null : Number.isNaN(n) ? out : n
      }
    }
    emits('update:modelValue', out)
  }
})

const inputRef = ref<HTMLInputElement | null>(null)
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  select: () => inputRef.value?.select(),
  el: inputRef
})
</script>

<template>
  <input
    ref="inputRef"
    v-model="model"
    :class="
      cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  >
</template>
