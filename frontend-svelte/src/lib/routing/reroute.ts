/**
 * Public URL → internal SvelteKit route mapping.
 *
 * The admin tree uses real `/admin/*` paths. User pages remain in `(user)`
 * while preserving Vue URL parity through this hook.
 */
const ADMIN_ALIASES: Record<string, string> = {
	'/admin': '/admin/dashboard',
	'/admin/affiliates': '/admin/affiliates/invites',
	'/admin/pricing': '/admin/monetization/pricing',
	'/admin/subscriptions': '/admin/monetization/subscriptions',
	'/admin/subscriptions/legacy': '/admin/monetization/subscriptions',
	'/admin/orders/plans': '/admin/monetization/plans',
	'/admin/proxies-v2': '/admin/proxies',
	'/admin/settings/legacy': '/admin/settings'
};

const AUTH_ALIASES: Record<string, string> = {
	'/login': '/auth/login',
	'/register': '/auth/register',
	'/forgot-password': '/auth/forgot',
	'/reset-password': '/auth/reset',
	'/email-verify': '/auth/verify-email',
	'/auth/oauth/callback': '/auth/callback',
	'/auth/linuxdo/callback': '/auth/callback/linuxdo',
	'/auth/wechat/callback': '/auth/callback/wechat',
	'/auth/dingtalk/callback': '/auth/callback/dingtalk',
	'/auth/dingtalk/email-completion': '/auth/callback/dingtalk/email-completion',
	'/auth/oidc/callback': '/auth/callback/oidc'
};

export function reroutePath(pathname: string): string | undefined {
	if (ADMIN_ALIASES[pathname]) return ADMIN_ALIASES[pathname];
	if (AUTH_ALIASES[pathname]) return AUTH_ALIASES[pathname];

	if (pathname === '/affiliate') return '/affiliates';

	return undefined;
}
