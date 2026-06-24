/**
 * /(admin)/orders/refunds · vitest 覆盖
 *
 * 覆盖点：
 *   1. List mock pending + approved + rejected → 渲染对应 admin-refunds-row。
 *   2. Approve → 打开 M11 RefundDialog，RefundDialog confirm 路径触发
 *      refundSub mock，后续 approveRefund 被调用。
 *   3. Reject → 内置 confirm dialog 出现 → 校验空 reason 阻止提交 →
 *      填入合法 reason → rejectRefund(id, reason) 被调用。
 *   4. Status filter Select 用 '__all__' 哨兵且 DOM 无 <option value="">。
 *   5. 红线 grep：refunds surface 不引用 billing_service / channels/model-pricing / GetModelPricing。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/refunds' / '$lib/api/admin/subscriptions'
 *     / '$lib/stores/toast.svelte'
 *   - 各 describe 在 beforeEach 重置 mock + 重新 import page 模块
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// 红线 grep：?raw 把源码字符串带进测试
import pageSrcRaw from '../../../routes/admin/orders/refunds/+page.svelte?raw';
import refundDetailDrawerSrc from '$lib/features/refunds/RefundDetailDrawer.svelte?raw';
import apiSrc from '$lib/api/admin/refunds.ts?raw';

const pageSrc = [pageSrcRaw, refundDetailDrawerSrc].join('\n');

import type { AdminRefundRequest } from '$lib/api/admin/refunds';

vi.mock('$lib/api/admin/refunds', () => {
	return {
		listRefundQueue: vi.fn(),
		getRefund: vi.fn(),
		approveRefund: vi.fn(),
		rejectRefund: vi.fn(),
		adminRefundsApi: {
			listRefundQueue: vi.fn(),
			getRefund: vi.fn(),
			approveRefund: vi.fn(),
			rejectRefund: vi.fn()
		}
	};
});

vi.mock('$lib/api/admin/payment', () => {
	// OrderRefundDialog 依赖 refundOrder —— 命中真实 ProcessRefund 端点。
	return {
		listProviders: vi.fn().mockResolvedValue([]),
		createProvider: vi.fn(),
		updateProvider: vi.fn(),
		deleteProvider: vi.fn(),
		refundOrder: vi.fn().mockResolvedValue({ amount: 0, status: 'REFUNDED' }),
		adminPaymentApi: {
			listProviders: vi.fn().mockResolvedValue([]),
			createProvider: vi.fn(),
			updateProvider: vi.fn(),
			deleteProvider: vi.fn(),
			refundOrder: vi.fn().mockResolvedValue({ amount: 0, status: 'REFUNDED' })
		}
	};
});

vi.mock('$lib/stores/toast.svelte', async () => {
	return {
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		dismiss: vi.fn(),
		toasts: { list: [] }
	};
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeRequest(over: Partial<AdminRefundRequest> = {}): AdminRefundRequest {
	return {
		id: 1,
		order_id: 1001,
		out_trade_no: 'OUT-1001',
		user_id: 2001,
		user_email: 'alice@example.com',
		amount: 19.99,
		currency: 'USD',
		reason: 'duplicate charge',
		status: 'pending',
		requested_at: '2026-06-10T08:00:00Z',
		plan_id: 11,
		plan_name: 'Pro',
		payment_provider: 'stripe',
		...over
	};
}

function fakeMixedListResponse() {
	const data: AdminRefundRequest[] = [
		fakeRequest({ id: 1, status: 'pending' }),
		fakeRequest({ id: 2, status: 'pending', order_id: 1002, out_trade_no: 'OUT-1002' }),
		fakeRequest({ id: 3, status: 'approved', order_id: 1003, out_trade_no: 'OUT-1003' }),
		fakeRequest({ id: 4, status: 'rejected', order_id: 1004, out_trade_no: 'OUT-1004' })
	];
	return { data, total: data.length, page: 1, page_size: 20 };
}

// ─────────────────────────────────────────────────────────────────
// Test 1 · queue list renders pending + approved + rejected rows
// ─────────────────────────────────────────────────────────────────

describe('admin refunds · list rendering', () => {
	let api: typeof import('$lib/api/admin/refunds');
	let pageMod: typeof import('../../../routes/admin/orders/refunds/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/refunds');
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockReset();
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeMixedListResponse()
		);

		pageMod = await import('../../../routes/admin/orders/refunds/+page.svelte');
	}, 30000);

	it('renders mixed pending + approved + rejected rows', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listRefundQueue).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-refunds-row"]');
			expect(rows.length).toBe(4);
		});

		const statuses = Array.from(
			container.querySelectorAll('[data-testid="admin-refunds-row"]')
		).map((el) => el.getAttribute('data-refund-status'));
		expect(statuses).toContain('pending');
		expect(statuses).toContain('approved');
		expect(statuses).toContain('rejected');

		// Only pending rows should expose approve/reject buttons.
		const approveBtns = container.querySelectorAll('[data-testid="admin-refunds-approve"]');
		const rejectBtns = container.querySelectorAll('[data-testid="admin-refunds-reject"]');
		expect(approveBtns.length).toBe(2);
		expect(rejectBtns.length).toBe(2);
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 2 · status filter sentinel
// ─────────────────────────────────────────────────────────────────

describe('admin refunds · status filter sentinel', () => {
	let api: typeof import('$lib/api/admin/refunds');
	let pageMod: typeof import('../../../routes/admin/orders/refunds/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/refunds');
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockReset();
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeMixedListResponse()
		);

		pageMod = await import('../../../routes/admin/orders/refunds/+page.svelte');
	}, 30000);

	it('status filter uses __all__ sentinel; no empty-string option', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listRefundQueue).toHaveBeenCalled());

		const sentinelOpt = container.querySelector(
			'[data-testid="admin-refunds-status-filter"] option[value="__all__"]'
		);
		expect(sentinelOpt).not.toBeNull();

		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 3 · approve → RefundDialog → approveRefund
// ─────────────────────────────────────────────────────────────────

describe('admin refunds · approve delegates to OrderRefundDialog → refundOrder', () => {
	let api: typeof import('$lib/api/admin/refunds');
	let payApi: typeof import('$lib/api/admin/payment');
	let pageMod: typeof import('../../../routes/admin/orders/refunds/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/refunds');
		payApi = await import('$lib/api/admin/payment');
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockReset();
		(api.approveRefund as ReturnType<typeof vi.fn>).mockReset();
		(payApi.refundOrder as ReturnType<typeof vi.fn>).mockReset();

		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockResolvedValue({
			// id = queue-request id (7777); order_id = the real order (1001)
			data: [fakeRequest({ id: 7777, order_id: 1001, status: 'pending', amount: 12.5 })],
			total: 1,
			page: 1,
			page_size: 20
		});
		(api.approveRefund as ReturnType<typeof vi.fn>).mockResolvedValue({
			status: 'approved'
		});
		(payApi.refundOrder as ReturnType<typeof vi.fn>).mockResolvedValue({
			amount: 12.5,
			status: 'REFUNDED'
		});

		pageMod = await import('../../../routes/admin/orders/refunds/+page.svelte');
	}, 30000);

	it('approve → OrderRefundDialog → refundOrder(ORDER id) then approveRefund(REQUEST id)', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			expect(
				container.querySelectorAll('[data-testid="admin-refunds-row"]').length
			).toBe(1);
		});

		const approveBtn = container.querySelector(
			'[data-testid="admin-refunds-approve"]'
		) as HTMLButtonElement;
		expect(approveBtn).not.toBeNull();
		await fireEvent.click(approveBtn);

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="order-refund-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// amount pre-filled from refundable balance; supply a reason ≥ 4 chars.
		const reasonInput = document.body.querySelector(
			'[data-testid="order-refund-reason-input"]'
		) as HTMLTextAreaElement;
		await fireEvent.input(reasonInput, { target: { value: 'approved by admin' } });

		const confirmBtn = document.body.querySelector(
			'[data-testid="order-refund-confirm-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(confirmBtn);

		// Refund must hit the ORDER record, not a subscription/ghost endpoint.
		await waitFor(() => {
			expect(payApi.refundOrder).toHaveBeenCalled();
			const [orderId] = (payApi.refundOrder as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(orderId).toBe(1001);
		});

		// Queue-side mark uses the REQUEST id.
		await waitFor(() => {
			expect(api.approveRefund).toHaveBeenCalled();
			const [calledId] = (api.approveRefund as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(calledId).toBe(7777);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 4 · reject confirm dialog + rejectRefund
// ─────────────────────────────────────────────────────────────────

describe('admin refunds · reject confirm dialog', () => {
	let api: typeof import('$lib/api/admin/refunds');
	let pageMod: typeof import('../../../routes/admin/orders/refunds/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/refunds');
		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockReset();
		(api.rejectRefund as ReturnType<typeof vi.fn>).mockReset();

		(api.listRefundQueue as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: [fakeRequest({ id: 8888, status: 'pending' })],
			total: 1,
			page: 1,
			page_size: 20
		});
		(api.rejectRefund as ReturnType<typeof vi.fn>).mockResolvedValue({
			status: 'rejected'
		});

		pageMod = await import('../../../routes/admin/orders/refunds/+page.svelte');
	}, 30000);

	it('reject button → confirm dialog → empty reason blocked → valid reason triggers rejectRefund', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			expect(
				container.querySelectorAll('[data-testid="admin-refunds-row"]').length
			).toBe(1);
		});

		const rejectBtn = container.querySelector(
			'[data-testid="admin-refunds-reject"]'
		) as HTMLButtonElement;
		expect(rejectBtn).not.toBeNull();
		await fireEvent.click(rejectBtn);

		await waitFor(() => {
			const dlg = document.body.querySelector(
				'[data-testid="admin-refunds-reject-dialog"]'
			);
			expect(dlg).not.toBeNull();
		});

		// Attempt empty-reason confirm — should display error, no API call.
		const confirmBtn = document.body.querySelector(
			'[data-testid="admin-refunds-reject-confirm"]'
		) as HTMLButtonElement;
		await fireEvent.click(confirmBtn);
		await waitFor(() => {
			const err = document.body.querySelector('[data-testid="admin-refunds-reject-error"]');
			expect(err).not.toBeNull();
		});
		expect(api.rejectRefund).not.toHaveBeenCalled();

		// Now supply a valid reason and confirm.
		const reasonInput = document.body.querySelector(
			'[data-testid="admin-refunds-reject-reason-input"]'
		) as HTMLTextAreaElement;
		await fireEvent.input(reasonInput, {
			target: { value: 'fraudulent chargeback' }
		});
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.rejectRefund).toHaveBeenCalled();
			const [calledId, calledReason] = (
				api.rejectRefund as ReturnType<typeof vi.fn>
			).mock.calls[0];
			expect(calledId).toBe(8888);
			expect(calledReason).toBe('fraudulent chargeback');
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 5 · RED LINE grep
// ─────────────────────────────────────────────────────────────────

describe('RED LINE · admin refunds surface must not reference billing core', () => {
	it('no source file under refunds surface references forbidden strings', () => {
		const sources: Array<[string, string]> = [
			['orders/refunds/+page.svelte', pageSrc as unknown as string],
			['api/admin/refunds.ts', apiSrc as unknown as string]
		];
		const forbidden = [
			'billing_service',
			'/admin/channels/model-pricing',
			'GetModelPricing'
		];
		for (const [label, src] of sources) {
			for (const needle of forbidden) {
				expect(
					src.includes(needle),
					`${label} contains forbidden string "${needle}"`
				).toBe(false);
			}
		}
	});

	it('detail drawer uses StandardDrawer instead of a hand-rolled bits overlay', () => {
		expect(pageSrc).toContain('StandardDrawer');
		expect(pageSrc).toContain('data-testid="admin-refunds-detail-drawer"');
		expect(pageSrc).not.toContain('Dialog.Overlay');
		expect(pageSrc).not.toContain('fixed inset-0');
	});
});
