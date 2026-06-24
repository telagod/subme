/**
 * /(user)/billing · vitest 覆盖（M6 billing）
 *
 * 覆盖点：
 *   1. Balance card 渲染：mock getBalance → balance value 出现并含 $42.50
 *   2. Transaction list：mock listTransactions 返回 3 行 → 行数 = 3
 *   3. Sentinel guard：type filter Select 必须含 value="__all__"，不含 value=""
 *   4. TopUpDialog 表单校验：
 *        - amount < 1（输入 '0.5' 然后 submit）→ createTopUp 不被调用，
 *          inline 错误显示
 *        - amount > 0（输入 '20' 然后 submit）→ createTopUp 被调一次
 *   5. 401 路径：listTransactions 抛 'unauthorized'，但 hook 已调 auth.logout，
 *      表格不白屏。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/user/billing'：替换为 vi.fn() 注入；
 *     beforeEach 重置 + 重新装载页面模块。
 *   - vi.mock '$lib/api/user/payment'：mock createTopUp（TopUpDialog 内 lazy import）。
 *   - vi.mock '$lib/stores/toast.svelte'：静音。
 *   - vi.mock '$lib/stores/auth.svelte'：暴露 logout spy 验证 401 路径。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { Balance, BillingTransaction } from '$lib/api/user/billing';
import topUpDialogSrc from './TopUpDialog.svelte?raw';

// vi.mock hoists —— 必须在 import +page.svelte / TopUpDialog 之前
vi.mock('$lib/api/user/billing', () => {
	return {
		getBalance: vi.fn(),
		listTransactions: vi.fn(),
		getTransaction: vi.fn(),
		userBillingApi: {
			getBalance: vi.fn(),
			listTransactions: vi.fn(),
			getTransaction: vi.fn()
		}
	};
});

// payment facade —— TopUpDialog submit 路径会 lazy import
vi.mock('$lib/api/user/payment', () => {
	return {
		startCheckout: vi.fn(),
		createTopUp: vi.fn().mockResolvedValue({
			orderId: 'order-stub',
			outTradeNo: 'out-stub'
		}),
		userPaymentApi: {
			startCheckout: vi.fn(),
			createTopUp: vi.fn()
		}
	};
});

// auth.svelte mock —— 暴露 logout spy（验证 401 路径）
const mockLogout = vi.fn();
vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		get user() {
			return { id: 1, email: 'alice@example.com', role: 'user' };
		},
		get isAuthenticated() {
			return true;
		},
		get isAdmin() {
			return false;
		},
		get isSimpleMode() {
			return false;
		},
		logout: (...args: unknown[]) => mockLogout(...args)
	}
}));

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
		nav: { billing: 'Billing' },
		user: {
			billing: {
				pageTitle: 'Billing',
				pageSubtitle: 'sub',
				refresh: 'Refresh',
				retry: 'Retry',
				balanceLabel: 'Current balance',
				topUp: 'Top Up',
				failedToLoadBalance: 'Failed to load balance',
				failedToLoadTxs: 'Failed to load transactions',
				typeFilter: 'Type',
				allTypes: 'All types',
				startDate: 'From',
				endDate: 'To',
				clearDates: 'Clear dates',
				colTimestamp: 'Timestamp',
				colType: 'Type',
				colAmount: 'Amount',
				colCurrency: 'Currency',
				colStatus: 'Status',
				colRef: 'Reference',
				emptyTitle: 'No transactions',
				emptyDescription: 'top up',
				pageOf: 'Page {page} of {pages}',
				prevPage: 'Previous',
				nextPage: 'Next',
				types: {
					topup: 'Top-up',
					charge: 'Charge',
					refund: 'Refund',
					rebate: 'Rebate'
				},
				statuses: {
					pending: 'Pending',
					completed: 'Completed',
					failed: 'Failed',
					cancelled: 'Cancelled',
					refunded: 'Refunded'
				}
			},
			topUp: {
				title: 'Top up',
				description: 'desc',
				amountLabel: 'Amount',
				amountPlaceholder: 'e.g. 20',
				currencyLabel: 'Currency',
				providerLabel: 'Provider',
				providerStripe: 'Stripe',
				providerAirwallex: 'Airwallex',
				cancel: 'Cancel',
				submit: 'Continue',
				submitting: 'Processing…',
				successToast: 'ok',
				errors: {
					AMOUNT_MIN: 'Amount must be at least 1.',
					UNKNOWN: 'unknown'
				}
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── fixtures ──────────────────────────────────────────────────────────

function fakeBalance(over: Partial<Balance> = {}): Balance {
	return {
		amount: 42.5,
		currency: 'USD',
		updatedAt: '2026-06-18T00:00:00Z',
		...over
	};
}

function fakeTx(over: Partial<BillingTransaction> = {}): BillingTransaction {
	return {
		id: 'tx-1',
		type: 'topup',
		amount: 20,
		currency: 'USD',
		status: 'completed',
		timestamp: '2026-06-15T12:00:00Z',
		ref: 'order-abc',
		note: null,
		...over
	};
}

// ────────────────────────────────────────────────────────────────────────
// 1) Balance card render
// ────────────────────────────────────────────────────────────────────────

describe('billing page · balance card renders mocked balance', () => {
	let api: typeof import('$lib/api/user/billing');
	let pageMod: typeof import('../../../routes/(user)/billing/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/billing');
		(api.getBalance as ReturnType<typeof vi.fn>).mockReset();
		(api.listTransactions as ReturnType<typeof vi.fn>).mockReset();

		(api.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBalance());
		(api.listTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});

		pageMod = await import('../../../routes/(user)/billing/+page.svelte');
	});

	it('renders balance value $42.50 from mock', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getBalance).toHaveBeenCalled());
		await waitFor(() => {
			const v = container.querySelector('[data-testid="billing-balance-value"]');
			expect(v).not.toBeNull();
			expect(v?.textContent).toContain('$42.50');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 2) Transaction list rendering
// ────────────────────────────────────────────────────────────────────────

describe('billing page · transaction list renders 3 mocked rows', () => {
	let api: typeof import('$lib/api/user/billing');
	let pageMod: typeof import('../../../routes/(user)/billing/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/billing');
		(api.getBalance as ReturnType<typeof vi.fn>).mockReset();
		(api.listTransactions as ReturnType<typeof vi.fn>).mockReset();

		(api.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBalance());
		(api.listTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				fakeTx({ id: 'tx-a', type: 'topup', amount: 20, ref: 'order-a' }),
				fakeTx({ id: 'tx-b', type: 'charge', amount: -1.23, ref: 'usage-b' }),
				fakeTx({ id: 'tx-c', type: 'refund', amount: 5, ref: 'refund-c' })
			],
			total: 3,
			pages: 1
		});

		pageMod = await import('../../../routes/(user)/billing/+page.svelte');
	});

	it('renders 3 rows + sentinel-safe type Select', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listTransactions).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="billing-tx-row"]');
			expect(rows.length).toBe(3);
		});

		// 3) Sentinel guard：type filter 含 __all__，不含 value=""
		const sel = container.querySelector(
			'[data-testid="billing-type-filter"]'
		) as HTMLSelectElement;
		expect(sel).not.toBeNull();

		const html = container.innerHTML;
		// 严禁任何 <option value=""> ——reshadcn-migration 红线
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		const allOpt = sel.querySelector('option[value="__all__"]');
		expect(allOpt).not.toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────
// 4) TopUpDialog form validation
// ────────────────────────────────────────────────────────────────────────

describe('TopUpDialog · form validation', () => {
	let payment: typeof import('$lib/api/user/payment');
	let TopUpDialog: typeof import('../../../lib/features/billing/TopUpDialog.svelte').default;

	beforeEach(async () => {
		payment = await import('$lib/api/user/payment');
		(payment.createTopUp as ReturnType<typeof vi.fn>).mockReset();
		(payment.createTopUp as ReturnType<typeof vi.fn>).mockResolvedValue({
			orderId: 'order-1',
			outTradeNo: 'out-1'
		});

		const mod = await import('../../../lib/features/billing/TopUpDialog.svelte');
		TopUpDialog = mod.default;
	});

	it('amount < 1 → createTopUp NOT called; inline error shown', async () => {
		render(TopUpDialog, { props: { open: true } });

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="topup-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const amountInput = document.body.querySelector(
			'[data-testid="topup-amount-input"]'
		) as HTMLInputElement;
		expect(amountInput).not.toBeNull();

		await fireEvent.input(amountInput, { target: { value: '0.5' } });

		const form = document.body.querySelector('[data-testid="topup-form"]') as HTMLFormElement;
		expect(form).not.toBeNull();
		await fireEvent.submit(form);

		// createTopUp 必不被调用
		await new Promise((r) => setTimeout(r, 50));
		expect(payment.createTopUp).not.toHaveBeenCalled();

		// inline 错误 / 字段错误任一可见即合格
		await waitFor(() => {
			const fieldErr = document.body.querySelector('[data-testid="topup-amount-error"]');
			const formErr = document.body.querySelector('[data-testid="topup-form-error"]');
			expect(fieldErr || formErr).not.toBeNull();
		});
	});

	it('amount > 0 → createTopUp called once with parsed amount', async () => {
		render(TopUpDialog, { props: { open: true } });

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="topup-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const amountInput = document.body.querySelector(
			'[data-testid="topup-amount-input"]'
		) as HTMLInputElement;
		await fireEvent.input(amountInput, { target: { value: '20' } });

		const form = document.body.querySelector('[data-testid="topup-form"]') as HTMLFormElement;
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(payment.createTopUp).toHaveBeenCalled();
				const args = (payment.createTopUp as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
				expect(args?.amount).toBe(20);
				expect(args?.provider).toBeDefined();
				expect(args?.currency).toBe('USD');
			},
			{ timeout: 2000 }
		);
	});

	it('TopUpDialog uses StandardDialog and keeps payment facade lazy', () => {
		expect(topUpDialogSrc).toContain('StandardDialog');
		expect(topUpDialogSrc).toContain('data-testid="topup-dialog"');
		expect(topUpDialogSrc).toContain("await import('$lib/api/user/payment')");
		expect(topUpDialogSrc).not.toContain("import { createTopUp");
		expect(topUpDialogSrc).not.toContain('Dialog.Overlay');
		expect(topUpDialogSrc).not.toContain('fixed inset-0');
	});
});

// ────────────────────────────────────────────────────────────────────────
// 5) 401 path: listTransactions returns 401 → auth.logout called via hook
// ────────────────────────────────────────────────────────────────────────

describe('billing page · 401 path triggers auth.logout via hook', () => {
	let api: typeof import('$lib/api/user/billing');
	let pageMod: typeof import('../../../routes/(user)/billing/+page.svelte');

	beforeEach(async () => {
		mockLogout.mockReset();

		api = await import('$lib/api/user/billing');
		(api.getBalance as ReturnType<typeof vi.fn>).mockReset();
		(api.listTransactions as ReturnType<typeof vi.fn>).mockReset();

		// 模拟 apiClient 401 interceptor 已装上 auth.logout hook：
		// fake api 调用先触发 logout，再抛 'unauthorized'。
		(api.getBalance as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			await mockLogout();
			throw new Error('unauthorized');
		});
		(api.listTransactions as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			await mockLogout();
			throw new Error('unauthorized');
		});

		pageMod = await import('../../../routes/(user)/billing/+page.svelte');
	});

	it('transactions fetch 401 → mockLogout called; page does not whitescreen', async () => {
		const { container } = render(pageMod.default);

		await waitFor(
			() => {
				expect(api.listTransactions).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		await waitFor(() => {
			expect(mockLogout).toHaveBeenCalled();
		});

		// 不白屏：billing 页 root 仍挂载
		await waitFor(() => {
			const root = container.querySelector('[data-testid="billing-page"]');
			expect(root).not.toBeNull();
		});
	});
});
