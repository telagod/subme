<template>
  <div
    class="flex items-center justify-between px-4 py-3 sm:px-6"
  >
    <div class="flex flex-1 items-center justify-between sm:hidden">
      <!-- Mobile pagination -->
      <Button
        variant="outline"
        @click="goToPage(page - 1)"
        :disabled="page === 1"
      >
        {{ t('pagination.previous') }}
      </Button>
      <span class="text-sm text-foreground/85">
        {{ t('pagination.pageOf', { page, total: totalPages }) }}
      </span>
      <Button
        variant="outline"
        @click="goToPage(page + 1)"
        :disabled="page === totalPages"
      >
        {{ t('pagination.next') }}
      </Button>
    </div>

    <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
      <!-- Desktop pagination info -->
      <div class="flex items-center space-x-4">
        <p class="text-sm text-foreground/85">
          {{ t('pagination.showing') }}
          <span class="font-medium">{{ fromItem }}</span>
          {{ t('pagination.to') }}
          <span class="font-medium">{{ toItem }}</span>
          {{ t('pagination.of') }}
          <span class="font-medium">{{ total }}</span>
          {{ t('pagination.results') }}
        </p>

        <!-- Page size selector -->
        <div v-if="showPageSizeSelector" class="flex items-center space-x-2">
          <span class="text-sm text-foreground/85"
            >{{ t('pagination.perPage') }}:</span
          >
          <div class="w-20">
            <Select
              :model-value="String(pageSize)"
              @update:model-value="handlePageSizeChange"
            >
              <SelectTrigger class="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in pageSizeSelectOptions"
                  :key="opt.value"
                  :value="String(opt.value)"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="showJump" class="flex items-center space-x-2">
          <span class="text-sm text-foreground/85">{{ t('pagination.jumpTo') }}</span>
          <Input
            v-model="jumpPage"
            type="number"
            min="1"
            :max="totalPages"
            class="w-20 text-sm"
            :placeholder="t('pagination.jumpPlaceholder')"
            @keyup.enter="submitJump"
          />
          <Button type="button" variant="ghost" size="sm" @click="submitJump">
            {{ t('pagination.jumpAction') }}
          </Button>
        </div>
      </div>

      <!-- Desktop pagination buttons (Vercel-style) -->
      <nav class="inline-flex items-center gap-1" aria-label="Pagination">
        <Button
          variant="ghost"
          size="icon"
          @click="goToPage(page - 1)"
          :disabled="page === 1"
          class="h-8 w-8"
          :aria-label="t('pagination.previous')"
        >
          <Icon name="chevronLeft" size="sm" />
        </Button>

        <Button
          v-for="(pageNum, index) in visiblePages"
          :key="`${pageNum}-${index}`"
          variant="ghost"
          @click="typeof pageNum === 'number' && goToPage(pageNum)"
          :disabled="typeof pageNum !== 'number'"
          :class="[
            'h-8 min-w-8 px-2 text-[13px] font-medium',
            pageNum === page
              ? 'bg-foreground text-background hover:bg-foreground hover:text-background'
              : typeof pageNum === 'number'
                ? 'text-muted-foreground'
                : 'cursor-default text-muted-foreground'
          ]"
          :aria-label="typeof pageNum === 'number' ? t('pagination.goToPage', { page: pageNum }) : undefined"
          :aria-current="pageNum === page ? 'page' : undefined"
        >
          {{ pageNum }}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          @click="goToPage(page + 1)"
          :disabled="page === totalPages"
          class="h-8 w-8"
          :aria-label="t('pagination.next')"
        >
          <Icon name="chevronRight" size="sm" />
        </Button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { setPersistedPageSize } from '@/composables/usePersistedPageSize'

const { t } = useI18n()

interface Props {
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  showPageSizeSelector?: boolean
  showJump?: boolean
}

interface Emits {
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', pageSize: number): void
}

const props = withDefaults(defineProps<Props>(), {
  pageSizeOptions: () => getConfiguredTablePageSizeOptions(),
  showPageSizeSelector: true,
  showJump: false
})

const emit = defineEmits<Emits>()

const totalPages = computed(() => Math.ceil(props.total / props.pageSize))

const fromItem = computed(() => {
  if (props.total === 0) return 0
  return (props.page - 1) * props.pageSize + 1
})

const toItem = computed(() => {
  const to = props.page * props.pageSize
  return to > props.total ? props.total : to
})

const pageSizeSelectOptions = computed(() => {
  const options = Array.from(
    new Set([
      ...getConfiguredTablePageSizeOptions(),
      normalizeTablePageSize(props.pageSize)
    ])
  ).sort((a, b) => a - b)

  return options.map((size) => ({
    value: size,
    label: String(size)
  }))
})

const jumpPage = ref('')

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const maxVisible = 7
  const total = totalPages.value

  if (total <= maxVisible) {
    // Show all pages if total is small
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // Always show first page
    pages.push(1)

    const start = Math.max(2, props.page - 2)
    const end = Math.min(total - 1, props.page + 2)

    // Add ellipsis before if needed
    if (start > 2) {
      pages.push('...')
    }

    // Add middle pages
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    // Add ellipsis after if needed
    if (end < total - 1) {
      pages.push('...')
    }

    // Always show last page
    pages.push(total)
  }

  return pages
})

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value && newPage !== props.page) {
    emit('update:page', newPage)
  }
}

const handlePageSizeChange = (value: string | number | boolean | null) => {
  if (value === null || typeof value === 'boolean') return
  const newPageSize = normalizeTablePageSize(typeof value === 'string' ? parseInt(value, 10) : value)
  setPersistedPageSize(newPageSize)
  emit('update:pageSize', newPageSize)
}

const submitJump = () => {
  const value = jumpPage.value.trim()
  if (!value) return
  const pageNum = Number.parseInt(value, 10)
  if (Number.isNaN(pageNum)) return
  const nextPage = Math.min(Math.max(pageNum, 1), totalPages.value)
  jumpPage.value = ''
  goToPage(nextPage)
}
</script>
