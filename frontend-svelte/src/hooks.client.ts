/**
 * hooks.client.ts · M6 auth foundation
 *
 * 三件事：
 *   1. 启动期 hydrate auth：localStorage 有 token 时拉一次 /auth/me 补齐 user。
 *   2. setUnauthorizedHook：把 apiClient 的 401 兜底改成 SPA-friendly：
 *      auth.logout() → goto('/login?next=…')；不再 location.href 全页跳转，
 *      避免 token 失效那一刻丢掉所有 UI 状态。
 *   3. beforeNavigate 路由守卫：
 *      - 未登录访问 /dashboard /keys /usage /profile /admin/* 等保护路由
 *        → cancel + goto('/login?next=<原路径>')。
 *      - 已登录非 admin 访问 /admin/* → cancel + goto('/dashboard') + toast 警告。
 *
 * SvelteKit 客户端钩子约定：本文件 export `handleError`（错误兜底）+ 顶层副作用
 * （beforeNavigate 注册必须在模块顶层执行，SvelteKit 会在 client bootstrap 时
 * import 一次）。
 */
import { goto, beforeNavigate } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte';
import { setUnauthorizedHook } from '$lib/api/client';
import { showError } from '$lib/stores/toast.svelte';

// ── 保护路由白名单：前缀匹配。/login /auth/* 等公开页留空。──────────────
const PROTECTED_PREFIXES = [
	'/dashboard',
	'/keys',
	'/usage',
	'/profile',
	'/redeem',
	'/orders',
	'/subscriptions',
	'/purchase',
	'/affiliate',
	'/available-channels',
	'/monitor',
	'/admin'
];

const ADMIN_PREFIXES = ['/admin'];

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some(
		(p) => pathname === p || pathname.startsWith(p + '/')
	);
}

function isAdminRoute(pathname: string): boolean {
	return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ── 1. 401 钩子注入 ────────────────────────────────────────────────────
setUnauthorizedHook(async () => {
	await auth.logout();
	// SPA navigation：避免 location.href 触发全页 reload。
	await goto('/login', { replaceState: true });
});

// ── 2. 启动期 hydrate ─────────────────────────────────────────────────
void auth.hydrate();

// ── 3. 路由守卫 ───────────────────────────────────────────────────────
beforeNavigate(({ to, cancel }) => {
	if (!to) return;
	const path = to.url.pathname;

	// 公开路由直接放行。
	if (!isProtected(path)) return;

	if (!auth.isAuthenticated) {
		cancel();
		const next = encodeURIComponent(path + (to.url.search ?? ''));
		void goto(`/login?next=${next}`, { replaceState: true });
		return;
	}

	if (isAdminRoute(path) && !auth.isAdmin) {
		cancel();
		showError('Admin access required.');
		void goto('/dashboard', { replaceState: true });
		return;
	}
});
