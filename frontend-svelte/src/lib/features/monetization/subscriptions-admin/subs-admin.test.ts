/**
 * /(admin)/monetization/subscriptions · vitest 覆盖（M22）
 *
 * 覆盖点：
 *   1. Subscriptions list mock 10 行 → 渲染 admin-subs-row 数 = 10
 *   2. Status filter Select 使用 '__all__' 哨兵 + DOM 不含 <option value="">
 *   3. Row click → SubscriptionDetailDrawer 打开 + audit log API 被调用
 *   4. Force-cancel 确认面板 → forceCancelSub API 被调用
 *   5. Refund dialog amount 校验 + reason 必填 + refundSub API 被调用
 *   6. 红线 grep：subscription surface 不出现 billing_service / channels/model-pricing / GetModelPricing
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/subscriptions' / '$lib/api/admin/plans'
 *   - 各 describe 在 beforeEach 重置 mock + 重新 import page 模块
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// 红线 grep：?raw 把源码字符串带进测试
import pageSrc from '../../../../routes/(admin)/monetization/subscriptions/+page.svelte?raw';
import drawerSrc from '$lib/features/monetization/subscriptions-admin/SubscriptionDetailDrawer.svelte?raw';
import refundSrc from '$lib/features/monetization/subscriptions-admin/RefundDialog.svelte?raw';
import apiSrc from '$lib/api/admin/subscriptions.ts?raw';

import type { AdminSubscription } from '$lib/api/admin/subscriptions';

vi.mock('$lib/api/admin/subscriptions', () => {
	return {
		listAdminSubs: vi.fn(),
		getAdminSub: vi.fn(),
		forceCancelSub: vi.fn(),
		refundSub: vi.fn(),
		extendSub: vi.fn(),
		getAuditLog: vi.fn(),
		adminSubscriptionsApi: {
			listAdminSubs: vi.fn(),
			getAdminSub: vi.fn(),
			forceCancelSub: vi.fn(),
			refundSub: vi.fn(),
			extendSub: vi.fn(),
			getAuditLog: vi.fn()
		}
	};
});

vi.mock('$lib/api/admin/plans', () => {
	return {
		listPlans: vi.fn().mockResolvedValue([]),
		listGroups: vi.fn().mockResolvedValue([])
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

function fakeSub(over: Partial<AdminSubscription> = {}): AdminSubscription {
	return {
		id: 1,
		user_id: 1001,
		user_email: 'alice@example.com',
		plan_id: 11,
		plan_name: 'Pro',
		group_id: 5,
		group_name: 'VIP',
		platform: 'anthropic',
		status: 'active',
		started_at: '2026-05-01T00:00:00Z',
		expires_at: '2026-07-01T00:00:00Z',
		cancelled_at: null,
		mtd_cost: 12.5,
		price_paid: 29.99,
		currency: 'USD',
		remaining_value: 15,
		...over
	};
}

function fakeListResponse(n: number) {
	const data: AdminSubscription[] = Array.from({ length: n }, (_, i) =>
		fakeSub({
			id: 100 + i,
			user_id: 1000 + i,
			user_email: `u${i}@example.com`,
			plan_name: i % 2 === 0 ? 'Pro' : 'Starter'
		})
	);
	return { data, total: n, page: 1, page_size: 20 };
}

// ─────────────────────────────────────────────────────────────────
// Test 1 · list renders 10 rows
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · list rendering', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/(admin)/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时；给到 30s
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(10));

		pageMod = await import(
			'../../../../routes/(admin)/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('renders 10 mock rows', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminSubs).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBe(10);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 2 · status filter sentinel
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · status filter sentinel', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/(admin)/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(5));

		pageMod = await import(
			'../../../../routes/(admin)/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('status filter uses __all__ sentinel; no empty-string option', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listAdminSubs).toHaveBeenCalled());

		const sentinelOpt = container.querySelector(
			'[data-testid="admin-subs-status-filter"] option[value="__all__"]'
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

describe('admin subscriptions · detail drawer wiring', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/(admin)/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockReset();
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(3));
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockImplementation(async (id) =>
			fakeSub({ id })
		);
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue([
			{
				id: 1,
				subscription_id: 100,
				action: 'created',
				actor: 'system',
				created_at: '2026-05-01T00:00:00Z'
			}
		]);

		pageMod = await import(
			'../../../../routes/(admin)/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('row click opens drawer and fetches detail + audit log', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-subs-row"]'
		) as HTMLElement;
		const subId = firstRow.getAttribute('data-sub-id');
		expect(subId).toBeTruthy();

		await fireEvent.click(firstRow);

		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="sub-detail-drawer"]');
			expect(drawer).not.toBeNull();
		});

		await waitFor(() => {
			expect(api.getAdminSub).toHaveBeenCalled();
			expect(api.getAuditLog).toHaveBeenCalled();
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 4 · force-cancel confirm → API called
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · force cancel', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/(admin)/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockReset();
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockReset();
		(api.forceCancelSub as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(2));
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockImplementation(async (id) =>
			fakeSub({ id })
		);
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.forceCancelSub as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		pageMod = await import(
			'../../../../routes/(admin)/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('force-cancel confirm panel calls forceCancelSub with reason', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector(
			'[data-testid="admin-subs-row"]'
		) as HTMLElement;
		await fireEvent.click(firstRow);

		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="sub-detail-drawer"]');
			expect(drawer).not.toBeNull();
		});
		await waitFor(() => {
			expect(api.getAdminSub).toHaveBeenCalled();
		});

		// 打开取消确认面板
		await waitFor(() => {
			const cancelBtn = document.body.querySelector(
				'[data-testid="sub-detail-cancel-btn"]'
			) as HTMLButtonElement;
			expect(cancelBtn).not.toBeNull();
		});
		const cancelBtn = document.body.querySelector(
			'[data-testid="sub-detail-cancel-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(cancelBtn);

		// 填入 reason 并确认
		await waitFor(() => {
			const reasonInput = document.body.querySelector(
				'[data-testid="sub-detail-cancel-reason"]'
			) as HTMLTextAreaElement;
			expect(reasonInput).not.toBeNull();
		});
		const reasonInput = document.body.querySelector(
			'[data-testid="sub-detail-cancel-reason"]'
		) as HTMLTextAreaElement;
		await fireEvent.input(reasonInput, { target: { value: 'customer requested closure' } });

		const confirmBtn = document.body.querySelector(
			'[data-testid="sub-detail-cancel-confirm"]'
		) as HTMLButtonElement;
		expect(confirmBtn).not.toBeNull();
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.forceCancelSub).toHaveBeenCalled();
			const [, reason] = (api.forceCancelSub as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(reason).toBe('customer requested closure');
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 5 · refund dialog amount + reason validation + API
// ─────────────────────────────────────────────────────────────────

describe('admin subscriptions · refund dialog', () => {
	let api: typeof import('$lib/api/admin/subscriptions');
	let pageMod: typeof import('../../../../routes/(admin)/monetization/subscriptions/+page.svelte');

	beforeEach(async () => {
		// 受 i18n parity test 并发拖累，beforeEach 默认 10s 会超时
		api = await import('$lib/api/admin/subscriptions');
		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockReset();
		(api.refundSub as ReturnType<typeof vi.fn>).mockReset();
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockReset();
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockReset();

		(api.listAdminSubs as ReturnType<typeof vi.fn>).mockResolvedValue(fakeListResponse(1));
		(api.refundSub as ReturnType<typeof vi.fn>).mockResolvedValue({ amount: 10 });
		(api.getAdminSub as ReturnType<typeof vi.fn>).mockImplementation(async (id) =>
			fakeSub({ id })
		);
		(api.getAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue([]);

		pageMod = await import(
			'../../../../routes/(admin)/monetization/subscriptions/+page.svelte'
		);
	}, 30000);

	it('refund: invalid amount blocks submission, then valid payload calls API', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="admin-subs-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		// 触发行内 Refund 按钮
		const quick = container.querySelector(
			'[data-testid="admin-subs-refund-quick"]'
		) as HTMLButtonElement;
		expect(quick).not.toBeNull();
		await fireEvent.click(quick);

		// Dialog 出现
		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="refund-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const amountInput = document.body.querySelector(
			'[data-testid="refund-amount-input"]'
		) as HTMLInputElement;
		const reasonInput = document.body.querySelector(
			'[data-testid="refund-reason-input"]'
		) as HTMLTextAreaElement;
		const confirmBtn = document.body.querySelector(
			'[data-testid="refund-confirm-btn"]'
		) as HTMLButtonElement;
		expect(amountInput).not.toBeNull();
		expect(reasonInput).not.toBeNull();
		expect(confirmBtn).not.toBeNull();

		// 1) amount = 0 → 校验失败
		await fireEvent.input(amountInput, { target: { value: '0' } });
		await fireEvent.input(reasonInput, { target: { value: 'duplicate billing complaint' } });
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			const err = document.body.querySelector('[data-testid="refund-amount-error"]');
			expect(err).not.toBeNull();
		});
		expect(api.refundSub).not.toHaveBeenCalled();

		// 2) reason 太短 → 校验失败
		await fireEvent.input(amountInput, { target: { value: '5' } });
		await fireEvent.input(reasonInput, { target: { value: 'no' } });
		await fireEvent.click(confirmBtn);
		await waitFor(() => {
			const err = document.body.querySelector('[data-testid="refund-reason-error"]');
			expect(err).not.toBeNull();
		});
		expect(api.refundSub).not.toHaveBeenCalled();

		// 3) 合法 payload → 调 API
		await fireEvent.input(amountInput, { target: { value: '5' } });
		await fireEvent.input(reasonInput, { target: { value: 'verified billing duplicate' } });
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.refundSub).toHaveBeenCalled();
			const [, payload] = (api.refundSub as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(payload.amount).toBe(5);
			expect(payload.reason).toBe('verified billing duplicate');
			expect(payload.notify_user).toBe(true);
		});
	});
});

// ─────────────────────────────────────────────────────────────────
// Test 6 · RED LINE grep
// ─────────────────────────────────────────────────────────────────

describe('RED LINE · admin subscriptions surface must not reference billing core', () => {
	it('no source file under subscriptions surface references forbidden strings', () => {
		const sources: Array<[string, string]> = [
			['subscriptions/+page.svelte', pageSrc as unknown as string],
			['SubscriptionDetailDrawer.svelte', drawerSrc as unknown as string],
			['RefundDialog.svelte', refundSrc as unknown as string],
			['api/admin/subscriptions.ts', apiSrc as unknown as string]
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
