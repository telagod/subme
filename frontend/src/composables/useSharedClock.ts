import { ref, onScopeDispose } from 'vue'

const sharedNow = ref(new Date())
let subscriberCount = 0
let intervalId: ReturnType<typeof setInterval> | null = null

function startClock() {
  if (intervalId) return
  intervalId = setInterval(() => {
    sharedNow.value = new Date()
  }, 60_000)
}

function stopClock() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function useSharedClock() {
  subscriberCount++
  if (subscriberCount === 1) startClock()

  onScopeDispose(() => {
    subscriberCount--
    if (subscriberCount <= 0) {
      subscriberCount = 0
      stopClock()
    }
  })

  return { now: sharedNow }
}
