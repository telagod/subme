/**
 * 用户端导航分组 · Svelte rewrite
 *
 * 工厂函数形式 (函数 ≠ const)：保留 Vue 端 buildUserNavGroups 的形态，
 * 但 featureFlag 从 getter 闭包 → 简单字符串名。调用方在 layout 层根据
 * public-settings 构造 `Set<string>` 传给 filterNavGroups。
 *
 * 维持 Vue tree (frontend/src/components/shell/nav.ts: buildUserNavGroups) 业务行为：
 *   - workspace      dashboard / apiKeys / usage / availableChannels / channelStatus
 *   - billing        mySubscriptions / buySubscription / myOrders / redeem / affiliate
 *   - account        profile
 *
 * 简易模式 (hideInSimpleMode) 标记：
 *   - workspace.usage / workspace.availableChannels
 *   - billing.* 全部
 *   - account.profile NOT 隐藏
 *
 * featureFlag 名（约定 layout 层注入）：
 *   - availableChannels    →  'availableChannels'
 *   - channelStatus        →  'channelMonitor'
 *   - buySubscription      →  'payment'
 *   - myOrders             →  'payment'
 *   - affiliate            →  'affiliate'
 *
 * 路径：与 frontend/src/router/index.ts 一致。
 *   /dashboard /keys /usage /available-channels /monitor
 *   /subscriptions /purchase /orders /redeem /affiliate /profile
 */

import {
	LayoutDashboard,
	Key,
	ClipboardList,
	Network,
	Signal,
	CreditCard,
	Wallet,
	ShoppingCart,
	Gift,
	Users,
	CircleUser
} from '@lucide/svelte';

import type { NavGroup } from './types';

/**
 * 用户端 nav 构造参数（v1：暂无字段，预留扩展位）。
 *
 * 为何函数化但参数为空：
 *   - 与 Vue tree 函数签名形态对齐，方便未来无破坏性引入新参数
 *   - 测试 / SSR 可保持调用风格统一
 *
 * 当前 featureFlag 是静态字符串名，无需运行时注入；如未来要做"按用户角色裁剪
 * 默认菜单"等高级行为，再扩这里。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BuildUserNavOptions = {};

/**
 * 构造用户端导航分组。
 *
 * 调用方拿到结果后，传入 `filterNavGroups(groups, { featureFlags, isSimpleMode })`
 * 完成 flag / simple-mode 双重过滤。
 */
export function buildUserNavGroups(_opts: BuildUserNavOptions = {}): NavGroup[] {
	return [
		{
			key: 'workspace',
			labelKey: 'nav.app.group.workspace',
			items: [
				{
					key: 'dashboard',
					labelKey: 'nav.dashboard',
					path: '/dashboard',
					icon: LayoutDashboard
				},
				{
					key: 'apiKeys',
					labelKey: 'nav.apiKeys',
					path: '/keys',
					icon: Key
				},
				{
					key: 'usage',
					labelKey: 'nav.usage',
					path: '/usage',
					icon: ClipboardList,
					hideInSimpleMode: true
				},
				{
					key: 'availableChannels',
					labelKey: 'nav.availableChannels',
					path: '/available-channels',
					icon: Network,
					hideInSimpleMode: true,
					featureFlag: 'availableChannels'
				},
				{
					key: 'channelStatus',
					labelKey: 'nav.channelStatus',
					path: '/monitor',
					icon: Signal,
					featureFlag: 'channelMonitor'
				}
			]
		},
		{
			key: 'billing',
			labelKey: 'nav.app.group.billing',
			items: [
				{
					key: 'mySubscriptions',
					labelKey: 'nav.mySubscriptions',
					path: '/subscriptions',
					icon: CreditCard,
					hideInSimpleMode: true
				},
				{
					key: 'buySubscription',
					labelKey: 'nav.buySubscription',
					path: '/purchase',
					icon: Wallet,
					hideInSimpleMode: true,
					featureFlag: 'payment'
				},
				{
					key: 'myOrders',
					labelKey: 'nav.myOrders',
					path: '/orders',
					icon: ShoppingCart,
					hideInSimpleMode: true,
					featureFlag: 'payment'
				},
				{
					key: 'redeem',
					labelKey: 'nav.redeem',
					path: '/redeem',
					icon: Gift,
					hideInSimpleMode: true
				},
				{
					key: 'affiliate',
					labelKey: 'nav.affiliate',
					path: '/affiliates',
					icon: Users,
					hideInSimpleMode: true,
					featureFlag: 'affiliate'
				}
			]
		},
		{
			key: 'account',
			labelKey: 'nav.app.group.account',
			items: [
				{
					key: 'profile',
					labelKey: 'nav.profile',
					path: '/profile',
					icon: CircleUser
				}
			]
		}
	];
}
