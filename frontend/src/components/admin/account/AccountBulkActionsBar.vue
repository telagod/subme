<template>
  <div class="mb-4 flex items-center justify-between rounded-md border border-border bg-metal-surface p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span v-if="selectedIds.length > 0" class="text-sm font-medium text-foreground">
        {{ t('admin.accounts.bulkActions.selected', { count: selectedIds.length }) }}
      </span>
      <span v-else class="text-sm font-medium text-foreground">
        {{ t('admin.accounts.bulkEdit.title') }}
      </span>
      <template v-if="selectedIds.length > 0">
      <button
        @click="$emit('select-page')"
        class="text-xs font-medium text-primary-200 hover:text-primary-100"
      >
        {{ t('admin.accounts.bulkActions.selectCurrentPage') }}
      </button>
      <span class="text-muted-foreground">•</span>
      <button
        @click="$emit('clear')"
        class="text-xs font-medium text-primary-200 hover:text-primary-100"
      >
        {{ t('admin.accounts.bulkActions.clear') }}
      </button>
      </template>
    </div>
    <div class="flex gap-2">
      <template v-if="selectedIds.length > 0">
        <Button @click="$emit('delete')"  variant="destructive" size="sm">{{ t('admin.accounts.bulkActions.delete') }}</Button>
        <Button @click="$emit('reset-status')"  variant="secondary" size="sm">{{ t('admin.accounts.bulkActions.resetStatus') }}</Button>
        <Button @click="$emit('refresh-token')"  variant="secondary" size="sm">{{ t('admin.accounts.bulkActions.refreshToken') }}</Button>
        <Button @click="$emit('toggle-schedulable', true)"  class="btn-sm">{{ t('admin.accounts.bulkActions.enableScheduling') }}</Button>
        <Button variant="outline" @click="$emit('toggle-schedulable', false)"  class="btn-warning btn-sm">{{ t('admin.accounts.bulkActions.disableScheduling') }}</Button>
        <Button @click="$emit('edit-selected')"  size="sm">{{ t('admin.accounts.bulkActions.edit') }}</Button>
      </template>
      <Button @click="$emit('edit-filtered')"  size="sm">
        {{ t('admin.accounts.bulkEdit.submit') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { useI18n } from 'vue-i18n'
defineProps(['selectedIds']); defineEmits(['delete', 'edit-selected', 'edit-filtered', 'clear', 'select-page', 'toggle-schedulable', 'reset-status', 'refresh-token']); const { t } = useI18n()
</script>
