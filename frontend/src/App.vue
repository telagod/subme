<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { ref, onMounted, onErrorCaptured, watch } from 'vue'
import Toast from '@/components/common/Toast.vue'
import NavigationProgress from '@/components/common/NavigationProgress.vue'
import { resolveDocumentTitle } from '@/router/title'
import AnnouncementPopup from '@/components/common/AnnouncementPopup.vue'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores'
import { useAppLifecycle } from '@/composables/useAppLifecycle'
import { getSetupStatus } from '@/api/setup'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
// useAppLifecycle 拥有：visibilitychange / 订阅轮询 / 公告 reset / admin-settings
// 监听器的整套生命周期。App.vue 只负责调用一次。
const { refreshAnnouncementsIfAuthed } = useAppLifecycle()

/**
 * Update favicon dynamically
 * @param logoUrl - URL of the logo to use as favicon
 */
function updateFavicon(logoUrl: string) {
  // Find existing favicon link or create new one
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = logoUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon'
  link.href = logoUrl
}

// Watch for site settings changes and update favicon/title
watch(
  () => appStore.siteLogo,
  (newLogo) => {
    if (newLogo) {
      updateFavicon(newLogo)
    }
  },
  { immediate: true }
)

// Route change trigger (throttled by store); useAppLifecycle 已掌管认证态切换的
// visibility/订阅/公告 reset/admin-settings 监听器的整套生命周期。
router.afterEach(() => {
  refreshAnnouncementsIfAuthed()
})

const routeError = ref(false)

onErrorCaptured((err) => {
  console.error('Route component error:', err)
  routeError.value = true
  return false
})

watch(() => route.path, () => {
  routeError.value = false
})

onMounted(async () => {
  // admin-settings window listener lifecycle 已由 useAppLifecycle 接管。
  // Check if setup is needed
  try {
    const status = await getSetupStatus()
    if (status.needs_setup && route.path !== '/setup') {
      router.replace('/setup')
      return
    }
  } catch {
    // If setup endpoint fails, assume normal mode and continue
  }

  // Load public settings into appStore (will be cached for other components)
  await appStore.fetchPublicSettings()

  // Re-resolve document title now that siteName is available
  document.title = resolveDocumentTitle(route.meta.title, appStore.siteName, route.meta.titleKey as string)
})
</script>

<template>
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-md focus:ring-2 focus:ring-ring">
    Skip to main content
  </a>
  <NavigationProgress />
  <div v-if="routeError" class="flex items-center justify-center min-h-screen">
    <div class="text-center space-y-4">
      <p class="text-muted-foreground">Page failed to load</p>
      <Button size="sm" @click="routeError = false; $router.go(0)">
        Reload
      </Button>
    </div>
  </div>
  <main id="main-content" tabindex="-1">
    <RouterView v-if="!routeError" v-slot="{ Component, route: viewRoute }">
      <transition name="page">
        <component v-if="Component" :is="Component" :key="viewRoute.path" />
      </transition>
    </RouterView>
  </main>
  <Toast />
  <AnnouncementPopup />
</template>
