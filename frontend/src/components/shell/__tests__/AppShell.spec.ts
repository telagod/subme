/**
 * AppShell + AppSidebarShell + useNavFiltered spec — v.22
 *
 * 验证：
 * 1. AppShell 渲染 sidebar + topbar + slot；navGroups 驱动 router-link
 * 2. showCommandPalette=true 渲染 CommandPalette，false 不渲染
 * 3. useNavFiltered.applyFeatureFlags: featureFlag()===false 隐藏；undefined/true 显示
 * 4. filterNavGroups: isSimpleMode 时剔除 hideInSimpleMode 项；空 group 被剔除
 */
import { defineComponent, h, ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, beforeEach } from 'vitest'

import AppShell from '../AppShell.vue'
import AppSidebarShell from '../AppSidebarShell.vue'
import { applyFeatureFlags, filterNavGroups, useNavFiltered } from '../useNavFiltered'
import type { NavGroup, NavItem } from '../nav'
import { LayoutDashboard, Key } from 'lucide-vue-next'

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackWarn: false,
    missingWarn: false,
    messages: {
      en: {
        nav: {
          dashboard: 'Dashboard',
          apiKeys: 'API Keys',
          profile: 'Profile',
          logout: 'Logout',
          lightMode: 'Light Mode',
          darkMode: 'Dark Mode',
          quench: {
            openCommandPalette: 'Open command palette',
            searchPlaceholder: 'Search…',
            commandPalette: 'Command Palette',
            commandPalettePlaceholder: 'Search…',
            noResults: 'No results',
          },
          app: {
            group: {
              workspace: 'Workspace',
              billing: 'Billing',
              account: 'Account',
            },
          },
        },
      },
    },
  })
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/dashboard', component: { template: '<div/>' } },
      { path: '/keys', component: { template: '<div/>' } },
      { path: '/profile', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
    ],
  })
}

const sampleGroups: NavGroup[] = [
  {
    key: 'workspace',
    labelKey: 'nav.app.group.workspace',
    items: [
      { key: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard },
      { key: 'apiKeys', labelKey: 'nav.apiKeys', path: '/keys', icon: Key },
    ],
  },
]

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useNavFiltered · applyFeatureFlags', () => {
  it('hides items whose featureFlag returns false', () => {
    const items: NavItem[] = [
      { key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard, featureFlag: () => false },
      { key: 'b', labelKey: 'b', path: '/b', icon: LayoutDashboard, featureFlag: () => true },
    ]
    const out = applyFeatureFlags(items)
    expect(out.map((i) => i.key)).toEqual(['b'])
  })

  it('keeps items whose featureFlag returns undefined (lenient: settings not loaded)', () => {
    const items: NavItem[] = [
      { key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard, featureFlag: () => undefined },
      { key: 'b', labelKey: 'b', path: '/b', icon: LayoutDashboard },
    ]
    const out = applyFeatureFlags(items)
    expect(out.map((i) => i.key)).toEqual(['a', 'b'])
  })
})

describe('useNavFiltered · filterNavGroups', () => {
  it('drops hideInSimpleMode items in simple mode and empties empty groups', () => {
    const groups: NavGroup[] = [
      {
        key: 'g1',
        labelKey: 'g1',
        items: [
          { key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard, hideInSimpleMode: true },
          { key: 'b', labelKey: 'b', path: '/b', icon: LayoutDashboard },
        ],
      },
      {
        key: 'g2',
        labelKey: 'g2',
        items: [
          { key: 'c', labelKey: 'c', path: '/c', icon: LayoutDashboard, hideInSimpleMode: true },
        ],
      },
    ]
    const out = filterNavGroups(groups, true)
    expect(out.length).toBe(1)
    expect(out[0].key).toBe('g1')
    expect(out[0].items.map((i) => i.key)).toEqual(['b'])
  })

  it('keeps everything when not simple mode (featureFlag still respected)', () => {
    const groups: NavGroup[] = [
      {
        key: 'g1',
        labelKey: 'g1',
        items: [
          { key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard, hideInSimpleMode: true },
          { key: 'b', labelKey: 'b', path: '/b', icon: LayoutDashboard, featureFlag: () => false },
          { key: 'c', labelKey: 'c', path: '/c', icon: LayoutDashboard },
        ],
      },
    ]
    const out = filterNavGroups(groups, false)
    expect(out[0].items.map((i) => i.key)).toEqual(['a', 'c'])
  })
})

describe('useNavFiltered · composable reactivity', () => {
  it('reacts to isSimpleMode changes', () => {
    const groups = computed(() => [
      {
        key: 'g',
        labelKey: 'g',
        items: [
          { key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard, hideInSimpleMode: true },
          { key: 'b', labelKey: 'b', path: '/b', icon: LayoutDashboard },
        ],
      },
    ])
    const simple = ref(false)
    const filtered = useNavFiltered(groups, simple)
    expect(filtered.value[0].items.length).toBe(2)
    simple.value = true
    expect(filtered.value[0].items.length).toBe(1)
    expect(filtered.value[0].items[0].key).toBe('b')
  })
})

describe('AppSidebarShell', () => {
  it('renders one router-link per nav item with correct paths', async () => {
    const router = makeRouter()
    await router.push('/dashboard')
    await router.isReady()
    const wrapper = mount(AppSidebarShell, {
      props: { navGroups: sampleGroups, brandLabel: 'USER' },
      global: { plugins: [router, makeI18n()] },
    })
    const links = wrapper.findAll('a[href]')
    const hrefs = links.map((l) => l.attributes('href'))
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/keys')
  })

  it('omits brand label when brandLabel is empty', () => {
    const router = makeRouter()
    const wrapper = mount(AppSidebarShell, {
      props: { navGroups: sampleGroups },
      global: { plugins: [router, makeI18n()] },
    })
    // brand label span has tracking-[0.22em]
    expect(wrapper.find('span.tracking-\\[0\\.22em\\]').exists()).toBe(false)
  })
})

describe('AppShell', () => {
  it('renders sidebar + topbar + slot', async () => {
    const router = makeRouter()
    await router.push('/dashboard')
    await router.isReady()
    const wrapper = mount(AppShell, {
      props: { navGroups: sampleGroups, brandLabel: 'USER' },
      slots: { default: '<div class="payload">CHILD</div>' },
      global: { plugins: [router, makeI18n()] },
    })
    expect(wrapper.html()).toContain('CHILD')
    expect(wrapper.find('aside').exists()).toBe(true)
    expect(wrapper.find('header').exists()).toBe(true)
  })

  it('does NOT render CommandPalette when showCommandPalette=false', async () => {
    const router = makeRouter()
    await router.push('/dashboard')
    await router.isReady()
    const wrapper = mount(AppShell, {
      props: { navGroups: sampleGroups, showCommandPalette: false },
      global: { plugins: [router, makeI18n()] },
    })
    // CommandPalette button has data-tour="cmdk" in the topbar; when hidden, no such trigger
    expect(wrapper.find('[data-tour="cmdk"]').exists()).toBe(false)
  })

  it('renders CommandPalette trigger when showCommandPalette=true', async () => {
    const router = makeRouter()
    await router.push('/dashboard')
    await router.isReady()
    const wrapper = mount(AppShell, {
      props: { navGroups: sampleGroups, showCommandPalette: true },
      global: { plugins: [router, makeI18n()] },
    })
    expect(wrapper.find('[data-tour="cmdk"]').exists()).toBe(true)
  })
})

// Silence unused-import lint for defineComponent/h kept for future shallow stubs
void defineComponent
void h
