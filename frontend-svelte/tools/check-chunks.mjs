#!/usr/bin/env node
/**
 * check-chunks.mjs · postbuild bundle gate for the Svelte rewrite
 *
 * Enforces two invariants on the SvelteKit static build at
 * `backend/internal/web/dist_svelte/`:
 *
 *   1. EAGER CHUNK CAP
 *      Files preloaded at first paint (anything <link rel="modulepreload">
 *      lists in index.html, plus the dedicated entry chunks under
 *      `_app/immutable/chunks/` that the entries pull in) must stay small.
 *      Hard ceiling: ≤ 2 non-entry eager chunks.
 *
 *      Rationale — Vue tree was bitten twice (commits 9c2db774, 6ca8d04e)
 *      by multi-chunk vendor splits triggering "Cannot access X before
 *      initialization" TDZ white screens. The Svelte tree's vite.config.ts
 *      already collapses the eager core into a single `vendor` chunk; this
 *      gate makes the regression cost visible at build time.
 *
 *   2. FORBIDDEN EAGER DEPS
 *      Heavy libs that MUST be lazy-loaded (chart.js, @stripe, airwallex,
 *      xlsx, markdown-it) must not appear in the eager chunk set. We scan
 *      the eager JS text for a small set of fingerprint strings. The check
 *      is defensive: at this seed stage none of these deps exist yet in
 *      package.json, so missing matches are expected and OK. The fail
 *      condition is "matched a forbidden marker INSIDE an eager chunk".
 *
 * Exit codes:
 *   0  — all invariants hold (or the dist tree is missing/empty; we no-op
 *        rather than fail so the script is safe to wire as `postbuild`
 *        before the first real build lands).
 *   1  — invariant breached. stderr names the offending file(s).
 *
 * No external deps. Pure Node ≥ 18 ESM.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DIST_DIR = resolve(REPO_ROOT, 'backend', 'internal', 'web', 'dist_svelte');
const INDEX_HTML = join(DIST_DIR, 'index.html');
const IMMUTABLE_DIR = join(DIST_DIR, '_app', 'immutable');

const EAGER_CHUNK_CAP = 2;

// Forbidden eager dependency fingerprints. Each entry is { name, markers[] }.
// `markers` are string substrings we expect to find in the chunk source if the
// dep was bundled in. Keep these specific enough to avoid false positives on
// transitive references.
const FORBIDDEN_DEPS = [
	{ name: 'chart.js', markers: ['chart.js/auto', 'Chart.register(', 'new Chart('] },
	{ name: '@stripe', markers: ['@stripe/stripe-js', 'loadStripe(', 'Stripe.js'] },
	{ name: 'airwallex', markers: ['@airwallex/components-sdk', 'Airwallex.init', 'createElement(\'card'] },
	{ name: 'xlsx', markers: ['xlsx/dist', 'XLSX.utils', 'XLSX.read(', 'XLSX.write('] },
	{ name: 'markdown-it', markers: ['markdown-it/lib', 'new MarkdownIt(', 'markdownIt.render('] }
];

function log(msg) {
	process.stdout.write(`[check-chunks] ${msg}\n`);
}

function fail(msg) {
	process.stderr.write(`[check-chunks] FAIL · ${msg}\n`);
	process.exit(1);
}

// --- 0. Pre-flight ---------------------------------------------------------

if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
	log(`dist_svelte/ not found at ${DIST_DIR} — skipping (no build artifacts yet).`);
	process.exit(0);
}

if (!existsSync(INDEX_HTML)) {
	log(`index.html missing inside dist_svelte/ — skipping (build incomplete).`);
	process.exit(0);
}

if (!existsSync(IMMUTABLE_DIR)) {
	log(`_app/immutable/ missing — skipping (SvelteKit adapter-static output not found).`);
	process.exit(0);
}

// --- 1. Eager chunk extraction --------------------------------------------

const indexHtml = readFileSync(INDEX_HTML, 'utf8');

/**
 * Find every modulepreload href under /_app/immutable/. These are the files
 * the browser fetches at first paint, before any user interaction.
 */
const preloadHrefs = new Set();
// Attribute order in <link> tags is not fixed (SvelteKit emits `href` before
// `rel`, others may differ). Match any <link …> tag, then check both attrs
// independently.
const linkRe = /<link\b([^>]*)>/gi;
const attrRe = /(\w[\w-]*)\s*=\s*"([^"]*)"|(\w[\w-]*)\s*=\s*'([^']*)'/g;
let lm;
while ((lm = linkRe.exec(indexHtml)) !== null) {
	const inner = lm[1];
	let rel = '';
	let href = '';
	let am;
	attrRe.lastIndex = 0;
	while ((am = attrRe.exec(inner)) !== null) {
		const k = (am[1] || am[3] || '').toLowerCase();
		const v = am[2] || am[4] || '';
		if (k === 'rel') rel = v.toLowerCase();
		else if (k === 'href') href = v;
	}
	if (rel === 'modulepreload' && href.startsWith('/_app/immutable/')) {
		preloadHrefs.add(href.replace(/^\//, ''));
	}
}

/**
 * Resolve each preload href to a file path inside DIST_DIR. Also pull in any
 * static imports those preloaded files declare (they are part of the eager
 * set even though SvelteKit may not list them in modulepreload tags — though
 * in practice the adapter does list them).
 */
const eagerFiles = new Set();
for (const href of preloadHrefs) {
	const p = join(DIST_DIR, href);
	if (existsSync(p)) eagerFiles.add(p);
}

if (eagerFiles.size === 0) {
	log('no modulepreload chunks found in index.html — skipping (nothing to gate).');
	process.exit(0);
}

// Classify eager files: entry (under _app/immutable/entry/) vs chunks
// (under _app/immutable/chunks/). Nodes (pages) appear via modulepreload too,
// but they're tiny per-page glue. The TDZ-risk surface is the shared
// `chunks/` pool — that's what we cap.
const entryDir = join(IMMUTABLE_DIR, 'entry');
const chunksDir = join(IMMUTABLE_DIR, 'chunks');

const eagerEntries = [];
const eagerSharedChunks = [];
const eagerOther = [];

for (const f of eagerFiles) {
	if (f.startsWith(entryDir + '/') || f.startsWith(entryDir + '\\')) {
		eagerEntries.push(f);
	} else if (f.startsWith(chunksDir + '/') || f.startsWith(chunksDir + '\\')) {
		eagerSharedChunks.push(f);
	} else {
		eagerOther.push(f);
	}
}

log(`eager entries: ${eagerEntries.length}, shared chunks: ${eagerSharedChunks.length}, other (nodes/css): ${eagerOther.length}`);

// --- 2. Cap check ----------------------------------------------------------

if (eagerSharedChunks.length > EAGER_CHUNK_CAP) {
	const list = eagerSharedChunks.map((p) => '  - ' + relative(DIST_DIR, p)).join('\n');
	fail(
		`eager shared-chunk count ${eagerSharedChunks.length} exceeds cap ${EAGER_CHUNK_CAP}. ` +
			`This is the TDZ trip-wire (see memory: vendor-chunk-tdz-trap). ` +
			`Collapse to a single \`vendor\` chunk in vite.config.ts manualChunks, or move the ` +
			`offending dep behind a dynamic import.\nOffending chunks:\n${list}`
	);
}

// --- 3. Forbidden dep scan -------------------------------------------------

const allEager = [...eagerEntries, ...eagerSharedChunks, ...eagerOther].filter((p) => p.endsWith('.js'));

const violations = [];
for (const file of allEager) {
	let src;
	try {
		src = readFileSync(file, 'utf8');
	} catch (e) {
		continue;
	}
	for (const dep of FORBIDDEN_DEPS) {
		for (const marker of dep.markers) {
			if (src.includes(marker)) {
				violations.push({ file: relative(DIST_DIR, file), dep: dep.name, marker });
			}
		}
	}
}

if (violations.length > 0) {
	const list = violations
		.map((v) => `  - ${v.file} contains \`${v.marker}\` (forbidden eager dep: ${v.dep})`)
		.join('\n');
	fail(
		`forbidden heavy dependencies leaked into eager bundle. ` +
			`These libs must be loaded via dynamic import (lazy route or component-level await import()).\n` +
			list
	);
}

// --- 4. Inventory (informational) -----------------------------------------

const allImmutableJs = [];
function walk(dir) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p);
		else if (ent.isFile() && p.endsWith('.js')) allImmutableJs.push(p);
	}
}
walk(IMMUTABLE_DIR);

log(`total .js files under _app/immutable/: ${allImmutableJs.length}`);
log(`OK — eager chunks ${eagerSharedChunks.length}/${EAGER_CHUNK_CAP}, no forbidden deps in eager set.`);
