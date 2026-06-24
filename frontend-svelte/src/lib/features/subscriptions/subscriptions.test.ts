/**
 * /(user)/subscriptions · /(user)/purchase · vitest 覆盖（M6）
 *
 * 覆盖点：
 *   1. 列表渲染：mock listPlans → /purchase 渲染 3 张 PlanCard
 *   2. CurrentSubCard：mock getCurrent 有值 → /subscriptions 渲染卡 + Cancel 按钮
 *   3. CancelDialog：点击 Cancel → 确认 → POST /subscriptions/cancel + 列表刷新
 *   4. 空态：listPlans 返回 [] → /purchase 显示 emptyTitle
 *
 * Mock 策略：vi.mock '$lib/api/user/subscriptions' 一律替换为 vi.fn()。
 *   beforeEach 重置 + 重新装载页面模块（动态 import 拿到新模块实例）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { UserSubscription, Plan } from '$lib/api/user/subscriptions';
import cancelDialogSrc from './CancelDialog.svelte?raw';
import purchasePageSrc from '../../../routes/(user)/purchase/+page.svelte?raw';

// vi.mock hoists —— 必须在 import +page.svelte 之前
vi.mock('$lib/api/user/subscriptions', () => {
	return {
		listPlans: vi.fn(),
		listAll: vi.fn(),
		listActive: vi.fn(),
		getCurrent: vi.fn(),
		listHistory: vi.fn(),
		cancel: vi.fn(),
		userSubscriptionsApi: {
			listPlans: vi.fn(),
			listAll: vi.fn(),
			listActive: vi.fn(),
			getCurrent: vi.fn(),
			listHistory: vi.fn(),
			cancel: vi.fn()
		}
	};
});

// payment facade —— /purchase Subscribe 按钮路径会动态 import。stub 一份。
vi.mock('$lib/api/user/payment', () => {
	return {
		startCheckout: vi.fn().mockResolvedValue({ orderId: 'stub', outTradeNo: 'stub' }),
		userPaymentApi: { startCheckout: vi.fn() }
	};
});

// toast 静音
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
	addMessages('en', {
		nav: {
			mySubscriptions: 'My Subscriptions',
			buySubscription: 'Buy Subscription'
		},
		user: {
			subscriptions: {
				pageTitle: 'My Subscriptions',
				pageSubtitle: 'sub',
				refresh: 'Refresh',
				retry: 'Retry',
				failedToLoad: 'load fail',
				currentLabel: 'Current subscription',
				startedAt: 'Started',
				renewsAt: 'Renews at',
				expiringSoon: 'expiring',
				cancel: 'Cancel',
				upgrade: 'Upgrade',
				browsePlans: 'Browse plans',
				emptyTitle: 'No active subscription',
				emptyDescription: 'pick a plan',
				historyTitle: 'Subscription history',
				historyEmpty: 'No past subscriptions yet.',
				colPlan: 'Plan',
				colStatus: 'Status',
				colEnded: 'Ended',
				colAmount: 'Amount',
				cancelTitle: 'Cancel subscription?',
				cancelDescription: 'You will keep access to {planName}',
				keepSubscription: 'Keep subscription',
				cancelling: 'Cancelling...',
				confirmCancel: 'Cancel subscription',
				cancelSuccess: 'cancelled',
				cancelError: 'fail',
				status: {
					active: 'Active',
					trialing: 'Trialing',
					expired: 'Expired',
					cancelled: 'Cancelled',
					pending: 'Pending'
				}
			},
			purchase: {
				pageTitle: 'Choose a plan',
				pageSubtitle: 'sub',
				refresh: 'Refresh',
				retry: 'Retry',
				failedToLoad: 'load fail',
				subscribe: 'Subscribe',
				emptyTitle: 'No plans available',
				emptyDescription: 'check back',
				promoLabel: 'Promo code',
				promoPlaceholder: 'code',
				promoApply: 'Apply',
				promoClear: 'Clear',
				promoApplied: 'applied {code}',
				providerTitle: 'Choose a payment method',
				providerStripe: 'Stripe',
				providerAirwallex: 'Airwallex',
				providerBalance: 'Pay with balance',
				cancel: 'Cancel',
				close: 'Close',
				continueToPayment: 'Continue to payment',
				processing: 'Processing...',
				checkoutError: 'checkout fail',
				period: {
					day: '/ {count} day',
					month: '/ {count} month',
					year: '/ {count} year'
				}
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakePlan(over: Partial<Plan> = {}): Plan {
	return {
		id: 'plan-1',
		name: 'Pro',
		price: 10,
		periodUnit: 'month',
		periodValue: 1,
		platform: 'anthropic',
		features: ['Higher quota', 'Priority support'],
		...over
	};
}

function fakeSub(over: Partial<UserSubscription> = {}): UserSubscription {
	return {
		id: 'sub-1',
		planId: 'plan-1',
		planName: 'Pro',
		platform: 'anthropic',
		status: 'active',
		startedAt: '2026-06-01T00:00:00Z',
		expiresAt: '2027-06-01T00:00:00Z',
		cancelledAt: null,
		pricePaid: 10,
		currency: 'USD',
		...over
	};
}

// ────────────────────────────────────────────────────────────────
// /purchase · plans rendering + empty
// ────────────────────────────────────────────────────────────────

describe('purchase page · plans rendering', () => {
	let api: typeof import('$lib/api/user/subscriptions');
	let pageMod: typeof import('../../../routes/(user)/purchase/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/subscriptions');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();

		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
			fakePlan({ id: 'p1', name: 'Starter', price: 5 }),
			fakePlan({ id: 'p2', name: 'Pro', price: 15 }),
			fakePlan({ id: 'p3', name: 'Elite', price: 50, platform: 'openai' })
		]);

		pageMod = await import('../../../routes/(user)/purchase/+page.svelte');
	}, 30000);

	it('renders 3 plan cards from mock fixture', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listPlans).toHaveBeenCalled());
		await waitFor(() => {
			const cards = container.querySelectorAll('[data-testid="plan-card"]');
			expect(cards.length).toBe(3);
		});
	});

	it('provider picker uses StandardDialog instead of a hand-rolled overlay', () => {
		expect(purchasePageSrc).toContain('StandardDialog');
		expect(purchasePageSrc).toContain('data-testid="purchase-provider-panel"');
		expect(purchasePageSrc).not.toContain('purchase-provider-overlay');
		expect(purchasePageSrc).not.toContain('fixed inset-0');
		expect(purchasePageSrc).not.toContain('role="dialog"');
	});
});

describe('purchase page · empty plans state', () => {
	let api: typeof import('$lib/api/user/subscriptions');
	let pageMod: typeof import('../../../routes/(user)/purchase/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/subscriptions');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();
		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		pageMod = await import('../../../routes/(user)/purchase/+page.svelte');
	});

	it('shows empty state when no plans are returned', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listPlans).toHaveBeenCalled());
		await waitFor(() => {
			const empty = container.querySelector('[data-testid="purchase-empty-state"]');
			expect(empty).not.toBeNull();
		});
	});
});

// ────────────────────────────────────────────────────────────────
// /subscriptions · current sub card with cancel button
// ────────────────────────────────────────────────────────────────

describe('subscriptions page · current sub renders with cancel button', () => {
	let api: typeof import('$lib/api/user/subscriptions');
	let pageMod: typeof import('../../../routes/(user)/subscriptions/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/subscriptions');
		(api.getCurrent as ReturnType<typeof vi.fn>).mockReset();
		(api.listHistory as ReturnType<typeof vi.fn>).mockReset();

		(api.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeSub({ id: 'sub-99', planName: 'Pro', status: 'active' })
		);
		(api.listHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

		pageMod = await import('../../../routes/(user)/subscriptions/+page.svelte');
	});

	it('renders CurrentSubCard with Cancel button when status=active', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getCurrent).toHaveBeenCalled());
		await waitFor(() => {
			const card = container.querySelector('[data-testid="current-sub-card"]');
			expect(card).not.toBeNull();
			const cancelBtn = container.querySelector(
				'[data-testid="current-sub-cancel-btn"]'
			);
			expect(cancelBtn).not.toBeNull();
		});
	});
});

// ────────────────────────────────────────────────────────────────
// /subscriptions · cancel dialog flow
// ────────────────────────────────────────────────────────────────

describe('subscriptions page · cancel flow', () => {
	let api: typeof import('$lib/api/user/subscriptions');
	let pageMod: typeof import('../../../routes/(user)/subscriptions/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/subscriptions');
		(api.getCurrent as ReturnType<typeof vi.fn>).mockReset();
		(api.listHistory as ReturnType<typeof vi.fn>).mockReset();
		(api.cancel as ReturnType<typeof vi.fn>).mockReset();

		(api.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeSub({ id: 'sub-42', planName: 'to-die', status: 'active' })
		);
		(api.listHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
		(api.cancel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		pageMod = await import('../../../routes/(user)/subscriptions/+page.svelte');
	});

	it('click Cancel → confirm → cancel API called → list refetched', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getCurrent).toHaveBeenCalled());

		// 等卡片落地
		await waitFor(() => {
			const btn = container.querySelector('[data-testid="current-sub-cancel-btn"]');
			expect(btn).not.toBeNull();
		});

		const cancelBtn = container.querySelector(
			'[data-testid="current-sub-cancel-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(cancelBtn);

		// bits-ui Portal 注入到 document.body
		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="cancel-sub-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const confirmBtn = document.body.querySelector(
			'[data-testid="cancel-sub-confirm-btn"]'
		) as HTMLButtonElement;
		expect(confirmBtn).not.toBeNull();
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.cancel).toHaveBeenCalledWith('sub-42');
		});
		// 取消后应触发 refresh —— getCurrent ≥ 2 次
		await waitFor(() => {
			expect((api.getCurrent as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
				2
			);
		});
	});

	it('CancelDialog uses StandardDialog instead of a hand-rolled bits overlay', () => {
		expect(cancelDialogSrc).toContain('StandardDialog');
		expect(cancelDialogSrc).toContain('data-testid="cancel-sub-dialog"');
		expect(cancelDialogSrc).not.toContain('Dialog.Overlay');
		expect(cancelDialogSrc).not.toContain('fixed inset-0');
	});
});
