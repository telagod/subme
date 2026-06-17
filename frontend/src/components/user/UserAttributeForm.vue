<template>
  <div v-if="attributes.length > 0" class="space-y-4">
    <div v-for="attr in attributes" :key="attr.id">
      <Label class="mb-1 block">
        {{ attr.name }}
        <span v-if="attr.required" class="text-destructive">*</span>
      </Label>

      <!-- Text Input -->
      <Input
        v-if="attr.type === 'text' || attr.type === 'email' || attr.type === 'url'"
        v-model="localValues[attr.id]"
        :type="attr.type === 'text' ? 'text' : attr.type"
        :required="attr.required"
        :placeholder="attr.placeholder"
        @input="emitChange"
      />

      <!-- Number Input -->
      <Input
        v-else-if="attr.type === 'number'"
        v-model.number="localValues[attr.id]"
        type="number"
        :required="attr.required"
        :placeholder="attr.placeholder"
        :min="attr.validation?.min"
        :max="attr.validation?.max"
        @input="emitChange"
      />

      <!-- Date Input -->
      <Input
        v-else-if="attr.type === 'date'"
        v-model="localValues[attr.id]"
        type="date"
        :required="attr.required"
        @input="emitChange"
      />

      <!-- Textarea -->
      <Textarea
        v-else-if="attr.type === 'textarea'"
        v-model="localValues[attr.id]"
        :required="attr.required"
        :placeholder="attr.placeholder"
        rows="3"
        @input="emitChange"
      />

      <!-- Select -->
      <Select
        v-else-if="attr.type === 'select'"
        v-model="localValues[attr.id]"
        :options="attr.options || []"
        @change="emitChange"
      />

      <!-- Multi-Select (Checkboxes) -->
      <div v-else-if="attr.type === 'multi_select'" class="space-y-2">
        <label
          v-for="opt in attr.options"
          :key="opt.value"
          class="flex items-center gap-2"
        >
          <Checkbox
            :checked="isOptionSelected(attr.id, opt.value)"
            @update:checked="() => toggleMultiSelectOption(attr.id, opt.value)"
          />
          <span class="text-sm text-foreground/85">{{ opt.label }}</span>
        </label>
      </div>

      <!-- Description -->
      <p v-if="attr.description" class="mt-1 text-xs text-muted-foreground">{{ attr.description }}</p>
    </div>
  </div>

  <!-- Loading State -->
  <div v-else-if="loading" class="flex justify-center py-4">
    <svg class="h-5 w-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { adminAPI } from '@/api/admin'
import type { UserAttributeDefinition, UserAttributeValuesMap } from '@/types'
import Select from '@/components/common/Select.vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  userId?: number
  modelValue: UserAttributeValuesMap
}

interface Emits {
  (e: 'update:modelValue', value: UserAttributeValuesMap): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const loading = ref(false)
const attributes = ref<UserAttributeDefinition[]>([])
const localValues = ref<UserAttributeValuesMap>({})

const loadAttributes = async () => {
  loading.value = true
  try {
    attributes.value = await adminAPI.userAttributes.listEnabledDefinitions()
  } catch (error) {
    console.error('Failed to load attributes:', error)
  } finally {
    loading.value = false
  }
}

const loadUserValues = async () => {
  if (!props.userId) return

  try {
    const values = await adminAPI.userAttributes.getUserAttributeValues(props.userId)
    const valuesMap: UserAttributeValuesMap = {}
    values.forEach(v => {
      valuesMap[v.attribute_id] = v.value
    })
    localValues.value = { ...valuesMap }
    emit('update:modelValue', localValues.value)
  } catch (error) {
    console.error('Failed to load user attribute values:', error)
  }
}

const emitChange = () => {
  emit('update:modelValue', { ...localValues.value })
}

const isOptionSelected = (attrId: number, optionValue: string): boolean => {
  const value = localValues.value[attrId]
  if (!value) return false
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) && arr.includes(optionValue)
  } catch {
    return false
  }
}

const toggleMultiSelectOption = (attrId: number, optionValue: string) => {
  let arr: string[] = []
  const value = localValues.value[attrId]
  if (value) {
    try {
      arr = JSON.parse(value)
      if (!Array.isArray(arr)) arr = []
    } catch {
      arr = []
    }
  }

  const index = arr.indexOf(optionValue)
  if (index > -1) {
    arr.splice(index, 1)
  } else {
    arr.push(optionValue)
  }

  localValues.value[attrId] = JSON.stringify(arr)
  emitChange()
}

watch(() => props.modelValue, (newVal) => {
  if (newVal && Object.keys(newVal).length > 0) {
    localValues.value = { ...newVal }
  }
}, { immediate: true })

watch(() => props.userId, (newUserId) => {
  if (newUserId) {
    loadUserValues()
  } else {
    // Reset for new user
    localValues.value = {}
  }
}, { immediate: true })

onMounted(() => {
  loadAttributes()
})
</script>
