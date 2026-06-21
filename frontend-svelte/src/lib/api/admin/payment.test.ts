/**
 * Admin payment API · order-refund wire-format guard (stop-the-bleeding).
 *
 * GROUND TRUTH (backend/internal/server/routes/payment.go:97-103 +
 * handler AdminProcessRefundRequest):
 *   admin order refund = POST /api/v1/admin/payment/orders/:id/refund
 *   processed by PaymentHandler.ProcessRefund, body { amount, reason,
 *   force, deduct_balance }. :id is the ORDER id.
 *
 * These assertions lock the wire format so order refunds can never again be
 * routed through the nonexistent /admin/subscriptions/:id/refund endpoint via
 * an id-aliasing adapter (the original BLOCKER — broke balance/topup orders).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { refundOrder } from './payment';

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
	post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('refundOrder', () => {
	it('POSTs /admin/payment/orders/:id/refund (NOT a subscriptions path)', async () => {
		mockedApi.post.mockResolvedValue({ status: 'REFUNDED', amount: 12.5 });
		await refundOrder(1001, { amount: 12.5, reason: 'duplicate charge' });

		expect(mockedApi.post).toHaveBeenCalledTimes(1);
		const [path, body] = mockedApi.post.mock.calls[0];
		expect(path).toBe('/api/v1/admin/payment/orders/1001/refund');
		expect(body).toEqual({ amount: 12.5, reason: 'duplicate charge' });

		// Regression lock: the broken subscriptions-refund route must never come back.
		expect(path).not.toContain('/subscriptions/');
		expect(path).not.toContain('/admin/subscriptions');
	});

	it('uses the raw ORDER id in the path for string ids too', async () => {
		mockedApi.post.mockResolvedValue({ status: 'REFUNDED' });
		await refundOrder('ord_abc', {});

		const [path] = mockedApi.post.mock.calls[0];
		expect(path).toBe('/api/v1/admin/payment/orders/ord_abc/refund');
	});

	it('forwards optional ProcessRefund fields (force / deduct_balance) verbatim', async () => {
		mockedApi.post.mockResolvedValue({ status: 'REFUNDED' });
		await refundOrder(7, { amount: 5, reason: 'partial', force: true, deduct_balance: true });

		const [, body] = mockedApi.post.mock.calls[0];
		expect(body).toEqual({
			amount: 5,
			reason: 'partial',
			force: true,
			deduct_balance: true
		});
	});
});
