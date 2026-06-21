import type { Proxy, ProxyTestResult, ProxyQualityCheckResult, SaveProxyPayload, ProxyBatchDeleteResult } from '$lib/api/admin/proxies';

export type ProxyBatchScope = 'selected' | 'all';

export type ProxyBatchParseResult = {
	mode: 'empty' | 'json' | 'url';
	total: number;
	valid: number;
	invalid: number;
	duplicate: number;
	proxies: SaveProxyPayload[];
	error?: string;
};

export const PROTOCOL_OPTIONS = ['http', 'https', 'socks5', 'socks5h'];

export function testResultText(proxy: Proxy, result: ProxyTestResult): string {
	const latency = typeof result.latency_ms === 'number' ? ` · ${result.latency_ms}ms` : '';
	return `${proxy.name}: ${result.success ? 'OK' : 'failed'}${latency}${result.message ? ` · ${result.message}` : ''}`;
}

export function qualityScoreText(result: ProxyQualityCheckResult | null): string {
	return typeof result?.score === 'number' ? String(result.score) : '-';
}

export function qualityMessage(result: ProxyQualityCheckResult | null): string {
	if (!result) return '-';
	const summary = result.summary;
	if (typeof summary === 'string' && summary.trim()) return summary;
	if (typeof result.message === 'string' && result.message.trim()) return result.message;
	return result.success ? 'Quality check passed' : 'Quality check failed';
}

export function qualityDetailRows(result: ProxyQualityCheckResult | null): Array<Record<string, unknown>> {
	if (!result) return [];
	if (Array.isArray(result.items)) return result.items as Array<Record<string, unknown>>;
	if (Array.isArray(result.results)) return result.results;
	return [];
}

export function detailText(value: unknown, fallback = '-'): string {
	if (value === null || value === undefined || value === '') return fallback;
	return String(value);
}

export function formatLatency(value: unknown): string {
	return typeof value === 'number' ? `${value}ms` : '-';
}

export function proxyNoun(count: number): string {
	return count === 1 ? 'proxy' : 'proxies';
}

export function batchDeleteCount(result: ProxyBatchDeleteResult, fallback: number): number {
	const record = result as unknown as Record<string, unknown>;
	if (Array.isArray(result.deleted_ids)) return result.deleted_ids.length;
	for (const key of ['deleted', 'deleted_count', 'count', 'success']) {
		const value = record[key];
		if (typeof value === 'number') return value;
	}
	return fallback;
}

export function batchSkipCount(result: ProxyBatchDeleteResult): number {
	const skipped = (result as unknown as Record<string, unknown>).skipped;
	if (Array.isArray(skipped)) return skipped.length;
	return typeof skipped === 'number' ? skipped : 0;
}

export function expiryUnixSeconds(date: string): number | null {
	if (!date) return null;
	const ms = new Date(`${date}T00:00:00Z`).getTime();
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function optionalPositiveInteger(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function downloadJson(filename: string, payload: string) {
	if (typeof document === 'undefined') return;
	const blob = new Blob([payload], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export async function readFileAsText(file: File): Promise<string> {
	if (typeof file.text === 'function') return file.text();
	const buffer = await file.arrayBuffer();
	return new TextDecoder().decode(buffer);
}

export function importResultSummary(result: Record<string, unknown> | null): string {
	if (!result) return '';
	const created = result.proxy_created ?? result.created ?? result.imported ?? 0;
	const reused = result.proxy_reused ?? result.reused ?? 0;
	const failed = result.proxy_failed ?? result.failed ?? 0;
	return `Created ${created} · reused ${reused} · failed ${failed}`;
}

export function importResultErrors(result: Record<string, unknown> | null): string[] {
	if (!result) return [];
	const source = result.errors ?? result.proxy_errors ?? result.failures;
	if (!Array.isArray(source)) return [];
	return source.map((item) => {
		if (typeof item === 'string') return item;
		if (item && typeof item === 'object') {
			const row = item as Record<string, unknown>;
			return String(row.error ?? row.message ?? row.reason ?? JSON.stringify(row));
		}
		return String(item);
	});
}

function emptyBatchParse(): ProxyBatchParseResult {
	return {
		mode: 'empty',
		total: 0,
		valid: 0,
		invalid: 0,
		duplicate: 0,
		proxies: []
	};
}

function parseProxyUrlLine(line: string): SaveProxyPayload | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const parsed = new URL(trimmed);
		const protocol = parsed.protocol.replace(':', '').toLowerCase();
		if (!PROTOCOL_OPTIONS.includes(protocol)) return null;
		const port = Number(parsed.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
		const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
		if (!host) return null;
		return {
			name: `${protocol}-${host}-${port}`,
			protocol,
			host,
			port,
			username: parsed.username ? decodeURIComponent(parsed.username) : '',
			password: parsed.password ? decodeURIComponent(parsed.password) : '',
			status: 'active'
		};
	} catch {
		return null;
	}
}

function parseProxyUrlBatch(value: string): ProxyBatchParseResult {
	const lines = value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return emptyBatchParse();
	const seen = new Set<string>();
	const proxies: SaveProxyPayload[] = [];
	let invalid = 0;
	let duplicate = 0;
	for (const line of lines) {
		const proxy = parseProxyUrlLine(line);
		if (!proxy) {
			invalid += 1;
			continue;
		}
		const key = `${proxy.protocol}:${proxy.host}:${proxy.port}:${proxy.username ?? ''}:${proxy.password ?? ''}`;
		if (seen.has(key)) {
			duplicate += 1;
			continue;
		}
		seen.add(key);
		proxies.push(proxy);
	}
	return {
		mode: 'url',
		total: lines.length,
		valid: proxies.length,
		invalid,
		duplicate,
		proxies
	};
}

export function parseProxyBatch(value: string): ProxyBatchParseResult {
	const trimmed = value.trim();
	if (!trimmed) return emptyBatchParse();
	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		try {
			const parsed = JSON.parse(trimmed);
			const proxies = Array.isArray(parsed) ? parsed : parsed.proxies;
			if (!Array.isArray(proxies)) {
				return { ...emptyBatchParse(), mode: 'json', error: 'Batch JSON must be an array or { proxies: [] }' };
			}
			return {
				mode: 'json',
				total: proxies.length,
				valid: proxies.length,
				invalid: 0,
				duplicate: 0,
				proxies
			};
		} catch (err) {
			return {
				...emptyBatchParse(),
				mode: 'json',
				total: 1,
				invalid: 1,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
	return parseProxyUrlBatch(trimmed);
}
