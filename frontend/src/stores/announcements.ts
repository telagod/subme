import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { announcementsAPI } from '@/api'
import type { UserAnnouncement } from '@/types'

const THROTTLE_MS = 20 * 60 * 1000 // 20 minutes
// Backoff window after a fetch failure — avoid hammering a 5xx backend on every
// nav / visibility-change tick.
const ERROR_BACKOFF_MS = 60 * 1000 // 60 seconds

export const useAnnouncementStore = defineStore('announcements', () => {
  // State
  const announcements = ref<UserAnnouncement[]>([])
  const loading = ref(false)
  const lastFetchTime = ref(0)
  const popupQueue = ref<UserAnnouncement[]>([])
  const currentPopup = ref<UserAnnouncement | null>(null)
  // Surfaced fetch failure (most recent)
  const fetchError = ref<unknown>(null)

  // Session-scoped dedup set — not reactive, used as plain lookup only
  let shownPopupIds = new Set<number>()

  // In-flight fetch promise — single-flight dedup so a burst of route changes
  // doesn't fan out into N concurrent /announcements calls.
  let fetchInFlight: Promise<void> | null = null

  // Setter timeout handle for the "show next popup after a short delay" path.
  // Tracked so reset() / repeated dismiss() calls don't leak overlapping timers.
  let pendingNextTimeoutId: number | null = null

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
    const now = Date.now()
    if (!force && lastFetchTime.value > 0 && now - lastFetchTime.value < THROTTLE_MS) {
      return
    }

    // Single-flight dedup: concurrent callers reuse the same promise.
    if (fetchInFlight) {
      return fetchInFlight
    }

    // Set immediately to prevent concurrent duplicate requests (belt & braces
    // with fetchInFlight — also keeps throttle correct across awaits).
    lastFetchTime.value = now
    fetchError.value = null

    fetchInFlight = (async () => {
      try {
        loading.value = true
        const all = await announcementsAPI.list(false)
        announcements.value = all.slice(0, 20)
        enqueueNewPopups()
      } catch (err: any) {
        fetchError.value = err
        // Backoff: keep throttle alive for ERROR_BACKOFF_MS instead of resetting
        // to 0 (which lets every subsequent nav / visibility-change re-hammer 5xx).
        lastFetchTime.value = now - THROTTLE_MS + ERROR_BACKOFF_MS
        console.error('Failed to fetch announcements:', err)
      } finally {
        loading.value = false
        fetchInFlight = null
      }
    })()

    return fetchInFlight
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
    lastFetchTime.value = 0
    shownPopupIds = new Set()
    popupQueue.value = []
    currentPopup.value = null
    loading.value = false
    fetchError.value = null
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
