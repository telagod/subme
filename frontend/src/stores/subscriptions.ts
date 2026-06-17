/**
 * Subscription Store
 * Global state for the user's active subscriptions.
 *
 * Fetch concerns (TTL cache, single-flight dedup, stale-response guard) are
 * delegated to useGenerationGuard so the store body stays focused on shape
 * conversion + polling lifecycle.
 *
 * Generation guard is load-bearing here because:
 *   - The store powers a 5-minute polling loop (subscriptions can change
 *     server-side from billing events).
 *   - clear() runs on logout via useAppLifecycle. Without generation guard, a
 *     slow poll response that started before logout could resurrect the
 *     previous user's subscription data after the new auth state took hold.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import subscriptionsAPI from '@/api/subscriptions'
import { useGenerationGuard } from '@/composables/useGenerationGuard'
import type { UserSubscription } from '@/types'

// Cache TTL: 60 seconds — short enough that user-visible billing changes
// surface quickly, long enough to absorb burst navigation.
const CACHE_TTL_MS = 60_000
// Auto-refresh cadence — matches the previous implementation.
const POLL_INTERVAL_MS = 5 * 60 * 1000

export const useSubscriptionStore = defineStore('subscriptions', () => {
  // Generation-guarded fetch layer. data here is the raw API response (or
  // null before first load); we mirror it into activeSubscriptions so the
  // public surface (always a UserSubscription[]) stays stable.
  const fetchState = useGenerationGuard<UserSubscription[]>(
    () => subscriptionsAPI.getActiveSubscriptions(),
    { cacheMs: CACHE_TTL_MS }
  )

  // Public state — preserved exactly for callers / tests.
  const activeSubscriptions = ref<UserSubscription[]>([])
  const loading = fetchState.loading

  // Auto-refresh interval handle.
  let pollerInterval: ReturnType<typeof setInterval> | null = null

  // Computed
  const hasActiveSubscriptions = computed(() => activeSubscriptions.value.length > 0)

  /**
   * Fetch active subscriptions with caching, single-flight dedup, and
   * generation-guarded commit. Errors propagate to the caller; stale
   * responses (post-reset or post-force) resolve with the stale value but
   * never overwrite activeSubscriptions.
   *
   * We mirror fetchState.data into activeSubscriptions rather than using the
   * fetcher's return value directly: useGenerationGuard only commits to
   * fetchState.data when the response is fresh, so reading it post-await
   * is the canonical signal of "what was actually accepted".
   */
  async function fetchActiveSubscriptions(force = false): Promise<UserSubscription[]> {
    try {
      await fetchState.fetch(force)
      // Mirror committed data. If generation guard rejected the commit,
      // fetchState.data still holds the last good value (or null pre-load).
      if (fetchState.data.value) {
        activeSubscriptions.value = fetchState.data.value
      }
      return activeSubscriptions.value
    } catch (error) {
      console.error('Failed to fetch active subscriptions:', error)
      throw error
    }
  }

  /**
   * Start auto-refresh polling. Idempotent — repeated calls are no-ops.
   */
  function startPolling() {
    if (pollerInterval) return

    pollerInterval = setInterval(() => {
      fetchActiveSubscriptions(true).catch((error) => {
        console.error('Subscription polling failed:', error)
      })
    }, POLL_INTERVAL_MS)
  }

  /**
   * Stop auto-refresh polling.
   */
  function stopPolling() {
    if (pollerInterval) {
      clearInterval(pollerInterval)
      pollerInterval = null
    }
  }

  /**
   * Clear all subscription data and stop polling.
   * Generation bump inside fetchState.reset() ensures any in-flight response
   * (e.g. a slow poll that started before logout) cannot commit afterwards.
   */
  function clear() {
    fetchState.reset()
    activeSubscriptions.value = []
    stopPolling()
  }

  /**
   * Invalidate cache so the next fetch() hits the network. Does not bump
   * generation — in-flight requests stay valid; this just shortens TTL.
   */
  function invalidateCache() {
    fetchState.lastFetchedAt.value = 0
  }

  return {
    // State
    activeSubscriptions,
    loading,
    hasActiveSubscriptions,

    // Actions
    fetchActiveSubscriptions,
    startPolling,
    stopPolling,
    clear,
    invalidateCache,
  }
})
