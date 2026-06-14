<template>
  <!-- ── 分配订阅 Dialog ── -->
  <Dialog :open="showAssign" @update:open="(v) => { if (!v) emit('close-assign') }">
    <DialogContent class="w-full max-w-[420px]" :aria-label="t('admin.subscriptionsQuench.assignTitle')">
      <DialogHeader>
        <DialogTitle>{{ t('admin.subscriptionsQuench.assignTitle') }}</DialogTitle>
      </DialogHeader>

      <!-- User search -->
      <div class="mb-4">
        <Label class="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {{ t('admin.subscriptionsQuench.formUser') }}
        </Label>
        <div class="relative">
          <Input
            v-model="userKeyword"
            :placeholder="t('admin.subscriptionsQuench.searchUserPlaceholder')"
            @input="debounceUserSearch"
            @focus="showUserDd = true"
            class="pr-8"
          />
          <Button
            v-if="selectedUser"
            type="button"
            variant="ghost"
            size="icon"
            class="absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            @click="clearUser"
          >✕</Button>
          <div
            v-if="showUserDd && (userResults.length || userKeyword)"
            class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
          >
            <div v-if="userLoading" class="px-3 py-2.5 text-xs text-muted-foreground">{{ t('common.loading') }}</div>
            <div v-else-if="!userResults.length && userKeyword" class="px-3 py-2.5 text-xs text-muted-foreground">{{ t('common.noOptionsFound') }}</div>
            <Button
              v-for="u in userResults"
              :key="u.id"
              type="button"
              variant="ghost"
              class="flex h-auto w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-sm text-foreground hover:bg-accent"
              @click="selectUser(u)"
            >
              <span>{{ u.email }}</span>
              <span class="text-xs text-muted-foreground">#{{ u.id }}</span>
            </Button>
          </div>
        </div>
      </div>

      <!-- Group select -->
      <div class="mb-4">
        <Label class="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {{ t('admin.subscriptionsQuench.formGroup') }}
        </Label>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="g in subGroups"
            :key="g.id"
            type="button"
            variant="outline"
            class="h-auto rounded-lg px-2.5 py-1 text-xs font-medium"
            :class="assignForm.group_id === g.id
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'"
            @click="assignForm.group_id = g.id"
          >{{ g.name }}</Button>
          <span v-if="!subGroups.length" class="text-xs text-muted-foreground">{{ t('admin.subscriptionsQuench.noGroups') }}</span>
        </div>
      </div>

      <!-- Validity days -->
      <div class="mb-4">
        <Label class="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {{ t('admin.subscriptionsQuench.formDays') }}
        </Label>
        <Input v-model.number="assignForm.validity_days" type="number" min="1" />
        <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.subscriptionsQuench.validityHint') }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('close-assign')">{{ t('common.cancel') }}</Button>
        <Button :disabled="submitting" @click="doAssign">
          {{ submitting ? t('admin.subscriptionsQuench.assigning') : t('admin.subscriptionsQuench.assign') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ── 续期 / 调整 Dialog ── -->
  <Dialog :open="showExtend && !!extendingSub" @update:open="(v) => { if (!v) emit('close-extend') }">
    <DialogContent class="w-full max-w-[420px]" :aria-label="t('admin.subscriptionsQuench.extendTitle')">
      <DialogHeader>
        <DialogTitle>{{ t('admin.subscriptionsQuench.extendTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="extendingSub" class="mb-4 rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
        <div>{{ t('admin.subscriptionsQuench.extendForUser') }} <strong class="text-foreground">{{ extendingSub.user?.email ?? `#${extendingSub.user_id}` }}</strong></div>
        <div>{{ t('admin.subscriptionsQuench.currentExpiry') }}: <strong class="text-foreground">{{ extendingSub.expires_at ? fmtDate(extendingSub.expires_at) : t('admin.subscriptions.noExpiration') }}</strong></div>
      </div>

      <div class="mb-4">
        <Label class="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {{ t('admin.subscriptionsQuench.formAdjustDays') }}
        </Label>
        <Input v-model.number="extendDays" type="number" :placeholder="t('admin.subscriptionsQuench.adjustDaysPlaceholder')" />
        <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.subscriptionsQuench.adjustHint') }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('close-extend')">{{ t('common.cancel') }}</Button>
        <Button :disabled="submitting" @click="doExtend">
          {{ submitting ? t('admin.subscriptionsQuench.adjusting') : t('admin.subscriptionsQuench.adjust') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ── 吊销确认 Dialog ── -->
  <Dialog :open="showRevoke && !!revokingSub" @update:open="(v) => { if (!v) emit('close-revoke') }">
    <DialogContent class="w-full max-w-[420px]" :aria-label="t('admin.subscriptionsQuench.revokeTitle')">
      <DialogHeader>
        <DialogTitle>{{ t('admin.subscriptionsQuench.revokeTitle') }}</DialogTitle>
      </DialogHeader>

      <p
        class="mb-5 text-sm leading-relaxed text-muted-foreground [&_b]:text-foreground"
        v-html="t('admin.subscriptionsQuench.revokeConfirm', { user: `<b>${revokingSub?.user?.email ?? revokingSub?.user_id}</b>` })"
      ></p>

      <DialogFooter>
        <Button variant="outline" @click="emit('close-revoke')">{{ t('common.cancel') }}</Button>
        <Button variant="destructive" :disabled="submitting" @click="doRevoke">
          {{ submitting ? t('admin.subscriptionsQuench.revoking') : t('admin.subscriptionsQuench.revoke') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- ── 重置配额确认 Dialog ── -->
  <Dialog :open="showResetQuota && !!resettingSub" @update:open="(v) => { if (!v) emit('close-reset-quota') }">
    <DialogContent class="w-full max-w-[420px]" :aria-label="t('admin.subscriptionsQuench.resetQuotaTitle')">
      <DialogHeader>
        <DialogTitle>{{ t('admin.subscriptionsQuench.resetQuotaTitle') }}</DialogTitle>
      </DialogHeader>

      <p
        class="mb-5 text-sm leading-relaxed text-muted-foreground [&_b]:text-foreground"
        v-html="t('admin.subscriptionsQuench.resetQuotaConfirm', { user: `<b>${resettingSub?.user?.email ?? resettingSub?.user_id}</b>` })"
      ></p>

      <DialogFooter>
        <Button variant="outline" @click="emit('close-reset-quota')">{{ t('common.cancel') }}</Button>
        <Button :disabled="submitting" @click="doResetQuota">
          {{ submitting ? t('admin.subscriptionsQuench.resetting') : t('admin.subscriptionsQuench.resetQuota') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { UserSubscription, Group } from '@/types'
import type { SimpleUser } from '@/api/admin/usage'
import { useAppStore } from '@/stores/app'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const { t } = useI18n()
const appStore = useAppStore()

const props = defineProps<{
  showAssign: boolean
  showExtend: boolean
  showRevoke: boolean
  showResetQuota: boolean
  extendingSub: UserSubscription | null
  revokingSub: UserSubscription | null
  resettingSub: UserSubscription | null
  groups: Group[]
}>()

const emit = defineEmits<{
  'close-assign': []
  'close-extend': []
  'close-revoke': []
  'close-reset-quota': []
  'assigned': []
  'extended': []
  'revoked': []
  'quota-reset': []
}>()

// ─── 工具函数 ─────────────────────────────────────────────────────
function fmtDate(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const submitting = ref(false)
const subGroups = computed(() => props.groups.filter(g => g.subscription_type === 'subscription' && g.status === 'active'))

// ─── 分配表单 ─────────────────────────────────────────────────────
const userKeyword = ref('')
const userResults = ref<SimpleUser[]>([])
const userLoading = ref(false)
const showUserDd = ref(false)
const selectedUser = ref<SimpleUser | null>(null)
let userTimer: ReturnType<typeof setTimeout> | null = null
const assignForm = reactive({ user_id: null as number | null, group_id: null as number | null, validity_days: 30 })

function debounceUserSearch() {
  if (userTimer) clearTimeout(userTimer)
  userTimer = setTimeout(searchUsers, 300)
}
async function searchUsers() {
  const kw = userKeyword.value.trim()
  if (selectedUser.value && kw !== selectedUser.value.email) { selectedUser.value = null; assignForm.user_id = null }
  if (!kw) { userResults.value = []; return }
  userLoading.value = true
  try { userResults.value = await adminAPI.usage.searchUsers(kw) } catch { userResults.value = [] } finally { userLoading.value = false }
}
function selectUser(u: SimpleUser) { selectedUser.value = u; userKeyword.value = u.email; showUserDd.value = false; assignForm.user_id = u.id }
function clearUser() { selectedUser.value = null; userKeyword.value = ''; userResults.value = []; assignForm.user_id = null }

async function doAssign() {
  if (!assignForm.user_id) { appStore.showError(t('admin.subscriptions.pleaseSelectUser')); return }
  if (!assignForm.group_id) { appStore.showError(t('admin.subscriptions.pleaseSelectGroup')); return }
  if (!assignForm.validity_days || assignForm.validity_days < 1) { appStore.showError(t('admin.subscriptions.validityDaysRequired')); return }
  submitting.value = true
  try {
    await adminAPI.subscriptions.assign({ user_id: assignForm.user_id, group_id: assignForm.group_id, validity_days: assignForm.validity_days })
    appStore.showSuccess(t('admin.subscriptionsQuench.assignedSuccess'))
    clearUser(); assignForm.group_id = null; assignForm.validity_days = 30
    emit('close-assign'); emit('assigned')
  } catch (e: any) { appStore.showError(e?.response?.data?.detail || t('admin.subscriptions.failedToAssign')) }
  finally { submitting.value = false }
}

// 关闭时重置分配表单
watch(() => props.showAssign, (v) => { if (!v) { clearUser(); assignForm.group_id = null; assignForm.validity_days = 30 } })

// ─── 续期表单 ─────────────────────────────────────────────────────
const extendDays = ref(30)
watch(() => props.showExtend, (v) => { if (v) extendDays.value = 30 })

async function doExtend() {
  if (!props.extendingSub) return
  if (props.extendingSub.expires_at) {
    const newExp = new Date(new Date(props.extendingSub.expires_at).getTime() + extendDays.value * 86400000)
    if (newExp <= new Date()) { appStore.showError(t('admin.subscriptions.adjustWouldExpire')); return }
  }
  submitting.value = true
  try {
    await adminAPI.subscriptions.extend(props.extendingSub.id, { days: extendDays.value })
    appStore.showSuccess(t('admin.subscriptionsQuench.extendedSuccess'))
    emit('close-extend'); emit('extended')
  } catch (e: any) { appStore.showError(e?.response?.data?.detail || t('admin.subscriptions.failedToAdjust')) }
  finally { submitting.value = false }
}

// ─── 吊销 ─────────────────────────────────────────────────────────
async function doRevoke() {
  if (!props.revokingSub) return
  submitting.value = true
  try {
    await adminAPI.subscriptions.revoke(props.revokingSub.id)
    appStore.showSuccess(t('admin.subscriptionsQuench.revokedSuccess'))
    emit('close-revoke'); emit('revoked')
  } catch (e: any) { appStore.showError(e?.response?.data?.detail || t('admin.subscriptions.failedToRevoke')) }
  finally { submitting.value = false }
}

// ─── 重置配额 ─────────────────────────────────────────────────────
async function doResetQuota() {
  if (!props.resettingSub) return
  submitting.value = true
  try {
    await adminAPI.subscriptions.resetQuota(props.resettingSub.id, { daily: true, weekly: true, monthly: true })
    appStore.showSuccess(t('admin.subscriptionsQuench.quotaResetSuccess'))
    emit('close-reset-quota'); emit('quota-reset')
  } catch (e: any) { appStore.showError(e?.response?.data?.detail || t('admin.subscriptions.failedToResetQuota')) }
  finally { submitting.value = false }
}
</script>
