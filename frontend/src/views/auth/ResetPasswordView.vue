<template>
  <AuthLayout>
    <div class="flex flex-col">
      <!-- 标题 -->
      <div class="mb-6 text-center">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">{{ t('auth.resetPasswordTitle') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('auth.resetPasswordHint') }}</p>
      </div>

      <!-- 无效链接 -->
      <div
        v-if="isInvalidLink"
        class="mb-2 flex flex-col items-center gap-3.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-7 text-center"
      >
        <div class="grid h-12 w-12 place-items-center rounded-full border border-amber-500/30 bg-amber-500/[0.12]">
          <Icon name="exclamationCircle" size="lg" class="text-amber-500" />
        </div>
        <div>
          <h3 class="mb-1 text-[15px] font-semibold text-foreground">{{ t('auth.invalidResetLink') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('auth.invalidResetLinkHint') }}</p>
        </div>
        <router-link
          to="/forgot-password"
          class="text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-primary"
        >
          {{ t('auth.requestNewResetLink') }}
        </router-link>
      </div>

      <!-- 成功状态 -->
      <div
        v-else-if="isSuccess"
        class="mb-2 flex flex-col items-center gap-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-5 py-7 text-center"
      >
        <div class="grid h-12 w-12 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.12]">
          <Icon name="checkCircle" size="lg" class="text-emerald-500" />
        </div>
        <div>
          <h3 class="mb-1 text-[15px] font-semibold text-foreground">{{ t('auth.passwordResetSuccess') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('auth.passwordResetSuccessHint') }}</p>
        </div>
        <Button as-child variant="outline" size="sm">
          <router-link to="/login" class="inline-flex items-center gap-2 no-underline">
            <Icon name="login" size="md" />
            {{ t('auth.signIn') }}
          </router-link>
        </Button>
      </div>

      <!-- 表单 -->
      <form v-else @submit.prevent="handleSubmit" class="flex flex-col">
        <!-- Email（只读） -->
        <div class="mb-[18px]">
          <Label for="email" class="mb-1.5 block">{{ t('auth.emailLabel') }}</Label>
          <div class="relative opacity-55 pointer-events-none">
            <Icon
              name="mail"
              size="md"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              :value="email"
              type="email"
              readonly
              disabled
              class="pl-10"
            />
          </div>
        </div>

        <!-- 新密码 -->
        <div class="mb-[18px]">
          <Label for="password" class="mb-1.5 block">{{ t('auth.newPassword') }}</Label>
          <div class="relative">
            <Icon
              name="lock"
              size="md"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="password"
              v-model="formData.password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="new-password"
              :disabled="isLoading"
              class="px-10"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.password }"
              :placeholder="t('auth.newPasswordPlaceholder')"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              @click="showPassword = !showPassword"
              class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            >
              <Icon v-if="showPassword" name="eyeOff" size="md" />
              <Icon v-else name="eye" size="md" />
            </Button>
          </div>
        </div>

        <!-- 确认密码 -->
        <div class="mb-[18px]">
          <Label for="confirmPassword" class="mb-1.5 block">{{ t('auth.confirmPassword') }}</Label>
          <div class="relative">
            <Icon
              name="lock"
              size="md"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="confirmPassword"
              v-model="formData.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              required
              autocomplete="new-password"
              :disabled="isLoading"
              class="px-10"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.confirmPassword }"
              :placeholder="t('auth.confirmPasswordPlaceholder')"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              @click="showConfirmPassword = !showConfirmPassword"
              class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
            >
              <Icon v-if="showConfirmPassword" name="eyeOff" size="md" />
              <Icon v-else name="eye" size="md" />
            </Button>
          </div>
        </div>

        <Button type="submit" :disabled="isLoading" class="w-full">
          <svg v-if="isLoading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <Icon v-else name="checkCircle" size="md" />
          {{ isLoading ? t('auth.resettingPassword') : t('auth.resetPassword') }}
        </Button>
      </form>
    </div>

    <template #footer>
      <p class="text-sm text-muted-foreground">
        {{ t('auth.rememberedPassword') }}
        <router-link to="/login" class="ml-1 text-foreground transition-colors hover:text-primary">
          {{ t('auth.signIn') }}
        </router-link>
      </p>
    </template>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AuthLayout } from '@/components/layout'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores'
import { resetPassword } from '@/api/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

// ==================== Router & Stores ====================

const route = useRoute()
const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const isSuccess = ref<boolean>(false)
const errorMessage = ref<string>('')
const showPassword = ref<boolean>(false)
const showConfirmPassword = ref<boolean>(false)

// URL parameters
const email = ref<string>('')
const token = ref<string>('')

const formData = reactive({
  password: '',
  confirmPassword: ''
})

const errors = reactive({
  password: '',
  confirmPassword: ''
})

const validationToastMessage = computed(
  () => errors.password || errors.confirmPassword || ''
)

watch(validationToastMessage, (value, previousValue) => {
  if (value && value !== previousValue) {
    appStore.showError(value)
  }
})

// Check if the reset link is valid (has email and token)
const isInvalidLink = computed(() => !email.value || !token.value)

// ==================== Lifecycle ====================

onMounted(() => {
  // Get email and token from URL query parameters
  email.value = (route.query.email as string) || ''
  token.value = (route.query.token as string) || ''

  if (!email.value || !token.value) {
    appStore.showError(t('auth.invalidResetLink'))
  }
})

// ==================== Validation ====================

function validateForm(): boolean {
  errors.password = ''
  errors.confirmPassword = ''

  let isValid = true

  // Password validation
  if (!formData.password) {
    errors.password = t('auth.passwordRequired')
    isValid = false
  } else if (formData.password.length < 6) {
    errors.password = t('auth.passwordMinLength')
    isValid = false
  }

  // Confirm password validation
  if (!formData.confirmPassword) {
    errors.confirmPassword = t('auth.confirmPasswordRequired')
    isValid = false
  } else if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = t('auth.passwordsDoNotMatch')
    isValid = false
  }

  return isValid
}

// ==================== Form Handlers ====================

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    await resetPassword({
      email: email.value,
      token: token.value,
      new_password: formData.password
    })

    isSuccess.value = true
    appStore.showSuccess(t('auth.passwordResetSuccess'))
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: { detail?: string; code?: string } } }

    // Check for invalid/expired token error
    if (err.response?.data?.code === 'INVALID_RESET_TOKEN') {
      errorMessage.value = t('auth.invalidOrExpiredToken')
    } else if (err.response?.data?.detail) {
      errorMessage.value = err.response.data.detail
    } else if (err.message) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = t('auth.resetPasswordFailed')
    }

    appStore.showError(errorMessage.value)
  } finally {
    isLoading.value = false
  }
}
</script>
