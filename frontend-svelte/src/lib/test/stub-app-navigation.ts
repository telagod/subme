/**
 * vitest stub for $app/navigation —— jsdom 环境下 SvelteKit 虚拟模块不存在。
 * 暴露 CommandPalette + sveltekit-superforms 需要的导航接口。
 */
export function goto(_url: string, _opts?: unknown): Promise<void> {
	return Promise.resolve();
}

// superforms 在 onDestroy 路径调 beforeNavigate(handler)；本桩 no-op 即可。
export function beforeNavigate(_handler: (...args: unknown[]) => unknown): void {
	/* noop */
}

export function afterNavigate(_handler: (...args: unknown[]) => unknown): void {
	/* noop */
}

export function invalidate(_url?: string | URL | ((url: URL) => boolean)): Promise<void> {
	return Promise.resolve();
}

export function invalidateAll(): Promise<void> {
	return Promise.resolve();
}

export function preloadData(_href: string): Promise<unknown> {
	return Promise.resolve({});
}

export function preloadCode(_url: string): Promise<void> {
	return Promise.resolve();
}

export function pushState(_url: string | URL, _state: unknown): void {
	/* noop */
}

export function replaceState(_url: string | URL, _state: unknown): void {
	/* noop */
}

export function onNavigate(_handler: (...args: unknown[]) => unknown): void {
	/* noop */
}

export function disableScrollHandling(): void {
	/* noop */
}
