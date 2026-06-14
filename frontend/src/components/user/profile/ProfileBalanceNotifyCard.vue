<template>
  <Card>
    <CardHeader class="border-b border-border px-6 py-4">
      <CardTitle class="text-lg font-medium text-foreground">
        {{ t('profile.balanceNotify.title') }}
      </CardTitle>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('profile.balanceNotify.description') }}
      </p>
    </CardHeader>
    <CardContent class="px-6 py-6 space-y-6">
      <!-- Enable toggle -->
      <div class="flex items-center justify-between">
        <Label class="mb-0">{{ t('profile.balanceNotify.enabled') }}</Label>
        <Switch v-model:checked="notifyEnabled" @update:checked="handleToggle" />
      </div>

      <template v-if="notifyEnabled">
        <!-- Custom threshold with save button -->
        <div>
          <Label>
            {{ t('profile.balanceNotify.threshold') }}
            <span class="text-xs text-muted-foreground ml-2">{{ t('profile.balanceNotify.thresholdHint') }}</span>
          </Label>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">$</span>
            <Input
              v-model.number="customThreshold"
              type="number"
              min="0"
              step="0.01"
              class="flex-1"
              :placeholder="systemDefaultThreshold > 0 ? `${t('profile.balanceNotify.systemDefault')} $${systemDefaultThreshold}` : t('profile.balanceNotify.thresholdPlaceholder')"
            />
            <Button
              @click="handleThresholdUpdate"
              :disabled="savingThreshold"
              size="sm"
              class="whitespace-nowrap"
            >
              {{ savingThreshold ? t('common.saving') : t('common.save') }}
            </Button>
          </div>
        </div>

        <!-- Email list with toggles -->
        <div>
          <Label>{{ t('profile.balanceNotify.extraEmails') }}</Label>
          <p class="mb-2 text-xs text-amber-400">{{ t('profile.balanceNotify.extraEmailsHint') }}</p>

          <!-- Saved email entries -->
          <div v-if="emailEntries.length > 0" class="space-y-2 mb-3">
            <div v-for="(entry, idx) in emailEntries" :key="idx"
              class="flex items-center justify-between px-3 py-2 bg-muted rounded-md">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <Switch
                  :checked="!entry.disabled"
                  @update:checked="() => handleEmailToggle(entry)"
                  class="shrink-0"
                />
                <span class="text-sm text-foreground/85 truncate">{{ entry.email }}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <template v-if="!entry.verified">
                  <!-- Inline verify flow for saved unverified emails -->
                  <template v-if="verifyingEmail === entry.email">
                    <Input
                      v-model="verifyCode"
                      type="text"
                      maxlength="6"
                      class="w-20 h-7 px-2 py-1 text-xs"
                      :placeholder="t('profile.balanceNotify.codePlaceholder')"
                    />
                    <Button variant="ghost" size="sm" @click="verifySavedEmail(entry.email)" :disabled="!verifyCode || verifyCode.length !== 6 || verifyingSaved" class="h-auto px-1 py-0 text-xs text-primary hover:text-primary/80">
                      {{ t('profile.balanceNotify.verify') }}
                    </Button>
                    <span v-if="verifyCountdown > 0" class="text-xs text-muted-foreground">{{ verifyCountdown }}s</span>
                    <Button v-else variant="ghost" size="sm" @click="sendCodeForSaved(entry.email)" :disabled="sendingSavedCode" class="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground">
                      {{ t('profile.balanceNotify.resend') }}
                    </Button>
                    <Button variant="ghost" size="sm" @click="verifyingEmail = ''" class="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground">
                      {{ t('common.cancel') }}
                    </Button>
                  </template>
                  <template v-else>
                    <Button variant="ghost" size="sm" @click="sendCodeForSaved(entry.email)" :disabled="sendingSavedCode" class="h-auto px-1 py-0 text-xs text-primary hover:text-primary/80">
                      {{ t('profile.balanceNotify.verify') }}
                    </Button>
                    <span class="text-xs text-amber-400">{{ t('profile.balanceNotify.unverified') }}</span>
                  </template>
                </template>
                <span v-else class="text-xs text-emerald-400">{{ t('profile.balanceNotify.verified') }}</span>
                <Button variant="ghost" size="sm" @click="handleRemoveEmail(entry.email)" class="h-auto px-1 py-0 text-xs text-destructive hover:text-destructive/80">
                  {{ t('profile.balanceNotify.removeEmail') }}
                </Button>
              </div>
            </div>
          </div>

          <!-- Pending (unverified) emails in verification flow -->
          <div v-if="pendingEmails.length > 0" class="space-y-2 mb-3">
            <div v-for="(pe, idx) in pendingEmails" :key="pe.email"
              class="flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-md border border-amber-500/30">
              <span class="flex-1 text-sm text-foreground/85">{{ pe.email }}</span>
              <div v-if="!pe.codeSent" class="flex items-center gap-1">
                <Button variant="ghost" size="sm" @click="sendCodeFor(idx)" :disabled="pe.sending" class="h-auto px-1 py-0 text-xs text-primary hover:text-primary/80">
                  {{ t('profile.balanceNotify.sendCode') }}
                </Button>
                <Button variant="ghost" size="sm" @click="pendingEmails.splice(idx, 1)" class="h-auto ml-1 px-1 py-0 text-xs text-destructive hover:text-destructive/80">
                  {{ t('profile.balanceNotify.removeEmail') }}
                </Button>
              </div>
              <div v-else class="flex items-center gap-1">
                <Input
                  v-model="pe.code"
                  type="text"
                  maxlength="6"
                  class="w-20 h-7 px-2 py-1 text-xs"
                  :placeholder="t('profile.balanceNotify.codePlaceholder')"
                />
                <Button variant="ghost" size="sm" @click="verifyPending(idx)" :disabled="!pe.code || pe.code.length !== 6 || pe.verifying" class="h-auto px-1 py-0 text-xs text-primary hover:text-primary/80">
                  {{ t('profile.balanceNotify.verify') }}
                </Button>
                <span v-if="pe.countdown > 0" class="text-xs text-muted-foreground">{{ pe.countdown }}s</span>
                <Button v-else variant="ghost" size="sm" @click="sendCodeFor(idx)" :disabled="pe.sending" class="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-foreground">
                  {{ t('profile.balanceNotify.resend') }}
                </Button>
              </div>
            </div>
          </div>

          <!-- Add new email input (hidden when at limit) -->
          <div v-if="canAddMore" class="flex gap-2">
            <Input
              v-model="newEmail"
              type="email"
              class="flex-1"
              :placeholder="t('profile.balanceNotify.emailPlaceholder')"
              @keyup.enter="addPendingEmail"
            />
            <Button
              @click="addPendingEmail"
              :disabled="!newEmail"
              variant="secondary"
              class="whitespace-nowrap"
            >
              {{ t('common.add') }}
            </Button>
          </div>
          <p v-else class="text-xs text-muted-foreground">
            {{ t('profile.balanceNotify.maxEmailsReached') }}
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { userAPI } from '@/api'
import { extractApiErrorMessage } from '@/utils/apiError'
import type { NotifyEmailEntry } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const maxTotalEmails = 3

interface PendingEmail {
  email: string
  codeSent: boolean
  code: string
  sending: boolean
  verifying: boolean
  countdown: number
  timer: ReturnType<typeof setInterval> | null
}

const props = defineProps<{
  enabled: boolean
  threshold: number | null
  extraEmails: NotifyEmailEntry[]
  systemDefaultThreshold: number
  userEmail: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()

const notifyEnabled = ref(props.enabled)
const customThreshold = ref<number | null>(props.threshold)
const emailEntries = ref<NotifyEmailEntry[]>([...props.extraEmails])
const pendingEmails = ref<PendingEmail[]>([])
const newEmail = ref('')
const savingThreshold = ref(false)

// State for verifying saved unverified emails
const verifyingEmail = ref('')
const verifyCode = ref('')
const verifyingSaved = ref(false)
const sendingSavedCode = ref(false)
const verifyCountdown = ref(0)
let verifyTimer: ReturnType<typeof setInterval> | null = null

const canAddMore = computed(() => {
  return emailEntries.value.length + pendingEmails.value.length < maxTotalEmails
})

watch(() => props.enabled, (val) => { notifyEnabled.value = val })
watch(() => props.threshold, (val) => { customThreshold.value = val })
watch(() => props.extraEmails, (val) => { emailEntries.value = [...val] })

// When list is empty on mount, pre-fill the add input with user's email
onMounted(() => {
  if (emailEntries.value.length === 0 && props.userEmail) {
    newEmail.value = props.userEmail
  }
})

onUnmounted(() => {
  for (const pe of pendingEmails.value) {
    if (pe.timer) clearInterval(pe.timer)
  }
  if (verifyTimer) clearInterval(verifyTimer)
})

const handleToggle = async () => {
  try {
    const updated = await userAPI.updateProfile({ balance_notify_enabled: notifyEnabled.value })
    authStore.user = updated
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
    notifyEnabled.value = !notifyEnabled.value
  }
}

const handleThresholdUpdate = async () => {
  savingThreshold.value = true
  try {
    const threshold = customThreshold.value && customThreshold.value > 0 ? customThreshold.value : 0
    const updated = await userAPI.updateProfile({ balance_notify_threshold: threshold })
    authStore.user = updated
    appStore.showSuccess(t('common.saved'))
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    savingThreshold.value = false
  }
}

async function handleEmailToggle(entry: NotifyEmailEntry) {
  const newDisabled = !entry.disabled
  try {
    const updated = await userAPI.toggleNotifyEmail(entry.email, newDisabled)
    authStore.user = updated
    emailEntries.value = [...updated.balance_notify_extra_emails]
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  }
}

function addPendingEmail() {
  const email = newEmail.value.trim()
  if (!email) return
  // Check duplicates
  const isDuplicate = emailEntries.value.some(e => e.email.toLowerCase() === email.toLowerCase())
    || pendingEmails.value.some(p => p.email.toLowerCase() === email.toLowerCase())
  if (isDuplicate) {
    appStore.showError(t('profile.balanceNotify.emailDuplicate'))
    return
  }
  pendingEmails.value.push({ email, codeSent: false, code: '', sending: false, verifying: false, countdown: 0, timer: null })
  newEmail.value = ''
}

async function sendCodeFor(idx: number) {
  const pe = pendingEmails.value[idx]
  if (!pe) return
  pe.sending = true
  try {
    await userAPI.sendNotifyEmailCode(pe.email)
    pe.codeSent = true
    pe.countdown = 60
    pe.timer = setInterval(() => {
      pe.countdown--
      if (pe.countdown <= 0 && pe.timer) {
        clearInterval(pe.timer)
        pe.timer = null
      }
    }, 1000)
    appStore.showSuccess(t('profile.balanceNotify.codeSent'))
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    pe.sending = false
  }
}

async function verifyPending(idx: number) {
  const pe = pendingEmails.value[idx]
  if (!pe || !pe.code || pe.code.length !== 6) return
  pe.verifying = true
  try {
    await userAPI.verifyNotifyEmail(pe.email, pe.code)
    if (pe.timer) clearInterval(pe.timer)
    pendingEmails.value.splice(idx, 1)
    appStore.showSuccess(t('profile.balanceNotify.verifySuccess'))
    const updated = await userAPI.getProfile()
    authStore.user = updated
    emailEntries.value = [...updated.balance_notify_extra_emails]
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    pe.verifying = false
  }
}

const handleRemoveEmail = async (email: string) => {
  try {
    await userAPI.removeNotifyEmail(email)
    appStore.showSuccess(t('profile.balanceNotify.removeSuccess'))
    const updated = await userAPI.getProfile()
    authStore.user = updated
    emailEntries.value = [...updated.balance_notify_extra_emails]
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  }
}

// Verify saved unverified emails
async function sendCodeForSaved(email: string) {
  sendingSavedCode.value = true
  try {
    await userAPI.sendNotifyEmailCode(email)
    verifyingEmail.value = email
    verifyCode.value = ''
    verifyCountdown.value = 60
    if (verifyTimer) clearInterval(verifyTimer)
    verifyTimer = setInterval(() => {
      verifyCountdown.value--
      if (verifyCountdown.value <= 0 && verifyTimer) {
        clearInterval(verifyTimer)
        verifyTimer = null
      }
    }, 1000)
    appStore.showSuccess(t('profile.balanceNotify.codeSent'))
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    sendingSavedCode.value = false
  }
}

async function verifySavedEmail(email: string) {
  if (!verifyCode.value || verifyCode.value.length !== 6) return
  verifyingSaved.value = true
  try {
    await userAPI.verifyNotifyEmail(email, verifyCode.value)
    verifyingEmail.value = ''
    verifyCode.value = ''
    if (verifyTimer) { clearInterval(verifyTimer); verifyTimer = null }
    appStore.showSuccess(t('profile.balanceNotify.verifySuccess'))
    const updated = await userAPI.getProfile()
    authStore.user = updated
    emailEntries.value = [...updated.balance_notify_extra_emails]
  } catch (err: unknown) {
    appStore.showError(extractApiErrorMessage(err, t('common.error')))
  } finally {
    verifyingSaved.value = false
  }
}
</script>
