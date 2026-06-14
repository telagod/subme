<template>
  <Sheet :open="open" @update:open="(v) => { if (!v) $emit('close') }">
    <SheetContent side="right" class="w-[400px] max-w-full p-0 flex flex-col" :aria-label="isEdit ? t('admin.userFormDrawer.titleEdit') : t('admin.userFormDrawer.titleCreate')">
      <!-- 头部 -->
      <SheetHeader class="px-6 py-4 border-b border-border flex-shrink-0">
        <SheetTitle class="text-[15px] font-bold text-foreground">
          {{ isEdit ? t('admin.userFormDrawer.titleEdit') : t('admin.userFormDrawer.titleCreate') }}
        </SheetTitle>
      </SheetHeader>

      <!-- 表单主体 -->
      <ScrollArea class="flex-1">
        <form class="flex flex-col gap-4 p-6" @submit.prevent="handleSubmit">
          <!-- 邮箱 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.emailLabel') }}
              <span class="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              v-model="form.email"
              type="email"
              required
              placeholder="user@example.com"
              autocomplete="off"
            />
          </div>

          <!-- 密码 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ isEdit ? t('admin.userFormDrawer.passwordEditLabel') : t('admin.userFormDrawer.passwordLabel') }}
            </Label>
            <div class="flex gap-2">
              <Input
                v-model="form.password"
                type="text"
                :required="!isEdit"
                :placeholder="t('admin.userFormDrawer.passwordPlaceholder')"
                autocomplete="new-password"
                class="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                :title="t('admin.userFormDrawer.passwordGenTitle')"
                @click="generatePassword"
                class="shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M11.5 6.5A5 5 0 1 1 6.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M9 1.5v3h-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </Button>
            </div>
          </div>

          <!-- 用户名 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.usernameLabel') }}
            </Label>
            <Input
              v-model="form.username"
              type="text"
              :placeholder="t('admin.userFormDrawer.usernamePlaceholder')"
              autocomplete="off"
            />
          </div>

          <!-- 初始余额（仅创建时） -->
          <div v-if="!isEdit" class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.balanceLabel') }}
            </Label>
            <Input
              v-model="form.balance"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>

          <!-- 并发上限 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.concurrencyLabel') }}
            </Label>
            <Input
              v-model.number="form.concurrency"
              type="number"
              min="1"
            />
          </div>

          <!-- RPM 限速 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.rpmLabel') }}
              <span class="ml-1 font-normal normal-case text-muted-foreground/70">{{ t('admin.userFormDrawer.rpmHint') }}</span>
            </Label>
            <Input
              v-model.number="form.rpm_limit"
              type="number"
              min="0"
              step="1"
            />
          </div>

          <!-- 备注（仅编辑时） -->
          <div v-if="isEdit" class="flex flex-col gap-1.5">
            <Label class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ t('admin.userFormDrawer.notesLabel') }}
            </Label>
            <Textarea
              v-model="form.notes"
              rows="3"
              :placeholder="t('admin.userFormDrawer.notesPlaceholder')"
              class="resize-y min-h-[72px]"
            />
          </div>

          <!-- 错误提示 -->
          <div v-if="errorMsg" class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive">
            {{ errorMsg }}
          </div>

          <!-- 底部操作 -->
          <div class="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" @click="$emit('close')">
              {{ t('admin.userFormDrawer.cancelBtn') }}
            </Button>
            <Button type="submit" :disabled="submitting">
              {{ submitting ? (isEdit ? t('admin.userFormDrawer.saving') : t('admin.userFormDrawer.creating')) : (isEdit ? t('admin.userFormDrawer.saveChanges') : t('admin.userFormDrawer.createUser')) }}
            </Button>
          </div>
        </form>
      </ScrollArea>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { AdminUser } from '@/types'
import { useAppStore } from '@/stores/app'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  user: AdminUser | null
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const appStore = useAppStore()
const submitting = ref(false)
const errorMsg = ref('')
const isEdit = computed(() => !!props.user)

const form = reactive({
  email: '',
  password: '',
  username: '',
  balance: '',
  concurrency: 1,
  rpm_limit: 0,
  notes: '',
})

// 同步 user prop → form
watch(() => props.user, (u) => {
  if (u) {
    form.email = u.email
    form.password = ''
    form.username = u.username || ''
    form.concurrency = u.concurrency
    form.rpm_limit = u.rpm_limit ?? 0
    form.notes = u.notes || ''
    form.balance = ''
  } else {
    form.email = ''
    form.password = ''
    form.username = ''
    form.concurrency = 1
    form.rpm_limit = 0
    form.notes = ''
    form.balance = ''
  }
  errorMsg.value = ''
}, { immediate: true })

// 每次面板打开时清错误
watch(() => props.open, (v) => {
  if (v) errorMsg.value = ''
})

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
  let p = ''
  for (let i = 0; i < 16; i++) p += chars.charAt(Math.floor(Math.random() * chars.length))
  form.password = p
}

async function handleSubmit() {
  errorMsg.value = ''
  if (!form.email.trim()) { errorMsg.value = t('admin.userFormDrawer.validEmailRequired'); return }
  if (!isEdit.value && !form.password.trim()) { errorMsg.value = t('admin.userFormDrawer.validPasswordRequired'); return }
  if (form.concurrency < 1) { errorMsg.value = t('admin.userFormDrawer.validConcurrencyMin'); return }

  submitting.value = true
  try {
    if (isEdit.value && props.user) {
      const data: Record<string, unknown> = {
        email: form.email,
        username: form.username,
        notes: form.notes,
        concurrency: form.concurrency,
        rpm_limit: form.rpm_limit,
      }
      if (form.password.trim()) data.password = form.password.trim()
      await adminAPI.users.update(props.user.id, data as any)
      appStore.showSuccess(t('admin.userFormDrawer.userUpdated'))
    } else {
      const balanceStr = String(form.balance).trim()
      const payload: Parameters<typeof adminAPI.users.create>[0] = {
        email: form.email,
        password: form.password,
        username: form.username || undefined,
        concurrency: form.concurrency,
        rpm_limit: form.rpm_limit,
      }
      if (balanceStr !== '') payload.balance = Number(balanceStr)
      await adminAPI.users.create(payload)
      appStore.showSuccess(t('admin.userFormDrawer.userCreated'))
    }
    emit('success')
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.detail || e?.message || t('admin.userFormDrawer.operationFailed')
  } finally {
    submitting.value = false
  }
}
</script>
