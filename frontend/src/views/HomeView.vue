<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="homeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- HTML mode - SECURITY: homeContent is admin-only setting, XSS risk is acceptable -->
    <div v-else v-html="homeContent"></div>
  </div>

  <!-- Default Home Page -->
  <div v-else class="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
    <!-- Background decorations -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        class="absolute inset-0 bg-[linear-gradient(rgba(127,127,127,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(127,127,127,0.04)_1px,transparent_1px)] bg-[size:64px_64px]"
      ></div>
      <div class="absolute -top-40 -right-20 h-[420px] w-[420px] rounded-full bg-primary/8 blur-3xl"></div>
      <div class="absolute top-1/2 -left-20 h-[360px] w-[360px] rounded-full bg-primary/5 blur-3xl"></div>
    </div>
    <!-- Header -->
    <header class="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <nav class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div class="flex items-center gap-3">
          <div class="h-8 w-8 overflow-hidden rounded-lg">
            <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <span class="text-[15px] font-bold tracking-tight">{{ siteName }}</span>
        </div>

        <div class="flex items-center gap-2">
          <LocaleSwitcher />
          <Button
            v-if="docUrl"
            as-child
            variant="ghost"
            size="sm"
          >
            <a
              :href="docUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen :size="14" />
              <span class="hidden sm:inline">{{ t('home.docs') }}</span>
            </a>
          </Button>
          <Button as-child variant="ghost" size="sm">
            <a :href="githubUrl" target="_blank" rel="noopener noreferrer">
              <Github :size="14" />
              <span class="hidden sm:inline">GitHub</span>
            </a>
          </Button>
          <Button as-child size="sm">
            <router-link :to="isAuthenticated ? dashboardPath : '/login'">
              <span
                v-if="isAuthenticated && userInitial"
                class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-semibold"
              >{{ userInitial }}</span>
              {{ isAuthenticated ? t('home.dashboard') : t('home.login') }}
              <ArrowRight :size="13" />
            </router-link>
          </Button>
        </div>
      </nav>
    </header>

    <!-- Main -->
    <main class="relative z-10 flex-1 px-6">
      <div class="mx-auto max-w-6xl">
        <!-- ═══ Hero ═══ -->
        <section class="flex flex-col items-center gap-14 pb-20 pt-20 lg:flex-row lg:gap-16 lg:pt-24">
          <!-- Left -->
          <div class="q-rise flex-1 text-center lg:text-left">
            <div
              class="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.22em] text-primary"
            >
              <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></i>
              {{ t('home.quench.eyebrow') }}
            </div>

            <h1 class="mt-5 text-[clamp(40px,6vw,64px)] font-extrabold leading-[1.05] tracking-tight">
              {{ siteName }}
            </h1>
            <p class="mt-4 text-[clamp(18px,2.2vw,23px)] font-semibold text-foreground">{{ siteSubtitle }}</p>
            <p class="mt-2.5 max-w-[480px] text-sm leading-7 text-muted-foreground max-lg:mx-auto">
              {{ t('home.heroDescription') }}
            </p>

            <div class="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Button as-child size="lg">
                <router-link :to="isAuthenticated ? dashboardPath : '/login'">
                  {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
                  <ArrowRight :size="15" />
                </router-link>
              </Button>
              <Button
                v-if="docUrl"
                as-child
                variant="outline"
                size="lg"
              >
                <a
                  :href="docUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('home.viewDocs') }}
                </a>
              </Button>
            </div>

            <!-- Stats -->
            <div class="mt-9 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <div class="font-mono text-xs text-muted-foreground">{{ t('home.quench.stats.providers') }}</div>
              <Separator orientation="vertical" class="h-3.5" />
              <div class="font-mono text-xs text-muted-foreground">{{ t('home.quench.stats.protocol') }}</div>
              <Separator orientation="vertical" class="h-3.5" />
              <div class="font-mono text-xs text-muted-foreground">{{ t('home.quench.stats.billing') }}</div>
            </div>
          </div>

          <!-- Right: Gateway Trace -->
          <div class="q-rise flex flex-1 justify-center lg:justify-end" style="animation-delay: 0.12s">
            <Card class="w-[440px] max-w-full overflow-hidden shadow-xl">
              <div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <div class="flex gap-1.5">
                  <i class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></i>
                  <i class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></i>
                  <i class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></i>
                </div>
                <span class="font-mono text-[11px] text-muted-foreground">gateway · trace</span>
                <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-primary">
                  <i class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></i>LIVE
                </span>
              </div>
              <div class="px-5 py-[18px] font-mono text-[13px] leading-[2.1]">
                <div class="q-line q-l1 flex items-center gap-2.5">
                  <span class="font-semibold text-primary">POST</span>
                  <span class="text-foreground">/v1/messages</span>
                  <span class="ml-auto rounded bg-emerald-500/10 px-2 py-px text-[11px] font-semibold text-emerald-500">200</span>
                  <span class="text-[11px] text-muted-foreground">1.24s</span>
                </div>
                <div class="q-line q-l2 flex items-center gap-2.5">
                  <span class="text-muted-foreground">├─</span><span class="w-14 text-muted-foreground">auth</span>
                  <span class="text-xs text-foreground">key sk-…f8a2</span><span class="ml-auto text-xs text-emerald-500">✓</span>
                </div>
                <div class="q-line q-l3 flex items-center gap-2.5">
                  <span class="text-muted-foreground">├─</span><span class="w-14 text-muted-foreground">route</span>
                  <span class="text-xs text-foreground">claude-pro <span class="text-primary">→</span> pool-01</span><span class="ml-auto text-xs text-emerald-500">✓</span>
                </div>
                <div class="q-line q-l4 flex items-center gap-2.5">
                  <span class="text-muted-foreground">├─</span><span class="w-14 text-muted-foreground">stream</span>
                  <span class="text-xs text-foreground">first token <b class="font-semibold text-primary">380ms</b></span><span class="ml-auto text-xs text-emerald-500">✓</span>
                </div>
                <div class="q-line q-l5 flex items-center gap-2.5">
                  <span class="text-muted-foreground">└─</span><span class="w-14 text-muted-foreground">billing</span>
                  <span class="text-xs font-medium text-foreground">$0.0042 deducted</span><span class="ml-auto text-xs text-emerald-500">✓</span>
                </div>
                <div class="q-line q-l6 flex items-center gap-2.5">
                  <span class="font-bold text-primary">$</span><span class="q-cursor"></span>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <!-- Feature Tags pills -->
        <section class="pb-12 pt-2">
          <div class="flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline" class="gap-2 px-4 py-2 text-[12.5px]">
              <ArrowLeftRight :size="13" />
              {{ t('home.tags.subscriptionToApi') }}
            </Badge>
            <Badge variant="outline" class="gap-2 px-4 py-2 text-[12.5px]">
              <ShieldCheck :size="13" />
              {{ t('home.tags.stickySession') }}
            </Badge>
            <Badge variant="outline" class="gap-2 px-4 py-2 text-[12.5px]">
              <BarChart3 :size="13" />
              {{ t('home.tags.realtimeBilling') }}
            </Badge>
          </div>
        </section>

        <!-- ═══ Capabilities ═══ -->
        <section class="pb-20">
          <div class="mb-10 text-center">
            <h2 class="text-[26px] font-bold tracking-tight">{{ t('home.quench.capabilitiesTitle') }}</h2>
            <p class="mt-2 text-[13px] text-muted-foreground">{{ t('home.quench.capabilitiesDesc') }}</p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card
              v-for="(cap, i) in capabilities"
              :key="cap.title"
              class="q-rise transition-colors hover:border-primary/40"
              :style="{ animationDelay: `${0.05 * i}s` }"
            >
              <CardContent class="p-[22px]">
                <div
                  class="grid h-[38px] w-[38px] place-items-center rounded-[9px] border border-primary/20 bg-primary/10 text-primary"
                >
                  <component :is="cap.icon" :size="18" />
                </div>
                <h3 class="mt-4 text-[14.5px] font-semibold">{{ cap.title }}</h3>
                <p class="mt-[7px] text-[12.5px] leading-7 text-muted-foreground">{{ cap.desc }}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <!-- ═══ Providers ═══ -->
        <section class="pb-20">
          <div class="mb-8 text-center">
            <h2 class="text-[26px] font-bold tracking-tight">{{ t('home.providers.title') }}</h2>
            <p class="mt-2 text-[13px] text-muted-foreground">{{ t('home.providers.description') }}</p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <div
              v-for="p in providers"
              :key="p.name"
              class="inline-flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-2.5"
              :class="{ 'opacity-50': p.soon }"
            >
              <span
                class="grid h-[26px] w-[26px] place-items-center rounded-[7px] border border-border bg-muted text-[11px] font-extrabold text-foreground"
              >{{ p.mark }}</span>
              <span class="text-[13px] font-medium">{{ p.name }}</span>
              <Badge :variant="p.soon ? 'secondary' : 'outline'" :class="p.soon ? '' : 'text-emerald-500'">
                {{ p.soon ? t('home.providers.soon') : t('home.providers.supported') }}
              </Badge>
            </div>
          </div>
        </section>

        <!-- ═══ CTA band ═══ -->
        <section class="pb-24">
          <Card
            class="flex flex-wrap items-center justify-between gap-6 px-[38px] py-[34px] shadow-lg"
          >
            <div>
              <h2 class="text-[21px] font-bold">{{ t('home.quench.ctaTitle') }}</h2>
              <p class="mt-1.5 text-[13px] text-muted-foreground">{{ t('home.quench.ctaDesc') }}</p>
            </div>
            <Button as-child size="lg" class="shrink-0">
              <router-link :to="isAuthenticated ? dashboardPath : '/login'">
                {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
                <ArrowRight :size="15" />
              </router-link>
            </Button>
          </Card>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer class="relative z-10 border-t border-border px-6 py-8">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left"
      >
        <p class="text-[12.5px] text-muted-foreground">
          &copy; {{ currentYear }} {{ siteName }}. {{ t('home.footer.allRightsReserved') }}
        </p>
        <div class="flex items-center gap-5">
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t('home.docs') }}
          </a>
          <a
            :href="githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Github,
  Network,
  Boxes,
  Wallet,
  Activity,
  ShieldCheck,
  Route,
} from 'lucide-vue-next'

const { t } = useI18n()

const authStore = useAuthStore()
const appStore = useAppStore()

// Site settings - directly from appStore (already initialized from injected config)
const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'subme')
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || t('home.heroSubtitle'))
const docUrl = computed(() => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || '')
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')

// Check if homeContent is a URL (for iframe display)
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

const githubUrl = 'https://github.com/telagod/subme'

// Auth state
const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => (isAdmin.value ? '/admin/dashboard' : '/dashboard'))
const userInitial = computed(() => {
  const email = authStore.user?.email
  return email ? email.charAt(0).toUpperCase() : ''
})

// Capability grid: 接入 → 调度 → 计费 → 监控 → 风控 → 会话
const capabilities = computed(() => [
  { icon: Network, title: t('home.features.unifiedGateway'), desc: t('home.features.unifiedGatewayDesc') },
  { icon: Boxes, title: t('home.features.multiAccount'), desc: t('home.features.multiAccountDesc') },
  { icon: Wallet, title: t('home.features.balanceQuota'), desc: t('home.features.balanceQuotaDesc') },
  { icon: Activity, title: t('home.quench.features.realtimeUsage'), desc: t('home.quench.features.realtimeUsageDesc') },
  { icon: ShieldCheck, title: t('home.quench.features.riskControl'), desc: t('home.quench.features.riskControlDesc') },
  { icon: Route, title: t('home.quench.features.stickySession'), desc: t('home.quench.features.stickySessionDesc') },
])

const providers = computed(() => [
  { mark: 'C', name: t('home.providers.claude'), soon: false },
  { mark: 'G', name: 'GPT', soon: false },
  { mark: 'G', name: t('home.providers.gemini'), soon: false },
  { mark: 'A', name: t('home.providers.antigravity'), soon: false },
  { mark: '+', name: t('home.providers.more'), soon: true },
])

// Current year for footer
const currentYear = computed(() => new Date().getFullYear())

onMounted(() => {
  // Check auth state
  authStore.checkAuth()

  // Ensure public settings are loaded (will use cache if already loaded from injected config)
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>

<style scoped>
/* 入场编排（纯视觉，无 QUENCH 变量） */
.q-rise {
  opacity: 0;
  transform: translateY(10px);
  animation: q-rise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes q-rise {
  to {
    opacity: 1;
    transform: none;
  }
}

/* Gateway Trace: 逐行入场 + 光标闪烁 */
.q-line {
  opacity: 0;
  animation: q-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
.q-l1 { animation-delay: 0.35s; }
.q-l2 { animation-delay: 0.8s; }
.q-l3 { animation-delay: 1.15s; }
.q-l4 { animation-delay: 1.5s; }
.q-l5 { animation-delay: 1.85s; }
.q-l6 { animation-delay: 2.3s; }
.q-cursor {
  display: inline-block;
  width: 8px;
  height: 15px;
  background: hsl(var(--primary));
  animation: q-blink 1.1s step-end infinite;
}
@keyframes q-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 动效降级 */
@media (prefers-reduced-motion: reduce) {
  .q-rise,
  .q-line {
    opacity: 1;
    transform: none;
    animation: none;
  }
  .q-cursor {
    animation: none;
  }
}
</style>
