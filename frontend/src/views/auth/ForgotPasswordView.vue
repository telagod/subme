<template>
  <AuthLayout>
    <div class="flex flex-col">
      <!-- 标题 -->
      <div class="mb-6 text-center">
        <h2 class="text-lg font-semibold tracking-tight text-foreground">{{ t('auth.forgotPasswordTitle') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('auth.forgotPasswordHint') }}</p>
      </div>

      <!-- 成功状态 -->
      <div
        v-if="isSubmitted"
        class="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-5 py-7 text-center"
      >
        <div
          class="grid h-12 w-12 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.12]"
        >
          <Icon name="checkCircle" size="lg" class="text-emerald-500" />
        </div>
        <div>
          <h3 class="mb-1.5 text-sm font-semibold text-foreground">{{ t('auth.resetEmailSent') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('auth.resetEmailSentHint') }}</p>
        </div>
        <router-link
          to="/login"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-primary focus-visible:rounded focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon name="arrowLeft" size="sm" />
          {{ t('auth.backToLogin') }}
        </router-link>
      </div>

      <!-- 表单状态 -->
      <form v-else @submit.prevent="handleSubmit" class="flex flex-col">
        <div class="mb-4">
          <Label for="email" class="mb-2 block">{{ t('auth.emailLabel') }}</Label>
          <div class="relative">
            <Icon
              name="mail"
              size="md"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              v-model="formData.email"
              type="email"
              required
              autofocus
              autocomplete="email"
              :disabled="isLoading"
              class="pl-10"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.email }"
              :placeholder="t('auth.emailPlaceholder')"
            />
          </div>
        </div>

        <div v-if="turnstileEnabled && turnstileSiteKey" class="mb-4">
          <TurnstileWidget
            ref="turnstileRef"
            :site-key="turnstileSiteKey"
            @verify="onTurnstileVerify"
            @expire="onTurnstileExpire"
            @error="onTurnstileError"
          />
        </div>

        <Button
          type="submit"
          :disabled="isLoading || (turnstileEnabled && !turnstileToken)"
          class="w-full"
        >
          <svg v-if="isLoading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <Icon v-else name="mail" size="md" />
          {{ isLoading ? t('auth.sendingResetLink') : t('auth.sendResetLink') }}
        </Button>
      </form>
    </div>

    <template #footer>
      <p class="text-sm text-muted-foreground">
        {{ t('auth.rememberedPassword') }}
        <router-link to="/login" class="ml-1 text-foreground transition-colors hover:text-primary">{{ t('auth.signIn') }}</router-link>
      </p>
    </template>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthLayout } from '@/components/layout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import Icon from '@/components/icons/Icon.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { useAppStore } from '@/stores'
import { getPublicSettings, forgotPassword } from '@/api/auth'

const { t } = useI18n()

// ==================== Stores ====================

const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const isSubmitted = ref<boolean>(false)
const errorMessage = ref<string>('')

// Public settings
const turnstileEnabled = ref<boolean>(false)
const turnstileSiteKey = ref<string>('')

// Turnstile
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const turnstileToken = ref<string>('')

const formData = reactive({
  email: ''
})

const errors = reactive({
  email: '',
  turnstile: ''
})

const validationToastMessage = computed(() => errors.email || errors.turnstile || '')

watch(validationToastMessage, (value, previousValue) => {
  if (value && value !== previousValue) {
    appStore.showError(value)
  }
})

// ==================== Lifecycle ====================

onMounted(async () => {
  try {
    const settings = await getPublicSettings()
    turnstileEnabled.value = settings.turnstile_enabled
    turnstileSiteKey.value = settings.turnstile_site_key || ''
  } catch (error) {
    console.error('Failed to load public settings:', error)
  }
})

// ==================== Turnstile Handlers ====================

function onTurnstileVerify(token: string): void {
  turnstileToken.value = token
  errors.turnstile = ''
}

function onTurnstileExpire(): void {
  turnstileToken.value = ''
  errors.turnstile = t('auth.turnstileExpired')
}

function onTurnstileError(): void {
  turnstileToken.value = ''
  errors.turnstile = t('auth.turnstileFailed')
}

// ==================== Validation ====================

function validateForm(): boolean {
  errors.email = ''
  errors.turnstile = ''

  let isValid = true

  // Email validation
  if (!formData.email.trim()) {
    errors.email = t('auth.emailRequired')
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = t('auth.invalidEmail')
    isValid = false
  }

  // Turnstile validation
  if (turnstileEnabled.value && !turnstileToken.value) {
    errors.turnstile = t('auth.completeVerification')
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
    await forgotPassword({
      email: formData.email,
      turnstile_token: turnstileEnabled.value ? turnstileToken.value : undefined
    })

    isSubmitted.value = true
    appStore.showSuccess(t('auth.resetEmailSent'))
  } catch (error: unknown) {
    // Reset Turnstile on error
    if (turnstileRef.value) {
      turnstileRef.value.reset()
      turnstileToken.value = ''
    }

    const err = error as { message?: string; response?: { data?: { detail?: string } } }

    if (err.response?.data?.detail) {
      errorMessage.value = err.response.data.detail
    } else if (err.message) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = t('auth.sendResetLinkFailed')
    }

    appStore.showError(errorMessage.value)
  } finally {
    isLoading.value = false
  }
}
</script>
