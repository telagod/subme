<template>
  <Teleport to="body">
    <!-- Scrim -->
    <Transition name="ud-scrim">
      <div
        v-if="open"
        class="ud-scrim"
        @click="handleClose"
        aria-hidden="true"
      />
    </Transition>

    <!-- Drawer -->
    <Transition name="ud-slide">
      <div
        v-if="open"
        ref="drawerRef"
        class="ud-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="user ? t('admin.userDetailDrawer.ariaLabelUser', { email: user.email }) : t('admin.userDetailDrawer.ariaLabel')"
        @keydown.esc="handleClose"
        tabindex="-1"
      >
        <!-- 加载态 -->
        <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground text-[12.5px]">
          <div class="ud-spinner"></div>
        </div>

        <!-- 错误态 -->
        <div v-else-if="loadError" class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground text-[12.5px]">
          <p>{{ loadError }}</p>
          <Button variant="outline" size="sm" @click="loadUser">{{ t('admin.userDetailDrawer.retryBtn') }}</Button>
        </div>

        <template v-else-if="user">
          <!-- ── 头部 ── -->
          <div class="flex items-center gap-3 px-[22px] py-5 pb-4 border-b border-border flex-shrink-0">
            <div
              class="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[17px] font-bold text-primary flex-shrink-0"
              :title="user.email"
            >
              {{ user.email.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-foreground truncate">{{ user.email }}</div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[11px] text-muted-foreground">{{ t('admin.userDetailDrawer.registered') }} {{ fmtDate(user.created_at) }}</span>
              </div>
            </div>
            <div class="flex gap-1.5 flex-shrink-0">
              <Badge :variant="user.role === 'admin' ? 'default' : 'secondary'">
                {{ user.role === 'admin' ? t('admin.userDetailDrawer.roleAdmin') : t('admin.userDetailDrawer.roleUser') }}
              </Badge>
              <Badge :variant="user.status === 'active' ? 'secondary' : 'destructive'" :class="user.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : ''">
                {{ user.status === 'active' ? t('admin.userDetailDrawer.statusActive') : t('admin.userDetailDrawer.statusDisabled') }}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" class="flex-shrink-0 w-8 h-8" @click="handleClose" :aria-label="t('admin.userDetailDrawer.ariaClose')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </Button>
          </div>

          <!-- ── KPI 三格 ── -->
          <div class="flex items-stretch px-[22px] py-3 border-b border-border gap-0 flex-shrink-0 bg-muted/40">
            <div class="flex flex-1 flex-col gap-0.5 px-3.5 first:pl-0 last:pr-0">
              <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userDetailDrawer.kpiBalance') }}</span>
              <span class="text-[15px] font-bold text-foreground">${{ fmtBal(user.balance) }}</span>
            </div>
            <div class="w-px bg-border my-0.5"></div>
            <div class="flex flex-1 flex-col gap-0.5 px-3.5">
              <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userDetailDrawer.kpiMonthCost') }}</span>
              <span class="text-[15px] font-bold text-foreground" v-if="!monthStatsLoading">${{ fmtBal(monthStats.total_cost) }}</span>
              <span class="text-[15px] font-bold text-muted-foreground" v-else>…</span>
            </div>
            <div class="w-px bg-border my-0.5"></div>
            <div class="flex flex-1 flex-col gap-0.5 px-3.5 last:pr-0">
              <span class="text-[10.5px] text-muted-foreground">{{ t('admin.userDetailDrawer.kpiSubscription') }}</span>
              <span class="text-[15px] font-bold text-foreground" v-if="activeSub">
                <Badge variant="secondary" class="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">{{ t('admin.userDetailDrawer.subscriptionActive') }}</Badge>
              </span>
              <span class="text-[15px] font-bold text-muted-foreground" v-else>{{ t('admin.userDetailDrawer.subscriptionNone') }}</span>
            </div>
          </div>

          <!-- ── 页签条 ── -->
          <div class="flex px-[22px] border-b border-border gap-0 flex-shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
            <Button
              v-for="tab in tabs"
              :key="tab.key"
              variant="ghost"
              class="px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground whitespace-nowrap border-b-2 border-transparent rounded-none transition-colors duration-150 -mb-px h-auto hover:bg-transparent hover:text-foreground"
              :class="{ 'text-primary border-b-primary border-b-2': activeTab === tab.key }"
              role="tab"
              :aria-selected="activeTab === tab.key"
              @click="activeTab = tab.key"
            >{{ tab.label }}</Button>
          </div>

          <!-- ── 页签内容 ── -->
          <div class="ud-body" role="tabpanel">
            <OverviewTab v-if="activeTab === 'overview'" :user="user" />
            <SubscriptionsTab v-else-if="activeTab === 'subscriptions'" :user="user" :active="activeTab === 'subscriptions'" />
            <KeysTab v-else-if="activeTab === 'keys'" :user="user" :active="activeTab === 'keys'" />
            <OrdersTab v-else-if="activeTab === 'orders'" :user="user" :active="activeTab === 'orders'" />
            <UsageTab v-else-if="activeTab === 'usage'" :user="user" :active="activeTab === 'usage'" />
            <RiskTab v-else-if="activeTab === 'risk'" :user="user" :active="activeTab === 'risk'" />
          </div>

          <!-- ── 底部操作栏 ── -->
          <div class="flex items-center gap-2.5 px-[22px] py-3.5 border-t border-border flex-shrink-0">
            <Button variant="outline" size="sm" @click="showBalanceAdj = true" class="gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              {{ t('admin.userDetailDrawer.adjustBalance') }}
            </Button>
            <Button
              :variant="user.status === 'active' ? 'destructive' : 'secondary'"
              size="sm"
              :disabled="user.role === 'admin' && isCurrentAdmin"
              @click="toggleStatus"
              :class="user.status !== 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : ''"
            >
              {{ statusToggleLabel }}
            </Button>
          </div>
        </template>
      </div>
    </Transition>

    <!-- 调余额弹窗 -->
    <BalanceAdjustPopover
      v-if="user"
      :open="showBalanceAdj"
      :user-id="user.id"
      :current-balance="user.balance"
      @close="showBalanceAdj = false"
      @updated="onUpdated"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import type { AdminUser } from '@/types'

import { useAuthStore } from '@/stores/auth'

// Tab components (lazy via v-if)
import OverviewTab from './tabs/OverviewTab.vue'
import SubscriptionsTab from './tabs/SubscriptionsTab.vue'
import KeysTab from './tabs/KeysTab.vue'
import OrdersTab from './tabs/OrdersTab.vue'
import UsageTab from './tabs/UsageTab.vue'
import RiskTab from './tabs/RiskTab.vue'
import BalanceAdjustPopover from './BalanceAdjustPopover.vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ── Props / Emits ──────────────────────────────────────────────────────
const props = defineProps<{
  userId: number | null
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

// ── i18n / Store ───────────────────────────────────────────────────────
const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

// ── State ──────────────────────────────────────────────────────────────
const drawerRef = ref<HTMLElement | null>(null)
const user = ref<AdminUser | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const activeTab = ref('overview')
const showBalanceAdj = ref(false)
const monthStatsLoading = ref(false)
const monthStats = ref({ total_cost: 0, total_requests: 0, total_tokens: 0 })

const tabs = computed(() => [
  { key: 'overview', label: t('admin.userDetailDrawer.tabOverview') },
  { key: 'subscriptions', label: t('admin.userDetailDrawer.tabSubscriptions') },
  { key: 'keys', label: t('admin.userDetailDrawer.tabKeys') },
  { key: 'orders', label: t('admin.userDetailDrawer.tabOrders') },
  { key: 'usage', label: t('admin.userDetailDrawer.tabUsage') },
  { key: 'risk', label: t('admin.userDetailDrawer.tabRisk') },
])

// ── Computed ──────────────────────────────────────────────────────────
const activeSub = computed(() =>
  user.value?.subscriptions?.some(s => s.status === 'active') ?? false
)

const isCurrentAdmin = computed(() =>
  authStore.user?.id === user.value?.id
)

const statusToggleLabel = computed(() =>
  user.value?.status === 'active' ? t('admin.userDetailDrawer.disableAccount') : t('admin.userDetailDrawer.enableAccount')
)

// ── Helpers ───────────────────────────────────────────────────────────
function fmtBal(v: number) {
  if (!v && v !== 0) return '0.00'
  const s = v.toFixed(8).replace(/\.?0+$/, '')
  const parts = s.split('.')
  if (parts.length === 1) return s + '.00'
  if (parts[1].length < 2) return s + '0'
  return s
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ── Data loading ──────────────────────────────────────────────────────
async function loadUser() {
  if (!props.userId) return
  loading.value = true; loadError.value = null
  try {
    user.value = await adminAPI.users.getById(props.userId)
    activeTab.value = 'overview'
    loadMonthStats()
  } catch (e: any) {
    loadError.value = e?.response?.data?.detail || t('admin.userDetailDrawer.loadFailed')
  } finally { loading.value = false }
}

async function loadMonthStats() {
  if (!props.userId) return
  monthStatsLoading.value = true
  try {
    const res = await adminAPI.users.getUserUsageStats(props.userId, 'month')
    monthStats.value = res
  } catch { /* silent */ } finally { monthStatsLoading.value = false }
}

// ── Actions ────────────────────────────────────────────────────────────
async function toggleStatus() {
  if (!user.value) return
  if (user.value.role === 'admin' && isCurrentAdmin.value) {
    appStore.showWarning(t('admin.userDetailDrawer.cannotDisableSelf'))
    return
  }
  const newStatus = user.value.status === 'active' ? 'disabled' : 'active'
  try {
    const updated = await adminAPI.users.toggleStatus(user.value.id, newStatus)
    user.value = updated
    appStore.showSuccess(newStatus === 'active' ? t('admin.userDetailDrawer.accountEnabled') : t('admin.userDetailDrawer.accountDisabled'))
    emit('updated')
  } catch (e: any) {
    appStore.showError(e?.response?.data?.detail || t('admin.userDetailDrawer.operationFailed'))
  }
}

function onUpdated() {
  emit('updated')
  // 刷新用户数据（余额已变）
  loadUser()
}

function handleClose() {
  emit('close')
}

// ── Keyboard & focus ──────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open && !showBalanceAdj.value) {
    handleClose()
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

// ── Watchers ──────────────────────────────────────────────────────────
watch(
  () => ({ uid: props.userId, open: props.open }),
  async ({ uid, open }, prev) => {
    if (open && uid) {
      // 仅在 open 从 false→true 或 userId 变化时重新加载
      if (!prev?.open || prev?.uid !== uid) {
        await loadUser()
        await nextTick()
        drawerRef.value?.focus()
      }
    } else if (!open) {
      user.value = null
      loadError.value = null
    }
  },
  { immediate: true }
)
</script>

<style scoped>
/* ── Scrim ── */
.ud-scrim {
  position: fixed; inset: 0; z-index: 9990;
  background: rgba(0, 0, 0, 0.52);
}
.ud-scrim-enter-active, .ud-scrim-leave-active { transition: opacity 0.24s ease; }
.ud-scrim-enter-from, .ud-scrim-leave-to { opacity: 0; }

/* ── Drawer ── */
.ud-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 9991;
  width: 560px;
  background: hsl(var(--background));
  border-left: 1px solid hsl(var(--border));
  box-shadow: -24px 0 64px rgba(0,0,0,.45);
  display: flex; flex-direction: column;
  font-family: var(--font-ui, "Archivo", "PingFang SC", sans-serif);
  font-size: 13px;
  color: hsl(var(--foreground));
  outline: none;
  overflow: hidden;
}

/* 滑入动画（prefers-reduced-motion 降级） */
@media (prefers-reduced-motion: no-preference) {
  .ud-slide-enter-active { transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1); }
  .ud-slide-leave-active { transition: transform 0.2s cubic-bezier(0.55, 0, 1, 0.45); }
}
@media (prefers-reduced-motion: reduce) {
  .ud-slide-enter-active { transition: opacity 0.15s; }
  .ud-slide-leave-active { transition: opacity 0.12s; }
  .ud-slide-enter-from, .ud-slide-leave-to { opacity: 0; transform: none !important; }
}
.ud-slide-enter-from { transform: translateX(100%); }
.ud-slide-leave-to  { transform: translateX(100%); }

/* ── 内容区 ── */
.ud-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}
.ud-body::-webkit-scrollbar { width: 5px; }
.ud-body::-webkit-scrollbar-track { background: transparent; }
.ud-body::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 3px; }

/* ── 加载 spinner ── */
.ud-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid hsl(var(--border));
  border-top-color: hsl(var(--primary));
  animation: ud-spin 0.7s linear infinite;
}
@keyframes ud-spin { to { transform: rotate(360deg); } }
</style>
