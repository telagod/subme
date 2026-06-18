import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 静态 SPA：fallback:'index.html' 配合 +layout.ts 的 ssr:false / prerender:false。
// 输出物直接写入后端嵌入路径 backend/internal/web/dist_svelte/，与 Vue tree
// 的 dist/ 平行共存；后端 embed.go 切换源时无需任何文件搬运。
const distAbs = path.resolve(__dirname, '..', 'backend', 'internal', 'web', 'dist_svelte');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: distAbs,
			assets: distAbs,
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		alias: {
			$lib: 'src/lib'
		}
	}
};

export default config;
