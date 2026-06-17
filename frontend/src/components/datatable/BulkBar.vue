<template>
  <Teleport to="body">
    <div
      class="q-bulkbar"
      :class="{ 'q-bulkbar-on': count > 0 }"
      role="toolbar"
      :aria-label="`批量操作：已选 ${count} 项`"
      :aria-hidden="count === 0"
    >
      <!-- 已选计数 -->
      <span class="q-bulk-cnt">
        已选 <span class="q-bulk-num">{{ count.toLocaleString() }}</span> 项
      </span>

      <!-- 操作按钮插槽 -->
      <slot />

      <!-- 清除选择 -->
      <Button
        variant="ghost"
        size="icon"
        class="h-[26px] w-[26px] shrink-0 rounded-[7px] text-muted-foreground"
        aria-label="清除选择"
        @click="emit('clear')"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </Button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'

// ── Props ──────────────────────────────────────────────────────────────
defineProps<{
  /** 已选行数量，>0 时浮出，= 0 时收起 */
  count: number
}>()

// ── Emits ──────────────────────────────────────────────────────────────
const emit = defineEmits<{
  'clear': []
}>()
</script>

<style scoped>
/* ── BulkBar 样式 ── */
.q-bulkbar {
  position: fixed;
  left: 50%;
  /* 默认收起到底部以下，侧边栏宽度 228px 时向右偏移 114px 让条居中于主区 */
  bottom: -80px;
  transform: translateX(calc(-50% + 114px));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  z-index: 60;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.6),
    0 0 24px rgba(0, 0, 0, 0.08);
  transition: bottom 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: "Archivo", "PingFang SC", sans-serif;
  font-size: 12.5px;
  color: hsl(var(--foreground));
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
}

/* 出场：count > 0 */
.q-bulkbar-on {
  bottom: 22px;
  pointer-events: auto;
  opacity: 1;
}

/* 已选计数 */
.q-bulk-cnt {
  font-size: 12.5px;
  color: hsl(var(--muted-foreground));
}

.q-bulk-num {
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: hsl(var(--primary));
}


/* 插槽内按钮统一样式（不强制，仅提供 :slotted 钩子） */
:slotted(button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 10px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all 0.15s;
}

:slotted(button:hover) {
  background: hsl(var(--accent));
  border-color: hsl(var(--border));
}

:slotted(button.q-btn-danger) {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.35);
  background: hsl(var(--destructive) / 0.12);
}


@media (prefers-reduced-motion: reduce) {
  .q-bulkbar { transition: none; }
}
</style>
