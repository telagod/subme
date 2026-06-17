import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSubscriptionStore } from '@/stores/subscriptions'

// Mock subscriptions API
const mockGetActiveSubscriptions = vi.fn()

vi.mock('@/api/subscriptions', () => ({
  default: {
    getActiveSubscriptions: (...args: any[]) => mockGetActiveSubscriptions(...args),
  },
}))

const fakeSubscriptions = [
  {
    id: 1,
    user_id: 1,
    group_id: 1,
    status: 'active' as const,
    daily_usage_usd: 5,
    weekly_usage_usd: 20,
    monthly_usage_usd: 50,
    daily_window_start: null,
    weekly_window_start: null,
    monthly_window_start: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    expires_at: '2025-01-01',
  },
  {
    id: 2,
    user_id: 1,
    group_id: 2,
    status: 'active' as const,
    daily_usage_usd: 10,
    weekly_usage_usd: 40,
    monthly_usage_usd: 100,
    daily_window_start: null,
    weekly_window_start: null,
    monthly_window_start: null,
    created_at: '2024-02-01',
    updated_at: '2024-02-01',
    expires_at: '2025-02-01',
  },
]

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- fetchActiveSubscriptions ---

  describe('fetchActiveSubscriptions', () => {
    it('成功获取活跃订阅', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      const result = await store.fetchActiveSubscriptions()

      expect(result).toEqual(fakeSubscriptions)
      expect(store.activeSubscriptions).toEqual(fakeSubscriptions)
      expect(store.loading).toBe(false)
    })

    it('缓存有效时返回缓存数据', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      // 第一次请求
      await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      // 第二次请求（60秒内）- 应返回缓存
      const result = await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1) // 没有新请求
      expect(result).toEqual(fakeSubscriptions)
    })

    it('缓存过期后重新请求', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      // 推进 61 秒让缓存过期
      vi.advanceTimersByTime(61_000)

      const updatedSubs = [fakeSubscriptions[0]]
      mockGetActiveSubscriptions.mockResolvedValue(updatedSubs)

      const result = await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(2)
      expect(result).toEqual(updatedSubs)
    })

    it('force=true 强制重新请求', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()

      const updatedSubs = [fakeSubscriptions[0]]
      mockGetActiveSubscriptions.mockResolvedValue(updatedSubs)

      const result = await store.fetchActiveSubscriptions(true)
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(2)
      expect(result).toEqual(updatedSubs)
    })

    it('并发请求共享同一个 Promise（去重）', async () => {
      let resolvePromise: (v: any) => void
      mockGetActiveSubscriptions.mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve })
      )
      const store = useSubscriptionStore()

      // 并发发起两个请求
      const p1 = store.fetchActiveSubscriptions()
      const p2 = store.fetchActiveSubscriptions()

      // 只调用了一次 API
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      // 解决 Promise
      resolvePromise!(fakeSubscriptions)

      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1).toEqual(fakeSubscriptions)
      expect(r2).toEqual(fakeSubscriptions)
    })

    it('API 错误时抛出异常', async () => {
      mockGetActiveSubscriptions.mockRejectedValue(new Error('Network error'))
      const store = useSubscriptionStore()

      await expect(store.fetchActiveSubscriptions()).rejects.toThrow('Network error')
    })
  })

  // --- hasActiveSubscriptions ---

  describe('hasActiveSubscriptions', () => {
    it('有订阅时返回 true', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()

      expect(store.hasActiveSubscriptions).toBe(true)
    })

    it('无订阅时返回 false', () => {
      const store = useSubscriptionStore()
      expect(store.hasActiveSubscriptions).toBe(false)
    })

    it('清除后返回 false', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()
      expect(store.hasActiveSubscriptions).toBe(true)

      store.clear()
      expect(store.hasActiveSubscriptions).toBe(false)
    })
  })

  // --- invalidateCache ---

  describe('invalidateCache', () => {
    it('失效缓存后下次请求重新获取数据', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      store.invalidateCache()

      await store.fetchActiveSubscriptions()
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(2)
    })
  })

  // --- clear ---

  describe('clear', () => {
    it('清除所有订阅数据', async () => {
      mockGetActiveSubscriptions.mockResolvedValue(fakeSubscriptions)
      const store = useSubscriptionStore()

      await store.fetchActiveSubscriptions()
      expect(store.activeSubscriptions).toHaveLength(2)

      store.clear()

      expect(store.activeSubscriptions).toHaveLength(0)
      expect(store.hasActiveSubscriptions).toBe(false)
    })
  })

  // --- polling ---

  describe('startPolling / stopPolling', () => {
    it('startPolling 不会创建重复 interval', () => {
      const store = useSubscriptionStore()
      mockGetActiveSubscriptions.mockResolvedValue([])

      store.startPolling()
      store.startPolling() // 重复调用

      // 推进5分钟只触发一次
      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      store.stopPolling()
    })

    it('stopPolling 停止定期刷新', () => {
      const store = useSubscriptionStore()
      mockGetActiveSubscriptions.mockResolvedValue([])

      store.startPolling()
      store.stopPolling()

      vi.advanceTimersByTime(10 * 60 * 1000)
      expect(mockGetActiveSubscriptions).not.toHaveBeenCalled()
    })
  })

  // --- generation guard (stale-response protection) ---

  describe('generation guard', () => {
    it('clear() 后旧响应到达不会复活订阅数据（防 logout 后污染）', async () => {
      // Simulates: user loads page → in-flight fetch A → logout → A resolves
      // late and tries to commit. Without generation guard this resurrects
      // the previous user's data after auth state cleared.
      let resolveA: (v: any) => void
      mockGetActiveSubscriptions.mockImplementation(
        () => new Promise((resolve) => {
          resolveA = resolve
        })
      )
      const store = useSubscriptionStore()

      // Start fetch A — leaves it hanging.
      const pA = store.fetchActiveSubscriptions()

      // Simulate logout mid-flight.
      store.clear()
      expect(store.activeSubscriptions).toHaveLength(0)

      // A's response now arrives, late.
      resolveA!(fakeSubscriptions)
      await pA.catch(() => {}) // promise itself resolves, but state must not move

      // Critical: store must still be empty. Stale response was dropped.
      expect(store.activeSubscriptions).toHaveLength(0)
      expect(store.hasActiveSubscriptions).toBe(false)
    })

    it('force=true 跨过 reset 后的旧响应不会覆盖新结果', async () => {
      // Simulates poll/force races: request A starts → clear() → fetch B starts
      // and resolves first with fresh data → A resolves late with stale data.
      // Without generation guard, A overwrites B.
      const resolvers: Array<(v: any) => void> = []
      mockGetActiveSubscriptions.mockImplementation(
        () => new Promise((resolve) => {
          resolvers.push(resolve)
        })
      )
      const store = useSubscriptionStore()

      // Request A — kept hanging.
      const pA = store.fetchActiveSubscriptions()
      expect(resolvers).toHaveLength(1)

      // clear() invalidates generation, drops inflight handle so B is a
      // brand-new request to the underlying useFetchState layer.
      store.clear()

      // Request B — fresh.
      const updatedSubs = [fakeSubscriptions[0]]
      const pB = store.fetchActiveSubscriptions()
      expect(resolvers).toHaveLength(2)

      // B resolves first with the fresh data.
      resolvers[1]!(updatedSubs)
      await pB
      expect(store.activeSubscriptions).toEqual(updatedSubs)

      // A resolves late with stale data.
      resolvers[0]!(fakeSubscriptions)
      await pA.catch(() => {})

      // Critical: B's payload must survive — A's stale commit was suppressed.
      expect(store.activeSubscriptions).toEqual(updatedSubs)
    })

    it('clear() 后 polling 不会用旧响应污染状态', async () => {
      // Simulates: polling tick fires fetch(true), logout fires clear()
      // before the request returns. The polling response must not commit.
      let resolvePoll: (v: any) => void
      mockGetActiveSubscriptions.mockImplementation(
        () => new Promise((resolve) => {
          resolvePoll = resolve
        })
      )
      const store = useSubscriptionStore()

      store.startPolling()
      // Tick the poll interval.
      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(mockGetActiveSubscriptions).toHaveBeenCalledTimes(1)

      // Logout fires before poll response lands. clear() also stops the timer.
      store.clear()

      // Poll response arrives late.
      resolvePoll!(fakeSubscriptions)
      // Flush microtasks so the polling .catch handler runs.
      await Promise.resolve()
      await Promise.resolve()

      expect(store.activeSubscriptions).toHaveLength(0)
      expect(store.hasActiveSubscriptions).toBe(false)
    })
  })
})
