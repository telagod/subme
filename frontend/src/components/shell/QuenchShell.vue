<template>
  <div class="quench-shell">
    <!-- Sidebar -->
    <QuenchSidebar />

    <!-- Main area -->
    <div class="quench-shell__main">
      <!-- Topbar -->
      <QuenchTopbar @open-command-palette="commandPaletteOpen = true" />

      <!-- Page content -->
      <main class="quench-shell__content">
        <slot />
      </main>
    </div>

    <!-- Command Palette (global) -->
    <CommandPalette v-model="commandPaletteOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import QuenchSidebar from './QuenchSidebar.vue'
import QuenchTopbar from './QuenchTopbar.vue'
import CommandPalette from './CommandPalette.vue'

const commandPaletteOpen = ref(false)
</script>

<style scoped>
.quench-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: hsl(var(--background));
  position: relative;
}

.quench-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.quench-shell__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 26px 80px;
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.quench-shell__content::-webkit-scrollbar {
  width: 8px;
}

.quench-shell__content::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 6px;
  border: 2px solid hsl(var(--background));
}

.quench-shell__content::-webkit-scrollbar-track {
  background: transparent;
}
</style>
