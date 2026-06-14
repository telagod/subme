<template>
  <div class="w-full">
    <Label v-if="label" :for="id" class="mb-1.5 block">
      {{ label }}
      <span v-if="required" class="text-destructive">*</span>
    </Label>
    <div class="relative">
      <!-- Prefix Icon Slot -->
      <div
        v-if="$slots.prefix"
        class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground"
      >
        <slot name="prefix"></slot>
      </div>

      <input
        :id="id"
        ref="inputRef"
        :type="type"
        :value="modelValue"
        :disabled="disabled"
        :required="required"
        :placeholder="placeholderText"
        :autocomplete="autocomplete"
        :readonly="readonly"
        :class="[
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-200',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          $slots.prefix ? 'pl-11' : '',
          $slots.suffix ? 'pr-11' : '',
          error ? 'border-destructive focus-visible:ring-destructive' : '',
        ]"
        @input="onInput"
        @change="$emit('change', ($event.target as HTMLInputElement).value)"
        @blur="$emit('blur', $event)"
        @focus="$emit('focus', $event)"
        @keyup.enter="$emit('enter', $event)"
      />

      <!-- Suffix Slot (e.g. Password Toggle or Clear Button) -->
      <div
        v-if="$slots.suffix"
        class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
      >
        <slot name="suffix"></slot>
      </div>
    </div>
    <!-- Hint / Error Text -->
    <p v-if="error" class="mt-1.5 text-sm text-destructive">
      {{ error }}
    </p>
    <p v-else-if="hint" class="mt-1.5 text-sm text-muted-foreground">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Label } from '@/components/ui/label'

interface Props {
  modelValue: string | number | null | undefined
  type?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  readonly?: boolean
  error?: string
  hint?: string
  id?: string
  autocomplete?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
  readonly: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'blur', event: FocusEvent): void
  (e: 'focus', event: FocusEvent): void
  (e: 'enter', event: KeyboardEvent): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const placeholderText = computed(() => props.placeholder || '')

const onInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
}

// Expose focus method
defineExpose({
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select()
})
</script>
