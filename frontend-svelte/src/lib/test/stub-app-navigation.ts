/**
 * vitest stub for $app/navigation —— jsdom 环境下 SvelteKit 虚拟模块不存在。
 * 仅暴露 CommandPalette 使用的 goto。
 */
export function goto(_url: string, _opts?: unknown): Promise<void> {
	return Promise.resolve();
}
