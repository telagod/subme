/**
 * vitest stub for $app/state —— SvelteKit 在 jsdom 下没有 page store。
 * 暴露 page 静态对象，足够 AppShell / CommandPalette 读 url.pathname。
 */
export const page = {
	url: new URL('http://localhost/')
};
