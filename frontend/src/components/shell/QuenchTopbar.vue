<template>
  <header
    class="sticky top-0 z-20 flex h-[54px] shrink-0 items-center gap-4 border-b border-border bg-background/80 px-[22px] backdrop-blur-[8px]"
  >
    <!-- Breadcrumb -->
    <div class="flex min-w-0 items-center text-[12.5px]">
      <span v-if="currentGroup" class="text-muted-foreground">
        {{ t(currentGroup.labelKey) }}
      </span>
      <span v-if="currentGroup && currentItem" class="mx-[7px] text-muted-foreground/50">›</span>
      <span v-if="currentItem" class="font-semibold text-foreground">
        {{ t(currentItem.labelKey) }}
      </span>
    </div>

    <!-- ⌘K pill -->
    <Button
      variant="outline"
      class="ml-auto flex min-w-[220px] cursor-pointer items-center gap-2 rounded-[9px] bg-muted px-[11px] py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring/40 hover:shadow-[0_0_14px_hsl(var(--ring)/0.12)]"
      data-tour="cmdk"
      @click="emit('openCommandPalette')"
      :title="t('nav.quench.openCommandPalette')"
    >
      <Search class="h-[13px] w-[13px] shrink-0" />
      <span class="flex-1 text-left">{{ t('nav.quench.searchPlaceholder') }}</span>
      <kbd
        class="ml-auto rounded border border-border bg-background px-1.5 py-[2px] font-mono text-[10px] text-muted-foreground"
      >⌘K</kbd>
    </Button>

    <!-- Right section: theme + locale + user -->
    <div class="flex shrink-0 items-center gap-2">
      <!-- Theme Toggle -->
      <Button
        variant="ghost"
        size="icon"
        @click="toggleTheme"
        :title="isDark ? t('nav.lightMode') : t('nav.darkMode')"
      >
        <Sun v-if="isDark" class="h-[15px] w-[15px]" />
        <Moon v-else class="h-[15px] w-[15px]" />
      </Button>

      <!-- Locale Switcher -->
      <LocaleSwitcher />

      <!-- User avatar + dropdown -->
      <div class="relative" ref="dropdownRef">
        <Button
          variant="ghost"
          class="h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full bg-muted p-0 text-[12px] font-bold text-foreground"
          @click="toggleDropdown"
          :title="displayName"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName"
            class="h-full w-full object-cover"
          />
          <span v-else>{{ userInitials }}</span>
        </Button>

        <transition
          enter-active-class="transition-[opacity,transform] duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 -translate-y-1"
          leave-active-class="transition-[opacity,transform] duration-150 ease-in"
          leave-to-class="opacity-0 scale-95 -translate-y-1"
        >
          <div
            v-if="dropdownOpen"
            class="absolute right-0 top-[calc(100%+6px)] z-50 w-[200px] overflow-hidden rounded-[10px] border border-border bg-popover shadow-[0_16px_48px_hsl(0_0%_0%/0.35)]"
          >
            <div class="border-b border-border px-[14px] pb-2.5 pt-3">
              <div class="truncate text-[13px] font-semibold text-foreground">{{ displayName }}</div>
              <div class="mt-0.5 truncate text-[11px] text-muted-foreground">{{ user?.email }}</div>
            </div>
            <div class="p-[6px_4px]">
              <router-link
                to="/profile"
                class="flex w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-none bg-transparent px-2.5 py-[7px] text-[12.5px] text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-inset focus-visible:ring-ring"
                @click="closeDropdown"
              >
                <UserIcon class="h-[14px] w-[14px] shrink-0 opacity-85" />
                {{ t('nav.profile') }}
              </router-link>
            </div>
            <div class="border-t border-border p-[6px_4px]">
              <Button
                variant="ghost"
                class="flex w-full items-center justify-start gap-[9px] rounded-[7px] px-2.5 py-[7px] text-[12.5px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                @click="handleLogout"
              >
                <LogOut class="h-[14px] w-[14px] shrink-0 opacity-85" />
                {{ t('nav.logout') }}
              </Button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search, Sun, Moon, User as UserIcon, LogOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import { resolveNavItem } from './nav'
import { useTheme } from '@/composables/useTheme'

const emit = defineEmits<{
  openCommandPalette: []
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const user = computed(() => authStore.user)
const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const resolved = computed(() => resolveNavItem(route.path))
const currentGroup = computed(() => resolved.value?.group ?? null)
const currentItem = computed(() => resolved.value?.item ?? null)

const avatarUrl = computed(() => user.value?.avatar_url?.trim() || '')
const userInitials = computed(() => {
  if (!user.value) return ''
  if (user.value.username) return user.value.username.substring(0, 2).toUpperCase()
  if (user.value.email) return user.value.email.split('@')[0].substring(0, 2).toUpperCase()
  return ''
})
const displayName = computed(() => {
  if (!user.value) return ''
  return user.value.username || user.value.email?.split('@')[0] || ''
})

const { isDark, toggle: toggleTheme } = useTheme()

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown() {
  dropdownOpen.value = false
}

async function handleLogout() {
  closeDropdown()
  try {
    await authStore.logout()
  } catch {
    // ignore logout errors; we still route to /login
  }
  await router.push('/login')
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
