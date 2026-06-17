<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150 ease-out"
      leave-active-class="transition-opacity duration-100 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 pb-0 sm:items-center sm:px-4 sm:pb-4"
        :style="zIndexStyle"
        :aria-labelledby="dialogId"
        role="dialog"
        aria-modal="true"
        @click.self="handleClose"
      >
        <!-- Modal panel -->
        <div
          ref="dialogRef"
          :class="[
            'flex w-full max-h-[92vh] flex-col rounded-t-xl border border-border bg-card shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:max-h-[80vh] sm:rounded-xl',
            widthClasses
          ]"
          @click.stop
        >
          <!-- Header -->
          <div class="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <h3 :id="dialogId" class="text-sm font-medium text-foreground">
              {{ title }}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              @click="emit('close')"
              class="-mr-2 dialog-close-btn"
              :aria-label="t('common.closeModal')"
            >
              <Icon name="x" size="md" />
            </Button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 [overflow-scrolling:touch]">
            <slot></slot>
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

// 生成唯一ID以避免多个对话框时ID冲突
let dialogIdCounter = 0
const dialogId = `modal-title-${++dialogIdCounter}`

// 焦点管理
const dialogRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null

type DialogWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide' | 'full'

interface Props {
  show: boolean
  title: string
  width?: DialogWidth
  closeOnEscape?: boolean
  closeOnClickOutside?: boolean
  zIndex?: number
}

interface Emits {
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  width: 'normal',
  closeOnEscape: true,
  closeOnClickOutside: false,
  zIndex: 50
})

const emit = defineEmits<Emits>()

// Custom z-index style (overrides the default z-50 from CSS)
const zIndexStyle = computed(() => {
  return props.zIndex !== 50 ? { zIndex: props.zIndex } : undefined
})

const widthClasses = computed(() => {
  // Width guidance: narrow=confirm/short prompts, normal=standard forms,
  // wide=multi-section forms or rich content, extra-wide=analytics/tables,
  // full=full-screen or very dense layouts.
  const widths: Record<DialogWidth, string> = {
    narrow: 'max-w-md',
    normal: 'max-w-lg',
    wide: 'w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
    'extra-wide': 'w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
    full: 'w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl'
  }
  return widths[props.width]
})

const handleClose = () => {
  if (props.closeOnClickOutside) {
    emit('close')
  }
}

const handleEscape = (event: KeyboardEvent) => {
  if (props.show && props.closeOnEscape && event.key === 'Escape') {
    emit('close')
  }
}

// Prevent body scroll when modal is open and manage focus
watch(
  () => props.show,
  async (isOpen) => {
    if (isOpen) {
      // 保存当前焦点元素
      previousActiveElement = document.activeElement as HTMLElement
      // 使用CSS类而不是直接操作style,更易于管理多个对话框
      document.body.classList.add('modal-open')

      // 等待DOM更新后设置焦点到对话框
      // A11y: prefer [autofocus], then first focusable inside body that ISN'T
      // the close-X button — Close-X being the first DOM-order focusable was
      // a poor default (screen-reader users heard "Close modal" before the title).
      // Fall back to Close-X only if nothing else is focusable.
      await nextTick()
      if (dialogRef.value) {
        const focusableSelector =
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

        const autofocusEl =
          dialogRef.value.querySelector<HTMLElement>('[autofocus]')
        if (autofocusEl) {
          autofocusEl.focus()
        } else {
          const allFocusable = Array.from(
            dialogRef.value.querySelectorAll<HTMLElement>(focusableSelector)
          )
          const firstNonClose = allFocusable.find(
            (el) => !el.classList.contains('dialog-close-btn')
          )
          ;(firstNonClose ?? allFocusable[0])?.focus()
        }
      }
    } else {
      document.body.classList.remove('modal-open')
      // 恢复之前的焦点
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus()
      }
      previousActiveElement = null
    }
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  // 确保组件卸载时移除滚动锁定
  document.body.classList.remove('modal-open')
})
</script>
