<template>
  <div class="flex flex-col gap-4 p-5">
    <!-- payment_enabled_types badge toggles -->
    <div class="flex flex-col gap-2">
      <label class="text-sm font-medium text-foreground">{{ t('admin.settings.payment.enabledPaymentTypes') }}</label>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="pt in allPaymentTypes"
          :key="pt.value"
          type="button"
          :variant="isEnabled(pt.value) ? 'default' : 'outline'"
          size="sm"
          :class="isEnabled(pt.value)
            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/20'
            : 'border-border bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground hover:bg-muted'"
          @click="toggleType(pt.value)"
        >
          {{ pt.label }}
        </Button>
      </div>
      <p class="text-xs text-muted-foreground leading-relaxed m-0">{{ t('admin.settings.payment.enabledPaymentTypesHint') }}</p>
    </div>

    <!-- Existing PaymentProviderList (reused as-is) -->
    <PaymentProviderList
      v-if="paymentEnabled"
      :providers="providers"
      :loading="loading"
      :can-create="enabledTypes.length > 0"
      :enabled-payment-types="enabledTypes"
      :all-payment-types="allPaymentTypes"
      :redirect-label="t('admin.settings.payment.easypayRedirect')"
      @refresh="load"
      @create="onCreateRequest"
      @edit="onEditRequest"
      @delete="onDeleteRequest"
      @toggle-field="onToggleField"
      @toggle-type="onToggleProviderType"
      @reorder="onReorder"
    />

    <!-- Provider dialog rendered via async component to keep bundle lean -->
    <component
      :is="ProviderDialog"
      v-if="dialog.open"
      ref="dialogRef"
      :show="dialog.open"
      :saving="saving"
      :editing="dialog.provider"
      :all-key-options="providerKeyOptions"
      :enabled-key-options="enabledProviderKeyOptions"
      :all-payment-types="allPaymentTypes"
      :redirect-label="t('admin.settings.payment.easypayRedirect')"
      @close="dialog.open = false"
      @save="onSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import PaymentProviderList from '@/components/payment/PaymentProviderList.vue'
import adminAPI from '@/api/admin'
import type { ProviderInstance } from '@/types/payment'
import type { TypeOption } from '@/components/payment/providerConfig'

const ProviderDialog = defineAsyncComponent(
  () => import('@/components/payment/PaymentProviderDialog.vue'),
)

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

// ── helpers ────────────────────────────────────────────────────────────────────
const activeSource = computed(() => props.formValues ?? props.settings)

// ─── payment_enabled_types (local mirror for badge toggles) ───────────────────

const allPaymentTypes: TypeOption[] = [
  { value: 'sub2apipay', label: 'sub2apipay' },
  { value: 'epay', label: 'epay' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'alipay', label: 'Alipay' },
  { value: 'wechat', label: 'WeChat Pay' },
]

function parseEnabledTypes(src: Record<string, unknown>): string[] {
  const raw = src['payment_enabled_types']
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw === 'string' && raw)
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

const localEnabledTypes = ref<string[]>(parseEnabledTypes(activeSource.value))

// Re-sync when parent resets
watch(
  () => activeSource.value['payment_enabled_types'],
  (incoming) => {
    const parsed = Array.isArray(incoming)
      ? (incoming as string[])
      : typeof incoming === 'string' && incoming
        ? incoming.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
    if (JSON.stringify(parsed) !== JSON.stringify(localEnabledTypes.value)) {
      localEnabledTypes.value = parsed
    }
  },
  { deep: true },
)

const enabledTypes = computed(() => localEnabledTypes.value)
const paymentEnabled = computed(() => !!activeSource.value['payment_enabled'])

function isEnabled(type: string): boolean {
  return localEnabledTypes.value.includes(type)
}

function toggleType(type: string) {
  const next = isEnabled(type)
    ? localEnabledTypes.value.filter((t) => t !== type)
    : [...localEnabledTypes.value, type]
  localEnabledTypes.value = next
  // Propagate to parent form — no server reload needed
  emit('update:field', 'payment_enabled_types', next)
}

// ─── Provider key options ─────────────────────────────────────────────────────

const providerKeyOptions = computed<TypeOption[]>(() => [
  { value: 'easypay', label: t('admin.settings.payment.providerEasypay') },
  { value: 'alipay', label: t('admin.settings.payment.providerAlipay') },
  { value: 'wxpay', label: t('admin.settings.payment.providerWxpay') },
  { value: 'stripe', label: t('admin.settings.payment.providerStripe') },
  { value: 'airwallex', label: t('admin.settings.payment.providerAirwallex') },
])

const enabledProviderKeyOptions = computed<TypeOption[]>(() => {
  return providerKeyOptions.value.filter((opt) => enabledTypes.value.includes(opt.value))
})

// ─── Provider list ────────────────────────────────────────────────────────────

const providers = ref<ProviderInstance[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogRef = ref<{ loadProvider: (p: ProviderInstance) => void; reset: (key: string) => void } | null>(null)

const dialog = ref<{
  open: boolean
  provider: ProviderInstance | null
}>({ open: false, provider: null })

async function load() {
  loading.value = true
  try {
    const res = await adminAPI.payment.getProviders()
    providers.value = (res.data ?? []) as ProviderInstance[]
  } finally {
    loading.value = false
  }
}

function onCreateRequest() {
  dialog.value = { open: true, provider: null }
}

function onEditRequest(p: ProviderInstance) {
  dialog.value = { open: true, provider: p }
}

async function onDeleteRequest(p: ProviderInstance) {
  if (!confirm(t('common.confirmDelete'))) return
  await adminAPI.payment.deleteProvider(p.id)
  await load()
}

async function onToggleField(
  p: ProviderInstance,
  field: 'enabled' | 'refund_enabled' | 'allow_user_refund',
) {
  const payload: Partial<ProviderInstance> = { [field]: !p[field] }
  if (field === 'refund_enabled' && !payload[field]) {
    payload['allow_user_refund'] = false
  }
  await adminAPI.payment.updateProvider(p.id, payload)
  await load()
}

async function onToggleProviderType(p: ProviderInstance, type: string) {
  const current = p.supported_types ?? []
  const updated = current.includes(type)
    ? current.filter((t) => t !== type)
    : [...current, type]
  await adminAPI.payment.updateProvider(p.id, { supported_types: updated })
  await load()
}

async function onReorder(updates: { id: number; sort_order: number }[]) {
  await Promise.all(
    updates.map((u) =>
      adminAPI.payment.updateProvider(u.id, { sort_order: u.sort_order }),
    ),
  )
  await load()
}

async function onSave(payload: Partial<ProviderInstance>) {
  saving.value = true
  try {
    if (dialog.value.provider) {
      await adminAPI.payment.updateProvider(dialog.value.provider.id, payload)
    } else {
      await adminAPI.payment.createProvider(payload)
    }
    dialog.value.open = false
    await load()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (paymentEnabled.value) load()
})
</script>
