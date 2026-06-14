<template>
  <div class="flex flex-wrap items-center gap-3">
    <slot name="before"></slot>
    <Button @click="$emit('refresh')" :disabled="loading" variant="outline" size="icon">
      <Icon name="refresh" size="md" :class="[loading ? 'animate-spin' : '']" />
    </Button>
    <slot name="after"></slot>
    <slot name="beforeCreate"></slot>
    <Button @click="$emit('create')">{{ t('admin.accounts.createAccount') }}</Button>
    <slot name="afterCreate"></slot>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

defineProps(['loading'])
defineEmits(['refresh', 'create'])

const { t } = useI18n()
</script>
