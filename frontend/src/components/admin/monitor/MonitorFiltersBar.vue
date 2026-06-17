<template>
  <CollapsibleFilters
    :active-count="activeFilterCount"
    storage-key="channel-monitor"
    @clear="clearFilters"
  >
    <template #search>
      <SearchInput
        v-model="search"
        :placeholder="t('admin.channelMonitor.searchPlaceholder')"
        class="w-full sm:w-64"
        @search="$emit('search-input')"
      />
    </template>
    <template #filters>
      <Select
        v-model="provider"
        :options="providerFilterOptions"
        :placeholder="t('admin.channelMonitor.allProviders')"
        class="w-44"
        @change="$emit('reload')"
      />
      <Select
        v-model="enabled"
        :options="enabledFilterOptions"
        :placeholder="t('admin.channelMonitor.enabledFilter')"
        class="w-40"
        @change="$emit('reload')"
      />
    </template>
    <template #actions>
      <Button
        variant="outline"
        size="sm"
        @click="$emit('reload')"
        :disabled="loading"
        :title="t('common.refresh')"
      >
        <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        @click="$emit('manage-templates')"
        :title="t('admin.channelMonitor.template.manageButton')"
      >
        <Icon name="cog" size="md" class="mr-2" />
        {{ t('admin.channelMonitor.template.manageButton') }}
      </Button>
      <Button size="sm" @click="$emit('create')">
        <Icon name="plus" size="md" class="mr-2" />
        {{ t('admin.channelMonitor.createButton') }}
      </Button>
    </template>
  </CollapsibleFilters>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Provider } from '@/api/admin/channelMonitor'
import Select from '@/components/common/Select.vue'
import CollapsibleFilters from '@/components/common/CollapsibleFilters.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import {
  PROVIDER_OPENAI,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
} from '@/constants/channelMonitor'

defineProps<{
  loading: boolean
}>()

defineEmits<{
  (e: 'reload'): void
  (e: 'create'): void
  (e: 'manage-templates'): void
  (e: 'search-input'): void
}>()

const search = defineModel<string>('search', { required: true })
const provider = defineModel<Provider | ''>('provider', { required: true })
const enabled = defineModel<'' | 'true' | 'false'>('enabled', { required: true })

const { t } = useI18n()

const activeFilterCount = computed(() => {
  let count = 0
  if (provider.value) count++
  if (enabled.value) count++
  return count
})

const clearFilters = () => {
  provider.value = ''
  enabled.value = ''
}

const providerFilterOptions = computed(() => [
  { value: '', label: t('admin.channelMonitor.allProviders') },
  { value: PROVIDER_OPENAI, label: t('monitorCommon.providers.openai') },
  { value: PROVIDER_ANTHROPIC, label: t('monitorCommon.providers.anthropic') },
  { value: PROVIDER_GEMINI, label: t('monitorCommon.providers.gemini') },
])

const enabledFilterOptions = computed(() => [
  { value: '', label: t('admin.channelMonitor.allStatus') },
  { value: 'true', label: t('admin.channelMonitor.onlyEnabled') },
  { value: 'false', label: t('admin.channelMonitor.onlyDisabled') },
])
</script>
