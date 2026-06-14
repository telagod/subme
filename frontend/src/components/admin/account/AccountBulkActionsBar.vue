<template>
  <div class="mb-4 rounded-md border border-border bg-card">
    <div class="flex items-center justify-between p-3">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="selectedIds.length > 0" class="text-sm font-medium text-foreground">
          {{ t('admin.accounts.bulkActions.selected', { count: selectedIds.length }) }}
        </span>
        <span v-else class="text-sm font-medium text-foreground">
          {{ t('admin.accounts.bulkEdit.title') }}
        </span>
        <template v-if="selectedIds.length > 0">
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            @click="$emit('select-page')"
          >
            {{ t('admin.accounts.bulkActions.selectCurrentPage') }}
          </Button>
          <span class="text-muted-foreground">•</span>
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            @click="$emit('clear')"
          >
            {{ t('admin.accounts.bulkActions.clear') }}
          </Button>
        </template>
      </div>
      <div class="flex gap-2">
        <template v-if="selectedIds.length > 0">
          <Button @click="$emit('delete')" :disabled="!!progress" variant="destructive" size="sm">{{ t('admin.accounts.bulkActions.delete') }}</Button>
          <Button @click="$emit('reset-status')" :disabled="!!progress" variant="outline" size="sm">{{ t('admin.accounts.bulkActions.resetStatus') }}</Button>
          <Button @click="$emit('refresh-token')" :disabled="!!progress" variant="outline" size="sm">{{ t('admin.accounts.bulkActions.refreshToken') }}</Button>
          <Button @click="$emit('toggle-schedulable', true)" :disabled="!!progress" variant="outline" size="sm" class="text-emerald-500 border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-500">{{ t('admin.accounts.bulkActions.enableScheduling') }}</Button>
          <Button @click="$emit('toggle-schedulable', false)" :disabled="!!progress" variant="outline" size="sm" class="text-amber-500 border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-500">{{ t('admin.accounts.bulkActions.disableScheduling') }}</Button>
          <Button @click="$emit('edit-selected')" :disabled="!!progress" variant="default" size="sm">{{ t('admin.accounts.bulkActions.edit') }}</Button>
        </template>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button :disabled="!!progress" variant="outline" size="sm" class="flex items-center gap-1">
              <span>{{ t('admin.accounts.bulkActions.batchOps') }}</span>
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem @click="$emit('edit-filtered')" class="gap-2 cursor-pointer">
              <svg class="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
              {{ t('admin.accounts.bulkEdit.submit') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="$emit('delete-filtered')" class="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              {{ t('admin.accounts.bulkActions.deleteFiltered') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <!-- Progress bar -->
    <div v-if="progress" class="border-t border-border px-3 py-2">
      <div class="flex items-center gap-3">
        <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div class="h-full rounded-full bg-destructive transition-all duration-300" :style="{ width: progressPercent + '%' }" />
        </div>
        <span class="text-xs font-mono tabular-nums text-muted-foreground shrink-0">{{ progress.current }}/{{ progress.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  selectedIds: number[]
  progress?: { current: number; total: number } | null
}>()

defineEmits(['delete', 'delete-filtered', 'edit-selected', 'edit-filtered', 'clear', 'select-page', 'toggle-schedulable', 'reset-status', 'refresh-token'])

const { t } = useI18n()

const progressPercent = computed(() => {
  if (!props.progress || props.progress.total === 0) return 0
  return Math.round((props.progress.current / props.progress.total) * 100)
})
</script>
