<template>
  <aside class="hidden w-[228px] shrink-0 flex-col border-r border-border bg-card lg:flex" style="height:100vh;position:sticky;top:0;overflow:hidden;">
    <!-- Brand -->
    <div class="flex shrink-0 items-center gap-2.5 border-b border-border px-[18px] pb-4 pt-[18px]">
      <div class="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-[8px] border border-border bg-secondary">
        <img
          v-if="siteLogo"
          :src="siteLogo"
          alt="logo"
          class="h-full w-full object-contain"
        />
        <span v-else class="text-sm font-extrabold text-foreground">S</span>
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold tracking-[0.04em] text-foreground">{{ siteName }}</span>
        <span v-if="brandLabel" class="font-mono text-[9.5px] tracking-[0.22em] text-muted-foreground">{{ brandLabel }}</span>
      </div>
    </div>

    <!-- Nav groups -->
    <ScrollArea class="flex-1 p-2.5" data-tour="nav-root">
      <nav>
        <div
          v-for="group in navGroups"
          :key="group.key"
          class="mb-3.5"
          :data-tour="`nav-group-${group.key}`"
        >
          <div class="px-2.5 pb-[5px] pt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {{ t(group.labelKey) }}
          </div>
          <router-link
            v-for="item in group.items"
            :key="item.key"
            :to="item.path"
            class="relative flex items-center gap-[9px] rounded-[8px] px-2.5 py-[7px] text-[13px] font-medium no-underline transition-[background,color] duration-150 select-none"
            :class="isActive(item.path)
              ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14)] before:absolute before:bottom-[7px] before:left-0 before:top-[7px] before:w-0.5 before:rounded-[2px] before:bg-primary before:shadow-[0_0_8px_hsl(var(--primary)/0.6)] before:content-[\'\']'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'"
            :aria-current="isActive(item.path) ? 'page' : undefined"
            :data-tour="`nav-${item.key}`"
          >
            <component :is="item.icon" class="h-[15px] w-[15px] shrink-0 opacity-90" />
            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ t(item.labelKey) }}</span>
          </router-link>
        </div>
      </nav>
    </ScrollArea>

    <!-- Footer: env chip -->
    <div class="shrink-0 border-t border-border px-4 pb-3 pt-2.5">
      <div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-[9px] py-1 font-mono text-[10px] text-muted-foreground">
        <i class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></i>
        <span>v{{ siteVersion || '—' }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import type { NavGroup } from './nav'
import { ScrollArea } from '@/components/ui/scroll-area'

withDefaults(
  defineProps<{
    navGroups: NavGroup[]
    /** Sidebar 顶端 brand 下方的小标（如 ADMIN）。空字符串则隐藏。 */
    brandLabel?: string
  }>(),
  { brandLabel: '' }
)

const { t } = useI18n()
const route = useRoute()
const appStore = useAppStore()

const siteName = computed(() => appStore.siteName)
const siteLogo = computed(() => appStore.siteLogo)
const siteVersion = computed(() => appStore.siteVersion)

function isActive(path: string): boolean {
  // 顶层 dashboard 路径要严格匹配（避免 /admin/dashboard 匹配到 /admin/dashboard-x），其余允许前缀匹配
  if (path === '/admin/dashboard' || path === '/dashboard') {
    return route.path === path
  }
  return route.path === path || route.path.startsWith(path + '/')
}
</script>
