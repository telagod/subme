/**
 * vitest stub for $app/environment · SvelteKit 虚拟模块。
 * jsdom 跑在浏览器条件下 → browser=true，避免 superForm 走 SSR 分支。
 */
export const browser = true;
export const dev = false;
export const building = false;
export const version = '0.0.0-test';
