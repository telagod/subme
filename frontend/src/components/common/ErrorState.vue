<template>
  <div :class="containerClasses" role="alert" aria-live="polite">
    <!-- Compact variant -->
    <template v-if="variant === 'compact'">
      <Icon
        :name="iconName"
        size="sm"
        class="shrink-0 text-destructive"
        aria-hidden="true"
      />
      <p class="flex-1 text-sm text-destructive">{{ displayTitle }}</p>
      <slot name="action">
        <Button
          v-if="onRetry"
          :variant="retryVariant"
          size="sm"
          :disabled="loading"
          @click="handleRetry"
        >
          <Icon name="refresh" size="sm" :class="loading ? 'animate-spin' : ''" />
          <span class="ml-1.5">{{ retryLabel || t('common.retry') }}</span>
        </Button>
      </slot>
    </template>

    <!-- Block variant (default) -->
    <template v-else>
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10"
      >
        <Icon
          :name="iconName"
          size="lg"
          class="text-destructive"
          aria-hidden="true"
        />
      </div>
      <h3 class="text-base font-medium text-foreground">{{ displayTitle }}</h3>
      <p v-if="displayDescription" class="max-w-md text-sm text-muted-foreground">
        {{ displayDescription }}
      </p>
      <slot name="action">
        <Button
          v-if="onRetry"
          :variant="retryVariant"
          size="sm"
          :disabled="loading"
          @click="handleRetry"
        >
          <Icon name="refresh" size="sm" :class="loading ? 'animate-spin' : ''" />
          <span class="ml-1.5">{{ retryLabel || t('common.retry') }}</span>
        </Button>
      </slot>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

type Variant = 'block' | 'compact'
type Kind = 'error' | 'forbidden' | 'network'

interface Props {
  title?: string
  description?: string
  variant?: Variant
  kind?: Kind
  retryLabel?: string
  loading?: boolean
  /**
   * Retry callback. If omitted, no retry button is rendered.
   * Caller can also supply a custom action via the `action` slot.
   */
  onRetry?: () => void | Promise<void>
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'block',
  kind: 'error',
  loading: false,
})

const { t } = useI18n()

const iconName = computed(() => {
  switch (props.kind) {
    case 'forbidden':
      return 'lock'
    case 'network':
      return 'exclamationTriangle'
    default:
      return 'exclamationCircle'
  }
})

const retryVariant = computed(() => (props.variant === 'compact' ? 'outline' : 'secondary'))

const displayTitle = computed(() => {
  if (props.title) return props.title
  switch (props.kind) {
    case 'forbidden':
      return t('common.errorState.forbiddenTitle')
    case 'network':
      return t('common.errorState.networkTitle')
    default:
      return t('common.errorState.title')
  }
})

const displayDescription = computed(() => {
  if (props.description !== undefined) return props.description
  if (props.variant === 'compact') return ''
  switch (props.kind) {
    case 'forbidden':
      return t('common.errorState.forbiddenDescription')
    case 'network':
      return t('common.errorState.networkDescription')
    default:
      return t('common.errorState.description')
  }
})

const containerClasses = computed(() => {
  if (props.variant === 'compact') {
    return 'flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2'
  }
  return 'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center'
})

async function handleRetry() {
  if (!props.onRetry || props.loading) return
  await props.onRetry()
}
</script>
