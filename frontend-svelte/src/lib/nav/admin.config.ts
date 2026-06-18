/**
 * 管理后台导航分组 · Svelte rewrite
 *
 * 与 Vue tree (frontend/src/components/shell/nav.ts: adminNavGroups) 结构 1:1 对齐。
 * 路径来源：SUBME 实际路由表 (frontend/src/router/index.ts) — 非 upstream 路由。
 *
 * 分组维度（保持与 Vue 端一致以便 i18n 复用）：
 *   - cockpit       仪表板入口
 *   - customers     用户与分销
 *   - monetization  计价 / 订阅 / 订单 / 兑换码 / 促销
 *   - supply        账号池 / 分组 / 渠道计价 / 代理
 *   - reliability   Ops / 渠道监控 / 风控 / 用量
 *   - platform      系统设置 / 公告 / 备份
 *
 * 注意：
 *   - "backup" 没有真实路由（frontend/src/router/index.ts 未收录），故未挂入导航。
 *     若后续接入备份页，挂在 platform 分组、icon 用 DatabaseBackup / HardDrive。
 *   - "users" 直接落 /admin/users（不是 /admin/users/list）。
 *   - "affiliates" 默认进 /admin/affiliates/invites（Vue 端 redirect 同向）。
 *   - "orders" 落主列表 /admin/orders；订单看板单列 paymentDashboard → /admin/orders/dashboard。
 *   - "channels" 拆为 channelPricing(/admin/channels/pricing) + channelMonitor(/admin/channels/monitor)。
 *
 * adminNavGroups 不消费 featureFlag — 管理员视角不做开关裁剪。
 */

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
	Calculator
} from '@lucide/svelte';

import type { NavGroup } from './types';

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
