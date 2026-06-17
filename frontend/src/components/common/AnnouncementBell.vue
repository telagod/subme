<template>
  <div>
    <!-- 铃铛按钮 -->
    <Button
      variant="ghost"
      size="icon"
      @click="openModal"
      class="relative text-muted-foreground transition-all hover:scale-105"
      :class="{ 'text-primary': unreadCount > 0 }"
      :aria-label="t('announcements.title')"
    >
      <Icon name="bell" size="md" />
      <!-- 未读红点 -->
      <span
        v-if="unreadCount > 0"
        class="absolute right-1 top-1 flex h-2 w-2"
      >
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
        <span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
      </span>
    </Button>

    <!-- 公告列表 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="isModalOpen"
          class="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-md"
          @click="closeModal"
        >
          <div
            class="w-full max-w-[620px] overflow-hidden rounded-lg border border-border bg-card "
            @click.stop
          >
            <!-- Header -->
            <div class="relative overflow-hidden border-b border-border bg-card px-6 py-5">
              <div class="relative z-10 flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <div class="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                      <Icon name="bell" size="sm" />
                    </div>
                    <h2 class="text-lg font-semibold text-foreground">
                      {{ t('announcements.title') }}
                    </h2>
                  </div>
                  <p v-if="unreadCount > 0" class="mt-2 text-sm text-muted-foreground">
                    <span class="font-medium text-primary">{{ unreadCount }}</span>
                    {{ t('announcements.unread') }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    v-if="unreadCount > 0"
                    @click="markAllAsRead"
                    :disabled="loading"
                    class="text-xs"
                  >
                    {{ t('announcements.markAllRead') }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click="closeModal"
                    class="text-muted-foreground hover:text-foreground"
                    :aria-label="t('common.close')"
                  >
                    <Icon name="x" size="sm" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- Body -->
            <div class="max-h-[65vh] overflow-y-auto">
              <!-- Loading -->
              <div v-if="loading" class="flex items-center justify-center py-16">
                <div class="relative">
                  <div class="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary"></div>
                </div>
              </div>

              <!-- Announcements List -->
              <div v-else-if="announcements.length > 0">
                <div
                  v-for="item in announcements"
                  :key="item.id"
                  class="group relative flex items-center gap-4 border-b border-border px-6 py-4 transition-all hover:bg-accent"
                  :class="{ 'bg-card': !item.read_at }"
                  style="min-height: 72px"
                  @click="openDetail(item)"
                >
                  <!-- Status Indicator -->
                  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                    <div
                      v-if="!item.read_at"
                      class="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary"
                    >
                      <!-- Pulse ring -->
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-md bg-primary/20 opacity-75"></span>
                      <Icon name="infoCircle" size="md" class="relative z-10" :stroke-width="2.5" />
                    </div>
                    <div
                      v-else
                      class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground"
                    >
                      <Icon name="checkCircle" size="md" :stroke-width="2" />
                    </div>
                  </div>

                  <!-- Content -->
                  <div class="flex min-w-0 flex-1 items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <h3 class="truncate text-sm font-medium text-foreground">
                        {{ item.title }}
                      </h3>
                      <div class="mt-1 flex items-center gap-2">
                        <time class="text-xs text-muted-foreground">
                          {{ formatRelativeTime(item.created_at) }}
                        </time>
                        <Badge
                          v-if="!item.read_at"
                          variant="outline"
                          class="inline-flex items-center gap-1 bg-secondary text-primary border-border px-1.5 py-0.5 text-xs"
                        >
                          <span class="relative flex h-1.5 w-1.5">
                            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75"></span>
                            <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary"></span>
                          </span>
                          {{ t('announcements.unread') }}
                        </Badge>
                      </div>
                    </div>

                    <div class="flex-shrink-0">
                      <Icon name="chevronRight" size="md" class="text-muted-foreground transition-transform group-hover:translate-x-1" :stroke-width="2" />
                    </div>
                  </div>

                  <!-- Unread indicator bar -->
                  <div
                    v-if="!item.read_at"
                    class="absolute left-0 top-0 h-full w-1 bg-primary"
                  ></div>
                </div>
              </div>

              <!-- Empty State -->
              <div v-else class="flex flex-col items-center justify-center py-16">
                <div class="relative mb-4">
                  <div class="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-secondary ">
                    <Icon name="inbox" size="xl" class="text-muted-foreground" />
                  </div>
                  <div class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  </div>
                </div>
                <p class="text-sm font-medium text-foreground">{{ t('announcements.empty') }}</p>
                <p class="mt-1 text-xs text-muted-foreground">{{ t('announcements.emptyDescription') }}</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 公告详情 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="detailModalOpen && selectedAnnouncement"
          class="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[6vh] backdrop-blur-md"
          @click="closeDetail"
        >
          <div
            class="w-full max-w-[780px] overflow-hidden rounded-lg border border-border bg-card "
            @click.stop
          >
            <!-- Header -->
            <div class="relative overflow-hidden border-b border-border bg-card px-8 py-6">
              <div class="relative z-10 flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <!-- Icon and Category -->
                  <div class="mb-3 flex items-center gap-2">
                    <div class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                      <Icon name="infoCircle" size="md" :stroke-width="2" />
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge variant="outline" class="bg-secondary text-primary border-border px-2.5 py-1 text-xs">
                        {{ t('announcements.title') }}
                      </Badge>
                      <Badge
                        v-if="!selectedAnnouncement.read_at"
                        variant="outline"
                        class="inline-flex items-center gap-1.5 bg-secondary text-primary border-border px-2.5 py-1 text-xs"
                      >
                        <span class="relative flex h-2 w-2">
                          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75"></span>
                          <span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                        </span>
                        {{ t('announcements.unread') }}
                      </Badge>
                    </div>
                  </div>

                  <!-- Title -->
                  <h2 class="mb-3 text-2xl font-bold leading-tight text-foreground">
                    {{ selectedAnnouncement.title }}
                  </h2>

                  <!-- Meta Info -->
                  <div class="flex items-center gap-4 text-sm text-muted-foreground">
                    <div class="flex items-center gap-1.5">
                      <Icon name="clock" size="sm" :stroke-width="2" />
                      <time>{{ formatRelativeWithDateTime(selectedAnnouncement.created_at) }}</time>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <Icon name="eye" size="sm" :stroke-width="2" />
                      <span>{{ selectedAnnouncement.read_at ? t('announcements.read') : t('announcements.unread') }}</span>
                    </div>
                  </div>
                </div>

                <!-- Close button -->
                <Button
                  variant="ghost"
                  size="icon"
                  @click="closeDetail"
                  class="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  :aria-label="t('common.close')"
                >
                  <Icon name="x" size="md" />
                </Button>
              </div>
            </div>

            <!-- Body with Enhanced Markdown -->
            <div class="max-h-[60vh] overflow-y-auto bg-card px-8 py-8">
              <!-- Content with decorative border -->
              <div class="relative">
                <!-- Decorative left border -->
                <div class="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-primary"></div>

                <div class="pl-6">
                  <div
                    class="markdown-body prose prose-sm max-w-none"
                    v-html="renderedDetailContent"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Footer with Actions -->
            <div class="border-t border-border bg-card px-8 py-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="infoCircle" size="sm" :stroke-width="2" />
                  <span>{{ selectedAnnouncement.read_at ? t('announcements.readStatus') : t('announcements.markReadHint') }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <Button
                    variant="outline"
                    @click="closeDetail"
                  >
                    {{ t('common.close') }}
                  </Button>
                  <Button
                    v-if="!selectedAnnouncement.read_at"
                    @click="markAsReadAndClose(selectedAnnouncement.id)"
                    class="hover:scale-105"
                  >
                    <Icon name="check" size="sm" :stroke-width="2" />
                    {{ t('announcements.markRead') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
// marked / dompurify 仅在公告详情真正打开时按需加载，避免污染主包
import { useAppStore } from '@/stores/app'
import { useAnnouncementStore } from '@/stores/announcements'
import { formatRelativeTime, formatRelativeWithDateTime } from '@/utils/format'
import type { UserAnnouncement } from '@/types'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()
const appStore = useAppStore()
const announcementStore = useAnnouncementStore()

// Use store state (storeToRefs for reactivity)
const { announcements, loading } = storeToRefs(announcementStore)
const unreadCount = computed(() => announcementStore.unreadCount)

// Local modal state
const isModalOpen = ref(false)
const detailModalOpen = ref(false)
const selectedAnnouncement = ref<UserAnnouncement | null>(null)
const renderedDetailContent = ref('')

// 懒加载 markdown 渲染器：只有用户打开公告详情才会真正拉取 marked/dompurify
let markdownRenderer: ((content: string) => string) | null = null
async function getMarkdownRenderer(): Promise<(content: string) => string> {
  if (markdownRenderer) return markdownRenderer
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    import('marked'),
    import('dompurify')
  ])
  marked.setOptions({ breaks: true, gfm: true })
  markdownRenderer = (content: string) => {
    if (!content) return ''
    const html = marked.parse(content) as string
    return DOMPurify.sanitize(html)
  }
  return markdownRenderer
}

async function renderDetail(content: string): Promise<void> {
  if (!content) {
    renderedDetailContent.value = ''
    return
  }
  const render = await getMarkdownRenderer()
  renderedDetailContent.value = render(content)
}

watch(selectedAnnouncement, (value) => {
  if (value) {
    void renderDetail(value.content)
  } else {
    renderedDetailContent.value = ''
  }
})

function openModal() {
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
}

function openDetail(announcement: UserAnnouncement) {
  selectedAnnouncement.value = announcement
  detailModalOpen.value = true
  if (!announcement.read_at) {
    markAsRead(announcement.id)
  }
}

function closeDetail() {
  detailModalOpen.value = false
  selectedAnnouncement.value = null
}

async function markAsRead(id: number) {
  try {
    await announcementStore.markAsRead(id)
  } catch (err: any) {
    appStore.showError(err?.message || t('common.unknownError'))
  }
}

async function markAsReadAndClose(id: number) {
  await markAsRead(id)
  appStore.showSuccess(t('announcements.markedAsRead'))
  closeDetail()
}

async function markAllAsRead() {
  try {
    await announcementStore.markAllAsRead()
    appStore.showSuccess(t('announcements.allMarkedAsRead'))
  } catch (err: any) {
    appStore.showError(err?.message || t('common.unknownError'))
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (detailModalOpen.value) {
      closeDetail()
    } else if (isModalOpen.value) {
      closeModal()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})

watch(
  [isModalOpen, detailModalOpen, () => announcementStore.currentPopup],
  ([modal, detail, popup]) => {
    document.body.style.overflow = (modal || detail || popup) ? 'hidden' : ''
  }
)
</script>

<style scoped>
/* Modal Animations */
.modal-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from > div {
  transform: scale(0.94) translateY(-12px);
  opacity: 0;
}

.modal-fade-leave-to > div {
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

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.6);
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.7);
}
</style>

<style>
/* Enhanced Markdown Styles */
.markdown-body {
  @apply text-[15px] leading-[1.75];
  @apply text-foreground/85;
}

.markdown-body h1 {
  @apply mb-6 mt-8 border-b border-border pb-3 text-3xl font-bold text-foreground;
}

.markdown-body h2 {
  @apply mb-4 mt-7 border-b border-border pb-2 text-2xl font-bold text-foreground;
}

.markdown-body h3 {
  @apply mb-3 mt-6 text-xl font-semibold text-foreground;
}

.markdown-body h4 {
  @apply mb-2 mt-5 text-lg font-semibold text-foreground;
}

.markdown-body p {
  @apply mb-4 leading-relaxed;
}

.markdown-body a {
  @apply font-medium text-primary underline decoration-primary/30 decoration-2 underline-offset-2 transition-all hover:decoration-primary;
}

.markdown-body ul,
.markdown-body ol {
  @apply mb-4 ml-6 space-y-2;
}

.markdown-body ul {
  @apply list-disc;
}

.markdown-body ol {
  @apply list-decimal;
}

.markdown-body li {
  @apply leading-relaxed;
  @apply pl-2;
}

.markdown-body li::marker {
  @apply text-primary;
}

.markdown-body blockquote {
  @apply relative my-5 border-l-4 border-primary bg-card py-3 pl-5 pr-4 italic text-foreground/85;
}

.markdown-body blockquote::before {
  content: '"';
  @apply absolute -left-1 top-0 text-5xl font-serif text-primary/20;
}

.markdown-body code {
  @apply rounded-md bg-muted px-2 py-1 text-[13px] font-mono text-primary;
}

.markdown-body pre {
  @apply my-5 overflow-x-auto rounded-md border border-border bg-muted p-5;
}

.markdown-body pre code {
  @apply bg-transparent p-0 text-[13px] text-foreground/85;
}

.markdown-body hr {
  @apply my-8 border-0 border-t-2 border-border;
}

.markdown-body table {
  @apply mb-5 w-full overflow-hidden rounded-md border border-border;
}

.markdown-body th,
.markdown-body td {
  @apply border-r border-b border-border px-4 py-3 text-left;
}

.markdown-body th:last-child,
.markdown-body td:last-child {
  @apply border-r-0;
}

.markdown-body tr:last-child td {
  @apply border-b-0;
}

.markdown-body th {
  @apply bg-card font-semibold text-foreground;
}

.markdown-body tbody tr {
  @apply transition-colors hover:bg-accent;
}

.markdown-body img {
  @apply my-5 max-w-full rounded-md border border-border ;
}

.markdown-body strong {
  @apply font-semibold text-foreground;
}

.markdown-body em {
  @apply italic text-muted-foreground;
}
</style>
