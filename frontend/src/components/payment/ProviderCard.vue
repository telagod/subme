<template>
  <div
    :class="[
      'group relative rounded-md border transition-all',
      enabled ? 'border-border' : 'border-border bg-muted opacity-50',
    ]"
    :title="!enabled ? t('admin.settings.payment.typeDisabled') + ' — ' + t('admin.settings.payment.enableTypesFirst') : undefined"
  >
    <div :class="[
      'flex items-center justify-between px-4 py-2.5',
      !enabled && 'pointer-events-none',
    ]">
      <!-- Left: icon + name + key badge + type badges -->
      <div class="flex items-center gap-3">
        <div :class="[
          'rounded-md border border-border p-1.5',
          provider.enabled && enabled ? 'bg-secondary ' : 'bg-card',
        ]">
          <Icon
            name="server"
            size="sm"
            :class="provider.enabled && enabled ? 'text-primary-200' : 'text-muted-foreground'"
          />
        </div>
        <span class="text-sm font-medium text-foreground">{{ provider.name }}</span>
        <span class="text-xs text-muted-foreground">{{ keyLabel }}</span>
        <span v-if="provider.payment_mode" class="text-xs text-muted-foreground">· {{ modeLabel }}</span>
        <span v-if="enabled && availableTypes.length" class="text-xs text-muted-foreground/60">|</span>
        <div v-if="enabled" class="flex items-center gap-1">
          <Button
            v-for="pt in availableTypes"
            :key="pt.value"
            type="button"
            size="sm"
            :variant="isSelected(pt.value) ? 'default' : 'ghost'"
            class="h-auto rounded px-2 py-0.5 text-xs font-medium"
            @click="emit('toggleType', pt.value)"
          >{{ pt.label }}</Button>
        </div>
      </div>

      <!-- Right: toggles + actions -->
      <div class="flex items-center gap-4">
        <label class="flex flex-col items-center gap-0.5 cursor-pointer">
          <span class="text-xs text-muted-foreground whitespace-nowrap">{{ t('common.enabled') }}</span>
          <Switch :checked="provider.enabled" @update:checked="emit('toggleField', 'enabled')" />
        </label>
        <label class="flex flex-col items-center gap-0.5 cursor-pointer">
          <span class="text-xs text-muted-foreground whitespace-nowrap">{{ t('admin.settings.payment.refundEnabled') }}</span>
          <Switch :checked="provider.refund_enabled" @update:checked="emit('toggleField', 'refund_enabled')" />
        </label>
        <label v-if="provider.refund_enabled" class="flex flex-col items-center gap-0.5 cursor-pointer">
          <span class="text-xs text-muted-foreground whitespace-nowrap">{{ t('admin.settings.payment.allowUserRefund') }}</span>
          <Switch :checked="provider.allow_user_refund" @update:checked="emit('toggleField', 'allow_user_refund')" />
        </label>
        <div class="flex items-center gap-2 border-l border-border pl-3">
          <Button type="button" variant="ghost" size="sm" class="flex flex-col items-center gap-0.5 h-auto p-1.5 text-muted-foreground" @click="emit('edit')">
            <Icon name="edit" size="sm" />
            <span class="text-xs">{{ t('common.edit') }}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" class="flex flex-col items-center gap-0.5 h-auto p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" @click="emit('delete')">
            <Icon name="trash" size="sm" />
            <span class="text-xs">{{ t('common.delete') }}</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { ProviderInstance } from '@/types/payment'
import type { TypeOption } from './providerConfig'
import { PAYMENT_MODE_QRCODE, PAYMENT_MODE_POPUP, PAYMENT_MODE_REDIRECT } from './providerConfig'

const PROVIDER_KEY_LABELS: Record<string, string> = {
  easypay: 'admin.settings.payment.providerEasypay',
  alipay: 'admin.settings.payment.providerAlipay',
  wxpay: 'admin.settings.payment.providerWxpay',
  stripe: 'admin.settings.payment.providerStripe',
  airwallex: 'admin.settings.payment.providerAirwallex',
}

const props = defineProps<{
  provider: ProviderInstance
  enabled: boolean
  availableTypes: TypeOption[]
}>()

const emit = defineEmits<{
  toggleField: [field: 'enabled' | 'refund_enabled' | 'allow_user_refund']
  toggleType: [type: string]
  edit: []
  delete: []
}>()

const { t } = useI18n()

const keyLabel = computed(() => t(PROVIDER_KEY_LABELS[props.provider.provider_key] || props.provider.provider_key))

const modeLabel = computed(() => {
  if (props.provider.payment_mode === PAYMENT_MODE_QRCODE) return t('admin.settings.payment.modeQRCode')
  if (props.provider.payment_mode === PAYMENT_MODE_POPUP) return t('admin.settings.payment.modePopup')
  if (props.provider.payment_mode === PAYMENT_MODE_REDIRECT) return t('admin.settings.payment.modeRedirect')
  return ''
})

function isSelected(type: string): boolean {
  return props.provider.supported_types.includes(type)
}
</script>
