<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4">
    <div class="w-full max-w-md">
      <!-- 品牌区 -->
      <div v-if="settingsLoaded" class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border bg-card"
        >
          <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-[70%] w-[70%] object-contain" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight text-foreground">{{ siteName }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">登录到控制台</p>
      </div>
      <!-- 骨架占位，避免布局抖动 -->
      <div v-else class="mb-8 text-center" aria-hidden="true">
        <div class="mx-auto mb-4 h-14 w-14 animate-pulse rounded-xl bg-muted"></div>
        <div class="mx-auto mb-2.5 h-[18px] w-28 animate-pulse rounded bg-muted"></div>
        <div class="mx-auto h-3 w-20 animate-pulse rounded bg-muted"></div>
      </div>

      <!-- 主卡：原生 Card -->
      <Card>
        <CardContent class="p-8">
          <slot />
        </CardContent>
      </Card>

      <!-- 页脚链接 -->
      <div
        class="mt-5 text-center text-sm text-muted-foreground [&_a]:text-foreground [&_a]:no-underline [&_a]:transition-colors [&_a:hover]:text-primary [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-foreground [&_button:hover]:text-primary"
      >
        <slot name="footer" />
      </div>

      <!-- 版权 -->
      <p class="mt-5 text-center text-xs text-muted-foreground/70">
        &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'
import { Card, CardContent } from '@/components/ui/card'

const appStore = useAppStore()

const siteName = computed(() => appStore.siteName || 'subme')
const siteLogo = computed(() =>
  sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true })
)
const settingsLoaded = computed(() => appStore.publicSettingsLoaded)
const currentYear = computed(() => new Date().getFullYear())

onMounted(() => {
  appStore.fetchPublicSettings()
})
</script>
