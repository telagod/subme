/**
 * App Shell · 导航模型（Svelte 端口）
 *
 * 端口自 frontend/src/components/shell/nav.ts —— 同结构、同键名、同业务路径。
 * 差异点仅在图标库：lucide-vue-next → @lucide/svelte。
 *
 * 暴露两套 NavGroup：
 *   - adminNavGroups：管理后台导航（/admin/*）
 *   - userNavGroups：用户端导航（/dashboard, /keys, /usage 等）
 * 以及 resolveNavItem / flatNavItems 两个纯工具。
 *
 * NOTE: featureFlag 走宽容语义 —— 只有显式 false 才隐藏；undefined / true 都视为显示。
 * 避免 public settings 未加载完成时菜单闪烁消失。
 */

import type { Component } from 'svelte';
import {
	LayoutDashboard,
	Users,
	Gift,
	Package,
	ShoppingCart,
	CreditCard,
	Ticket,
	Tag,
	Server,
	Layers,
	DollarSign,
	Network,
	Activity,
	Radio,
	Shield,
	ClipboardList,
	Settings,
	Megaphone,
	Calculator,
	Key,
	Signal,
	CircleUser,
	Wallet
} from '@lucide/svelte';

export interface NavItem {
	key: string;
	labelKey: string;
	path: string;
	icon: Component;
	/** 简单模式下隐藏 */
	hideInSimpleMode?: boolean;
	/**
	 * 可选功能开关 getter。
	 * 返回 false 时菜单项被隐藏；返回 undefined / true 时显示。
	 * 宽容策略（undefined → 显示）避免 public settings 未加载完成时菜单闪烁消失。
	 */
	featureFlag?: () => boolean | undefined;
	/** 一级子项（仅允许单层嵌套；任意子项 active 时父项也展开） */
	children?: NavItem[];
}

export interface NavGroup {
	key: string;
	labelKey: string;
	items: NavItem[];
}

/** 管理后台导航分组 */
export const adminNavGroups: NavGroup[] = [
	{
		key: 'cockpit',
		labelKey: 'nav.quench.group.cockpit',
		items: [
			{
				key: 'dashboard',
				labelKey: 'nav.quench.dashboard',
				path: '/admin/dashboard',
				icon: LayoutDashboard
			}
		]
	},
	{
		key: 'customers',
		labelKey: 'nav.quench.group.customers',
		items: [
			{
				key: 'users',
				labelKey: 'nav.quench.users',
				path: '/admin/users',
				icon: Users
			},
			{
				key: 'affiliates',
				labelKey: 'nav.quench.affiliates',
				path: '/admin/affiliates/invites',
				icon: Gift
			}
		]
	},
	{
		key: 'monetization',
		labelKey: 'nav.quench.group.monetization',
		items: [
			{
				key: 'pricingDesk',
				labelKey: 'nav.quench.pricingDesk',
				path: '/admin/pricing',
				icon: Calculator
			},
			{
				key: 'subscriptions',
				labelKey: 'nav.quench.subscriptions',
				path: '/admin/subscriptions',
				icon: Package
			},
			{
				key: 'orders',
				labelKey: 'nav.quench.orders',
				path: '/admin/orders',
				icon: ShoppingCart
			},
			{
				key: 'paymentDashboard',
				labelKey: 'nav.quench.paymentDashboard',
				path: '/admin/orders/dashboard',
				icon: CreditCard
			},
			{
				key: 'redeem',
				labelKey: 'nav.quench.redeem',
				path: '/admin/redeem',
				icon: Ticket
			},
			{
				key: 'promoCodes',
				labelKey: 'nav.quench.promoCodes',
				path: '/admin/promo-codes',
				icon: Tag
			}
		]
	},
	{
		key: 'supply',
		labelKey: 'nav.quench.group.supply',
		items: [
			{
				key: 'accounts',
				labelKey: 'nav.quench.accounts',
				path: '/admin/accounts',
				icon: Server
			},
			{
				key: 'groups',
				labelKey: 'nav.quench.groups',
				path: '/admin/groups',
				icon: Layers
			},
			{
				key: 'channelPricing',
				labelKey: 'nav.quench.channelPricing',
				path: '/admin/channels/pricing',
				icon: DollarSign
			},
			{
				key: 'proxies',
				labelKey: 'nav.quench.proxies',
				path: '/admin/proxies',
				icon: Network
			}
		]
	},
	{
		key: 'reliability',
		labelKey: 'nav.quench.group.reliability',
		items: [
			{
				key: 'ops',
				labelKey: 'nav.quench.ops',
				path: '/admin/ops',
				icon: Activity
			},
			{
				key: 'channelMonitor',
				labelKey: 'nav.quench.channelMonitor',
				path: '/admin/channels/monitor',
				icon: Radio
			},
			{
				key: 'riskControl',
				labelKey: 'nav.quench.riskControl',
				path: '/admin/risk-control',
				icon: Shield
			},
			{
				key: 'usage',
				labelKey: 'nav.quench.usage',
				path: '/admin/usage',
				icon: ClipboardList
			}
		]
	},
	{
		key: 'platform',
		labelKey: 'nav.quench.group.platform',
		items: [
			{
				key: 'settings',
				labelKey: 'nav.quench.settings',
				path: '/admin/settings',
				icon: Settings
			},
			{
				key: 'announcements',
				labelKey: 'nav.quench.announcements',
				path: '/admin/announcements',
				icon: Megaphone
			}
		]
	}
];

/**
 * 用户端导航分组工厂。
 *
 * NOTE: 函数形式 —— 调用方按需注入 featureFlag getter（在用户布局处装配），
 * 保持 nav.ts 自身无副作用、不依赖 stores。
 */
export function buildUserNavGroups(opts?: {
	flagAvailableChannels?: () => boolean | undefined;
	flagChannelMonitor?: () => boolean | undefined;
	flagPayment?: () => boolean | undefined;
	flagAffiliate?: () => boolean | undefined;
}): NavGroup[] {
	const o = opts ?? {};
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
					featureFlag: o.flagAvailableChannels
				},
				{
					key: 'channelStatus',
					labelKey: 'nav.channelStatus',
					path: '/monitor',
					icon: Signal,
					featureFlag: o.flagChannelMonitor
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
					featureFlag: o.flagPayment
				},
				{
					key: 'myOrders',
					labelKey: 'nav.myOrders',
					path: '/orders',
					icon: ShoppingCart,
					hideInSimpleMode: true,
					featureFlag: o.flagPayment
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
					path: '/affiliate',
					icon: Users,
					hideInSimpleMode: true,
					featureFlag: o.flagAffiliate
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

/** 默认 userNavGroups（无 featureFlag），仅测试/简单场景使用。 */
export const userNavGroups: NavGroup[] = buildUserNavGroups();

/**
 * 从当前 route path 反查所在的 group + item。
 * 匹配规则：path === item.path || path.startsWith(item.path + '/')
 * （+ '/' 防止 /key 误匹配 /keys 这类同前缀的不同路径）
 */
export function resolveNavItem(
	path: string,
	groups: NavGroup[] = adminNavGroups
): { group: NavGroup; item: NavItem } | null {
	for (const group of groups) {
		for (const item of group.items) {
			if (path === item.path || path.startsWith(item.path + '/')) {
				return { group, item };
			}
		}
	}
	return null;
}

/** 展平所有 NavItem，附带 groupKey + groupLabelKey；供 ⌘K 之类的搜索使用。 */
export function flatNavItems(
	groups: NavGroup[] = adminNavGroups
): (NavItem & { groupKey: string; groupLabelKey: string })[] {
	return groups.flatMap((g) =>
		g.items.map((item) => ({
			...item,
			groupKey: g.key,
			groupLabelKey: g.labelKey
		}))
	);
}

/**
 * 判定一个 nav item 在当前 path 下是否 active。
 *
 * 特殊例外：'/admin/dashboard' 与 '/dashboard' 用严格相等
 * （防止 /admin/dashboard-x 之类的兄弟路径误高亮 /admin/dashboard）。
 * 其它路径走 path === itemPath || path.startsWith(itemPath + '/')。
 */
export function isItemActive(currentPath: string, itemPath: string): boolean {
	if (itemPath === '/admin/dashboard' || itemPath === '/dashboard') {
		return currentPath === itemPath;
	}
	return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
}
