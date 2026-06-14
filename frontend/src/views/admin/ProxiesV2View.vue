<template>
  <AppLayout>
    <ResourcePage ref="pageRef" :resource="enrichedResource">
      <!-- 协议 badge -->
      <template #cell-protocol="{ value }">
        <Badge
          v-if="value"
          :variant="String(value).startsWith('socks5') ? 'default' : 'secondary'"
          class="font-mono text-[10.5px] font-bold tracking-widest"
        >
          {{ String(value).toUpperCase() }}
        </Badge>
        <span v-else class="text-muted-foreground">-</span>
      </template>

      <!-- 主机:端口 mono -->
      <template #cell-host_port="{ row }">
        <code class="font-mono text-[11.5px] text-foreground">{{ row.host }}:{{ row.port }}</code>
      </template>

      <!-- 状态点 + 文字 -->
      <template #cell-status="{ value }">
        <span class="inline-flex items-center gap-1.5">
          <span
            class="h-[7px] w-[7px] shrink-0 rounded-full"
            :class="{
              'bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.5)]': value === 'active',
              'bg-destructive': value === 'inactive' || value === 'expired'
            }"
          ></span>
          <span class="text-xs text-foreground">
            {{ value === 'active' ? '活跃' : value === 'inactive' ? '禁用' : '已过期' }}
          </span>
        </span>
      </template>

      <!-- 账号数 -->
      <template #cell-account_count="{ value }">
        <span class="font-mono text-[11.5px] text-muted-foreground">{{ value ?? 0 }}</span>
      </template>

      <!-- 创建时间 -->
      <template #cell-created_at="{ value }">
        <span class="text-[11.5px] text-muted-foreground">{{ formatDate(value as string) }}</span>
      </template>
    </ResourcePage>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { ResourcePage } from '@/resource'
import { Badge } from '@/components/ui/badge'
import { proxiesResource } from '@/resource/resources/proxies'
import type { ResourceDef, RowAction } from '@/resource/types'
import type { Proxy } from '@/types'
import { adminAPI } from '@/api/admin'

const pageRef = ref<InstanceType<typeof ResourcePage> | null>(null)

function formatDate(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

// 注入行操作（需要访问 pageRef 打开抽屉）
const enrichedResource = computed<ResourceDef>(() => ({
  ...(proxiesResource as unknown as ResourceDef),
  rowActions: [
    {
      key: 'edit',
      label: '编辑',
      handler(row) {
        // 注入 _isEdit 标记，让 status 字段 showWhen 可感知
        pageRef.value?.openEditDrawer({ ...row, _isEdit: true })
      }
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      async handler(row) {
        const proxy = row as unknown as Proxy
        if (!confirm(`确认删除代理「${proxy.name}」？此操作不可撤销。`)) return
        await adminAPI.proxies.delete(proxy.id)
        pageRef.value?.reload()
      }
    }
  ] as RowAction<Record<string, unknown>>[]
}))
</script>
