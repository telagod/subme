<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4">
    <Card class="w-full max-w-md">
      <CardContent class="space-y-4 p-6">
        <!-- Amount + Order ID -->
        <div v-if="amount" class="text-center">
          <p class="text-3xl font-bold" :style="{ color: methodColor }">¥{{ amount }}</p>
          <p v-if="orderId" class="mt-1 text-sm text-muted-foreground">
            {{ t('payment.orders.orderId') }}: {{ orderId }}
          </p>
        </div>

        <!-- Error -->
        <div v-if="error" class="space-y-3">
          <div
            class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {{ error }}
          </div>
          <Button
            variant="link"
            class="w-full text-sm"
            :style="{ color: methodColor }"
            @click="closeWindow"
          >
            {{ t('common.close') }}
          </Button>
        </div>

        <!-- Success -->
        <div v-else-if="success" class="space-y-3 py-4 text-center">
          <div class="text-5xl text-emerald-500">✓</div>
          <p class="text-sm text-muted-foreground">{{ t('payment.result.success') }}</p>
          <Button
            variant="link"
            class="text-sm"
            :style="{ color: methodColor }"
            @click="closeWindow"
          >
            {{ t('common.close') }}
          </Button>
        </div>

        <!-- Loading / Redirecting -->
        <div v-else class="flex items-center justify-center py-8">
          <div
            class="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            :style="{ borderColor: methodColor, borderTopColor: 'transparent' }"
          />
          <span class="ml-3 text-sm text-muted-foreground">{{ hint }}</span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface StripeWithWechatPay {
  confirmWechatPayPayment(clientSecret: string, options: Record<string, unknown>): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>
}

const METHOD_COLORS: Record<string, string> = {
  alipay: '#00AEEF',
  wechat_pay: '#07C160',
}
const DEFAULT_METHOD_COLOR = '#635bff'

const { t } = useI18n()
const route = useRoute()

const orderId = String(route.query.order_id || '')
const method = String(route.query.method || 'alipay')
const amount = String(route.query.amount || '')

const methodColor = computed(() => METHOD_COLORS[method] || DEFAULT_METHOD_COLOR)

const error = ref('')
const success = ref(false)
const hint = ref(t('payment.stripePopup.redirecting'))

let pollTimer: ReturnType<typeof setInterval> | null = null

function closeWindow() { if (typeof window !== 'undefined') window.close() }

onMounted(() => {
  // SSR / non-browser guard: onMounted fires post-mount but the whole popup view
  // makes no sense outside a browser context, so we bail early to keep prerender safe.
  if (typeof window === 'undefined') return

  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    if (event.data?.type !== 'STRIPE_POPUP_INIT') return
    window.removeEventListener('message', handler)
    initStripe(event.data.clientSecret, event.data.publishableKey)
  }
  window.addEventListener('message', handler)

  if (window.opener) {
    window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin)
  }

  setTimeout(() => {
    if (!error.value && !success.value) {
      error.value = t('payment.stripePopup.timeout')
    }
  }, 15000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function initStripe(clientSecret: string, publishableKey: string) {
  if (!clientSecret || !publishableKey) {
    error.value = t('payment.stripeMissingParams')
    return
  }
  try {
    const { loadStripe } = await import('@stripe/stripe-js')
    const stripe = await loadStripe(publishableKey)
    if (!stripe) { error.value = t('payment.stripeLoadFailed'); return }

    const returnUrl = window.location.origin + '/payment/result?order_id=' + orderId + '&status=success'

    if (method === 'alipay') {
      // Alipay: redirect this popup to Alipay payment page
      const { error: err } = await stripe.confirmAlipayPayment(clientSecret, { return_url: returnUrl })
      if (err) error.value = err.message || t('payment.result.failed')
    } else if (method === 'wechat_pay') {
      // WeChat: Stripe shows its built-in QR dialog, user scans, promise resolves
      hint.value = t('payment.stripePopup.loadingQr')
      const result = await (stripe as unknown as StripeWithWechatPay).confirmWechatPayPayment(clientSecret, {
        payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } },
      })
      if (result.error) {
        error.value = result.error.message || t('payment.result.failed')
      } else if (result.paymentIntent?.status === 'succeeded') {
        success.value = true
        setTimeout(closeWindow, 2000)
      } else {
        // Payment not completed (user closed QR dialog)
        startPolling()
      }
    }
  } catch (err: unknown) {
    error.value = extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed'))
  }
}

function startPolling() {
  pollTimer = setInterval(async () => {
    try {
      // SSR / Worker: document and localStorage are absent. The polling itself only runs
      // after user clicks pay in a real browser, but defensive guard keeps the static
      // route prerender-safe.
      let token = ''
      if (typeof document !== 'undefined') {
        token = document.cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1] || ''
      }
      if (!token && typeof window !== 'undefined') {
        try { token = window.localStorage.getItem('token') || '' } catch { /* private mode */ }
      }
      const res = await fetch('/api/v1/payment/orders/' + orderId, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      const status = data?.data?.status
      if (status === 'COMPLETED' || status === 'PAID') {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
        success.value = true
        setTimeout(closeWindow, 2000)
      }
    } catch { /* ignore */ }
  }, 3000)
}
</script>
