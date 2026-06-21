import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static SPA: fallback:'index.html' pairs with +layout.ts ssr:false / prerender:false.
// Build output is written directly to the backend embed path.
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
