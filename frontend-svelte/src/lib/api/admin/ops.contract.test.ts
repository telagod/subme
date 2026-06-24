/**
 * Admin Ops API · wire-format contract guard.
 *
 * GROUND TRUTH: backend/internal/server/routes/admin.go registerOpsRoutes
 * (group `/api/v1/admin/ops`). These assertions lock method + path + body shape
 * for a representative sample of the ops surface so a refactor can never silently
 * re-point an endpoint (e.g. drop the `/dashboard/` segment, swap PUT→POST, or
 * forget the RFC3339 silence body).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import {
	getOpsDashboardSnapshot,
	getOpsDashboardOverview,
	getOpsErrorDistribution,
	getOpsConcurrencyStats,
	getOpsUserConcurrencyStats,
	getOpsRealtimeTraffic,
	listOpsAlertRules,
	createOpsAlertRule,
	updateOpsAlertRule,
	deleteOpsAlertRule,
	updateOpsAlertEventStatus,
	createOpsAlertSilence,
	getOpsEmailNotificationConfig,
	updateOpsAdvancedSettings,
	getOpsMetricThresholds,
	updateOpsMetricThresholds,
	resetOpsRuntimeLogConfig,
	listOpsRequestErrors,
	resolveOpsRequestError,
	listOpsRequestErrorUpstreamErrors,
	listOpsSystemLogs,
	cleanupOpsSystemLogs,
	getOpsSystemLogSinkHealth,
	type AlertRule
} from './ops';

vi.mock('../client', () => ({
	apiClient: {
		delete: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		streamPost: vi.fn()
	}
}));

const api = apiClient as unknown as {
	get: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

const BASE = '/api/v1/admin/ops';

// A paginated response.Success envelope the supply.getPaginated helper unwraps.
const paginated = { code: 0, data: { items: [], total: 0, page: 1, page_size: 20 } };

beforeEach(() => {
	vi.clearAllMocks();
	api.get.mockResolvedValue({ code: 0, data: {} });
	api.post.mockResolvedValue({ code: 0, data: {} });
	api.put.mockResolvedValue({ code: 0, data: {} });
	api.delete.mockResolvedValue({ code: 0, data: {} });
});

describe('ops dashboard endpoints', () => {
	it('snapshot-v2 GET hits /dashboard/snapshot-v2 with query', async () => {
		await getOpsDashboardSnapshot({ time_range: '1h', platform: 'claude' });
		const [path] = api.get.mock.calls[0];
		expect(path).toBe(`${BASE}/dashboard/snapshot-v2?time_range=1h&platform=claude`);
	});

	it('overview GET hits /dashboard/overview', async () => {
		await getOpsDashboardOverview({ time_range: '6h' });
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/dashboard/overview?time_range=6h`);
	});

	it('error-distribution GET hits /dashboard/error-distribution', async () => {
		await getOpsErrorDistribution({});
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/dashboard/error-distribution`);
	});
});

describe('ops realtime endpoints', () => {
	it('concurrency GET hits /concurrency', async () => {
		await getOpsConcurrencyStats({ platform: 'openai' });
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/concurrency?platform=openai`);
	});

	it('user-concurrency GET takes no query', async () => {
		await getOpsUserConcurrencyStats();
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/user-concurrency`);
	});

	it('realtime-traffic GET defaults window=1m', async () => {
		await getOpsRealtimeTraffic({ platform: 'gemini' });
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/realtime-traffic?window=1m&platform=gemini`);
	});
});

describe('ops alert rules CRUD', () => {
	const rule: AlertRule = {
		name: 'high-error-rate',
		enabled: true,
		severity: 'P1',
		metric_type: 'error_rate',
		operator: 'gt',
		threshold: 5,
		window_minutes: 5,
		sustained_minutes: 3,
		cooldown_minutes: 30,
		notify_email: true
	};

	it('list GET hits /alert-rules and tolerates null payload', async () => {
		api.get.mockResolvedValueOnce({ code: 0, data: null });
		const res = await listOpsAlertRules();
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/alert-rules`);
		expect(res).toEqual([]);
	});

	it('create POST hits /alert-rules with rule body', async () => {
		await createOpsAlertRule(rule);
		const [path, body] = api.post.mock.calls[0];
		expect(path).toBe(`${BASE}/alert-rules`);
		expect(body).toEqual(rule);
	});

	it('update PUT hits /alert-rules/:id', async () => {
		await updateOpsAlertRule(42, { enabled: false });
		const [path, body] = api.put.mock.calls[0];
		expect(path).toBe(`${BASE}/alert-rules/42`);
		expect(body).toEqual({ enabled: false });
	});

	it('delete DELETE hits /alert-rules/:id', async () => {
		await deleteOpsAlertRule(42);
		expect(api.delete.mock.calls[0][0]).toBe(`${BASE}/alert-rules/42`);
	});
});

describe('ops alert events + silences', () => {
	it('event status PUT hits /alert-events/:id/status with status body', async () => {
		await updateOpsAlertEventStatus(7, 'manual_resolved');
		const [path, body] = api.put.mock.calls[0];
		expect(path).toBe(`${BASE}/alert-events/7/status`);
		expect(body).toEqual({ status: 'manual_resolved' });
	});

	it('silence POST hits /alert-silences with RFC3339 until verbatim', async () => {
		await createOpsAlertSilence({
			rule_id: 3,
			platform: 'claude',
			until: '2026-06-21T00:00:00Z',
			reason: 'maintenance'
		});
		const [path, body] = api.post.mock.calls[0];
		expect(path).toBe(`${BASE}/alert-silences`);
		expect(body).toEqual({
			rule_id: 3,
			platform: 'claude',
			until: '2026-06-21T00:00:00Z',
			reason: 'maintenance'
		});
	});
});

describe('ops settings endpoints', () => {
	it('email-notification config GET hits nested path', async () => {
		await getOpsEmailNotificationConfig();
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/email-notification/config`);
	});

	it('advanced-settings PUT hits /advanced-settings', async () => {
		const payload = { auto_refresh_enabled: true } as never;
		await updateOpsAdvancedSettings(payload);
		const [path, body] = api.put.mock.calls[0];
		expect(path).toBe(`${BASE}/advanced-settings`);
		expect(body).toBe(payload);
	});

	it('metric-thresholds GET/PUT hit /settings/metric-thresholds', async () => {
		await getOpsMetricThresholds();
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/settings/metric-thresholds`);
		await updateOpsMetricThresholds({ sla_percent_min: 99.5 });
		const [path, body] = api.put.mock.calls[0];
		expect(path).toBe(`${BASE}/settings/metric-thresholds`);
		expect(body).toEqual({ sla_percent_min: 99.5 });
	});

	it('runtime logging reset POST hits /runtime/logging/reset', async () => {
		await resetOpsRuntimeLogConfig();
		const [path, body] = api.post.mock.calls[0];
		expect(path).toBe(`${BASE}/runtime/logging/reset`);
		expect(body).toEqual({});
	});
});

describe('ops error log endpoints', () => {
	it('request-errors list GET hits /request-errors (paginated)', async () => {
		api.get.mockResolvedValueOnce(paginated);
		await listOpsRequestErrors({ page: 2, time_range: '24h' });
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/request-errors?page=2&time_range=24h`);
	});

	it('request-error resolve PUT hits /request-errors/:id/resolve with resolved body', async () => {
		await resolveOpsRequestError(11, true);
		const [path, body] = api.put.mock.calls[0];
		expect(path).toBe(`${BASE}/request-errors/11/resolve`);
		expect(body).toEqual({ resolved: true });
	});

	it('upstream-errors drilldown maps include_detail → include_detail=1', async () => {
		api.get.mockResolvedValueOnce(paginated);
		await listOpsRequestErrorUpstreamErrors(11, { page: 1 }, { include_detail: true });
		expect(api.get.mock.calls[0][0]).toBe(
			`${BASE}/request-errors/11/upstream-errors?page=1&include_detail=1`
		);
	});
});

describe('ops system log endpoints', () => {
	it('system-logs list GET hits /system-logs (paginated)', async () => {
		api.get.mockResolvedValueOnce(paginated);
		await listOpsSystemLogs({ level: 'error', q: 'timeout' });
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/system-logs?level=error&q=timeout`);
	});

	it('system-logs cleanup POST hits /system-logs/cleanup and unwraps deleted', async () => {
		api.post.mockResolvedValueOnce({ code: 0, data: { deleted: 12 } });
		const res = await cleanupOpsSystemLogs({ level: 'debug' });
		const [path, body] = api.post.mock.calls[0];
		expect(path).toBe(`${BASE}/system-logs/cleanup`);
		expect(body).toEqual({ level: 'debug' });
		expect(res).toEqual({ deleted: 12 });
	});

	it('system-logs health GET hits /system-logs/health', async () => {
		await getOpsSystemLogSinkHealth();
		expect(api.get.mock.calls[0][0]).toBe(`${BASE}/system-logs/health`);
	});
});
