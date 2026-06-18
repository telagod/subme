/**
 * 极简 fetch wrapper · Svelte rewrite（M6 升级版）
 *
 * 设计：
 *   - 读取 window.__APP_CONFIG__.apiBase 决定 base URL（与 Vue tree 契约对齐）。
 *     缺省时走相对路径，配合后端 embed 同源部署。
 *   - 自动 Content-Type: application/json + JSON 解码 + Authorization Bearer 注入。
 *   - 401 → 走 auth.logout() 本地 teardown + goto('/login')；不再用 location.href hack。
 *     onUnauthorized 钩子可被 hooks.client.ts 覆盖以统一路由跳转策略。
 *   - 非 2xx 抛 Error，message 优先取响应 JSON 的 message/error 字段。
 *
 * 不引入 axios —— 远没必要为这一层薄 wrapper 拖 30KB。
 */

type Json = unknown;

interface AppConfig {
	apiBase?: string;
}

function getBase(): string {
	if (typeof window === 'undefined') return '';
	const cfg = (window as unknown as { __APP_CONFIG__?: AppConfig }).__APP_CONFIG__;
	return cfg?.apiBase ?? '';
}

// ── 401 钩子：默认行为 = teardown auth + 全页跳 /login。
//    hooks.client.ts 在启动时覆盖为 goto('/login')，避免 SPA 状态丢失。
//    auth store 用 dynamic import 解耦，杜绝 client.ts ↔ auth.svelte.ts 循环。
let _unauthorizedHook: (() => void | Promise<void>) | null = null;

export function setUnauthorizedHook(fn: () => void | Promise<void>): void {
	_unauthorizedHook = fn;
}

async function defaultUnauthorized(): Promise<void> {
	if (typeof window === 'undefined') return;
	try {
		const mod = await import('$lib/stores/auth.svelte');
		await mod.auth.logout();
	} catch {
		// 静默：动态导入失败也照样跳登录。
	}
	if (typeof window !== 'undefined') {
		window.location.href = '/login';
	}
}

function readAuthToken(): string | null {
	// 直接 sniff localStorage：避免运行时与 auth store 同步耦合 / 循环依赖。
	// 注意：与 persisted helper 的 schema 前缀对齐（__v1__:）。
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem('auth.token');
		if (!raw || !raw.startsWith('__v1__:')) return null;
		const v = JSON.parse(raw.slice('__v1__:'.length));
		return typeof v === 'string' ? v : null;
	} catch {
		return null;
	}
}

async function request<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
	const url = getBase() + path;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const tok = readAuthToken();
	if (tok) headers['Authorization'] = `Bearer ${tok}`;
	const init: RequestInit = {
		method,
		headers,
		credentials: 'include'
	};
	if (body !== undefined) init.body = JSON.stringify(body);

	const res = await fetch(url, init);

	if (res.status === 401) {
		const hook = _unauthorizedHook ?? defaultUnauthorized;
		await hook();
		throw new Error('unauthorized');
	}

	const text = await res.text();
	let parsed: unknown = undefined;
	if (text) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}

	if (!res.ok) {
		const msg =
			(parsed && typeof parsed === 'object' && parsed !== null
				? ((parsed as Record<string, unknown>).message as string | undefined) ??
					((parsed as Record<string, unknown>).error as string | undefined)
				: undefined) ?? `HTTP ${res.status}`;
		throw new Error(msg);
	}

	return parsed as T;
}

export const apiClient = {
	get: <T = Json>(path: string) => request<T>('GET', path),
	post: <T = Json>(path: string, body?: unknown) => request<T>('POST', path, body),
	patch: <T = Json>(path: string, body?: unknown) => request<T>('PATCH', path, body),
	put: <T = Json>(path: string, body?: unknown) => request<T>('PUT', path, body),
	delete: <T = Json>(path: string) => request<T>('DELETE', path)
};
