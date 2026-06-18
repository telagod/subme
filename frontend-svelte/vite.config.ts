/**
 * Vite 配置 · TDZ 防御版（svelte-rewrite seed）
 *
 * 历史教训（见 ~/.claude memory: vendor-chunk-tdz-trap）：
 *   把核心框架生态切碎成多个 eager chunk 会触发跨 chunk 循环 import，
 *   浏览器加载顺序进入 "Cannot access X before initialization" 白屏。
 *   Vue tree 已两度复盘（commit 9c2db774、6ca8d04e）。
 *
 * 铁律：
 *   1. 所有 eager 加载的核心生态（svelte / @sveltejs/kit / bits-ui /
 *      @lucide/svelte / clsx / tailwind-merge / tailwind-variants /
 *      svelte-i18n / zod）合并为单一 `vendor` chunk。
 *   2. 仅保留**动态 import 触发**的大块依赖独立成 chunk（xlsx / chart /
 *      i18n-bundle / markdown / airwallex / driver / stripe）——目前未引入，
 *      留空 if 分支作为占位，依赖落地时再填 path 匹配。
 *   3. 严禁 `manualChunks: undefined`；任何新增 vendor 拆分前必须验证
 *      它不会被 eager 路径 import。
 */
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// outDir 由 svelte.config.js 的 adapter-static 控制，这里不重复。
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (!id.includes('node_modules')) return;

					// —— 懒加载安全岛 ——
					// @tanstack/svelte-virtual：仅被 VirtualTable.svelte 通过 dynamic import 引用，
					// 一定要落独立 lazy chunk，否则 rollup 会按 manualChunks 强制塞 vendor，
					// VirtualTable 的 await import() 失效 —— 表面看不出但 perf 退化。
					// POC 5 落地，含在 check-chunks 已知 lazy island 列表内。
					if (id.includes('/@tanstack/svelte-virtual/')) return 'vendor-virtual';

					// —— 懒加载安全岛占位：依赖未落地，预留命名空间 ——
					// xlsx：导出功能（~400KB）
					// if (id.includes('/xlsx/')) return 'vendor-xlsx';

					// 图表库：仪表盘/统计页懒加载
					// if (id.includes('/chart.js/')) return 'vendor-chart';

					// 支付 SDK
					// if (id.includes('/@stripe/')) return 'vendor-stripe';
					// if (id.includes('/@airwallex/')) return 'vendor-airwallex';

					// markdown / 净化
					// if (id.includes('/marked/') || id.includes('/dompurify/')) return 'vendor-markdown';

					// 引导库
					// if (id.includes('/driver.js/')) return 'vendor-driver';

					// i18n 消息包（svelte-i18n runtime 已合并入 vendor，
					// 大体积消息字典落盘后再独立 chunk）
					// if (id.includes('/svelte-i18n/dist/messages/')) return 'vendor-i18n';

					// —— 其余 eager 生态全部合并为单一 vendor chunk ——
					// svelte / @sveltejs/kit / bits-ui / @lucide/svelte /
					// clsx / tailwind-merge / tailwind-variants /
					// svelte-i18n / zod / sveltekit-superforms 等
					return 'vendor';
				}
			}
		}
	},
	server: {
		host: '0.0.0.0',
		port: 3001,
		proxy: {
			'/api': { target: 'http://localhost:8080', changeOrigin: true },
			'/v1': { target: 'http://localhost:8080', changeOrigin: true },
			'/setup': { target: 'http://localhost:8080', changeOrigin: true }
		}
	}
});
