<template>
  <Teleport to="body">
    <Transition name="popup-fade">
      <div
        v-if="announcementStore.currentPopup"
        class="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh]"
      >
        <div
          class="w-full max-w-[680px] overflow-hidden rounded-lg border border-border bg-card"
          @click.stop
        >
          <!-- Header -->
          <div class="relative overflow-hidden border-b border-border bg-card px-8 py-6">
            <div class="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div class="mb-3 flex items-center gap-2">
                  <div class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                    <Icon name="bell" size="md" :stroke-width="2" />
                  </div>
                  <Badge variant="outline" class="gap-1.5 border-primary/30 bg-primary/10 text-primary">
                    <span class="relative flex h-2 w-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                    </span>
                    {{ t('announcements.unread') }}
                  </Badge>
                </div>

                <h2 class="mb-2 text-2xl font-bold leading-tight text-foreground">
                  {{ announcementStore.currentPopup.title }}
                </h2>

                <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon name="clock" size="sm" :stroke-width="2" />
                  <time>{{ formatRelativeWithDateTime(announcementStore.currentPopup.created_at) }}</time>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                @click="handleSkip"
                class="flex-shrink-0 text-muted-foreground hover:text-foreground"
                :aria-label="t('common.close')"
              >
                <Icon name="x" size="md" />
              </Button>
            </div>
          </div>

          <!-- Body -->
          <div class="max-h-[50vh] overflow-y-auto bg-card px-8 py-8">
            <div class="relative">
              <div class="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-muted-foreground/40"></div>
              <div class="pl-6">
                <div
                  class="markdown-body prose prose-sm max-w-none"
                  v-html="renderedContent"
                ></div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-border bg-card px-8 py-5">
            <div class="flex items-center justify-end gap-3">
              <Button variant="outline" @click="handleSkip">
                {{ t('announcements.readLater') }}
              </Button>
              <Button @click="handleDismiss">
                <Icon name="check" size="sm" :stroke-width="2" />
                {{ t('announcements.markRead') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAnnouncementStore } from '@/stores/announcements'
import { formatRelativeWithDateTime } from '@/utils/format'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()
const announcementStore = useAnnouncementStore()

marked.setOptions({
  breaks: true,
  gfm: true,
})

const renderedContent = computed(() => {
  const content = announcementStore.currentPopup?.content
  if (!content) return ''
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
})

function handleDismiss() {
  announcementStore.dismissPopup()
}

function handleSkip() {
  announcementStore.skipPopup()
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && announcementStore.currentPopup) {
    handleSkip()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEscape)
})

watch(
  () => announcementStore.currentPopup,
  (popup) => {
    if (popup) {
      document.body.style.overflow = 'hidden'
    }
  }
)
</script>

<style scoped>
.popup-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}

.popup-fade-enter-from > div {
  transform: scale(0.94) translateY(-12px);
  opacity: 0;
}

.popup-fade-leave-to > div {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}

/* Scrollbar Styling */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
