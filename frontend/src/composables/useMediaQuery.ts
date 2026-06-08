import { ref, onUnmounted } from 'vue'

type CacheEntry = {
  value: ReturnType<typeof ref<boolean>>
  mql: MediaQueryList
  handler: (e: MediaQueryListEvent) => void
  count: number
}

const cache = new Map<string, CacheEntry>()

export function useMediaQuery(query: string) {
  let entry = cache.get(query)

  if (!entry) {
    const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null
    const value = ref(mql?.matches ?? false)
    const handler = (e: MediaQueryListEvent) => { value.value = e.matches }
    mql?.addEventListener('change', handler)
    entry = { value, mql: mql!, handler, count: 0 }
    cache.set(query, entry)
  }

  entry.count++
  const matches = entry.value

  onUnmounted(() => {
    const e = cache.get(query)
    if (!e) return
    e.count--
    if (e.count <= 0) {
      e.mql?.removeEventListener('change', e.handler)
      cache.delete(query)
    }
  })

  return matches
}

export function useDesktopViewport() {
  return useMediaQuery('(min-width: 768px)')
}
