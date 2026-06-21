/**
 * /(admin)/orders/list · vitest 覆盖（M12）
 *
 * 覆盖点：
 *   1. Orders list mock 5 行 → 渲染 admin-orders-row 数 = 5
 *   2. Status filter Select 用 '__all__' 哨兵 + DOM 不含 <option value="">
 *   3. Row click → AdminOrderDetail drawer 打开 + audit log API 被调用
 *   4. Refund quick action → 委托给 M11 RefundDialog（refund-dialog testid 出现）
 *   5. Retry / Cancel delegate（drawer 内按钮触发 retryOrder / cancelOrder）
 *   6. AdminOrderDetail 使用 StandardDrawer，不再手写 bits overlay
 *   7. 红线 grep：orders surface 不含 billing_service / channels/model-pricing / GetModelPricing
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/orders' / '$lib/api/admin/plans' / '$lib/api/admin/payment'
 *   - 各 describe 在 beforeEach 重置 mock + 重新 import page 模块
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// 红线 grep：?raw 把源码字符串带进测试
import pageSrc from '../../../routes/admin/orders/list/+page.svelte?raw';
import rootPageSrc from '../../../routes/admin/orders/+page.svelte?raw';
import drawerSrc from '$lib/features/orders/AdminOrderDetail.svelte?raw';
import filterSrc from '$lib/features/orders/OrdersFilterBar.svelte?raw';
import apiSrc from '$lib/api/admin/orders.ts?raw';

import type { AdminOrder } from '$lib/api/admin/orders';

vi.mock('$lib/api/admin/orders', () => {
	return {
		listAdminOrders: vi.fn(),
		getAdminOrder: vi.fn(),
		retryOrder: vi.fn(),
		cancelOrder: vi.fn(),
		listOrderAuditLog: vi.fn(),
		adminOrdersApi: {
			listAdminOrders: vi.fn(),
			getAdminOrder: vi.fn(),
			retryOrder: vi.fn(),
			cancelOrder: vi.fn(),
			listOrderAuditLog: vi.fn()
		}
	};
});

vi.mock('$lib/api/admin/plans', () => {
	return {
		listPlans: vi.fn().mockResolvedValue([]),
		listGroups: vi.fn().mockResolvedValue([])
	};
});

vi.mock('$lib/api/admin/payment', () => {
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

function fakeOrder(over: Partial<AdminOrder> = {}): AdminOrder {
	return {
		id: 1,
		out_trade_no: 'OUT-0001',
		user_id: 1001,
		user_email: 'alice@example.com',
		plan_id: 11,
		plan_name: 'Pro',
		order_type: 'subscription',
		payment_type: 'stripe',
		payment_provider: 'stripe',
		provider_id: 1,
		provider_name: 'Stripe',
		status: 'PAID',
		base_amount: 30,
		pay_amount: 29.99,
		credited_amount: 29.99,
		fee: 0.99,
		currency: 'USD',
		created_at: '2026-06-01T00:00:00Z',
		expires_at: '2026-07-01T00:00:00Z',
		paid_at: '2026-06-01T00:01:00Z',
		completed_at: null,
		actually_refunded: 0,
		...over
	};
}

function fakeListResponse(n: number) {
	const data: AdminOrder[] = Array.from({ length: n }, (_, i) =>
		fakeOrder({
			id: 100 + i,
			out_trade_no: `OUT-${100 + i}`,
			user_id: 1000 + i,
			user_email: `u${i}@example.com`,
			plan_name: i % 2 === 0 ? 'Pro' : 'Starter'
		})
	);
	return { data, total: n, page: 1, page_size: 20 };
}

// ─────────────────────────────────────────────────────────────────
// Test 1 · list renders 5 rows
// ─────────────────────────────────────────────────────────────────

describe('admin orders · list rendering', () => {
	let api: typeof import('$lib/api/admin/orders');
	let pageMod: typeof import('../../../routes/admin/orders/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/orders');
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeListResponse(5)
		);

		pageMod = await import('../../../routes/admin/orders/+page.svelte');
	}, 30000);

	it('root /admin/orders renders the real list and no placeholder copy', async () => {
		expect(rootPageSrc).not.toContain('Admin orders placeholder');
		expect(rootPageSrc).toContain('./list/+page.svelte');

		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminOrders).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-orders-row"]');
			expect(rows.length).toBe(5);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 2 · status filter sentinel
// ─────────────────────────────────────────────────────────────────

describe('admin orders · status filter sentinel', () => {
	let api: typeof import('$lib/api/admin/orders');
	let pageMod: typeof import('../../../routes/admin/orders/list/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/orders');
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeListResponse(3)
		);

		pageMod = await import('../../../routes/admin/orders/list/+page.svelte');
	}, 30000);

	it('status filter uses __all__ sentinel; no empty-string option', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminOrders).toHaveBeenCalled());

		const sentinelOpt = container.querySelector(
			'[data-testid="admin-orders-status-filter"] option[value="__all__"]'
		);
		expect(sentinelOpt).not.toBeNull();

		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 3 · row click → drawer open + audit log fetched
// ─────────────────────────────────────────────────────────────────

describe('admin orders · detail drawer wiring', () => {
	let api: typeof import('$lib/api/admin/orders');
	let pageMod: typeof import('../../../routes/admin/orders/list/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/orders');
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.listOrderAuditLog as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeListResponse(3)
		);
		(api.getAdminOrder as ReturnType<typeof vi.fn>).mockImplementation(
			async (id) => fakeOrder({ id })
		);
		(api.listOrderAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue([
			{
				id: 1,
				order_id: 100,
				action: 'created',
				actor: 'system',
				created_at: '2026-06-01T00:00:00Z'
			}
		]);

		pageMod = await import('../../../routes/admin/orders/list/+page.svelte');
	}, 30000);

	it('row click opens drawer and fetches detail + audit log', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-orders-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-orders-row"]'
		) as HTMLElement;
		const orderId = firstRow.getAttribute('data-order-id');
		expect(orderId).toBeTruthy();

		await fireEvent.click(firstRow);

		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="order-detail-drawer"]');
			expect(drawer).not.toBeNull();
		});

		await waitFor(() => {
			expect(api.getAdminOrder).toHaveBeenCalled();
			expect(api.listOrderAuditLog).toHaveBeenCalled();
		});
	});

	it('AdminOrderDetail uses StandardDrawer instead of a hand-rolled bits overlay', () => {
		expect(drawerSrc).toContain('StandardDrawer');
		expect(drawerSrc).toContain('data-testid="order-detail-drawer"');
		expect(drawerSrc).not.toContain('Dialog.Root');
		expect(drawerSrc).not.toContain('Dialog.Overlay');
		expect(drawerSrc).not.toContain('fixed inset-0');
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 4 · refund quick action → OrderRefundDialog wired
// ─────────────────────────────────────────────────────────────────

describe('admin orders · refund opens feature-native OrderRefundDialog', () => {
	let api: typeof import('$lib/api/admin/orders');
	let pageMod: typeof import('../../../routes/admin/orders/list/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/orders');
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeListResponse(1)
		);

		pageMod = await import('../../../routes/admin/orders/list/+page.svelte');
	}, 30000);

	it('clicking row refund-quick opens OrderRefundDialog and refunds the ORDER', async () => {
		const payApi = await import('$lib/api/admin/payment');
		(payApi.refundOrder as ReturnType<typeof vi.fn>).mockReset();
		(payApi.refundOrder as ReturnType<typeof vi.fn>).mockResolvedValue({
			amount: 0,
			status: 'REFUNDED'
		});

		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-orders-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-orders-row"]'
		) as HTMLElement;
		const orderId = Number(firstRow.getAttribute('data-order-id'));

		const quick = container.querySelector(
			'[data-testid="admin-orders-refund-quick"]'
		) as HTMLButtonElement;
		expect(quick).not.toBeNull();
		await fireEvent.click(quick);

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="order-refund-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// Confirm the refund: amount pre-filled, supply a reason ≥ 4 chars.
		const reasonInput = document.body.querySelector(
			'[data-testid="order-refund-reason-input"]'
		) as HTMLTextAreaElement;
		await fireEvent.input(reasonInput, { target: { value: 'duplicate charge' } });

		const confirmBtn = document.body.querySelector(
			'[data-testid="order-refund-confirm-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(payApi.refundOrder).toHaveBeenCalled();
			const [calledId] = (payApi.refundOrder as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(calledId).toBe(orderId);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 5 · retry + cancel delegate to API
// ─────────────────────────────────────────────────────────────────

describe('admin orders · drawer retry / cancel delegate', () => {
	let api: typeof import('$lib/api/admin/orders');
	let pageMod: typeof import('../../../routes/admin/orders/list/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/orders');
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.listOrderAuditLog as ReturnType<typeof vi.fn>).mockReset();
		(api.retryOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.cancelOrder as ReturnType<typeof vi.fn>).mockReset();

		(api.retryOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		(api.cancelOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		(api.listOrderAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue([]);
	}, 30000);

	it('retry button calls retryOrder for FAILED order', async () => {
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: [fakeOrder({ id: 501, status: 'FAILED' })],
			total: 1,
			page: 1,
			page_size: 20
		});
		(api.getAdminOrder as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeOrder({ id: 501, status: 'FAILED' })
		);

		pageMod = await import('../../../routes/admin/orders/list/+page.svelte');
		const { container } = render(pageMod.default);
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="admin-orders-row"]').length).toBe(1);
		});

		const row = container.querySelector('[data-testid="admin-orders-row"]') as HTMLElement;
		await fireEvent.click(row);

		await waitFor(() => {
			const btn = document.body.querySelector('[data-testid="order-detail-retry-btn"]');
			expect(btn).not.toBeNull();
		});
		const retryBtn = document.body.querySelector(
			'[data-testid="order-detail-retry-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(retryBtn);

		await waitFor(() => {
			expect(api.retryOrder).toHaveBeenCalled();
			const [calledId] = (api.retryOrder as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(calledId).toBe(501);
		});
	});

	it('cancel button calls cancelOrder for PENDING order', async () => {
		(api.listAdminOrders as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: [fakeOrder({ id: 601, status: 'PENDING' })],
			total: 1,
			page: 1,
			page_size: 20
		});
		(api.getAdminOrder as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeOrder({ id: 601, status: 'PENDING' })
		);

		pageMod = await import('../../../routes/admin/orders/list/+page.svelte');
		const { container } = render(pageMod.default);
		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid="admin-orders-row"]').length).toBe(1);
		});

		const row = container.querySelector('[data-testid="admin-orders-row"]') as HTMLElement;
		await fireEvent.click(row);

		await waitFor(() => {
			const btn = document.body.querySelector('[data-testid="order-detail-cancel-btn"]');
			expect(btn).not.toBeNull();
		});
		const cancelBtn = document.body.querySelector(
			'[data-testid="order-detail-cancel-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(cancelBtn);

		await waitFor(() => {
			expect(api.cancelOrder).toHaveBeenCalled();
			const [calledId] = (api.cancelOrder as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(calledId).toBe(601);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 6 · RED LINE grep
// ─────────────────────────────────────────────────────────────────

describe('RED LINE · admin orders surface must not reference billing core', () => {
	it('no source file under orders surface references forbidden strings', () => {
		const sources: Array<[string, string]> = [
			['orders/+page.svelte', rootPageSrc as unknown as string],
			['orders/list/+page.svelte', pageSrc as unknown as string],
			['AdminOrderDetail.svelte', drawerSrc as unknown as string],
			['OrdersFilterBar.svelte', filterSrc as unknown as string],
			['api/admin/orders.ts', apiSrc as unknown as string]
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
});
