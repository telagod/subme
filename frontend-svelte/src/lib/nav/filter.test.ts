/**
 * filter.ts 单元测试
 *
 * 覆盖：
 *   1. 空输入 → 空输出
 *   2. 所有 flag 命中 → 全部保留
 *   3. featureFlag 不在 set → 项被丢弃
 *   4. 简易模式 + hideInSimpleMode → 项被丢弃
 *   5. 嵌套混合组 → 仅保留有效项 + 空组移除
 *   6. items 全空的 group → 整组移除
 *
 * 说明：构造 fixture 时 icon 字段强制 typecast 为 any 以避免在测试里引入 svelte runtime。
 * 这是 *测试 fixture* 的合理特例（generated icon 类型在 vitest 下解析成本高），
 * 仍维持 NavItem 形状约束。
 */
import { describe, it, expect } from 'vitest';
import { filterNavGroups } from './filter';
import type { NavGroup, NavItem } from './types';

// ---- helpers --------------------------------------------------------------

// fixture-only icon stub；filter 纯逻辑层不读 icon，故占位即可。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON: any = (() => null) as unknown;

function item(partial: Partial<NavItem> & Pick<NavItem, 'key'>): NavItem {
	return {
		labelKey: `nav.${partial.key}`,
		path: `/${partial.key}`,
		icon: ICON,
		...partial
	};
}

function group(key: string, items: NavItem[]): NavGroup {
	return { key, labelKey: `group.${key}`, items };
}

// ---- tests ----------------------------------------------------------------

describe('filterNavGroups', () => {
	it('空输入 → 空输出', () => {
		const out = filterNavGroups([], {
			featureFlags: new Set<string>(),
			isSimpleMode: false
		});
		expect(out).toEqual([]);
	});

	it('所有 flag 满足 → 项全部保留', () => {
		const groups: NavGroup[] = [
			group('workspace', [
				item({ key: 'dashboard' }),
				item({ key: 'orders', featureFlag: 'payment' }),
				item({ key: 'affiliate', featureFlag: 'affiliate' })
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set(['payment', 'affiliate']),
			isSimpleMode: false
		});

		expect(out).toHaveLength(1);
		expect(out[0].items.map((i) => i.key)).toEqual(['dashboard', 'orders', 'affiliate']);
	});

	it('featureFlag 不在 set → 项被丢弃；无 flag 项始终保留', () => {
		const groups: NavGroup[] = [
			group('billing', [
				item({ key: 'mySubscriptions' }), // 无 flag → 保留
				item({ key: 'buySubscription', featureFlag: 'payment' }), // flag 缺 → 丢
				item({ key: 'affiliate', featureFlag: 'affiliate' }) // flag 缺 → 丢
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set<string>(), // 全空
			isSimpleMode: false
		});

		expect(out).toHaveLength(1);
		expect(out[0].items.map((i) => i.key)).toEqual(['mySubscriptions']);
	});

	it('简易模式 + hideInSimpleMode → 项被丢弃', () => {
		const groups: NavGroup[] = [
			group('workspace', [
				item({ key: 'dashboard' }), // 不标记 → 保留
				item({ key: 'usage', hideInSimpleMode: true }), // 简易模式丢
				item({ key: 'apiKeys' }) // 不标记 → 保留
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set<string>(),
			isSimpleMode: true
		});

		expect(out).toHaveLength(1);
		expect(out[0].items.map((i) => i.key)).toEqual(['dashboard', 'apiKeys']);
	});

	it('简易模式 + 全部 hideInSimpleMode → 该组整组移除', () => {
		const groups: NavGroup[] = [
			group('workspace', [item({ key: 'dashboard' })]),
			group('billing', [
				item({ key: 'mySubscriptions', hideInSimpleMode: true }),
				item({ key: 'buySubscription', hideInSimpleMode: true })
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set<string>(),
			isSimpleMode: true
		});

		expect(out.map((g) => g.key)).toEqual(['workspace']);
	});

	it('混合 flag + simple-mode + 多组 → 仅保留有效项', () => {
		const groups: NavGroup[] = [
			group('workspace', [
				item({ key: 'dashboard' }),
				item({ key: 'usage', hideInSimpleMode: true }),
				item({ key: 'channelStatus', featureFlag: 'channelMonitor' })
			]),
			group('billing', [
				item({ key: 'mySubscriptions', hideInSimpleMode: true }),
				item({ key: 'buySubscription', hideInSimpleMode: true, featureFlag: 'payment' }),
				item({ key: 'redeem', hideInSimpleMode: true })
			]),
			group('account', [item({ key: 'profile' })])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set(['channelMonitor']), // payment 缺
			isSimpleMode: false
		});

		expect(out.map((g) => g.key)).toEqual(['workspace', 'billing', 'account']);

		const workspace = out.find((g) => g.key === 'workspace')!;
		expect(workspace.items.map((i) => i.key)).toEqual(['dashboard', 'usage', 'channelStatus']);

		const billing = out.find((g) => g.key === 'billing')!;
		// payment 缺 → buySubscription 丢；其余 hideInSimpleMode 在非简易模式都保留
		expect(billing.items.map((i) => i.key)).toEqual(['mySubscriptions', 'redeem']);

		const account = out.find((g) => g.key === 'account')!;
		expect(account.items.map((i) => i.key)).toEqual(['profile']);
	});

	it('group.items 为空 → 整组移除（即使 flags 全开）', () => {
		const groups: NavGroup[] = [
			group('empty', []), // 直接空
			group('workspace', [item({ key: 'dashboard' })])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set<string>(['everything']),
			isSimpleMode: false
		});

		expect(out.map((g) => g.key)).toEqual(['workspace']);
	});

	it('递归 children：父项保留 / 全部子项被过滤 → 父项作废', () => {
		const groups: NavGroup[] = [
			group('platform', [
				item({
					key: 'settings',
					children: [
						item({ key: 'general', featureFlag: 'never' }),
						item({ key: 'security', featureFlag: 'never' })
					]
				}),
				item({
					key: 'announcements',
					children: [
						item({ key: 'inbox' }),
						item({ key: 'archive', featureFlag: 'archive' })
					]
				})
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set<string>(), // 'never' / 'archive' 全无
			isSimpleMode: false
		});

		expect(out).toHaveLength(1);
		const platform = out[0];
		// settings 的子树全部 fail → settings 整个作废
		// announcements.inbox 留下 → announcements 保留，但 archive 被剪
		expect(platform.items.map((i) => i.key)).toEqual(['announcements']);
		expect(platform.items[0].children?.map((c) => c.key)).toEqual(['inbox']);
	});

	it('递归 children：父项满足 + 子项部分满足 → 保留父并裁剪子', () => {
		const groups: NavGroup[] = [
			group('reliability', [
				item({
					key: 'ops',
					children: [
						item({ key: 'overview' }),
						item({ key: 'detail', featureFlag: 'observability' }),
						item({ key: 'legacy', hideInSimpleMode: true })
					]
				})
			])
		];

		const out = filterNavGroups(groups, {
			featureFlags: new Set(['observability']),
			isSimpleMode: true
		});

		expect(out).toHaveLength(1);
		const ops = out[0].items[0];
		expect(ops.key).toBe('ops');
		// overview 无 gate → 保留；detail 命中 flag → 保留；legacy 简易模式被丢
		expect(ops.children?.map((c) => c.key)).toEqual(['overview', 'detail']);
	});

	it('不就地变更输入', () => {
		const original: NavGroup[] = [
			group('workspace', [
				item({ key: 'dashboard' }),
				item({ key: 'orders', featureFlag: 'payment' })
			])
		];
		const snapshot = JSON.parse(JSON.stringify(original.map((g) => ({
			...g,
			items: g.items.map((i) => ({ ...i, icon: null }))
		}))));

		filterNavGroups(original, {
			featureFlags: new Set<string>(),
			isSimpleMode: true
		});

		const after = original.map((g) => ({
			...g,
			items: g.items.map((i) => ({ ...i, icon: null }))
		}));
		expect(JSON.parse(JSON.stringify(after))).toEqual(snapshot);
	});
});
