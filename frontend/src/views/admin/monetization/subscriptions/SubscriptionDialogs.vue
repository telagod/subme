<template>
  <Teleport to="body">
    <!-- ── 分配订阅 Dialog ── -->
    <Transition name="sq-modal">
      <div v-if="showAssign" class="sq-overlay" @click.self="emit('close-assign')">
        <div class="sq-dialog" role="dialog" :aria-label="t('admin.subscriptionsQuench.assignTitle')">
          <div class="sq-dlg-title">
            {{ t('admin.subscriptionsQuench.assignTitle') }}
            <button class="sq-dlg-close" @click="emit('close-assign')">✕</button>
          </div>
          <!-- User search -->
          <div class="sq-field">
            <label class="sq-label">{{ t('admin.subscriptionsQuench.formUser') }}</label>
            <div class="sq-search-wrap">
              <input v-model="userKeyword" class="sq-search-input" :placeholder="t('admin.subscriptionsQuench.searchUserPlaceholder')" @input="debounceUserSearch" @focus="showUserDd = true" />
              <button v-if="selectedUser" class="sq-search-clear" @click="clearUser">✕</button>
              <div v-if="showUserDd && (userResults.length || userKeyword)" class="sq-dropdown">
                <div v-if="userLoading" class="sq-dd-hint">{{ t('common.loading') }}</div>
                <div v-else-if="!userResults.length && userKeyword" class="sq-dd-hint">{{ t('common.noOptionsFound') }}</div>
                <button v-for="u in userResults" :key="u.id" class="sq-dd-item" @click="selectUser(u)">
                  <span>{{ u.email }}</span><span class="sq-muted sq-xs">#{{ u.id }}</span>
                </button>
              </div>
            </div>
          </div>
          <!-- Group select -->
          <div class="sq-field">
            <label class="sq-label">{{ t('admin.subscriptionsQuench.formGroup') }}</label>
            <div class="sq-sel-bar">
              <button v-for="g in subGroups" :key="g.id" class="sq-sel-chip" :class="{ on: assignForm.group_id === g.id }" @click="assignForm.group_id = g.id">{{ g.name }}</button>
              <span v-if="!subGroups.length" class="sq-muted sq-xs">{{ t('admin.subscriptionsQuench.noGroups') }}</span>
            </div>
          </div>
          <!-- Validity days -->
          <div class="sq-field">
            <label class="sq-label">{{ t('admin.subscriptionsQuench.formDays') }}</label>
            <input v-model.number="assignForm.validity_days" type="number" min="1" class="sq-input" />
            <p class="sq-hint">{{ t('admin.subscriptionsQuench.validityHint') }}</p>
          </div>
          <div class="sq-dlg-foot">
            <button class="sq-btn" @click="emit('close-assign')">{{ t('common.cancel') }}</button>
            <button class="sq-btn sq-btn-metal" :disabled="submitting" @click="doAssign">
              {{ submitting ? t('admin.subscriptionsQuench.assigning') : t('admin.subscriptionsQuench.assign') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── 续期 / 调整 Dialog ── -->
    <Transition name="sq-modal">
      <div v-if="showExtend && extendingSub" class="sq-overlay" @click.self="emit('close-extend')">
        <div class="sq-dialog" role="dialog" :aria-label="t('admin.subscriptionsQuench.extendTitle')">
          <div class="sq-dlg-title">
            {{ t('admin.subscriptionsQuench.extendTitle') }}
            <button class="sq-dlg-close" @click="emit('close-extend')">✕</button>
          </div>
          <div class="sq-info-box">
            <div>{{ t('admin.subscriptionsQuench.extendForUser') }} <strong>{{ extendingSub.user?.email ?? `#${extendingSub.user_id}` }}</strong></div>
            <div>{{ t('admin.subscriptionsQuench.currentExpiry') }}: <strong>{{ extendingSub.expires_at ? fmtDate(extendingSub.expires_at) : t('admin.subscriptions.noExpiration') }}</strong></div>
          </div>
          <div class="sq-field">
            <label class="sq-label">{{ t('admin.subscriptionsQuench.formAdjustDays') }}</label>
            <input v-model.number="extendDays" type="number" class="sq-input" :placeholder="t('admin.subscriptionsQuench.adjustDaysPlaceholder')" />
            <p class="sq-hint">{{ t('admin.subscriptionsQuench.adjustHint') }}</p>
          </div>
          <div class="sq-dlg-foot">
            <button class="sq-btn" @click="emit('close-extend')">{{ t('common.cancel') }}</button>
            <button class="sq-btn sq-btn-metal" :disabled="submitting" @click="doExtend">
              {{ submitting ? t('admin.subscriptionsQuench.adjusting') : t('admin.subscriptionsQuench.adjust') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── 吊销确认 Dialog ── -->
    <Transition name="sq-modal">
      <div v-if="showRevoke && revokingSub" class="sq-overlay" @click.self="emit('close-revoke')">
        <div class="sq-dialog" role="dialog" :aria-label="t('admin.subscriptionsQuench.revokeTitle')">
          <div class="sq-dlg-title">
            {{ t('admin.subscriptionsQuench.revokeTitle') }}
            <button class="sq-dlg-close" @click="emit('close-revoke')">✕</button>
          </div>
          <p class="sq-dlg-body" v-html="t('admin.subscriptionsQuench.revokeConfirm', { user: `<b>${revokingSub.user?.email ?? revokingSub.user_id}</b>` })"></p>
          <div class="sq-dlg-foot">
            <button class="sq-btn" @click="emit('close-revoke')">{{ t('common.cancel') }}</button>
            <button class="sq-btn sq-btn-danger" :disabled="submitting" @click="doRevoke">
              {{ submitting ? t('admin.subscriptionsQuench.revoking') : t('admin.subscriptionsQuench.revoke') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── 重置配额确认 Dialog ── -->
    <Transition name="sq-modal">
      <div v-if="showResetQuota && resettingSub" class="sq-overlay" @click.self="emit('close-reset-quota')">
        <div class="sq-dialog" role="dialog" :aria-label="t('admin.subscriptionsQuench.resetQuotaTitle')">
          <div class="sq-dlg-title">
            {{ t('admin.subscriptionsQuench.resetQuotaTitle') }}
            <button class="sq-dlg-close" @click="emit('close-reset-quota')">✕</button>
          </div>
          <p class="sq-dlg-body" v-html="t('admin.subscriptionsQuench.resetQuotaConfirm', { user: `<b>${resettingSub.user?.email ?? resettingSub.user_id}</b>` })"></p>
          <div class="sq-dlg-foot">
            <button class="sq-btn" @click="emit('close-reset-quota')">{{ t('common.cancel') }}</button>
            <button class="sq-btn sq-btn-metal" :disabled="submitting" @click="doResetQuota">
              {{ submitting ? t('admin.subscriptionsQuench.resetting') : t('admin.subscriptionsQuench.resetQuota') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { UserSubscription, Group } from '@/types'
import type { SimpleUser } from '@/api/admin/usage'
import { useAppStore } from '@/stores/app'

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

<style>
/* sq-modal 入场动画 */
.sq-modal-enter-active, .sq-modal-leave-active { transition: opacity 0.18s ease; }
.sq-modal-enter-from, .sq-modal-leave-to { opacity: 0; }
</style>
