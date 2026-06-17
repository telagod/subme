/**
 * useFetchState — small caching+single-flight wrapper for cross-store "fetch
 * once, share, refresh on demand" patterns.
 *
 * Each Pinia store rolling its own {loading, loaded, error, lastFetchedAt}
 * triplet diverges on subtle bits (TTL, force-fetch semantics, error backoff,
 * promise dedup). This composable codifies one shape:
 *
 *   const state = useFetchState(() => api.getPlans(), { cacheMs: 60_000 })
 *   await state.fetch()           // throttled
 *   await state.fetch(true)       // force
 *   state.data.value              // last successful payload (or null)
 *   state.loading.value           // in-flight indicator
 *   state.error.value             // last failure (cleared on success)
 *
 * It deliberately stays Vue-only (no Pinia) so non-store callers (App.vue,
 * route guards, etc.) can use it too.
 */

import { ref, type Ref } from 'vue'

export interface UseFetchStateOptions {
  /** Cache TTL in ms. fetch() within this window after success is a no-op. */
  cacheMs?: number
  /** Backoff window after a failure; throttle stays active until elapsed. */
  errorBackoffMs?: number
  /**
   * Optional commit gate. Invoked after the fetcher resolves but BEFORE the
   * result is written to `data` / `loaded` / `lastFetchedAt`. If it returns
   * false, the commit is skipped but fetch() still resolves with the value so
   * the caller's contract is preserved. Used by useGenerationGuard to drop
   * stale responses without surfacing them as errors. Default: always commit.
   */
  shouldCommit?: () => boolean
}

export interface UseFetchState<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  error: Ref<unknown>
  lastFetchedAt: Ref<number>
  fetch: (force?: boolean) => Promise<T | null>
  reset: () => void
}

export function useFetchState<T>(
  fetcher: () => Promise<T>,
  options: UseFetchStateOptions = {}
): UseFetchState<T> {
  const cacheMs = options.cacheMs ?? 0
  const errorBackoffMs = options.errorBackoffMs ?? 0
  const shouldCommit = options.shouldCommit

  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<unknown>(null)
  const lastFetchedAt = ref(0)

  // Single-flight in-flight Promise — concurrent callers reuse the same call.
  let inflight: Promise<T | null> | null = null

  async function fetch(force = false): Promise<T | null> {
    const now = Date.now()
    if (!force && lastFetchedAt.value > 0 && now - lastFetchedAt.value < cacheMs) {
      return data.value
    }
    if (inflight) {
      return inflight
    }

    loading.value = true
    error.value = null
    // Stamp now BEFORE awaiting so a parallel caller sees cache-hit and short-circuits.
    lastFetchedAt.value = now

    inflight = (async () => {
      try {
        const result = await fetcher()
        // Commit gate: useGenerationGuard plugs in here to drop stale responses
        // without poisoning data/loaded/lastFetchedAt. When skipped, we also
        // roll lastFetchedAt back to its pre-fetch value (captured above) so a
        // stale response cannot keep the TTL alive past a reset().
        if (shouldCommit && !shouldCommit()) {
          lastFetchedAt.value = 0
          return result
        }
        data.value = result
        loaded.value = true
        return result
      } catch (err) {
        error.value = err
        // Backoff: keep throttle alive for errorBackoffMs instead of letting the
        // next caller blast the failing endpoint immediately.
        if (errorBackoffMs > 0) {
          lastFetchedAt.value = now - cacheMs + errorBackoffMs
        } else {
          // No backoff configured — reset to 0 so a retry is allowed.
          lastFetchedAt.value = 0
        }
        throw err
      } finally {
        loading.value = false
        inflight = null
      }
    })()

    return inflight
  }

  function reset(): void {
    data.value = null
    loading.value = false
    loaded.value = false
    error.value = null
    lastFetchedAt.value = 0
    inflight = null
  }

  return {
    data,
    loading,
    loaded,
    error,
    lastFetchedAt,
    fetch,
    reset,
  }
}
