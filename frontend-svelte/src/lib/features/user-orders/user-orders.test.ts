import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import apiSrc from '$lib/api/user/payment.ts?raw';
import pageSrc from '../../../routes/(user)/orders/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	canCancel,
	canRequestRefund,
	formatMoney,
	orderTypeLabel,
	statusTone
} from './user-orders';
import type { UserPaymentOrder } from '$lib/api/user/payment';

vi.mock('$lib/api/user/payment', async () => {
	const actual = await vi.importActual<typeof import('$lib/api/user/payment')>('$lib/api/user/payment');
	return {
		...actual,
		listMyOrders: vi.fn(),
		cancelMyOrder: vi.fn(),
		requestMyOrderRefund: vi.fn(),
		getRefundEligibleProviders: vi.fn()
	};
});

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

const order: UserPaymentOrder = {
	id: 1,
	user_id: 1,
	amount: 10,
	pay_amount: 10.5,
	currency: 'USD',
	fee_rate: 5,
	payment_type: 'stripe',
	out_trade_no: 'otn-1',
	status: 'COMPLETED',
	order_type: 'balance',
	created_at: '2026-01-01T00:00:00Z',
	expires_at: '2026-01-01T01:00:00Z',
	refund_amount: 0,
	provider_instance_id: 'stripe-main'
};

beforeAll(async () => {
	addMessages('en', {
		common: { all: 'All', refresh: 'Refresh', actions: 'Actions', cancel: 'Cancel', success: 'Success', processing: 'Processing...' },
		payment: {
			confirmCancel: 'Cancel this pending order?',
			refundReason: 'Refund reason',
			refundReasonPlaceholder: 'Reason',
			result: { backToRecharge: 'Buy subscription' },
			status: {
				pending: 'Pending',
				completed: 'Completed',
				failed: 'Failed',
				refunded: 'Refunded',
				refund_requested: 'Refund requested',
				cancelled: 'Cancelled'
			},
			methods: { stripe: 'Stripe' },
			orders: {
				title: 'Orders',
				description: 'desc',
				orderId: 'Order ID',
				orderNo: 'Order No',
				payAmount: 'Pay Amount',
				amount: 'Amount',
				paymentMethod: 'Payment Method',
				status: 'Status',
				createdAt: 'Created At',
				creditedAmount: 'Credited',
				cancel: 'Cancel',
				requestRefund: 'Request refund',
				empty: 'No orders found'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('user orders helpers', () => {
	it('formats status, money, and action gates', () => {
		expect(formatMoney(10.5)).toBe('$10.50');
		expect(orderTypeLabel(order)).toBe('Balance top-up');
		expect(statusTone('COMPLETED')).toContain('emerald');
		expect(canCancel({ ...order, status: 'PENDING' })).toBe(true);
		expect(canCancel(order)).toBe(false);
		expect(canRequestRefund(order, new Set(['stripe-main']))).toBe(true);
		expect(canRequestRefund(order, new Set())).toBe(false);
	});

	it('keeps user orders page wired to payment order backend contract', () => {
		expect(apiSrc).toContain('/api/v1/payment/orders/my');
		expect(apiSrc).toContain('/api/v1/payment/orders/${id}/cancel');
		expect(apiSrc).toContain('/api/v1/payment/orders/${id}/refund-request');
		expect(apiSrc).toContain('/api/v1/payment/orders/refund-eligible-providers');
		expect(pageSrc).toContain('data-testid="user-orders-page"');
		expect(pageSrc).toContain('data-testid="user-order-row"');
		expect(pageSrc).toContain('StandardDialog');
		expect(pageSrc).toContain('data-testid="user-order-cancel-dialog"');
		expect(pageSrc).toContain('data-testid="user-order-refund-dialog"');
		expect(pageSrc).not.toContain('fixed inset-0');
		expect(rerouteSrc).not.toContain("'/orders'");
	});
});

describe('user orders page', () => {
	let api: typeof import('$lib/api/user/payment');
	let pageMod: typeof import('../../../routes/(user)/orders/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/payment');
		(api.listMyOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.cancelMyOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.requestMyOrderRefund as ReturnType<typeof vi.fn>).mockReset();
		(api.getRefundEligibleProviders as ReturnType<typeof vi.fn>).mockReset();
		(api.listMyOrders as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				{ ...order, id: 1, status: 'PENDING', provider_instance_id: 'stripe-main' },
				{ ...order, id: 2, status: 'COMPLETED', provider_instance_id: 'stripe-main' }
			],
			total: 2,
			page: 1,
			page_size: 20,
			pages: 1
		});
		(api.getRefundEligibleProviders as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(['stripe-main']));
		(api.cancelMyOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		(api.requestMyOrderRefund as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		pageMod = await import('../../../routes/(user)/orders/+page.svelte');
	});

	it('renders rows and performs cancel/refund actions', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listMyOrders).toHaveBeenCalled());
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="user-order-row"]').length).toBe(2);
		});

		const cancelButton = Array.from(container.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('Cancel')
		) as HTMLButtonElement;
		await fireEvent.click(cancelButton);
		await waitFor(() =>
			expect(document.body.querySelector('[data-testid="user-order-cancel-dialog"]')).not.toBeNull()
		);
		const confirmCancel = Array.from(
			document.body.querySelectorAll('[data-testid="user-order-cancel-dialog"] button')
		).at(-1) as HTMLButtonElement;
		await fireEvent.click(confirmCancel);
		await waitFor(() => expect(api.cancelMyOrder).toHaveBeenCalledWith(1));

		const refundButton = Array.from(container.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('Request refund')
		) as HTMLButtonElement;
		await fireEvent.click(refundButton);
		await waitFor(() =>
			expect(document.body.querySelector('[data-testid="user-order-refund-dialog"]')).not.toBeNull()
		);
		const textarea = document.body.querySelector(
			'[data-testid="user-order-refund-dialog"] textarea'
		) as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'duplicate charge' } });
		const confirmRefund = Array.from(
			document.body.querySelectorAll('[data-testid="user-order-refund-dialog"] button')
		).at(-1) as HTMLButtonElement;
		await fireEvent.click(confirmRefund);
		await waitFor(() => expect(api.requestMyOrderRefund).toHaveBeenCalledWith(2, 'duplicate charge'));
	});
});
