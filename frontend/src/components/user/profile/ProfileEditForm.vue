<template>
  <Card v-if="!props.embedded">
    <CardHeader class="border-b border-border py-4">
      <h2 class="text-lg font-medium text-foreground">
        {{ t('profile.editProfile') }}
      </h2>
    </CardHeader>
    <CardContent class="py-6">
      <form @submit.prevent="handleUpdateProfile" class="space-y-4">
        <div>
          <Label for="username" class="mb-1.5 block">
            {{ t('profile.username') }}
          </Label>
          <Input
            id="username"
            v-model="username"
            type="text"
            :placeholder="t('profile.enterUsername')"
          />
        </div>

        <div class="flex justify-end pt-4">
          <Button type="submit" :disabled="loading">
            {{ loading ? t('profile.updating') : t('profile.updateProfile') }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>

  <div v-else class="space-y-4">
    <form @submit.prevent="handleUpdateProfile" class="space-y-4">
      <div>
        <p class="text-sm font-semibold text-foreground">
          {{ t('profile.editProfile') }}
        </p>
      </div>
      <div>
        <Label for="username" class="mb-1.5 block">
          {{ t('profile.username') }}
        </Label>
        <Input
          id="username"
          v-model="username"
          type="text"
          :placeholder="t('profile.enterUsername')"
        />
      </div>

      <div class="flex justify-end pt-4">
        <Button type="submit" :disabled="loading">
          {{ loading ? t('profile.updating') : t('profile.updateProfile') }}
        </Button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { userAPI } from '@/api'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'

const props = withDefaults(defineProps<{
  initialUsername: string
  embedded?: boolean
}>(), {
  embedded: false,
})

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()

const username = ref(props.initialUsername)
const loading = ref(false)

watch(() => props.initialUsername, (val) => {
  username.value = val
})

const handleUpdateProfile = async () => {
  if (!username.value.trim()) {
    appStore.showError(t('profile.usernameRequired'))
    return
  }

  loading.value = true
  try {
    const updatedUser = await userAPI.updateProfile({
      username: username.value
    })
    authStore.user = updatedUser
    appStore.showSuccess(t('profile.updateSuccess'))
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('profile.updateFailed'))
  } finally {
    loading.value = false
  }
}
</script>
