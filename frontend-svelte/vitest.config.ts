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
			$lib: path.resolve(__dirname, 'src/lib'),
			// SvelteKit 虚拟模块在 vitest（裸 vite）里不存在 —— 用最小桩件兜住 import。
			// 真实运行时由 SvelteKit 的 .svelte-kit 注入。
			'$app/navigation': path.resolve(__dirname, 'src/lib/test/stub-app-navigation.ts'),
			'$app/state': path.resolve(__dirname, 'src/lib/test/stub-app-state.ts'),
			'$app/stores': path.resolve(__dirname, 'src/lib/test/stub-app-stores.ts'),
			'$app/forms': path.resolve(__dirname, 'src/lib/test/stub-app-forms.ts'),
			'$app/environment': path.resolve(__dirname, 'src/lib/test/stub-app-environment.ts')
		}
	},
	test: {
		environment: 'jsdom',
		globals: false,
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['src/lib/test/setup.ts'],
		// Sandbox CPU contention can push cold-import beforeEach past the 10s default;
		// raise both timeouts so flake stays out of CI. Real failures still surface
		// quickly — these are cold-start ceilings, not assertion deadlines.
		hookTimeout: 60_000,
		testTimeout: 30_000,
		// Serialize test files: cold-import contention on parallel workers was the
		// root cause of the 6 page-test hook-timeouts flagged in M10c/M11 verify.
		// Isolated re-runs always pass — the only difference is parallel-mode pressure.
		fileParallelism: false
	}
});
