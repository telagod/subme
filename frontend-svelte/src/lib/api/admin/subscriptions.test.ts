/**
 * Admin subscriptions API · stop-the-bleeding guard.
 *
 * GROUND TRUTH（backend/internal/server/routes/admin.go:517-535）—— 唯一真实端点：
 *   GET    /admin/subscriptions , /:id , /:id/progress
 *   POST   /admin/subscriptions/assign , /bulk-assign
 *   POST   /admin/subscriptions/:id/extend   body { days }
 *   POST   /admin/subscriptions/:id/reset-quota
 *   DELETE /admin/subscriptions/:id           （Revoke）
 *
 * 这些断言锁死 wire format，防止再次回退到不存在的 /:id/cancel、/:id/refund、/:id/audit-log。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import * as subsApi from './subscriptions';
import {
	extendSub,
	revokeSub,
	resetQuotaSub,
	getAdminSub,
	listAdminSubs
} from './subscriptions';

vi.mock('../client', () => ({
	apiClient: {
		delete: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		streamPost: vi.fn(),
		put: vi.fn(),
		patch: vi.fn()
	}
}));

const mockedApi = apiClient as unknown as {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('extendSub', () => {
	it('POSTs /:id/extend with body { days } (NOT new_expires_at)', async () => {
		mockedApi.post.mockResolvedValue({ id: 42 });
		await extendSub(42, 30);

		expect(mockedApi.post).toHaveBeenCalledTimes(1);
		const [path, body] = mockedApi.post.mock.calls[0];
		expect(path).toBe('/api/v1/admin/subscriptions/42/extend');
		expect(body).toEqual({ days: 30 });
		// Regression lock: the old broken shape must never come back.
		expect(body).not.toHaveProperty('new_expires_at');
	});
});

describe('revokeSub', () => {
	it('DELETEs /admin/subscriptions/:id (no /cancel sub-route, no body)', async () => {
		mockedApi.delete.mockResolvedValue(undefined);
		await revokeSub(7);

		expect(mockedApi.delete).toHaveBeenCalledTimes(1);
		expect(mockedApi.delete).toHaveBeenCalledWith('/api/v1/admin/subscriptions/7');
		// Revoke must not be routed through POST /:id/cancel.
		expect(mockedApi.post).not.toHaveBeenCalled();
	});
});

describe('resetQuotaSub', () => {
	it('POSTs /:id/reset-quota', async () => {
		mockedApi.post.mockResolvedValue({ id: 9 });
		await resetQuotaSub(9);
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/subscriptions/9/reset-quota');
	});
});

describe('read paths', () => {
	it('getAdminSub hits GET /:id', async () => {
		mockedApi.get.mockResolvedValue({ id: 3 });
		await getAdminSub(3);
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/subscriptions/3');
	});

	it('listAdminSubs hits GET /admin/subscriptions', async () => {
		mockedApi.get.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20 });
		await listAdminSubs();
		const path = mockedApi.get.mock.calls[0][0] as string;
		expect(path.startsWith('/api/v1/admin/subscriptions')).toBe(true);
	});
});

describe('no phantom endpoints exported', () => {
	it('does NOT export refund / cancel / audit-log helpers (endpoints do not exist)', () => {
		const keys = Object.keys(subsApi);
		expect(keys).not.toContain('refundSub');
		expect(keys).not.toContain('forceCancelSub');
		expect(keys).not.toContain('getAuditLog');
		// adminSubscriptionsApi facade must also be clean.
		const facadeKeys = Object.keys(subsApi.adminSubscriptionsApi);
		expect(facadeKeys).toEqual(
			expect.arrayContaining(['listAdminSubs', 'getAdminSub', 'revokeSub', 'extendSub', 'resetQuotaSub'])
		);
		expect(facadeKeys).not.toContain('refundSub');
		expect(facadeKeys).not.toContain('forceCancelSub');
		expect(facadeKeys).not.toContain('getAuditLog');
	});

	it('no helper ever targets /cancel, /refund, or /audit-log', async () => {
		mockedApi.post.mockResolvedValue({});
		mockedApi.delete.mockResolvedValue(undefined);
		mockedApi.get.mockResolvedValue({ data: [] });

		await extendSub(1, 5);
		await revokeSub(1);
		await resetQuotaSub(1);
		await getAdminSub(1);
		await listAdminSubs();

		const allPaths = [
			...mockedApi.post.mock.calls,
			...mockedApi.delete.mock.calls,
			...mockedApi.get.mock.calls
		].map((c) => String(c[0]));

		for (const p of allPaths) {
			expect(p).not.toMatch(/\/cancel\b/);
			expect(p).not.toMatch(/\/refund\b/);
			expect(p).not.toMatch(/\/audit-log\b/);
		}
	});
});
