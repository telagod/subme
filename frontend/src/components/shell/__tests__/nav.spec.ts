/**
 * nav.ts spec — v.22 user-side AppShell
 *
 * 验证：
 * 1. userNavGroups paths 与已注册 user routes 对齐
 * 2. resolveNavItem 未匹配返回 null，匹配返回 group+item
 * 3. flatNavItems 接受 groups 参数并返回展平列表，带 groupKey/groupLabelKey
 */
import { describe, expect, it } from 'vitest'
import {
  adminNavGroups,
  buildUserNavGroups,
  flatNavItems,
  resolveNavItem,
  userNavGroups,
} from '../nav'

describe('nav · userNavGroups', () => {
  it('contains the expected user-side paths', () => {
    const all = userNavGroups.flatMap((g) => g.items.map((i) => i.path)).sort()
    expect(all).toEqual(
      [
        '/dashboard',
        '/keys',
        '/usage',
        '/available-channels',
        '/monitor',
        '/subscriptions',
        '/purchase',
        '/orders',
        '/redeem',
        '/affiliate',
        '/profile',
      ].sort(),
    )
  })

  it('groups items into workspace / billing / account', () => {
    const keys = userNavGroups.map((g) => g.key)
    expect(keys).toEqual(['workspace', 'billing', 'account'])
  })

  it('buildUserNavGroups injects featureFlag getters into items', () => {
    let availableCalled = 0
    const groups = buildUserNavGroups({
      flagAvailableChannels: () => {
        availableCalled++
        return false
      },
    })
    const workspace = groups.find((g) => g.key === 'workspace')!
    const ac = workspace.items.find((i) => i.key === 'availableChannels')!
    expect(ac.featureFlag?.()).toBe(false)
    expect(availableCalled).toBe(1)
  })
})

describe('nav · resolveNavItem', () => {
  it('returns null for unknown path', () => {
    expect(resolveNavItem('/nope-not-real', userNavGroups)).toBeNull()
  })

  it('matches exact and nested paths', () => {
    const r = resolveNavItem('/keys', userNavGroups)
    expect(r?.group.key).toBe('workspace')
    expect(r?.item.key).toBe('apiKeys')

    const nested = resolveNavItem('/profile/security', userNavGroups)
    expect(nested?.item.key).toBe('profile')
  })

  it('defaults to adminNavGroups when groups omitted', () => {
    const r = resolveNavItem('/admin/dashboard')
    expect(r?.group.key).toBe('cockpit')
    expect(r?.item.key).toBe('dashboard')
  })
})

describe('nav · flatNavItems', () => {
  it('flattens groups and stamps groupKey / groupLabelKey', () => {
    const flat = flatNavItems(userNavGroups)
    expect(flat.length).toBe(11)
    const apiKeys = flat.find((i) => i.key === 'apiKeys')!
    expect(apiKeys.groupKey).toBe('workspace')
    expect(apiKeys.groupLabelKey).toBe('nav.app.group.workspace')
  })

  it('defaults to adminNavGroups when groups omitted', () => {
    const flat = flatNavItems()
    const dash = flat.find((i) => i.key === 'dashboard' && i.path === '/admin/dashboard')
    expect(dash).toBeTruthy()
    expect(dash?.groupKey).toBe('cockpit')
  })

  it('admin and user groups are non-empty', () => {
    expect(adminNavGroups.length).toBeGreaterThan(0)
    expect(userNavGroups.length).toBeGreaterThan(0)
  })
})
