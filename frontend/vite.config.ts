import { defineConfig, loadEnv, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import { resolve } from 'path'

/**
 * Vite 插件：开发模式下注入公开配置到 index.html
 * 与生产模式的后端注入行为保持一致，消除闪烁
 */
function injectPublicSettings(backendUrl: string): Plugin {
  return {
    name: 'inject-public-settings',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        try {
          const response = await fetch(`${backendUrl}/api/v1/settings/public`, {
            signal: AbortSignal.timeout(2000)
          })
          if (response.ok) {
            const data = await response.json()
            if (data.code === 0 && data.data) {
              const script = `<script>window.__APP_CONFIG__=${JSON.stringify(data.data)};</script>`
              return html.replace('</head>', `${script}\n</head>`)
            }
          }
        } catch (e) {
          console.warn('[vite] 无法获取公开配置，将回退到 API 调用:', (e as Error).message)
        }
        return html
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080'
  const devPort = Number(env.VITE_DEV_PORT || 3000)

  return {
    plugins: [
      vue(),
      checker({
        vueTsc: true
      }),
      injectPublicSettings(backendUrl)
    ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 使用 vue-i18n 运行时版本，避免 CSP unsafe-eval 问题
      'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
    }
  },
  define: {
    // 启用 vue-i18n JIT 编译，在 CSP 环境下处理消息插值
    // JIT 编译器生成 AST 对象而非 JS 代码，无需 unsafe-eval
    __INTLIFY_JIT_COMPILATION__: true
  },
  build: {
    outDir: '../backend/internal/web/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * 手动分包配置（TDZ 防御版）
         *
         * 历史教训：把 Vue 生态切碎（vendor-vue / vendor-router / vendor-pinia /
         * vendor-shadcn / vendor-ui / vendor-misc）后，reka-ui 与 @vueuse 跨 chunk、
         * vendor-vue ↔ vendor-misc 形成双向 import，浏览器加载顺序触发
         * "Cannot access X before initialization" 白屏（commit 9c2db774 复盘）。
         *
         * 修复策略：
         *   1. 所有 eager 加载的 Vue 生态（vue/@vue/router/pinia/reka-ui/@vueuse/
         *      shadcn 样式工具/lucide 图标/其它杂项）合并为单一 `vendor` chunk —
         *      模块内部解析顺序由 Rollup 拓扑排序保证，不会出现跨 chunk TDZ。
         *   2. 仅保留**动态 import 触发**的大块依赖独立成 chunk：xlsx、chart、
         *      stripe、airwallex、markdown、driver、i18n —— 这些都是路由级懒加载，
         *      不参与首屏关键路径，无 TDZ 风险，能换取首屏体积下降。
         *   3. 严禁回退到 `manualChunks: undefined`；任何新增 vendor 拆分前必须
         *      验证它不会被 eager 路径 import。
         */
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // —— 懒加载安全岛：这些库只在动态 import 的路由/功能里出现 ——

            // xlsx：仅导出功能用到（~400KB）
            if (id.includes('/xlsx/')) {
              return 'vendor-xlsx'
            }

            // 图表库：仪表盘/统计页懒加载
            if (id.includes('/chart.js/') || id.includes('/vue-chartjs/')) {
              return 'vendor-chart'
            }

            // 支付 SDK：体积大且仅在结账/充值路径触发
            if (id.includes('/@stripe/')) {
              return 'vendor-stripe'
            }
            if (id.includes('/@airwallex/')) {
              return 'vendor-airwallex'
            }

            // markdown / 净化器：公告、协议页延迟加载
            if (id.includes('/marked/') || id.includes('/dompurify/')) {
              return 'vendor-markdown'
            }

            // 引导库：onboarding 触发后再加载
            if (id.includes('/driver.js/')) {
              return 'vendor-driver'
            }

            // 国际化：main.ts 早期 use，但其 runtime 与 vue 解耦，独立 chunk
            // 不会触发 TDZ（vue-i18n 不反向 import vue 内部符号）
            if (id.includes('/vue-i18n/') || id.includes('/@intlify/')) {
              return 'vendor-i18n'
            }

            // —— 其余全部合并为单一 vendor chunk，杜绝跨 chunk 循环 ——
            // 包含：vue, @vue/*, vue-router, pinia, reka-ui, @vueuse/*,
            //       class-variance-authority, tailwind-merge, tailwindcss-animate,
            //       clsx, lucide-vue-next, axios, qrcode, file-saver,
            //       vue-draggable-plus, @tanstack/vue-virtual 等所有杂项
            return 'vendor'
          }

          // 应用代码：按入口点自动分包，不手动干预
          // 这样可以避免循环依赖，同时保持合理的 chunk 数量
        }
      }
    }
  },
    server: {
      host: '0.0.0.0',
      port: devPort,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true
        },
        '/v1': {
          target: backendUrl,
          changeOrigin: true
        },
        '/setup': {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  }
})
