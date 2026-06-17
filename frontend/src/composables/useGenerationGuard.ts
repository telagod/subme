/**
 * useGenerationGuard — generation-aware wrapper around useFetchState.
 *
 * useFetchState handles single-flight + TTL + error backoff, but it cannot
 * defend against this race:
 *
 *   1. fetch()      — request A starts (slow path, 5s)
 *   2. reset()      — store clear / logout fires (clears inflight handle)
 *   3. fetch()      — request B starts (fresh, 1s)
 *   4. B resolves   — commits B's payload (correct)
 *   5. A resolves   — commits A's payload, overwriting B with stale data
 *
 * Without a generation token, useFetchState has no way to know A is stale at
 * commit time. The single-flight dedup only protects concurrent callers of
 * the same generation; it doesn't protect across reset().
 *
 * Generation guard fixes this by:
 *   - Bumping a generation counter on every reset().
 *   - Bumping it on every force=true fetch (so any abandoned inflight is
 *     marked stale even if the underlying dedup were bypassed).
 *   - Capturing the generation at fetcher-invocation time and validating it
 *     via useFetchState's shouldCommit gate. Stale responses still resolve
 *     for the caller (preserving the Promise<T> contract used by polling
 *     loops) but never mutate the underlying state.
 *
 * Public surface mirrors useFetchState — drop-in replacement for stores whose
 * fetches outlive a logout/clear (subscriptions polling is the canonical case).
 */

import { ref, type Ref } from 'vue'
import { useFetchState, type UseFetchStateOptions } from './useFetchState'

export interface UseGenerationGuard<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  error: Ref<unknown>
  lastFetchedAt: Ref<number>
  /** Current generation token. Exposed for tests / diagnostics. */
  generation: Ref<number>
  fetch: (force?: boolean) => Promise<T | null>
  reset: () => void
}

export function useGenerationGuard<T>(
  fetcher: () => Promise<T>,
  options: UseFetchStateOptions = {}
): UseGenerationGuard<T> {
  const generation = ref(0)

  // Per-request generation: captured in the wrapped fetcher's local closure
  // BEFORE awaiting the user fetcher. Each invocation of the wrapped fetcher
  // gets its own `reqGen` value, so even if shouldCommit runs out-of-order
  // (request B commits before A resolves), each request validates against
  // its own captured generation, not a shared mutable slot.
  //
  // shouldCommit is closed over via `lastReqGen` which is set inside the
  // fetcher right before resolving — useFetchState calls shouldCommit
  // synchronously after the fetcher resolves, so this is single-threaded.
  let lastReqGen = 0

  const inner = useFetchState<T>(
    async () => {
      const reqGen = generation.value
      const result = await fetcher()
      // Hand off our captured generation to shouldCommit. This assignment
      // and the immediate shouldCommit() call are synchronous (no await
      // between them inside useFetchState) so concurrent requests cannot
      // interleave the handoff.
      lastReqGen = reqGen
      return result
    },
    {
      ...options,
      shouldCommit: () => lastReqGen === generation.value,
    }
  )

  async function fetch(force = false): Promise<T | null> {
    // force=true bumps generation: even though useFetchState single-flights
    // and returns the existing inflight on force=true, we still want a fresh
    // generation so a parallel polling loop that doesn't share that inflight
    // (e.g. it just resolved) can't commit afterward.
    if (force) {
      generation.value++
    }
    return inner.fetch(force)
  }

  function reset(): void {
    // Bump first so any in-flight response that's about to call shouldCommit
    // sees the mismatch and drops its commit.
    generation.value++
    inner.reset()
  }

  return {
    data: inner.data,
    loading: inner.loading,
    loaded: inner.loaded,
    error: inner.error,
    lastFetchedAt: inner.lastFetchedAt,
    generation,
    fetch,
    reset,
  }
}
