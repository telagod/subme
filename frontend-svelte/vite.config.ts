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
					// —— src/ 核心工具收编进 vendor ——
					// hooks.client.ts 启动期需要的 store / api 子树（persisted /
					// auth / toast / api/client / api/auth）默认会被 Rollup 切成
					// 独立 eager chunks（每个 .svelte.ts 一个），触发 check-chunks
					// 的 EAGER_CHUNK_CAP=2 红线。
					//
					// 把它们强行合并进 vendor：
					//   1. 与框架代码同 chunk，依赖图上无跨 chunk 循环风险
					//   2. 体积影响 < 5KB（store/client 实现都是数十行），可忽略
					//   3. 与 vendor 同生同灭，hash 稳定性不变
					if (id.includes('/src/lib/stores/') && id.endsWith('.svelte.ts')) return 'vendor';
					if (id.includes('/src/lib/api/') && id.endsWith('.ts')) return 'vendor';
					// 标准 UI primitives 被 shell/layout/routes 广泛 eager 引用。Rollup 默认
					// 会把 Button/Input 等拆成额外 shared chunks，突破 EAGER_CHUNK_CAP=2。
					// 这些组件是启动期基础设施，不属于懒加载业务岛，统一收进 vendor。
					if (id.includes('/src/lib/ui/')) return 'vendor';

					if (!id.includes('node_modules')) return;

					// —— 懒加载安全岛 ——
					// @tanstack/svelte-virtual：仅被 VirtualTable.svelte 通过 dynamic import 引用，
					// 一定要落独立 lazy chunk，否则 rollup 会按 manualChunks 强制塞 vendor，
					// VirtualTable 的 await import() 失效 —— 表面看不出但 perf 退化。
					// POC 5 落地，含在 check-chunks 已知 lazy island 列表内。
					if (id.includes('/@tanstack/svelte-virtual/')) return 'vendor-virtual';

					// —— 图表库：M6 user dashboard 懒加载落地 ——
					// chart.js + svelte-chartjs 只通过 UsageChart.svelte 的 await import()
					// 链入；务必落独立 lazy chunk，否则会被 vendor 兜底吸走变 eager，
					// check-chunks gate 直接红。规则必须早于下面的 vendor 兜底。
					if (id.includes('/chart.js/')) return 'vendor-chart';
					if (id.includes('/svelte-chartjs/')) return 'vendor-chart';
					if (id.includes('/@kurkle/color/')) return 'vendor-chart';

					// —— QR 码渲染懒加载岛（M7 profile/totp 落地）——
					// `qrcode` 只被 TotpEnrollDialog 通过 dynamic `await import('qrcode')`
					// 引用；规则必须早于 vendor 兜底，否则会被吸进 eager set，触发
					// check-chunks 红线（memory: vendor-chunk-tdz-trap）。
					if (id.includes('/qrcode/')) return 'vendor-qrcode';
					if (id.includes('/dijkstrajs/')) return 'vendor-qrcode';
					if (id.includes('/pngjs/')) return 'vendor-qrcode';

					// —— 支付 SDK 懒加载岛（M6 落地）——
					// @stripe/stripe-js + airwallex-payment-elements 都是百 KB 级
					// 重包，必须落独立 lazy chunk。两条规则必须早于下面的 vendor
					// 兜底，否则会被吸进 eager set 触发 check-chunks 红线
					// (memory: vendor-chunk-tdz-trap)。
					//
					// 接入方：src/lib/payments/{stripe,airwallex}.ts 用
					// `await import(...)` 引用；上层路由（/payment/*）禁止顶层
					// 静态 import 这两个包。
					if (id.includes('/@stripe/stripe-js/')) return 'vendor-stripe';
					if (id.includes('/airwallex-payment-elements/')) return 'vendor-airwallex';
					if (id.includes('/@airwallex/')) return 'vendor-airwallex';

					// —— 懒加载安全岛占位：依赖未落地，预留命名空间 ——
					// xlsx：导出功能（~400KB）
					// if (id.includes('/xlsx/')) return 'vendor-xlsx';

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
