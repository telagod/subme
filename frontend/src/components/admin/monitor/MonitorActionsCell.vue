<template>
  <div class="flex items-center gap-1">
    <Button
      variant="ghost"
      @click="$emit('run', row)"
      :disabled="running"
      class="flex h-auto flex-col items-center gap-0.5 rounded-lg p-1.5 text-muted-foreground hover:text-primary-200"
    >
      <Icon name="refresh" size="sm" :class="running ? 'animate-spin' : ''" />
      <span class="text-xs">{{ t('admin.channelMonitor.runNow') }}</span>
    </Button>
    <Button
      variant="ghost"
      @click="$emit('edit', row)"
      class="flex h-auto flex-col items-center gap-0.5 rounded-lg p-1.5 text-muted-foreground hover:text-primary-200"
    >
      <Icon name="edit" size="sm" />
      <span class="text-xs">{{ t('common.edit') }}</span>
    </Button>
    <Button
      variant="ghost"
      @click="$emit('delete', row)"
      class="flex h-auto flex-col items-center gap-0.5 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
    >
      <Icon name="trash" size="sm" />
      <span class="text-xs">{{ t('common.delete') }}</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ChannelMonitor } from '@/api/admin/channelMonitor'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

defineProps<{
  row: ChannelMonitor
  running: boolean
}>()

defineEmits<{
  (e: 'run', row: ChannelMonitor): void
  (e: 'edit', row: ChannelMonitor): void
  (e: 'delete', row: ChannelMonitor): void
}>()

const { t } = useI18n()
</script>
