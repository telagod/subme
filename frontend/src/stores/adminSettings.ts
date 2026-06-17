import { defineStore } from 'pinia'
import { ref } from 'vue'
import { adminAPI } from '@/api'
import { useAuthStore } from './auth'
import { useAppStore } from './app'
import { extractApiErrorMessage } from '@/utils/apiError'
import { i18n } from '@/i18n'
import type { CustomMenuItem } from '@/types'

export const useAdminSettingsStore = defineStore('adminSettings', () => {
  const loaded = ref(false)
  const loading = ref(false)
  // Surfaced fetch failure for UI to render an inline error / retry. catch path
  // no longer flips `loaded`, so the next call naturally retries.
  const fetchError = ref<unknown>(null)

  const readCachedBool = (key: string, defaultValue: boolean): boolean => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {
      // ignore localStorage failures
    }
    return defaultValue
  }

  const writeCachedBool = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, value ? 'true' : 'false')
    } catch {
      // ignore localStorage failures
    }
  }

  const readCachedString = (key: string, defaultValue: string): string => {
    try {
      const raw = localStorage.getItem(key)
      if (typeof raw === 'string' && raw.length > 0) return raw
    } catch {
      // ignore localStorage failures
    }
    return defaultValue
  }

  const writeCachedString = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // ignore localStorage failures
    }
  }

  // Default open, but honor cached value to reduce UI flicker on first paint.
  const opsMonitoringEnabled = ref(readCachedBool('ops_monitoring_enabled_cached', true))
  const opsRealtimeMonitoringEnabled = ref(readCachedBool('ops_realtime_monitoring_enabled_cached', true))
  const opsQueryModeDefault = ref(readCachedString('ops_query_mode_default_cached', 'auto'))
  const paymentEnabled = ref(readCachedBool('payment_enabled_cached', false))
  const customMenuItems = ref<CustomMenuItem[]>([])

  async function fetch(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (loading.value) return

    const authStore = useAuthStore()
    if (!authStore.isAdmin) {
      loaded.value = true
      return
    }

    loading.value = true
    fetchError.value = null
    try {
      const [settings, paymentConfigResp] = await Promise.all([
        adminAPI.settings.getSettings(),
        adminAPI.payment.getConfig()
      ])
      opsMonitoringEnabled.value = settings.ops_monitoring_enabled ?? true
      writeCachedBool('ops_monitoring_enabled_cached', opsMonitoringEnabled.value)

      opsRealtimeMonitoringEnabled.value = settings.ops_realtime_monitoring_enabled ?? true
      writeCachedBool('ops_realtime_monitoring_enabled_cached', opsRealtimeMonitoringEnabled.value)

      opsQueryModeDefault.value = settings.ops_query_mode_default || 'auto'
      writeCachedString('ops_query_mode_default_cached', opsQueryModeDefault.value)

      customMenuItems.value = Array.isArray(settings.custom_menu_items) ? settings.custom_menu_items : []

      paymentEnabled.value = paymentConfigResp.data?.enabled ?? false
      writeCachedBool('payment_enabled_cached', paymentEnabled.value)

      loaded.value = true
    } catch (err) {
      // Surface error and KEEP loaded=false so the next fetch() retries automatically.
      // Cached/default values for UI continue to apply (already initialized at module scope).
      fetchError.value = err
      console.error('[adminSettings] Failed to fetch settings:', err)
      // No component consumes fetchError directly, so route through the global app
      // toast so admins actually see the failure instead of silently using cached defaults.
      try {
        const appStore = useAppStore()
        const t = i18n.global.t
        appStore.showError(
          extractApiErrorMessage(err, t('admin.settings.fetchFailed', 'Failed to load admin settings')),
        )
      } catch {
        // ignore toast failures (e.g. during early bootstrap before pinia/i18n ready)
      }
    } finally {
      loading.value = false
    }
  }

  function setOpsMonitoringEnabledLocal(value: boolean) {
    opsMonitoringEnabled.value = value
    writeCachedBool('ops_monitoring_enabled_cached', value)
    loaded.value = true
  }

  function setOpsRealtimeMonitoringEnabledLocal(value: boolean) {
    opsRealtimeMonitoringEnabled.value = value
    writeCachedBool('ops_realtime_monitoring_enabled_cached', value)
    loaded.value = true
  }

  function setPaymentEnabledLocal(value: boolean) {
    paymentEnabled.value = value
    writeCachedBool('payment_enabled_cached', value)
    loaded.value = true
  }

  function setOpsQueryModeDefaultLocal(value: string) {
    opsQueryModeDefault.value = value || 'auto'
    writeCachedString('ops_query_mode_default_cached', opsQueryModeDefault.value)
    loaded.value = true
  }

  // Keep UI consistent if we learn that ops is disabled via feature-gated 404s.
  // (event is dispatched from the axios interceptor)
  //
  // Lifecycle: previously the listener was registered at module-load time, with the
  // cleanup handle captured but never invoked — a guaranteed window-leak across HMR
  // and app teardown. Ownership is now App.vue, which calls installEventListeners()
  // on mount and uninstallEventListeners() on beforeUnmount.
  let eventHandlerCleanup: (() => void) | null = null

  function installEventListeners() {
    if (eventHandlerCleanup) return
    if (typeof window === 'undefined') return

    try {
      const handler = () => {
        setOpsMonitoringEnabledLocal(false)
      }
      window.addEventListener('ops-monitoring-disabled', handler)
      eventHandlerCleanup = () => {
        window.removeEventListener('ops-monitoring-disabled', handler)
      }
    } catch {
      // ignore window access failures (SSR)
    }
  }

  function uninstallEventListeners() {
    if (eventHandlerCleanup) {
      eventHandlerCleanup()
      eventHandlerCleanup = null
    }
  }

  return {
    loaded,
    loading,
    fetchError,
    opsMonitoringEnabled,
    opsRealtimeMonitoringEnabled,
    opsQueryModeDefault,
    paymentEnabled,
    customMenuItems,
    fetch,
    setOpsMonitoringEnabledLocal,
    setOpsRealtimeMonitoringEnabledLocal,
    setPaymentEnabledLocal,
    setOpsQueryModeDefaultLocal,
    installEventListeners,
    uninstallEventListeners
  }
})
