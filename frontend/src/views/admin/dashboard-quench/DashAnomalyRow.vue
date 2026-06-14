<template>
  <div class="dq-alert-row">
    <!-- 账号池异常 -->
    <Card class="dq-alert-card rise" :style="`animation-delay:${baseDelay ?? 0}s`" role="button" tabindex="0" @click="$emit('nav', '/admin/accounts')" @keyup.enter="$emit('nav', '/admin/accounts')">
      <div class="dq-ac-head">
        <span class="dq-ac-title">{{ t('admin.dashboardQuench.anomalyAccountPool') }}</span>
        <span class="dq-ac-more">{{ t('admin.dashboardQuench.anomalyViewMore') }}</span>
      </div>
      <div class="dq-ac-nums">
        <div class="dq-ac-num">
          <span class="sdot" :class="(errorAccounts ?? 0) > 0 ? 'bad' : 'ok'"></span>
          <span class="dq-ac-val" :class="(errorAccounts ?? 0) > 0 ? 'dq-bad' : ''">{{ errorAccounts ?? 0 }}</span>
          <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyErrors') }}</span>
        </div>
        <div class="dq-ac-num">
          <span class="sdot" :class="(ratelimitAccounts ?? 0) > 0 ? 'warn' : 'ok'"></span>
          <span class="dq-ac-val" :class="(ratelimitAccounts ?? 0) > 0 ? 'dq-warn' : ''">{{ ratelimitAccounts ?? 0 }}</span>
          <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyRateLimit') }}</span>
        </div>
        <div class="dq-ac-num">
          <span class="sdot ok"></span>
          <span class="dq-ac-val dq-ok">{{ normalAccounts ?? 0 }}</span>
          <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyNormal') }}</span>
        </div>
      </div>
      <div class="dq-ac-total">{{ t('admin.dashboardQuench.anomalyTotalAccounts', { n: totalAccounts ?? 0 }) }}</div>
    </Card>

    <!-- 未处理告警 -->
    <Card class="dq-alert-card rise" :style="`animation-delay:${(baseDelay ?? 0) + 0.04}s`" role="button" tabindex="0" @click="$emit('nav', '/admin/ops')" @keyup.enter="$emit('nav', '/admin/ops')">
      <div class="dq-ac-head">
        <span class="dq-ac-title">{{ t('admin.dashboardQuench.anomalyAlerts') }}</span>
        <span class="dq-ac-more">{{ t('admin.dashboardQuench.anomalyViewMore') }}</span>
      </div>
      <div v-if="alertsLoading" class="dq-ac-spin"><LoadingSpinner size="sm" /></div>
      <template v-else>
        <div class="dq-ac-nums">
          <div class="dq-ac-num">
            <span class="sdot" :class="(firingCount ?? 0) > 0 ? 'bad' : 'ok'"></span>
            <span class="dq-ac-val" :class="(firingCount ?? 0) > 0 ? 'dq-bad' : ''">{{ firingCount ?? 0 }}</span>
            <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyFiring') }}</span>
          </div>
          <div class="dq-ac-num">
            <span class="sdot dim"></span>
            <span class="dq-ac-val">{{ resolvedCount }}</span>
            <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyResolved') }}</span>
          </div>
        </div>
        <div v-if="latestTitle" class="dq-ac-latest">
          <Badge variant="outline" :class="latestSeverity === 'critical' ? 'bg-destructive/15 text-destructive border-transparent' : latestSeverity === 'warning' ? 'bg-amber-500/15 text-amber-500 border-transparent' : 'bg-primary/15 text-primary border-transparent'">{{ latestSeverity }}</Badge>
          <span class="dq-al-title">{{ latestTitle }}</span>
        </div>
        <div v-else class="dq-ac-ok">{{ t('admin.dashboardQuench.anomalyNoAlerts') }}</div>
      </template>
    </Card>

    <!-- API Keys -->
    <Card class="dq-alert-card rise" :style="`animation-delay:${(baseDelay ?? 0) + 0.08}s`" role="button" tabindex="0" @click="$emit('nav', '/admin/users')" @keyup.enter="$emit('nav', '/admin/users')">
      <div class="dq-ac-head">
        <span class="dq-ac-title">API Keys</span>
        <span class="dq-ac-more">{{ t('admin.dashboardQuench.anomalyViewMore') }}</span>
      </div>
      <div class="dq-ac-nums">
        <div class="dq-ac-num">
          <span class="sdot ok"></span>
          <span class="dq-ac-val dq-ok">{{ activeKeys ?? 0 }}</span>
          <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyKeyActive') }}</span>
        </div>
        <div class="dq-ac-num">
          <span class="sdot dim"></span>
          <span class="dq-ac-val">{{ inactiveKeys }}</span>
          <span class="dq-ac-lbl">{{ t('admin.dashboardQuench.anomalyKeyInactive') }}</span>
        </div>
      </div>
      <div class="dq-ac-total">{{ t('admin.dashboardQuench.anomalyTotalKeys', { n: totalKeys ?? 0 }) }}</div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()

const props = defineProps<{
  baseDelay?: number
  errorAccounts?: number
  ratelimitAccounts?: number
  normalAccounts?: number
  totalAccounts?: number
  activeKeys?: number
  totalKeys?: number
  alertsLoading?: boolean
  firingCount?: number
  resolvedCount?: number
  latestTitle?: string | null
  latestSeverity?: string | null
}>()

defineEmits<{ nav: [path: string] }>()

const inactiveKeys = computed(() => (props.totalKeys ?? 0) - (props.activeKeys ?? 0))
</script>

<style scoped>
.dq-alert-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 900px) { .dq-alert-row { grid-template-columns: 1fr 1fr; } }
@media (max-width: 540px) { .dq-alert-row { grid-template-columns: 1fr; } }

.dq-alert-card {
  padding: 14px 16px; cursor: pointer; transition: border-color .15s;
}
.dq-alert-card:hover { border-color: hsl(var(--primary) / .45); }
.dq-alert-card:focus-visible { outline: 2px solid hsl(var(--primary) / .6); outline-offset: 2px; }

.dq-ac-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dq-ac-title { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.dq-ac-more { font-size: 11px; color: hsl(var(--muted-foreground)); opacity: 0; transition: opacity .15s; }
.dq-alert-card:hover .dq-ac-more { opacity: 1; }

.dq-ac-nums { display: flex; gap: 18px; }
.dq-ac-num { display: flex; align-items: center; gap: 6px; }
.dq-ac-val { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: hsl(var(--foreground)); }
.dq-ac-lbl { font-size: 11px; color: hsl(var(--muted-foreground)); }
.dq-ac-total { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 8px; }
.dq-ac-ok { font-size: 12px; color: #46C98C; margin-top: 8px; }
.dq-ac-spin { display: flex; justify-content: center; padding: 8px 0; }
.dq-ac-latest { display: flex; align-items: center; gap: 7px; margin-top: 8px; overflow: hidden; }
.dq-al-title { font-size: 11.5px; color: hsl(var(--foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dq-ok  { color: #46C98C; }
.dq-bad { color: hsl(var(--destructive)); }
.dq-warn { color: #E0B34E; }

.sdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sdot.ok   { background: #46C98C; }
.sdot.warn { background: #E0B34E; animation: pulse-w 2s infinite; }
.sdot.bad  { background: hsl(var(--destructive)); }
.sdot.dim  { background: hsl(var(--muted-foreground)); }
@keyframes pulse-w { 0%,100%{ box-shadow:0 0 0 0 rgb(224 179 78 / .5);} 50%{ box-shadow:0 0 0 5px rgb(224 179 78 / 0);} }

.rise { opacity: 0; transform: translateY(10px); animation: rise .5s cubic-bezier(.22,.68,0,1.2) forwards; }
@keyframes rise { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } .sdot.warn { animation: none; } }
</style>
