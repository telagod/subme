/**
 * 极简 fetch wrapper · Svelte rewrite（POC 4）
 *
 * 设计：
 *   - 读取 window.__APP_CONFIG__.apiBase 决定 base URL（与 Vue tree 契约对齐）。
 *     缺省时走相对路径，配合后端 embed 同源部署。
 *   - 自动 Content-Type: application/json + JSON 解码。
 *   - 401 → 跳 /login（与 Vue tree axios interceptor 同语义）。
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

async function request<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
	const url = getBase() + path;
	const init: RequestInit = {
		method,
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include'
	};
	if (body !== undefined) init.body = JSON.stringify(body);

	const res = await fetch(url, init);

	if (res.status === 401) {
		if (typeof window !== 'undefined') {
			// 短路：登录态丢失，跳登录页。Vue tree 同语义。
			window.location.href = '/login';
		}
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
