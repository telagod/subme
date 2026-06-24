import { describe, expect, it } from 'vitest';
import {
	ALL,
	buildErrorQueryParams,
	defaultFilters,
	displayModel,
	formatTime,
	smartMessage,
	statusTone,
	typeBadge,
	type OpsErrorFilterState
} from './OpsErrorLogTable.svelte';

function fakeFilters(over: Partial<OpsErrorFilterState> = {}): OpsErrorFilterState {
	return { ...defaultFilters(), ...over };
}

describe('OpsErrorLogTable helpers', () => {
	it('defaultFilters seeds ALL sentinels, never empty string', () => {
		const f = defaultFilters();
		expect(f.status).toBe(ALL);
		expect(f.resolved).toBe(ALL);
		expect(f.view).toBe('errors');
		expect(f.q).toBe('');
		expect(f.model).toBe('');
	});

	it('buildErrorQueryParams drops ALL sentinels and assembles base params', () => {
		const p = buildErrorQueryParams({
			filters: fakeFilters(),
			page: 2,
			pageSize: 20,
			timeRange: '1h'
		});
		expect(p).toMatchObject({ page: 2, page_size: 20, time_range: '1h', view: 'errors' });
		expect(p).not.toHaveProperty('status_codes');
		expect(p).not.toHaveProperty('status_codes_other');
		expect(p).not.toHaveProperty('resolved');
		expect(p).not.toHaveProperty('q');
		expect(p).not.toHaveProperty('model');
		expect(p).not.toHaveProperty('platform');
		expect(p).not.toHaveProperty('group_id');
	});

	it('buildErrorQueryParams maps concrete status code', () => {
		const p = buildErrorQueryParams({
			filters: fakeFilters({ status: '429' }),
			page: 1,
			pageSize: 20,
			timeRange: '5m'
		});
		expect(p.status_codes).toBe('429');
		expect(p).not.toHaveProperty('status_codes_other');
	});

	it('buildErrorQueryParams maps "other" sentinel to status_codes_other', () => {
		const p = buildErrorQueryParams({
			filters: fakeFilters({ status: 'other' }),
			page: 1,
			pageSize: 20,
			timeRange: '5m'
		});
		expect(p.status_codes_other).toBe(true);
		expect(p).not.toHaveProperty('status_codes');
	});

	it('buildErrorQueryParams maps resolved sentinel to boolean', () => {
		expect(
			buildErrorQueryParams({
				filters: fakeFilters({ resolved: 'true' }),
				page: 1,
				pageSize: 20,
				timeRange: '5m'
			}).resolved
		).toBe(true);
		expect(
			buildErrorQueryParams({
				filters: fakeFilters({ resolved: 'false' }),
				page: 1,
				pageSize: 20,
				timeRange: '5m'
			}).resolved
		).toBe(false);
	});

	it('buildErrorQueryParams forwards q / model / platform / groupId only when meaningful', () => {
		const p = buildErrorQueryParams({
			filters: fakeFilters({ q: '  abc ', model: ' gpt-4o ' }),
			page: 1,
			pageSize: 20,
			timeRange: '5m',
			platform: ' openai ',
			groupId: 7
		});
		expect(p.q).toBe('abc');
		expect(p.model).toBe('gpt-4o');
		expect(p.platform).toBe('openai');
		expect(p.group_id).toBe(7);

		const none = buildErrorQueryParams({
			filters: fakeFilters(),
			page: 1,
			pageSize: 20,
			timeRange: '5m',
			platform: '   ',
			groupId: 0
		});
		expect(none).not.toHaveProperty('platform');
		expect(none).not.toHaveProperty('group_id');
	});

	it('statusTone buckets by severity', () => {
		expect(statusTone(503)).toContain('destructive');
		expect(statusTone(429)).toContain('amber');
		expect(statusTone(404)).toContain('amber');
		expect(statusTone(200)).toContain('muted');
		expect(statusTone(undefined)).toContain('muted');
	});

	it('typeBadge maps phase+owner to semantic badge', () => {
		expect(typeBadge({ phase: 'upstream', error_owner: 'provider' }).key).toBe(
			'admin.ops.errorLog.typeUpstream'
		);
		expect(typeBadge({ phase: 'request', error_owner: 'client' }).key).toBe(
			'admin.ops.errorLog.typeRequest'
		);
		expect(typeBadge({ phase: 'auth', error_owner: 'client' }).tone).toContain('primary');
		const fb = typeBadge({ phase: 'weird', error_owner: '' });
		expect(fb.key).toBe('');
		expect(fb.fallback).toBe('weird');
	});

	it('displayModel prefers upstream then requested then model', () => {
		expect(displayModel({ upstream_model: 'a', requested_model: 'b', model: 'c' })).toBe('a');
		expect(displayModel({ requested_model: 'b', model: 'c' })).toBe('b');
		expect(displayModel({ model: 'c' })).toBe('c');
		expect(displayModel({})).toBe('');
	});

	it('smartMessage extracts nested JSON error message', () => {
		expect(smartMessage('{"error":{"message":"boom"}}')).toBe('boom');
		expect(smartMessage('{"message":"hi"}')).toBe('hi');
		expect(smartMessage('plain text')).toBe('plain text');
		expect(smartMessage(undefined)).toBe('');
	});

	it('smartMessage truncates very long plain text', () => {
		const long = 'x'.repeat(300);
		const out = smartMessage(long);
		expect(out.length).toBeLessThanOrEqual(201);
		expect(out.endsWith('…')).toBe(true);
	});

	it('smartMessage normalizes common network errors via translator', () => {
		const t = (k: string, _fb: string) => `T:${k}`;
		expect(smartMessage('dial tcp: connection refused', t)).toBe(
			'T:admin.ops.errorLog.commonErrors.connectionRefused'
		);
	});

	it('formatTime returns dash for empty/invalid', () => {
		expect(formatTime(undefined)).toBe('-');
		expect(formatTime('not-a-date')).toBe('-');
		expect(formatTime('2026-06-19T12:34:56Z')).not.toBe('-');
	});
});
