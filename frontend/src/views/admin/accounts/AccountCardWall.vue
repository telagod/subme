<template>
  <!-- 按分组分区的账号卡片墙 -->
  <div class="acp-wall">
    <!-- 无数据：体面空态 -->
    <div v-if="!loading && accounts.length === 0" class="acp-empty">
      <div class="acp-empty-icon">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <rect x="5" y="7" width="30" height="26" rx="5" stroke="currentColor" stroke-width="1.5"/>
          <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M12 16h16M12 22h10"/>
          <circle cx="30" cy="30" r="7" fill="transparent" stroke="currentColor" stroke-width="1.5"/>
          <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M30 27v3m0 0v3m0-3h-3m3 0h3"/>
        </svg>
      </div>
      <div class="acp-empty-text">
        <span class="acp-empty-title">{{ t('admin.accountCardWall.emptyTitle') }}</span>
        <span class="acp-empty-desc">{{ t('admin.accountCardWall.emptyDesc') }}</span>
      </div>
      <Button variant="outline" size="sm" @click="$emit('add-account')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        {{ t('admin.accountCardWall.addAccountCta') }}
      </Button>
    </div>

    <!-- 骨架 -->
    <template v-if="loading">
      <div class="acp-group">
        <div class="acp-group-label acp-skel-label"></div>
        <div class="acp-grid">
          <Card v-for="i in 6" :key="i" class="acp-card-skel p-3 flex flex-col gap-1.5 pointer-events-none">
            <div class="acp-skel acp-skel-w60"></div>
            <div class="acp-skel acp-skel-w40 acp-skel-mt"></div>
          </Card>
        </div>
      </div>
    </template>

    <!-- 分组区块 -->
    <template v-else>
      <div v-for="group in groupedAccounts" :key="group.label" class="acp-group">
        <div class="acp-group-header">
          <span class="acp-group-label">{{ group.label }}</span>
          <span class="acp-group-count">{{ group.accounts.length }}</span>
        </div>
        <div class="acp-grid">
          <Card
            v-for="account in group.accounts"
            :key="account.id"
            class="p-3 flex flex-col gap-1.5 transition-[border-color,box-shadow] duration-150 hover:border-ring/50 hover:shadow-md"
            :class="statusCardClass(account)"
          >
            <!-- 顶部：渠道 chip + 状态呼吸点 -->
            <div class="acp-card-top">
              <PlatformTypeBadge
                :platform="account.platform"
                :type="account.type"
                :plan-type="(account.credentials as any)?.plan_type"
                :privacy-mode="(account.extra as any)?.privacy_mode"
                :compact="true"
              />
              <span class="acp-breath" :class="breathClass(account)" :title="statusTitle(account)"></span>
            </div>

            <!-- 账号名 -->
            <div class="acp-card-name" :title="account.name">{{ account.name }}</div>

            <!-- email (if any) -->
            <div v-if="accountEmail(account)" class="acp-card-email">{{ accountEmail(account) }}</div>

            <!-- 利用率：concurrency bar -->
            <div class="acp-util">
              <div class="acp-util-bar-bg">
                <div
                  class="acp-util-bar"
                  :class="utilBarClass(account)"
                  :style="{ width: utilPercent(account) + '%' }"
                ></div>
              </div>
              <span class="acp-util-label">
                {{ account.current_concurrency ?? 0 }}/{{ account.concurrency }}
              </span>
            </div>

            <!-- 错误消息（若有） -->
            <div v-if="account.error_message" class="acp-card-err" :title="account.error_message">
              {{ account.error_message }}
            </div>

            <!-- 行内操作 -->
            <div class="acp-card-actions">
              <Button
                variant="ghost"
                size="icon"
                class="h-[26px] w-[26px] rounded-md border border-border text-muted-foreground hover:border-ring/50 hover:bg-muted hover:text-foreground"
                :title="account.status === 'active' ? t('admin.accountCardWall.toggleDisable') : t('admin.accountCardWall.toggleEnable')"
                :disabled="operating.has(account.id)"
                @click.stop="$emit('toggle-status', account)"
              >
                <svg v-if="account.status === 'active'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 12.728M12 3v4" /></svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-[26px] w-[26px] rounded-md border border-border text-muted-foreground hover:border-ring/50 hover:bg-muted hover:text-foreground"
                :title="t('admin.accountCardWall.refreshToken')"
                :disabled="operating.has(account.id)"
                @click.stop="$emit('refresh', account)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-[26px] w-[26px] rounded-md border border-border text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                :title="t('admin.accountCardWall.deleteBtn')"
                :disabled="operating.has(account.id)"
                @click.stop="$emit('delete', account)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account, AdminGroup } from '@/types'
import PlatformTypeBadge from '@/components/common/PlatformTypeBadge.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const props = defineProps<{
  accounts: Account[]
  groups: AdminGroup[]
  loading?: boolean
  operating: Set<number>
}>()

defineEmits<{
  'toggle-status': [account: Account]
  'refresh': [account: Account]
  'delete': [account: Account]
  'add-account': []
}>()

const { t } = useI18n()

/** 按分组聚合账号，无分组的归入"未分组" */
const groupedAccounts = computed(() => {
  const groupMap = new Map<string, { label: string; accounts: Account[] }>()

  for (const account of props.accounts) {
    const accountGroups = account.groups ?? []
    if (accountGroups.length === 0) {
      const key = '__ungrouped__'
      if (!groupMap.has(key)) groupMap.set(key, { label: t('admin.accountCardWall.ungrouped'), accounts: [] })
      groupMap.get(key)!.accounts.push(account)
    } else {
      for (const g of accountGroups) {
        const key = String(g.id)
        if (!groupMap.has(key)) groupMap.set(key, { label: g.name, accounts: [] })
        groupMap.get(key)!.accounts.push(account)
      }
    }
  }

  // 优先显示有分组的，"未分组"排末尾
  const result = []
  for (const [key, val] of groupMap.entries()) {
    if (key !== '__ungrouped__') result.push(val)
  }
  if (groupMap.has('__ungrouped__')) result.push(groupMap.get('__ungrouped__')!)
  return result
})

function accountEmail(account: Account): string {
  return (account.extra as any)?.email_address
    || (account.extra as any)?.email
    || (account.credentials as any)?.email
    || ''
}

function isRateLimited(account: Account): boolean {
  if (!account.rate_limit_reset_at) return false
  return new Date(account.rate_limit_reset_at) > new Date()
}

function breathClass(account: Account): string {
  if (account.status === 'error') return 'acp-breath-bad'
  if (isRateLimited(account)) return 'acp-breath-warn'
  if (account.status === 'inactive') return 'acp-breath-off'
  if (account.status === 'active' && account.schedulable) return 'acp-breath-ok'
  return 'acp-breath-off'
}

function statusTitle(account: Account): string {
  if (account.error_message) return account.error_message
  if (isRateLimited(account)) return t('admin.accountCardWall.rateLimited')
  return account.status
}

function statusCardClass(account: Account): string {
  if (account.status === 'error') return 'acp-card-error'
  if (isRateLimited(account)) return 'acp-card-warn'
  return ''
}

function utilPercent(account: Account): number {
  const cur = account.current_concurrency ?? 0
  const max = account.concurrency ?? 1
  if (max <= 0) return 0
  return Math.min(100, Math.round((cur / max) * 100))
}

function utilBarClass(account: Account): string {
  const pct = utilPercent(account)
  if (pct >= 100) return 'acp-util-bar-full'
  if (pct >= 80) return 'acp-util-bar-high'
  return 'acp-util-bar-ok'
}
</script>

<style scoped>
.acp-wall {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.acp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 64px 24px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.acp-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  color: hsl(var(--muted-foreground));
}

.acp-empty-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.acp-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: .01em;
}

.acp-empty-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  max-width: 280px;
  line-height: 1.6;
}

/* 分组区块 */
.acp-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.acp-group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.acp-group-count {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-radius: 99px;
  padding: 0 7px;
}

/* 卡片网格 */
.acp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}


.acp-card-error {
  border-color: hsl(var(--destructive) / 0.35);
}

.acp-card-warn {
  border-color: rgba(224, 179, 78, 0.35);
}

/* 顶部行 */
.acp-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 状态呼吸点 */
.acp-breath {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.acp-breath-ok {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
  animation: breath 2.4s ease-in-out infinite;
}

.acp-breath-warn {
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
}

.acp-breath-bad {
  background: hsl(var(--destructive));
  box-shadow: 0 0 0 2px hsl(var(--destructive) / 0.2);
}

.acp-breath-off {
  background: hsl(var(--muted-foreground) / 0.4);
}

@keyframes breath {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* 名称 */
.acp-card-name {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* email */
.acp-card-email {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 错误消息 */
.acp-card-err {
  font-size: 10px;
  color: hsl(var(--destructive));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 利用率 */
.acp-util {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.acp-util-bar-bg {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.acp-util-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

/* 利用率条：正常用 primary 色，高/满用语义状态色 */
.acp-util-bar-ok   { background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6)); }
.acp-util-bar-high { background: #f59e0b; }
.acp-util-bar-full { background: hsl(var(--destructive)); }

.acp-util-label {
  font-size: 10px;
  font-family: monospace;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

/* 行内操作 */
.acp-card-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}


.acp-skel {
  height: 12px;
  border-radius: 4px;
  background: hsl(var(--muted));
  animation: shimmer 1.4s ease-in-out infinite;
}

.acp-skel-label {
  width: 80px;
  height: 11px;
}

.acp-skel-w60 { width: 60%; }
.acp-skel-w40 { width: 40%; }
.acp-skel-mt  { margin-top: 6px; }

@keyframes shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .acp-breath-ok { animation: none; }
  .acp-skel { animation: none; opacity: 0.7; }
}
</style>
