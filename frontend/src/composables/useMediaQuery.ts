import { ref, onUnmounted } from 'vue'

const cache = new Map<string, { value: ReturnType<typeof ref<boolean>>, mql: MediaQueryList, count: number }>()

export function useMediaQuery(query: string) {
  let entry = cache.get(query)

  if (!entry) {
    const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null
    const value = ref(mql?.matches ?? false)
    const handler = (e: MediaQueryListEvent) => { value.value = e.matches }
    mql?.addEventListener('change', handler)
    entry = { value, mql: mql!, count: 0 }
    cache.set(query, entry)
  }

  entry.count++
  const matches = entry.value

  onUnmounted(() => {
    const e = cache.get(query)
    if (e) {
      e.count--
      if (e.count <= 0) {
        e.mql?.removeEventListener('change', () => {})
        cache.delete(query)
      }
    }
  })

  return matches
}

export function useDesktopViewport() {
  return useMediaQuery('(min-width: 768px)')
}
