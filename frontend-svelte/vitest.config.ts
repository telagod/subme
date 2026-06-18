/**
 * Vitest 配置（POC 3）
 *
 * 设计：
 *   - svelte plugin 启用 .svelte 组件解析
 *   - jsdom 环境支撑 @testing-library/svelte mount
 *   - $lib 别名与 svelte.config.js 保持一致
 *   - resolve.conditions 加 browser，避免 svelte SSR 入口被误命中
 */
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	},
	test: {
		environment: 'jsdom',
		globals: false,
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
