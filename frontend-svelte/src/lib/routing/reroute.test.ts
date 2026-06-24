import { describe, expect, it } from 'vitest';
import { adminNavGroups } from '$lib/nav/admin.config';
import { buildUserNavGroups } from '$lib/nav/user.config';
import { reroutePath } from './reroute';

const ROUTE_IDS = new Set([
	'/admin/accounts',
	'/admin/affiliates/invites',
	'/admin/backup',
	'/admin/channels',
	'/admin/channels/pricing',
	'/admin/dashboard',
	'/admin/groups',
	'/admin/monetization/plans',
	'/admin/monetization/pricing',
	'/admin/monetization/subscriptions',
	'/admin/ops',
	'/admin/orders',
	'/admin/orders/list',
	'/admin/orders/dashboard',
	'/admin/orders/payments',
	'/admin/orders/refunds',
	'/admin/proxies',
	'/admin/risk-control',
	'/admin/settings',
	'/auth/callback',
	'/auth/forgot',
	'/auth/login',
	'/auth/register',
	'/auth/reset',
	'/auth/verify-email',
	'/home',
	'/setup',
	'/(user)/available-channels',
	'/(user)/affiliates',
	'/(user)/billing',
	'/(user)/custom/[id]',
	'/(user)/dashboard',
	'/(user)/keys',
	'/(user)/monitor',
	'/(user)/orders',
	'/(user)/payment/cancel',
	'/(user)/payment/airwallex',
	'/(user)/payment/qrcode',
	'/(user)/payment/result',
	'/(user)/payment/stripe',
	'/(user)/payment/stripe-popup',
	'/(user)/payment/success',
	'/(user)/profile',
	'/(user)/purchase',
	'/(user)/redeem',
	'/(user)/subscriptions',
	'/(user)/usage',
	'/key-usage',
	'/legal/[documentId]'
]);

function adminPaths(): string[] {
	return adminNavGroups.flatMap((g) => g.items.map((item) => item.path));
}

function userPaths(): string[] {
	return buildUserNavGroups().flatMap((g) => g.items.map((item) => item.path));
}

describe('reroutePath', () => {
	it('maps implemented admin nav paths to existing grouped route ids', () => {
		const implemented = adminPaths().filter((path) =>
			[
				'/admin/accounts',
				'/admin/affiliates/invites',
				'/admin/backup',
				'/admin/channels',
				'/admin/channels/pricing',
				'/admin/dashboard',
				'/admin/groups',
				'/admin/ops',
				'/admin/orders',
				'/admin/orders/dashboard',
				'/admin/pricing',
				'/admin/proxies',
				'/admin/risk-control',
				'/admin/settings',
				'/admin/subscriptions'
			].includes(path)
		);

		for (const path of implemented) {
			const mapped = reroutePath(path) ?? path;
			expect(ROUTE_IDS.has(mapped), `${path} -> ${mapped}`).toBe(true);
		}
	});

	it('preserves Vue admin aliases for grouped admin paths', () => {
		expect(reroutePath('/admin')).toBe('/admin/dashboard');
		expect(reroutePath('/admin/affiliates')).toBe('/admin/affiliates/invites');
		expect(reroutePath('/admin/pricing')).toBe('/admin/monetization/pricing');
		expect(reroutePath('/admin/subscriptions')).toBe('/admin/monetization/subscriptions');
		expect(reroutePath('/admin/subscriptions/legacy')).toBe(
			'/admin/monetization/subscriptions'
		);
		expect(reroutePath('/admin/orders/plans')).toBe('/admin/monetization/plans');
		expect(reroutePath('/admin/proxies-v2')).toBe('/admin/proxies');
		expect(reroutePath('/admin/settings/legacy')).toBe('/admin/settings');
	});

	it('leaves implemented user nav paths to native SvelteKit route-group routing', () => {
		const implemented = userPaths().filter((path) =>
			['/available-channels', '/affiliates', '/billing', '/dashboard', '/keys', '/monitor', '/orders', '/profile', '/purchase', '/redeem', '/subscriptions', '/usage'].includes(path)
		);

		for (const path of implemented) {
			expect(reroutePath(path), path).toBeUndefined();
		}
	});

	it('keeps public/auth routes untouched', () => {
		expect(reroutePath('/')).toBeUndefined();
		expect(reroutePath('/auth/callback')).toBeUndefined();
		expect(reroutePath('/auth/callback/google')).toBeUndefined();
		expect(reroutePath('/key-usage')).toBeUndefined();
		expect(reroutePath('/legal/terms')).toBeUndefined();
	});

	it('maps Vue legacy auth public paths to Svelte auth pages', () => {
		expect(reroutePath('/login')).toBe('/auth/login');
		expect(reroutePath('/register')).toBe('/auth/register');
		expect(reroutePath('/forgot-password')).toBe('/auth/forgot');
		expect(reroutePath('/reset-password')).toBe('/auth/reset');
		expect(reroutePath('/email-verify')).toBe('/auth/verify-email');
	});

	it('maps provider-specific Vue auth callbacks to the Svelte polymorphic callback route', () => {
		expect(reroutePath('/auth/oauth/callback')).toBe('/auth/callback');
		expect(reroutePath('/auth/linuxdo/callback')).toBe('/auth/callback/linuxdo');
		expect(reroutePath('/auth/wechat/callback')).toBe('/auth/callback/wechat');
		expect(reroutePath('/auth/dingtalk/callback')).toBe('/auth/callback/dingtalk');
		expect(reroutePath('/auth/dingtalk/email-completion')).toBe(
			'/auth/callback/dingtalk/email-completion'
		);
		expect(reroutePath('/auth/oidc/callback')).toBe('/auth/callback/oidc');
	});

	it('preserves legacy singular user aliases', () => {
		expect(reroutePath('/affiliate')).toBe('/affiliates');
	});

	it('leaves dynamic custom pages to native SvelteKit route-group routing', () => {
		expect(reroutePath('/custom/docs')).toBeUndefined();
	});
});
