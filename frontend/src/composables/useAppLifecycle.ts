/**
 * useAppLifecycle — owns the App.vue-side store side-effects.
 *
 * Previously App.vue directly orchestrated:
 *   - visibility listener registration/teardown
 *   - subscription polling start/stop on auth changes
 *   - announcement reset on logout
 *   - admin-settings window listener install/uninstall on mount/unmount
 *
 * That spread fragile cleanup logic through one component template. This
 * composable consolidates it so:
 *   - App.vue only calls useAppLifecycle() once in setup()
 *   - HMR / teardown reliably tears down all side-effects
 *   - Other shells (test harness, isolated views) can opt in to the same wiring
 *
 * Each side-effect remains a single source of truth — the stores themselves
 * still own their data; this just owns the *coordination* between auth state
 * and store lifecycle.
 */

import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore, useSubscriptionStore, useAnnouncementStore } from '@/stores'
import { useAdminSettingsStore } from '@/stores/adminSettings'

export interface UseAppLifecycleOptions {
  /** Delay in ms before force-fetching announcements after a fresh login. */
  freshLoginAnnouncementDelayMs?: number
}

export function useAppLifecycle(options: UseAppLifecycleOptions = {}) {
  const authStore = useAuthStore()
  const subscriptionStore = useSubscriptionStore()
  const announcementStore = useAnnouncementStore()
  const adminSettingsStore = useAdminSettingsStore()

  const freshLoginDelayMs = options.freshLoginAnnouncementDelayMs ?? 3000

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && authStore.isAuthenticated) {
      announcementStore.fetchAnnouncements()
    }
  }

  // Track whether we registered visibilitychange so teardown is idempotent.
  let visibilityRegistered = false

  function registerVisibility(): void {
    if (visibilityRegistered) return
    document.addEventListener('visibilitychange', onVisibilityChange)
    visibilityRegistered = true
  }

  function unregisterVisibility(): void {
    if (!visibilityRegistered) return
    document.removeEventListener('visibilitychange', onVisibilityChange)
    visibilityRegistered = false
  }

  const stopAuthWatch = watch(
    () => authStore.isAuthenticated,
    (isAuthenticated, oldValue) => {
      if (isAuthenticated) {
        subscriptionStore.fetchActiveSubscriptions().catch((error) => {
          console.error('Failed to preload subscriptions:', error)
        })
        subscriptionStore.startPolling()

        if (oldValue === false) {
          // New login: delay then force fetch — gives the toast/redirect a moment.
          setTimeout(() => announcementStore.fetchAnnouncements(true), freshLoginDelayMs)
        } else {
          // Page refresh restore: cooperative throttle inside the store.
          announcementStore.fetchAnnouncements()
        }

        registerVisibility()
      } else {
        subscriptionStore.clear()
        announcementStore.reset()
        unregisterVisibility()
      }
    },
    { immediate: true }
  )

  onMounted(() => {
    adminSettingsStore.installEventListeners()
  })

  onBeforeUnmount(() => {
    stopAuthWatch()
    unregisterVisibility()
    adminSettingsStore.uninstallEventListeners()
  })

  return {
    /** Manually trigger an announcement refresh — used by the router afterEach hook. */
    refreshAnnouncementsIfAuthed(): void {
      if (authStore.isAuthenticated) {
        announcementStore.fetchAnnouncements()
      }
    },
  }
}
