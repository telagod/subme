/**
 * hooks.client.ts · M6 auth foundation
 *
 * 三件事：
 *   1. 启动期 hydrate auth：localStorage 有 token 时拉一次 /auth/me 补齐 user。
 *   2. setUnauthorizedHook：把 apiClient 的 401 兜底改成 SPA-friendly：
 *      auth.logout() → goto('/login?next=…')；不再 location.href 全页跳转，
 *      避免 token 失效那一刻丢掉所有 UI 状态。
 *   3. setup status check：首次启动时把未初始化实例带到 /setup。
 *
 * Route guards live in the root layout because SvelteKit navigation callbacks
 * must be registered during component initialisation.
 */
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte';
import { setUnauthorizedHook } from '$lib/api/client';
import { setupApi } from '$lib/api/setup';

// ── 1. 401 钩子注入 ────────────────────────────────────────────────────
setUnauthorizedHook(async () => {
	await auth.logout();
	// SPA navigation：避免 location.href 触发全页 reload。
	await goto('/login', { replaceState: true });
});

// ── 2. 启动期 hydrate ─────────────────────────────────────────────────
void auth.hydrate();

void setupApi.status().then((status) => {
	if (status.needs_setup && window.location.pathname !== '/setup') {
		void goto('/setup', { replaceState: true });
	}
}).catch(() => {
	// Normal mode deployments may not expose setup status during early boot.
});
