import { describe, expect, it } from 'vitest';
import {
	ALL,
	buildCleanupPayload,
	buildLogQuery,
	clampInt,
	defaultFilters,
	defaultRuntimeConfig,
	formatSystemLogDetail,
	formatTime,
	levelTone,
	timeRangeToMs,
	toRFC3339,
	type OpsSystemLogFilterState
} from './OpsSystemLogTable.svelte';
import type { OpsSystemLog } from '$lib/api/admin/ops';

function fakeFilters(over: Partial<OpsSystemLogFilterState> = {}): OpsSystemLogFilterState {
	return { ...defaultFilters(), ...over };
}

describe('OpsSystemLogTable · filter defaults', () => {
	it('seeds ALL sentinel for level, never empty string', () => {
		const f = defaultFilters();
		expect(f.level).toBe(ALL);
		expect(f.time_range).toBe('1h');
		expect(f.platform).toBe('');
	});

	it('seeds platform from arg, trimmed', () => {
		expect(defaultFilters('  openai ').platform).toBe('openai');
	});

	it('runtime config defaults are sane', () => {
		const c = defaultRuntimeConfig();
		expect(c.level).toBe('info');
		expect(c.stacktrace_level).toBe('error');
		expect(c.retention_days).toBe(30);
		expect(c.caller).toBe(true);
		expect(c.enable_sampling).toBe(false);
	});
});

describe('OpsSystemLogTable · buildLogQuery', () => {
	it('drops ALL level sentinel and empty fields', () => {
		const q = buildLogQuery({ filters: fakeFilters(), page: 2, pageSize: 20 });
		expect(q).toMatchObject({ page: 2, page_size: 20, time_range: '1h' });
		expect(q).not.toHaveProperty('level');
		expect(q).not.toHaveProperty('component');
		expect(q).not.toHaveProperty('q');
	});

	it('forwards level when not ALL, trims text fields', () => {
		const q = buildLogQuery({
			filters: fakeFilters({
				level: 'error',
				component: ' http.access ',
				request_id: ' req-1 ',
				q: ' boom '
			}),
			page: 1,
			pageSize: 20
		});
		expect(q.level).toBe('error');
		expect(q.component).toBe('http.access');
		expect(q.request_id).toBe('req-1');
		expect(q.q).toBe('boom');
	});

	it('parses positive integer user_id / account_id, drops invalid', () => {
		const q = buildLogQuery({
			filters: fakeFilters({ user_id: '42', account_id: '0' }),
			page: 1,
			pageSize: 20
		});
		expect(q.user_id).toBe(42);
		expect(q).not.toHaveProperty('account_id');
	});

	it('converts datetime-local start/end to RFC3339', () => {
		const q = buildLogQuery({
			filters: fakeFilters({ start_time: '2026-06-20T10:00', end_time: '2026-06-20T11:00' }),
			page: 1,
			pageSize: 20
		});
		expect(q.start_time).toMatch(/Z$/);
		expect(q.end_time).toMatch(/Z$/);
	});
});

describe('OpsSystemLogTable · buildCleanupPayload', () => {
	it('derives absolute window from time_range when no explicit times', () => {
		const now = Date.parse('2026-06-20T12:00:00Z');
		const { payload, hasAny } = buildCleanupPayload(fakeFilters({ time_range: '1h' }), now);
		expect(hasAny).toBe(true);
		expect(payload.start_time).toBe(new Date(now - 3_600_000).toISOString());
		expect(payload.end_time).toBe(new Date(now).toISOString());
	});

	it('prefers explicit absolute times over time_range', () => {
		const { payload } = buildCleanupPayload(
			fakeFilters({ start_time: '2026-06-20T10:00', end_time: '2026-06-20T11:00' })
		);
		expect(payload.start_time).toMatch(/Z$/);
		expect(payload.end_time).toMatch(/Z$/);
	});

	it('drops ALL level sentinel from payload', () => {
		const { payload } = buildCleanupPayload(fakeFilters({ level: ALL }));
		expect(payload.level).toBeUndefined();
	});

	it('keeps explicit level in payload', () => {
		const { payload } = buildCleanupPayload(fakeFilters({ level: 'warn' }));
		expect(payload.level).toBe('warn');
	});

	it('hasAny true even with no filters because time_range derives a window', () => {
		// time_range always defaults to 1h → derives absolute window → hasAny true.
		const { hasAny } = buildCleanupPayload(fakeFilters());
		expect(hasAny).toBe(true);
	});
});

describe('OpsSystemLogTable · helpers', () => {
	it('timeRangeToMs maps known windows, null for unknown', () => {
		expect(timeRangeToMs('5m')).toBe(300_000);
		expect(timeRangeToMs('24h')).toBe(86_400_000);
		expect(timeRangeToMs('nope')).toBeNull();
	});

	it('toRFC3339 returns undefined for empty/invalid', () => {
		expect(toRFC3339('')).toBeUndefined();
		expect(toRFC3339('not-a-date')).toBeUndefined();
		expect(toRFC3339('2026-06-20T10:00')).toMatch(/Z$/);
	});

	it('levelTone maps semantic tones with no raw hex', () => {
		expect(levelTone('error')).toContain('text-destructive');
		expect(levelTone('warn')).toContain('amber-500');
		expect(levelTone('debug')).toContain('text-muted-foreground');
		expect(levelTone('info')).toContain('text-primary');
		// guard: no raw hex anywhere
		for (const lvl of ['error', 'warn', 'debug', 'info', 'fatal']) {
			expect(levelTone(lvl)).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		}
	});

	it('formatTime handles empty and invalid', () => {
		expect(formatTime('')).toBe('-');
		expect(formatTime(undefined)).toBe('-');
		expect(formatTime('garbage')).toBe('garbage');
	});

	it('clampInt clamps and floors', () => {
		expect(clampInt(0, 1, 3650)).toBe(1);
		expect(clampInt(99999, 1, 3650)).toBe(3650);
		expect(clampInt('30', 1, 3650)).toBe(30);
		expect(clampInt('abc', 1, 3650)).toBe(1);
		expect(clampInt(12.9, 1, 100)).toBe(12);
	});

	it('formatSystemLogDetail composes message + access + correlation + error', () => {
		const row: OpsSystemLog = {
			id: 1,
			created_at: '2026-06-20T10:00:00Z',
			level: 'info',
			component: 'http.access',
			message: 'request done',
			request_id: 'req-9',
			user_id: 7,
			platform: 'openai',
			extra: { status_code: 200, latency_ms: 12, method: 'GET', path: '/v1/x', error: 'boom' }
		};
		const out = formatSystemLogDetail(row);
		expect(out).toContain('request done');
		expect(out).toContain('status=200');
		expect(out).toContain('latency_ms=12');
		expect(out).toContain('req=req-9');
		expect(out).toContain('user=7');
		expect(out).toContain('platform=openai');
		expect(out).toContain('error=boom');
	});

	it('formatSystemLogDetail tolerates missing extra/message', () => {
		const row = { id: 2, created_at: '', level: 'warn', component: '', message: '' } as OpsSystemLog;
		expect(formatSystemLogDetail(row)).toBe('');
	});
});
