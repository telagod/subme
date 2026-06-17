<template>
  <Card v-if="!props.embedded">
    <CardHeader class="border-b border-border px-6 py-4">
      <CardTitle class="text-lg font-medium text-foreground">
        {{ t('profile.changePassword') }}
      </CardTitle>
    </CardHeader>
    <CardContent class="px-6 py-6">
      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div>
          <Label for="old_password" class="mb-2 block">
            {{ t('profile.currentPassword') }}
          </Label>
          <Input
            id="old_password"
            v-model="form.old_password"
            type="password"
            required
            autocomplete="current-password"
          />
        </div>

        <div>
          <Label for="new_password" class="mb-2 block">
            {{ t('profile.newPassword') }}
          </Label>
          <Input
            id="new_password"
            v-model="form.new_password"
            type="password"
            required
            autocomplete="new-password"
          />
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t('profile.passwordHint') }}
          </p>
        </div>

        <div>
          <Label for="confirm_password" class="mb-2 block">
            {{ t('profile.confirmNewPassword') }}
          </Label>
          <Input
            id="confirm_password"
            v-model="form.confirm_password"
            type="password"
            required
            autocomplete="new-password"
          />
        </div>

        <div class="flex justify-end pt-4">
          <Button type="submit" :disabled="loading">
            {{ loading ? t('profile.changingPassword') : t('profile.changePasswordButton') }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>

  <div v-else class="space-y-4">
    <form @submit.prevent="handleChangePassword" class="space-y-4">
      <div>
        <p class="text-sm font-semibold text-foreground">
          {{ t('profile.changePassword') }}
        </p>
      </div>
      <div>
        <Label for="old_password_embedded" class="mb-2 block">
          {{ t('profile.currentPassword') }}
        </Label>
        <Input
          id="old_password_embedded"
          v-model="form.old_password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>

      <div>
        <Label for="new_password_embedded" class="mb-2 block">
          {{ t('profile.newPassword') }}
        </Label>
        <Input
          id="new_password_embedded"
          v-model="form.new_password"
          type="password"
          required
          autocomplete="new-password"
        />
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('profile.passwordHint') }}
        </p>
      </div>

      <div>
        <Label for="confirm_password_embedded" class="mb-2 block">
          {{ t('profile.confirmNewPassword') }}
        </Label>
        <Input
          id="confirm_password_embedded"
          v-model="form.confirm_password"
          type="password"
          required
          autocomplete="new-password"
        />
      </div>

      <div class="flex justify-end pt-4">
        <Button type="submit" :disabled="loading">
          {{ loading ? t('profile.changingPassword') : t('profile.changePasswordButton') }}
        </Button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { userAPI } from '@/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const appStore = useAppStore()
const props = withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

const loading = ref(false)
const form = ref({
  old_password: '',
  new_password: '',
  confirm_password: ''
})

const handleChangePassword = async () => {
  if (form.value.new_password !== form.value.confirm_password) {
    appStore.showError(t('profile.passwordsNotMatch'))
    return
  }

  if (form.value.new_password.length < 8) {
    appStore.showError(t('profile.passwordTooShort'))
    return
  }

  loading.value = true
  try {
    await userAPI.changePassword(form.value.old_password, form.value.new_password)
    form.value = { old_password: '', new_password: '', confirm_password: '' }
    appStore.showSuccess(t('profile.passwordChangeSuccess'))
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('profile.passwordChangeFailed'))
  } finally {
    loading.value = false
  }
}
</script>
