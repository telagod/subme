import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { announcementsAPI } from '@/api'
import { useFetchState } from '@/composables/useFetchState'
import type { UserAnnouncement } from '@/types'

const THROTTLE_MS = 20 * 60 * 1000 // 20 minutes
// Backoff window after a fetch failure — avoid hammering a 5xx backend on every
// nav / visibility-change tick.
const ERROR_BACKOFF_MS = 60 * 1000 // 60 seconds

export const useAnnouncementStore = defineStore('announcements', () => {
  // State
  const announcements = ref<UserAnnouncement[]>([])
  const popupQueue = ref<UserAnnouncement[]>([])
  const currentPopup = ref<UserAnnouncement | null>(null)

  // Session-scoped dedup set — not reactive, used as plain lookup only
  let shownPopupIds = new Set<number>()

  // Setter timeout handle for the "show next popup after a short delay" path.
  // Tracked so reset() / repeated dismiss() calls don't leak overlapping timers.
  let pendingNextTimeoutId: number | null = null

  // Fetch layer (TTL + error backoff + single-flight) delegated to useFetchState.
  // The fetcher itself runs the side effect (slice + enqueue popups) on success
  // so the upstream contract (Promise<void> with mutated store state) stays.
  const fetchState = useFetchState<true>(
    async () => {
      const all = await announcementsAPI.list(false)
      announcements.value = all.slice(0, 20)
      enqueueNewPopups()
      return true
    },
    { cacheMs: THROTTLE_MS, errorBackoffMs: ERROR_BACKOFF_MS }
  )

  const loading = fetchState.loading
  const fetchError = fetchState.error

  // Getters
  const unreadCount = computed(() =>
    announcements.value.filter((a) => !a.read_at).length
  )

  function schedulePendingNext(delayMs: number) {
    if (pendingNextTimeoutId !== null) {
      clearTimeout(pendingNextTimeoutId)
    }
    pendingNextTimeoutId = window.setTimeout(() => {
      pendingNextTimeoutId = null
      showNextPopup()
    }, delayMs)
  }

  // Actions
  async function fetchAnnouncements(force = false): Promise<void> {
    // Preserve original swallow-on-failure contract — call sites in
    // useAppLifecycle invoke this without await/.catch and would otherwise
    // surface as unhandled rejections.
    try {
      await fetchState.fetch(force)
    } catch (err) {
      console.error('Failed to fetch announcements:', err)
    }
  }

  function enqueueNewPopups() {
    const newPopups = announcements.value.filter(
      (a) => a.notify_mode === 'popup' && !a.read_at && !shownPopupIds.has(a.id)
    )
    if (newPopups.length === 0) return

    for (const p of newPopups) {
      if (!popupQueue.value.some((q) => q.id === p.id)) {
        popupQueue.value.push(p)
      }
    }

    if (!currentPopup.value) {
      showNextPopup()
    }
  }

  function showNextPopup() {
    if (popupQueue.value.length === 0) {
      currentPopup.value = null
      return
    }
    currentPopup.value = popupQueue.value.shift()!
    shownPopupIds.add(currentPopup.value.id)
  }

  async function dismissPopup() {
    if (!currentPopup.value) return
    const id = currentPopup.value.id
    currentPopup.value = null

    // Mark as read (fire-and-forget, UI already updated)
    markAsRead(id)

    // Show next popup after a short delay (tracked handle, clears prior timer)
    if (popupQueue.value.length > 0) {
      schedulePendingNext(300)
    }
  }

  function skipPopup() {
    if (!currentPopup.value) return
    currentPopup.value = null
    if (popupQueue.value.length > 0) {
      schedulePendingNext(300)
    }
  }

  async function markAsRead(id: number) {
    try {
      await announcementsAPI.markRead(id)
      const ann = announcements.value.find((a) => a.id === id)
      if (ann) {
        ann.read_at = new Date().toISOString()
      }
    } catch (err: any) {
      console.error('Failed to mark announcement as read:', err)
    }
  }

  async function markAllAsRead() {
    const unread = announcements.value.filter((a) => !a.read_at)
    if (unread.length === 0) return

    try {
      loading.value = true
      await Promise.all(unread.map((a) => announcementsAPI.markRead(a.id)))
      announcements.value.forEach((a) => {
        if (!a.read_at) {
          a.read_at = new Date().toISOString()
        }
      })
    } catch (err: any) {
      console.error('Failed to mark all as read:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  function reset() {
    announcements.value = []
    shownPopupIds = new Set()
    popupQueue.value = []
    currentPopup.value = null
    // Clears data/loading/loaded/error/lastFetchedAt and any inflight handle.
    fetchState.reset()
    if (pendingNextTimeoutId !== null) {
      clearTimeout(pendingNextTimeoutId)
      pendingNextTimeoutId = null
    }
  }

  return {
    // State
    announcements,
    loading,
    currentPopup,
    fetchError,
    // Getters
    unreadCount,
    // Actions
    fetchAnnouncements,
    dismissPopup,
    skipPopup,
    markAsRead,
    markAllAsRead,
    reset,
  }
})
