<template>
  <div>
    <!-- Multi-select Dropdown -->
    <div class="relative mb-3">
      <div
        @click="toggleDropdown"
        class="cursor-pointer rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="grid grid-cols-2 gap-1.5">
          <Badge
            v-for="model in modelValue"
            :key="model"
            variant="secondary"
            class="inline-flex items-center justify-between gap-1 px-2 py-1 text-xs text-foreground/85"
          >
            <span class="flex items-center gap-1 truncate">
              <ModelIcon :model="model" size="14px" />
              <span class="truncate">{{ model }}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              @click.stop="removeModel(model)"
              class="h-3.5 w-3.5 shrink-0 rounded-full p-0"
            >
              <Icon name="x" size="xs" class="h-3.5 w-3.5" :stroke-width="2" />
            </Button>
          </Badge>
        </div>
        <div class="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span class="text-xs text-muted-foreground">{{ t('admin.accounts.modelCount', { count: modelValue.length }) }}</span>
          <svg class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <!-- Dropdown List -->
      <div
        v-if="showDropdown"
        class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-card "
      >
        <div class="sticky top-0 border-b border-border bg-card p-2">
          <Input
            v-model="searchQuery"
            type="text"
            class="w-full text-sm"
            :placeholder="t('admin.accounts.searchModels')"
            @click.stop
          />
        </div>
        <div class="max-h-52 overflow-auto">
          <Button
            v-for="model in filteredModels"
            :key="model.value"
            type="button"
            variant="ghost"
            @click="toggleModel(model.value)"
            class="flex h-auto w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-left text-sm"
          >
            <span
              :class="[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                modelValue.includes(model.value)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border'
              ]"
            >
              <svg v-if="modelValue.includes(model.value)" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <ModelIcon :model="model.value" size="18px" />
            <span class="truncate text-foreground">{{ model.value }}</span>
          </Button>
          <div v-if="filteredModels.length === 0" class="px-3 py-4 text-center text-sm text-muted-foreground">
            {{ t('admin.accounts.noMatchingModels') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mb-4 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="fillRelated"
        class="text-foreground/85"
      >
        {{ t('admin.accounts.fillRelatedModels') }}
      </Button>
      <Button
        v-if="canSyncUpstream"
        type="button"
        variant="outline"
        size="sm"
        @click="syncUpstreamModels"
        :disabled="isSyncingUpstream"
        class="border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-500"
      >
        {{ isSyncingUpstream ? t('admin.accounts.syncUpstreamModelsLoading') : t('admin.accounts.syncUpstreamModels') }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="clearAll"
        class="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
      >
        {{ t('admin.accounts.clearAllModels') }}
      </Button>
    </div>

    <!-- Custom Model Input -->
    <div class="mb-3">
      <Label class="mb-1.5 block text-sm font-medium text-foreground/85">{{ t('admin.accounts.customModelName') }}</Label>
      <div class="flex gap-2">
        <Input
          v-model="customModel"
          type="text"
          class="flex-1"
          :placeholder="t('admin.accounts.enterCustomModelName')"
          @keydown.enter.prevent="handleEnter"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
        <Button
          type="button"
          @click="addCustom"
        >
          {{ t('admin.accounts.addModel') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { accountsAPI } from '@/api/admin/accounts'
import type { SyncUpstreamPreviewParams } from '@/api/admin/accounts'
import ModelIcon from '@/components/common/ModelIcon.vue'
import Icon from '@/components/icons/Icon.vue'
import { allModels, getModelsByPlatform } from '@/composables/useModelWhitelist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string[]
  platform?: string
  platforms?: string[]
  accountId?: number
  syncCredentials?: {
    platform: string
    type: string
    base_url?: string
    api_key: string
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const appStore = useAppStore()

const showDropdown = ref(false)
const searchQuery = ref('')
const customModel = ref('')
const isComposing = ref(false)
const isSyncingUpstream = ref(false)
const normalizedPlatforms = computed(() => {
  const rawPlatforms =
    props.platforms && props.platforms.length > 0
      ? props.platforms
      : props.platform
        ? [props.platform]
        : []

  return Array.from(
    new Set(
      rawPlatforms
        .map(platform => platform?.trim())
        .filter((platform): platform is string => Boolean(platform))
    )
  )
})

const upstreamSyncPlatforms = new Set(['anthropic', 'openai', 'gemini', 'antigravity'])
const canSyncUpstream = computed(() => {
  if (props.accountId) {
    if (normalizedPlatforms.value.length === 0) return true
    return normalizedPlatforms.value.some(platform => upstreamSyncPlatforms.has(platform.toLowerCase()))
  }
  if (props.syncCredentials) {
    return upstreamSyncPlatforms.has(props.syncCredentials.platform.toLowerCase())
  }
  return false
})

const availableOptions = computed(() => {
  if (normalizedPlatforms.value.length === 0) {
    return allModels
  }

  const allowedModels = new Set<string>()
  for (const platform of normalizedPlatforms.value) {
    for (const model of getModelsByPlatform(platform)) {
      allowedModels.add(model)
    }
  }

  return allModels.filter(model => allowedModels.has(model.value))
})

const filteredModels = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return availableOptions.value
  return availableOptions.value.filter(
    m => m.value.toLowerCase().includes(query) || m.label.toLowerCase().includes(query)
  )
})

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
  if (!showDropdown.value) searchQuery.value = ''
}

const removeModel = (model: string) => {
  emit('update:modelValue', props.modelValue.filter(m => m !== model))
}

const toggleModel = (model: string) => {
  if (props.modelValue.includes(model)) {
    removeModel(model)
  } else {
    emit('update:modelValue', [...props.modelValue, model])
  }
}

const addCustom = () => {
  const model = customModel.value.trim()
  if (!model) return
  if (props.modelValue.includes(model)) {
    appStore.showInfo(t('admin.accounts.modelExists'))
    return
  }
  emit('update:modelValue', [...props.modelValue, model])
  customModel.value = ''
}

const handleEnter = () => {
  if (!isComposing.value) addCustom()
}

const fillRelated = () => {
  const newModels = [...props.modelValue]
  for (const platform of normalizedPlatforms.value) {
    for (const model of getModelsByPlatform(platform)) {
      if (!newModels.includes(model)) {
        newModels.push(model)
      }
    }
  }
  emit('update:modelValue', newModels)
}

const syncUpstreamModels = async () => {
  if (isSyncingUpstream.value) return
  if (!props.accountId && !props.syncCredentials) return

  isSyncingUpstream.value = true
  try {
    let result
    if (props.accountId) {
      result = await accountsAPI.syncUpstreamModels(props.accountId)
    } else if (props.syncCredentials) {
      result = await accountsAPI.syncUpstreamModelsPreview(props.syncCredentials as SyncUpstreamPreviewParams)
    } else {
      return
    }

    const upstreamModels = result.models.map(model => model.trim()).filter(Boolean)
    if (upstreamModels.length === 0) {
      appStore.showInfo(t('admin.accounts.syncUpstreamModelsEmpty'))
      return
    }

    const newModels = [...props.modelValue]
    let addedCount = 0
    for (const model of upstreamModels) {
      if (!newModels.includes(model)) {
        newModels.push(model)
        addedCount += 1
      }
    }

    emit('update:modelValue', newModels)
    if (addedCount > 0) {
      appStore.showSuccess(t('admin.accounts.syncUpstreamModelsSuccess', { count: addedCount, total: upstreamModels.length }))
    } else {
      appStore.showInfo(t('admin.accounts.syncUpstreamModelsNoChanges', { count: upstreamModels.length }))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('admin.accounts.syncUpstreamModelsFailed')
    appStore.showError(t('admin.accounts.syncUpstreamModelsError', { message }))
  } finally {
    isSyncingUpstream.value = false
  }
}

const clearAll = () => {
  emit('update:modelValue', [])
}

</script>
