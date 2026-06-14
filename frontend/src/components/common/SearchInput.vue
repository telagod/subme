<template>
  <div class="relative w-full">
    <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
      <Icon name="search" size="md" class="text-muted-foreground" />
    </div>
    <Input
      ref="inputRef"
      :model-value="modelValue"
      type="text"
      class="pl-10 pr-8"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown.escape.prevent="handleClear"
    />
    <Button
      v-if="modelValue"
      type="button"
      variant="ghost"
      size="icon"
      class="absolute inset-y-0 right-0 h-full w-8 text-muted-foreground hover:text-foreground"
      @click="handleClear"
    >
      <Icon name="x" size="sm" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import Icon from '@/components/icons/Icon.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  debounceMs?: number
}>(), {
  placeholder: 'Search...',
  debounceMs: 300
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'search', value: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const debouncedEmitSearch = useDebounceFn((value: string) => {
  emit('search', value)
}, props.debounceMs)

const handleInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  debouncedEmitSearch(value)
}

const handleClear = () => {
  emit('update:modelValue', '')
  emit('search', '')
  inputRef.value?.focus()
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>
