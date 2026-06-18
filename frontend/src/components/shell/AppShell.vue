<template>
  <div class="app-shell">
    <!-- Sidebar -->
    <AppSidebarShell :nav-groups="navGroups" :brand-label="brandLabel" />

    <!-- Main area -->
    <div class="app-shell__main">
      <!-- Topbar -->
      <AppTopbar
        :nav-groups="navGroups"
        :show-command-palette="showCommandPalette"
        @open-command-palette="commandPaletteOpen = true"
      />

      <!-- Page content -->
      <main class="app-shell__content">
        <slot />
      </main>
    </div>

    <!-- Command Palette (admin only in v.22) -->
    <CommandPalette
      v-if="showCommandPalette"
      v-model="commandPaletteOpen"
      :nav-groups="navGroups"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, withDefaults } from 'vue'
import AppSidebarShell from './AppSidebarShell.vue'
import AppTopbar from './AppTopbar.vue'
import CommandPalette from './CommandPalette.vue'
import type { NavGroup } from './nav'

withDefaults(
  defineProps<{
    /** 当前 shell 的 NavGroup 列表（已经过 useNavFiltered 过滤） */
    navGroups: NavGroup[]
    /** Sidebar 顶部 brand 小标，例如 'ADMIN' */
    brandLabel?: string
    /** 是否启用 ⌘K 命令面板（v.22 仅 admin 开启） */
    showCommandPalette?: boolean
  }>(),
  {
    brandLabel: '',
    showCommandPalette: false,
  }
)

const commandPaletteOpen = ref(false)
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: hsl(var(--background));
  position: relative;
}

.app-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.app-shell__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 26px 80px;
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.app-shell__content::-webkit-scrollbar {
  width: 8px;
}

.app-shell__content::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 6px;
  border: 2px solid hsl(var(--background));
}

.app-shell__content::-webkit-scrollbar-track {
  background: transparent;
}
</style>
