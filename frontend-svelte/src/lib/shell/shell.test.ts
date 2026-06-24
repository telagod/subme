/**
 * AppShell suite · 验证 AppSidebar + nav helpers + navFilter 契约（POC AppShell 落地）
 *
 * 测试目标（brief 要求）：
 *   1. 所有 NavGroup 标签渲染
 *   2. 命中路径的 item 加 active class
 *   3. 嵌套 children 在父 active 时展开渲染
 *
 * 不直接 mount AppShell —— AppShell 会 import $app/state，会触发 SvelteKit 虚拟模块解析
 * （vitest 默认环境无 SvelteKit runtime）。改测 AppSidebar，覆盖 brief 列的三条契约，
 * 同时附带验证 isItemActive / filterNavGroups 两条配套纯函数。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { LayoutDashboard, Users, Key, Settings } from '@lucide/svelte';
import AppSidebar from './AppSidebar.svelte';
import {
	adminNavGroups,
	userNavGroups,
	resolveNavItem,
	flatNavItems,
	isItemActive,
	type NavGroup
} from './nav';
import { applyFeatureFlags, filterNavGroups } from './navFilter';

// ── 初始化 svelte-i18n —— 测试里走 passthrough：key 即 label，断言时直接用 key 字符串。
beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── 测试 fixture：含 group 标题、单层 item、嵌套 children。
const fixtureGroups: NavGroup[] = [
	{
		key: 'main',
		labelKey: 'fixture.group.main',
		items: [
			{
				key: 'dashboard',
				labelKey: 'fixture.dashboard',
				path: '/admin/dashboard',
				icon: LayoutDashboard
			},
			{
				key: 'users',
				labelKey: 'fixture.users',
				path: '/admin/users',
				icon: Users,
				children: [
					{
						key: 'users-list',
						labelKey: 'fixture.users.list',
						path: '/admin/users/list',
						icon: Users
					},
					{
						key: 'users-roles',
						labelKey: 'fixture.users.roles',
						path: '/admin/users/roles',
						icon: Key
					}
				]
			}
		]
	},
	{
		key: 'platform',
		labelKey: 'fixture.group.platform',
		items: [
			{
				key: 'settings',
				labelKey: 'fixture.settings',
				path: '/admin/settings',
				icon: Settings
			}
		]
	}
];

describe('AppSidebar rendering', () => {
	it('renders all NavGroup label keys', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/dashboard' }
		});
		const text = container.textContent ?? '';
		expect(text).toContain('fixture.group.main');
		expect(text).toContain('fixture.group.platform');
	});

	it('renders all top-level NavItem label keys', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/dashboard' }
		});
		const text = container.textContent ?? '';
		expect(text).toContain('fixture.dashboard');
		expect(text).toContain('fixture.users');
		expect(text).toContain('fixture.settings');
	});

	it('applies active state to the matching item via data-active + aria-current', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/dashboard' }
		});
		const dashboard = container.querySelector('a[href="/admin/dashboard"]');
		expect(dashboard).not.toBeNull();
		expect(dashboard!.getAttribute('data-active')).toBe('true');
		expect(dashboard!.getAttribute('aria-current')).toBe('page');
		expect(dashboard!.classList.contains('active')).toBe(true);

		// 兄弟项不应 active
		const settings = container.querySelector('a[href="/admin/settings"]');
		expect(settings).not.toBeNull();
		expect(settings!.getAttribute('aria-current')).toBeNull();
	});

	it('expands children when any child path is active', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/users/roles' }
		});
		// 父项 users 应当被标记 active（child 命中触发父展开）
		const parent = container.querySelector('a[href="/admin/users"]');
		expect(parent!.getAttribute('data-active')).toBe('true');

		// 子项应渲染并标 active
		const child = container.querySelector('a[href="/admin/users/roles"]');
		expect(child).not.toBeNull();
		expect(child!.getAttribute('aria-current')).toBe('page');

		// 另一个未命中的子项也要渲染（兄弟）但 active=null
		const sibling = container.querySelector('a[href="/admin/users/list"]');
		expect(sibling).not.toBeNull();
		expect(sibling!.getAttribute('aria-current')).toBeNull();
	});

	it('does NOT render children when neither parent nor any child active', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/dashboard' }
		});
		// users 父项未 active 且子项也未命中 → children 不渲染
		expect(container.querySelector('a[href="/admin/users/list"]')).toBeNull();
		expect(container.querySelector('a[href="/admin/users/roles"]')).toBeNull();
	});

	it('honors collapsed prop —— width 64px and no group labels', () => {
		const { container } = render(AppSidebar, {
			props: { navGroups: fixtureGroups, activePath: '/admin/dashboard', collapsed: true }
		});
		const aside = container.querySelector('aside');
		expect(aside).not.toBeNull();
		expect(aside!.getAttribute('data-collapsed')).toBe('true');
		expect(aside!.getAttribute('style')).toContain('width: 64px');
	});
});

describe('isItemActive · 边界契约', () => {
	it('strict equality for /admin/dashboard (no prefix bleed)', () => {
		expect(isItemActive('/admin/dashboard', '/admin/dashboard')).toBe(true);
		expect(isItemActive('/admin/dashboard-x', '/admin/dashboard')).toBe(false);
		expect(isItemActive('/admin/dashboard/sub', '/admin/dashboard')).toBe(false);
	});

	it('strict equality for /dashboard (no prefix bleed)', () => {
		expect(isItemActive('/dashboard', '/dashboard')).toBe(true);
		expect(isItemActive('/dashboard-x', '/dashboard')).toBe(false);
	});

	it('prefix-with-slash for non-dashboard paths (no false /key vs /keys)', () => {
		expect(isItemActive('/keys', '/keys')).toBe(true);
		expect(isItemActive('/keys/123', '/keys')).toBe(true);
		// 关键反例：/key 不应匹配 /keys
		expect(isItemActive('/key', '/keys')).toBe(false);
	});
});

describe('navFilter pure functions', () => {
	it('applyFeatureFlags drops only explicit false', () => {
		const out = applyFeatureFlags([
			{ key: 'a', labelKey: 'a', path: '/a', icon: LayoutDashboard },
			{
				key: 'b',
				labelKey: 'b',
				path: '/b',
				icon: LayoutDashboard,
				featureFlag: () => false
			},
			{
				key: 'c',
				labelKey: 'c',
				path: '/c',
				icon: LayoutDashboard,
				featureFlag: () => undefined
			},
			{ key: 'd', labelKey: 'd', path: '/d', icon: LayoutDashboard, featureFlag: () => true }
		]);
		expect(out.map((i) => i.key)).toEqual(['a', 'c', 'd']);
	});

	it('filterNavGroups drops hideInSimpleMode items in simple mode and removes empty groups', () => {
		const groups: NavGroup[] = [
			{
				key: 'g1',
				labelKey: 'g1',
				items: [
					{
						key: 'i1',
						labelKey: 'i1',
						path: '/i1',
						icon: LayoutDashboard,
						hideInSimpleMode: true
					}
				]
			},
			{
				key: 'g2',
				labelKey: 'g2',
				items: [
					{
						key: 'i2',
						labelKey: 'i2',
						path: '/i2',
						icon: LayoutDashboard
					}
				]
			}
		];
		const full = filterNavGroups(groups, false);
		const simple = filterNavGroups(groups, true);
		expect(full.map((g) => g.key)).toEqual(['g1', 'g2']);
		expect(simple.map((g) => g.key)).toEqual(['g2']);
	});
});

describe('nav helpers · resolveNavItem / flatNavItems', () => {
	it('resolveNavItem hits admin/user defaults', () => {
		const admin = resolveNavItem('/admin/users', adminNavGroups);
		expect(admin?.item.key).toBe('users');

		const user = resolveNavItem('/keys', userNavGroups);
		expect(user?.item.key).toBe('apiKeys');

		// 路径前缀（带 /）
		const detail = resolveNavItem('/admin/users/42', adminNavGroups);
		expect(detail?.item.key).toBe('users');
	});

	it('flatNavItems flattens with groupKey + groupLabelKey', () => {
		const flat = flatNavItems(userNavGroups);
		expect(flat.length).toBeGreaterThan(0);
		const profile = flat.find((i) => i.key === 'profile');
		expect(profile).toBeDefined();
		expect(profile!.groupKey).toBe('account');
		expect(profile!.groupLabelKey).toBe('nav.app.group.account');
	});
});
