import { describe, it, expect } from 'vitest';
import {
	parseTimeRangeMinutes,
	buildTimeWindow,
	buildRequestDetailsParams,
	formatDurationMs,
	statusTone,
	formatDateTime,
	type OpsRequestDetailsPreset
} from './OpsRequestDetailsModal.svelte';

describe('parseTimeRangeMinutes', () => {
	it('parses minute suffix', () => {
		expect(parseTimeRangeMinutes('5m')).toBe(5);
		expect(parseTimeRangeMinutes('30m')).toBe(30);
	});
	it('parses hour suffix', () => {
		expect(parseTimeRangeMinutes('1h')).toBe(60);
		expect(parseTimeRangeMinutes('6h')).toBe(360);
	});
	it('parses day suffix', () => {
		expect(parseTimeRangeMinutes('7d')).toBe(7 * 24 * 60);
	});
	it('falls back to 60 on empty / invalid / non-positive', () => {
		expect(parseTimeRangeMinutes('')).toBe(60);
		expect(parseTimeRangeMinutes('garbage')).toBe(60);
		expect(parseTimeRangeMinutes('0m')).toBe(60);
		expect(parseTimeRangeMinutes('-3h')).toBe(60);
	});
});

describe('buildTimeWindow', () => {
	it('derives ISO start/end from now minus window', () => {
		const now = new Date('2026-06-20T12:00:00.000Z');
		const w = buildTimeWindow('30m', now);
		expect(w.end_time).toBe('2026-06-20T12:00:00.000Z');
		expect(w.start_time).toBe('2026-06-20T11:30:00.000Z');
	});
	it('handles hour window', () => {
		const now = new Date('2026-06-20T12:00:00.000Z');
		const w = buildTimeWindow('6h', now);
		expect(w.start_time).toBe('2026-06-20T06:00:00.000Z');
	});
});

describe('buildRequestDetailsParams', () => {
	const now = new Date('2026-06-20T12:00:00.000Z');
	const base = { timeRange: '1h', page: 1, pageSize: 10, now };

	it('defaults kind=all, sort=created_at_desc when preset omits them', () => {
		const preset: OpsRequestDetailsPreset = { title: 'All' };
		const p = buildRequestDetailsParams({ ...base, preset });
		expect(p.kind).toBe('all');
		expect(p.sort).toBe('created_at_desc');
		expect(p.page).toBe(1);
		expect(p.page_size).toBe(10);
		expect(p.start_time).toBe('2026-06-20T11:00:00.000Z');
		expect(p.end_time).toBe('2026-06-20T12:00:00.000Z');
	});

	it('honours preset kind/sort and duration bounds', () => {
		const preset: OpsRequestDetailsPreset = {
			title: 'Slow',
			kind: 'success',
			sort: 'duration_desc',
			min_duration_ms: 2000
		};
		const p = buildRequestDetailsParams({ ...base, preset });
		expect(p.kind).toBe('success');
		expect(p.sort).toBe('duration_desc');
		expect(p.min_duration_ms).toBe(2000);
		expect(p.max_duration_ms).toBeUndefined();
	});

	it('drops empty platform and non-positive group_id', () => {
		const preset: OpsRequestDetailsPreset = { title: 'x' };
		const p = buildRequestDetailsParams({ ...base, preset, platform: '   ', groupId: 0 });
		expect(p.platform).toBeUndefined();
		expect(p.group_id).toBeUndefined();
	});

	it('passes trimmed platform and positive group_id', () => {
		const preset: OpsRequestDetailsPreset = { title: 'x' };
		const p = buildRequestDetailsParams({
			...base,
			preset,
			platform: '  openai  ',
			groupId: 7
		});
		expect(p.platform).toBe('openai');
		expect(p.group_id).toBe(7);
	});

	it('keeps min_duration_ms=0 (a valid number, not dropped)', () => {
		const preset: OpsRequestDetailsPreset = { title: 'x', min_duration_ms: 0 };
		const p = buildRequestDetailsParams({ ...base, preset });
		expect(p.min_duration_ms).toBe(0);
	});
});

describe('formatDurationMs', () => {
	it('formats finite numbers with ms suffix', () => {
		expect(formatDurationMs(0)).toBe('0 ms');
		expect(formatDurationMs(1234)).toBe('1234 ms');
	});
	it('returns dash for null / undefined / non-finite', () => {
		expect(formatDurationMs(null)).toBe('-');
		expect(formatDurationMs(undefined)).toBe('-');
		expect(formatDurationMs(NaN)).toBe('-');
	});
});

describe('statusTone', () => {
	it('maps 5xx to destructive token', () => {
		expect(statusTone(500)).toContain('text-destructive');
		expect(statusTone(503)).toContain('text-destructive');
	});
	it('maps 4xx to amber token', () => {
		expect(statusTone(404)).toContain('amber');
		expect(statusTone(429)).toContain('amber');
	});
	it('maps 2xx/3xx to emerald token', () => {
		expect(statusTone(200)).toContain('emerald');
	});
	it('maps null / 0 to muted token', () => {
		expect(statusTone(null)).toContain('muted');
		expect(statusTone(0)).toContain('muted');
	});
	it('never emits raw hex', () => {
		for (const c of [200, 404, 500, null, 0]) {
			expect(statusTone(c)).not.toMatch(/#[0-9a-f]{3,8}/i);
		}
	});
});

describe('formatDateTime', () => {
	it('returns dash for empty / invalid', () => {
		expect(formatDateTime(null)).toBe('-');
		expect(formatDateTime(undefined)).toBe('-');
		expect(formatDateTime('not-a-date')).toBe('-');
	});
	it('returns a non-dash string for valid ISO', () => {
		expect(formatDateTime('2026-06-20T12:00:00.000Z')).not.toBe('-');
	});
});
