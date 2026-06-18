<template>
  <!-- Admin routes: AppShell (renamed from QuenchShell) -->
  <AppShell
    v-if="isAdminRoute"
    :nav-groups="adminNavGroups"
    brand-label="ADMIN"
    show-command-palette
  >
    <slot />
  </AppShell>

  <!-- User-side /dashboard: same AppShell, user nav, no ⌘K (admin-scoped in v.22) -->
  <AppShell
    v-else-if="isUserShellRoute"
    :nav-groups="filteredUserNavGroups"
  >
    <slot />
  </AppShell>

  <!-- Other user routes: legacy AppSidebar + AppHeader (v.23 will migrate) -->
  <template v-else>
    <div class="min-h-screen bg-background">
      <!-- Sidebar -->
      <AppSidebar />

      <!-- Main Content Area -->
      <div
        class="relative min-h-screen transition-all duration-300"
        :class="[sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64']"
      >
        <!-- Header -->
        <AppHeader />

        <!-- Main Content -->
        <main class="p-3 sm:p-4 md:p-6 lg:p-8">
          <slot />
        </main>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import '@/styles/onboarding.css'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingTour } from '@/composables/useOnboardingTour'
import { useOnboardingStore } from '@/stores/onboarding'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import AppShell from '@/components/shell/AppShell.vue'
import { adminNavGroups, buildUserNavGroups } from '@/components/shell/nav'
import { useNavFiltered } from '@/components/shell/useNavFiltered'
import { FeatureFlags, makeSidebarFlag } from '@/utils/featureFlags'

const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const isAdmin = computed(() => authStore.user?.role === 'admin')

// Route-based: admin paths → AppShell with admin nav
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

// v.22 staged rollout: only /dashboard moves to AppShell; other user routes stay on legacy until v.23.
const isUserShellRoute = computed(() => route.path === '/dashboard')

// User-side feature flags — same registry as legacy AppSidebar so menu visibility stays consistent.
const flagAvailableChannels = makeSidebarFlag(FeatureFlags.availableChannels)
const flagChannelMonitor = makeSidebarFlag(FeatureFlags.channelMonitor)
const flagPayment = makeSidebarFlag(FeatureFlags.payment)
const flagAffiliate = makeSidebarFlag(FeatureFlags.affiliate)

const userNavGroupsBuilt = computed(() =>
  buildUserNavGroups({
    flagAvailableChannels,
    flagChannelMonitor,
    flagPayment,
    flagAffiliate,
  })
)
const isSimpleMode = computed(() => authStore.isSimpleMode)
const filteredUserNavGroups = useNavFiltered(userNavGroupsBuilt, isSimpleMode)

// admin_guide_quench: 引导 key 保持 QUENCH 期遗留命名，避免老用户重看
const { replayTour } = useOnboardingTour({
  storageKey: isAdmin.value ? 'admin_guide_quench' : 'user_guide',
  autoStart: true
})

const onboardingStore = useOnboardingStore()

onMounted(() => {
  onboardingStore.setReplayCallback(replayTour)
})

defineExpose({ replayTour })
</script>
