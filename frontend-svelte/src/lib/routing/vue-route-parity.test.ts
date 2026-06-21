import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { reroutePath } from './reroute';

const svelteRoutesRoot = path.join(process.cwd(), 'src/routes');
const srcRoot = path.join(process.cwd(), 'src');

const LEGACY_ROUTE_PATHS = [
	'/setup',
	'/home',
	'/login',
	'/register',
	'/email-verify',
	'/auth/callback',
	'/auth/oauth/callback',
	'/auth/linuxdo/callback',
	'/auth/wechat/callback',
	'/auth/wechat/payment/callback',
	'/auth/dingtalk/callback',
	'/auth/dingtalk/email-completion',
	'/auth/oidc/callback',
	'/forgot-password',
	'/reset-password',
	'/key-usage',
	'/legal/:documentId',
	'/',
	'/dashboard',
	'/keys',
	'/usage',
	'/redeem',
	'/affiliate',
	'/available-channels',
	'/profile',
	'/subscriptions',
	'/purchase',
	'/orders',
	'/payment/qrcode',
	'/payment/result',
	'/payment/stripe',
	'/payment/airwallex',
	'/payment/stripe-popup',
	'/custom/:id',
	'/admin',
	'/admin/dashboard',
	'/admin/ops',
	'/admin/users',
	'/admin/groups',
	'/admin/channels',
	'/admin/channels/pricing',
	'/admin/channels/monitor',
	'/monitor',
	'/admin/subscriptions',
	'/admin/subscriptions/legacy',
	'/admin/accounts',
	'/admin/announcements',
	'/admin/proxies',
	'/admin/proxies-v2',
	'/admin/redeem',
	'/admin/promo-codes',
	'/admin/settings',
	'/admin/settings/legacy',
	'/admin/risk-control',
	'/admin/usage',
	'/admin/affiliates',
	'/admin/affiliates/invites',
	'/admin/affiliates/rebates',
	'/admin/affiliates/transfers',
	'/admin/orders/dashboard',
	'/admin/orders',
	'/admin/orders/plans',
	'/admin/pricing'
] as const;

function collectSvelteRouteIds(dir = svelteRoutesRoot): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectSvelteRouteIds(full));
			continue;
		}
		if (entry.name !== '+page.svelte') continue;
		let rel = '/' + path.relative(svelteRoutesRoot, path.dirname(full)).split(path.sep).join('/');
		if (rel === '/') rel = '/';
		out.push(rel);
	}
	return out;
}

function collectSourceFiles(dir = srcRoot): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectSourceFiles(full));
			continue;
		}
		if (!/\.(svelte|ts)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
		out.push(full);
	}
	return out;
}

function legacyPathToSvelteRouteId(legacyPath: string): string {
	if (legacyPath === '/') return '/';
	return legacyPath.replace(/:([A-Za-z0-9_]+)/g, '[$1]');
}

function routeIdMatches(routeId: string, candidate: string): boolean {
	const publicRouteId = routeId.replace(/\/\([^)]+\)(?=\/|$)/g, '');
	if (routeId === candidate || publicRouteId === candidate) return true;
	const escaped = publicRouteId
		.split('/')
		.map((part) =>
			part.startsWith('[') && part.endsWith(']')
				? '[^/]+'
				: part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		)
		.join('/');
	return new RegExp(`^${escaped}$`).test(candidate);
}

function normalizeCandidate(target: string): string {
	return target.split(/[?#]/, 1)[0] || '/';
}

function routeExists(routeIds: Set<string>, target: string): boolean {
	const direct = normalizeCandidate(target);
	const mapped = reroutePath(direct);
	const candidates = [
		mapped,
		direct,
		direct === '/' ? undefined : `/(user)${direct}`
	].filter(Boolean) as string[];

	return candidates.some((candidate) =>
		[...routeIds].some((routeId) => routeIdMatches(routeId, candidate))
	);
}

function collectStaticRouteTargets(): Array<{ target: string; file: string }> {
	const patterns = [
		/goto\(\s*['"]([^'"]+)['"]/g,
		/href\s*=\s*['"]([^'"]+)['"]/g,
		/path:\s*['"]([^'"]+)['"]/g,
		/redirect\s*=\s*['"]([^'"]+)['"]/g
	];
	const targets: Array<{ target: string; file: string }> = [];

	for (const file of collectSourceFiles()) {
		const text = readFileSync(file, 'utf8');
		for (const pattern of patterns) {
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(text))) {
				const target = match[1];
				if (!target.startsWith('/')) continue;
				if (target.startsWith('/api/') || target.startsWith('/v1/')) continue;
				if (target.includes('…')) continue;
				targets.push({
					target,
					file: path.relative(srcRoot, file)
				});
			}
		}
	}

	return targets;
}

describe('legacy route parity', () => {
	it('has a Svelte route or reroute mapping for every concrete legacy Vue path and alias', () => {
		const routeIds = new Set(collectSvelteRouteIds());
		const missing: string[] = [];

		for (const legacyPath of LEGACY_ROUTE_PATHS) {
			const mapped = reroutePath(legacyPath);
			const direct = legacyPathToSvelteRouteId(legacyPath);
			const candidates = [
				mapped,
				direct,
				direct === '/' ? undefined : `/(user)${direct}`
			].filter(Boolean) as string[];

			if (
				!candidates.some((candidate) =>
					[...routeIds].some((routeId) => routeIdMatches(routeId, candidate))
				)
			) {
				missing.push(`${legacyPath} -> ${mapped ?? direct}`);
			}
		}

		expect(missing).toEqual([]);
	});

	it('keeps static source route targets resolvable', () => {
		const routeIds = new Set(collectSvelteRouteIds());
		const missing = collectStaticRouteTargets()
			.filter(({ target }) => !routeExists(routeIds, target))
			.map(({ target, file }) => `${target} (${file})`);

		expect(missing).toEqual([]);
	});
});
