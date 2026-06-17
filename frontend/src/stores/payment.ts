/**
 * Payment Store
 * Manages payment configuration, current order state, and subscription plans
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { paymentAPI } from '@/api/payment'
import { useFetchState } from '@/composables/useFetchState'
import type { PaymentConfig, PaymentOrder, SubscriptionPlan, CreateOrderRequest } from '@/types/payment'

export const usePaymentStore = defineStore('payment', () => {
  // ==================== State ====================

  /** Currently active order (for payment flow) */
  const currentOrder = ref<PaymentOrder | null>(null)
  /** Available subscription plans */
  const plans = ref<SubscriptionPlan[]>([])

  // Config fetch state — backed by useFetchState for single-flight + load-guard.
  // Original public surface (config / configLoading / configLoaded / configError /
  // fetchConfig) is preserved one-to-one; fetchConfig still swallows errors and
  // returns null on failure to keep call sites (StripePaymentView, etc.) intact.
  const configState = useFetchState<PaymentConfig>(async () => {
    const response = await paymentAPI.getConfig()
    return response.data
  })

  /** Payment configuration from backend */
  const config = configState.data
  const configLoading = configState.loading
  const configLoaded = configState.loaded
  const configError = configState.error

  // Surfaced fetch errors — UI can render inline retry / banner.
  // Each fetch entry point clears its corresponding error before issuing the request.
  const plansError = ref<unknown>(null)
  const orderError = ref<unknown>(null)

  // ==================== Actions ====================

  /** Fetch payment configuration */
  async function fetchConfig(force = false): Promise<PaymentConfig | null> {
    // Preserve original swallow-and-return-null contract; throws would break the
    // existing try/await chain in callers and the StripePaymentView spec.
    try {
      return await configState.fetch(force)
    } catch (error: unknown) {
      console.error('[payment] Failed to fetch config:', error)
      return null
    }
  }

  /** Fetch available subscription plans */
  async function fetchPlans(): Promise<SubscriptionPlan[]> {
    plansError.value = null
    try {
      const response = await paymentAPI.getPlans()
      // Backend returns features as newline-separated string; parse to array
      plans.value = (response.data || []).map((p: Omit<SubscriptionPlan, 'features'> & { features: string | string[] }) => ({
        ...p,
        features: typeof p.features === 'string'
          ? p.features.split('\n').map((f: string) => f.trim()).filter(Boolean)
          : (p.features || []),
      }))
      return plans.value
    } catch (error: unknown) {
      plansError.value = error
      console.error('[payment] Failed to fetch plans:', error)
      return []
    }
  }

  /** Create a new order and set it as current */
  async function createOrder(params: CreateOrderRequest) {
    orderError.value = null
    try {
      const response = await paymentAPI.createOrder(params)
      return response.data
    } catch (error: unknown) {
      orderError.value = error
      throw error
    }
  }

  /** Poll order status by ID (read-only, no upstream check) */
  async function pollOrderStatus(orderId: number): Promise<PaymentOrder | null> {
    orderError.value = null
    try {
      const response = await paymentAPI.getOrder(orderId)
      const order = response.data
      if (currentOrder.value?.id === orderId) {
        currentOrder.value = order
      }
      return order
    } catch (error: unknown) {
      orderError.value = error
      console.error('[payment] Failed to poll order status:', error)
      return null
    }
  }

  /** Clear current order state */
  function clearCurrentOrder() {
    currentOrder.value = null
  }

  return {
    config,
    currentOrder,
    plans,
    configLoading,
    configLoaded,
    configError,
    plansError,
    orderError,
    fetchConfig,
    fetchPlans,
    createOrder,
    pollOrderStatus,
    clearCurrentOrder
  }
})
