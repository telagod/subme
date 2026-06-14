<template>
  <BaseDialog
    :show="show"
    :title="t('admin.users.createUser')"
    width="normal"
    @close="$emit('close')"
  >
    <form id="create-user-form" @submit.prevent="submit" class="space-y-5">
      <div>
        <Label class="mb-2 block">{{ t('admin.users.email') }}</Label>
        <Input v-model="form.email" type="email" required :placeholder="t('admin.users.enterEmail')" />
      </div>
      <div>
        <Label class="mb-2 block">{{ t('admin.users.password') }}</Label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input v-model="form.password" type="text" required class="pr-10" :placeholder="t('admin.users.enterPassword')" />
          </div>
          <Button type="button" variant="outline" size="icon" @click="generateRandomPassword">
            <Icon name="refresh" size="md" />
          </Button>
        </div>
      </div>
      <div>
        <Label class="mb-2 block">{{ t('admin.users.username') }}</Label>
        <Input v-model="form.username" type="text" :placeholder="t('admin.users.enterUsername')" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label class="mb-2 block">{{ t('admin.users.columns.balance') }}</Label>
          <Input v-model="form.balance" type="number" step="any" />
        </div>
        <div>
          <Label class="mb-2 block">{{ t('admin.users.columns.concurrency') }}</Label>
          <Input v-model.number="form.concurrency" type="number" />
        </div>
      </div>
      <div>
        <Label class="mb-2 block">{{ t('admin.users.form.rpmLimit') }}</Label>
        <Input
          v-model.number="form.rpm_limit"
          type="number"
          min="0"
          step="1"
          :placeholder="t('admin.users.form.rpmLimitPlaceholder')"
        />
        <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.users.form.rpmLimitHint') }}</p>
      </div>
    </form>
    <template #footer>
      <div class="flex justify-end gap-3">
        <Button @click="$emit('close')" type="button" variant="outline">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="create-user-form" :disabled="loading">
          {{ loading ? t('admin.users.creating') : t('common.create') }}
        </Button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'; import { adminAPI } from '@/api/admin'
import { useForm } from '@/composables/useForm'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['close', 'success']); const { t } = useI18n()

const form = reactive({ email: '', password: '', username: '', notes: '', balance: '', concurrency: 1, rpm_limit: 0 })

const { loading, submit } = useForm({
  form,
  submitFn: async (data) => {
    const { balance: rawBalance, ...rest } = data
    const balance = String(rawBalance).trim()
    const payload: typeof rest & { balance?: number } = { ...rest }
    if (balance !== '') {
      payload.balance = Number(balance)
    }
    await adminAPI.users.create(payload)
    emit('success'); emit('close')
  },
  successMsg: t('admin.users.userCreated')
})

watch(() => props.show, (v) => { if(v) Object.assign(form, { email: '', password: '', username: '', notes: '', balance: '', concurrency: 1, rpm_limit: 0 }) })

const generateRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
  let p = ''; for (let i = 0; i < 16; i++) p += chars.charAt(Math.floor(Math.random() * chars.length))
  form.password = p
}
</script>
