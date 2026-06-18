/**
 * /(user)/affiliates · vitest 覆盖（subme-only affiliate dashboard）
 *
 * 覆盖点：
 *   1. Referral card 渲染：mock getReferralInfo → code 出现 + Copy 按钮触发
 *      navigator.clipboard.writeText（伪造）。
 *   2. Invited users 列表：mock listInvitedUsers 返回 5 行 → 行数 = 5。
 *   3. Rebate ledger：mock listRebateLedger 返回 frozen + available 混排。
 *   4. WithdrawalDialog：
 *        - amount > available → 提交拒绝（requestWithdrawal 不被调用）。
 *        - amount valid + paypal email valid → 提交触发 requestWithdrawal。
 *   5. Status filter Select 用 '__all__' sentinel；严禁 <option value="">。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/user/affiliates' 一律替换为 vi.fn()。
 *   - vi.mock 'qrcode' dynamic-import 兜底（避免 jsdom canvas warning）。
 *   - vi.mock '$lib/stores/toast.svelte'（静音）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type {
	ReferralInfo,
	AffiliateInvitee,
	RebateRecord
} from '$lib/api/user/affiliates';

// vi.mock hoists —— 必须在 import +page.svelte / WithdrawalDialog 之前
vi.mock('$lib/api/user/affiliates', () => {
	return {
		getReferralInfo: vi.fn(),
		listInvitedUsers: vi.fn(),
		listRebateLedger: vi.fn(),
		requestWithdrawal: vi.fn(),
		listWithdrawals: vi.fn(),
		transferAffiliateQuota: vi.fn(),
		userAffiliatesApi: {}
	};
});

// qrcode dynamic-import 兜底
vi.mock('qrcode', () => {
	return {
		default: {
			toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,STUB')
		},
		toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,STUB')
	};
});

// toast 静音
vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {
		nav: { affiliate: 'Affiliates' },
		user: {
			affiliates: {
				pageTitle: 'Affiliates',
				pageSubtitle: 'sub',
				refresh: 'Refresh',
				retry: 'Retry',
				loadFailed: 'Failed to load',
				yourCode: 'Code',
				inviteLink: 'Link',
				copyCode: 'Copy',
				copyLink: 'Copy',
				copyFailed: 'copy fail',
				codeCopied: 'Code copied',
				linkCopied: 'Link copied',
				requestWithdrawal: 'Withdraw',
				prevPage: 'Prev',
				nextPage: 'Next',
				pageOf: 'Page {page} of {pages}',
				stats: {
					totalInvited: 'Invited',
					totalRebate: 'Rebate',
					available: 'Available',
					frozen: 'Frozen',
					pendingWithdrawals: 'Pending'
				},
				invited: {
					title: 'Invited users',
					totalLabel: '{count} total',
					empty: 'none',
					loadFailed: 'load failed',
					colId: 'ID',
					colEmail: 'Email',
					colJoined: 'Joined',
					colSpend: 'Spend',
					colRebate: 'Rebate'
				},
				rebates: {
					title: 'Rebate ledger',
					empty: 'none',
					loadFailed: 'load failed',
					allStatuses: 'All statuses',
					colTimestamp: 'Timestamp',
					colSource: 'Source',
					colAmount: 'Amount',
					colStatus: 'Status',
					colFrozenUntil: 'Frozen until'
				},
				rebateStatuses: {
					available: 'Available',
					frozen: 'Frozen',
					withdrawn: 'Withdrawn',
					cancelled: 'Cancelled'
				}
			},
			withdrawal: {
				title: 'Request withdrawal',
				description: 'desc',
				availableLabel: 'Available rebate',
				amountLabel: 'Amount',
				amountPlaceholder: 'e.g. 50',
				destinationLabel: 'Destination',
				cancel: 'Cancel',
				submit: 'Request',
				submitting: 'Submitting…',
				success: 'ok',
				destinations: {
					paypal: 'PayPal',
					alipay: 'Alipay',
					wxpay: 'WeChat Pay',
					bank: 'Bank'
				},
				details: {
					paypalEmail: 'PayPal email',
					alipayAccount: 'Alipay account',
					wxpayOpenid: 'WeChat OpenID',
					bankAccountName: 'Name',
					bankName: 'Bank',
					bankAccount: 'Account'
				},
				errors: {
					AMOUNT_REQUIRED: 'amount required',
					AMOUNT_MIN: 'amount min {min}',
					AMOUNT_MAX: 'amount max {max}',
					DETAILS_REQUIRED: 'details required',
					UNKNOWN: 'unknown'
				}
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── fixtures ──────────────────────────────────────────────────────────

function fakeReferral(over: Partial<ReferralInfo> = {}): ReferralInfo {
	return {
		code: 'ABCD1234',
		link: 'http://localhost/register?ref=ABCD1234',
		rebateRatePercent: 10,
		totalInvited: 5,
		availableRebate: 50,
		frozenRebate: 20,
		totalRebate: 70,
		pendingWithdrawals: 15,
		invitees: [],
		...over
	};
}

function fakeInvitee(over: Partial<AffiliateInvitee> = {}): AffiliateInvitee {
	return {
		userId: 1,
		email: 'alice@example.com',
		username: 'alice',
		joinedAt: '2026-06-01T00:00:00Z',
		totalSpend: 100,
		rebateGenerated: 10,
		...over
	};
}

function fakeRebate(over: Partial<RebateRecord> = {}): RebateRecord {
	return {
		id: 'r1',
		timestamp: '2026-06-15T12:00:00Z',
		sourceUserId: 2,
		sourceEmail: 'bob@example.com',
		amount: 5,
		status: 'available',
		frozenUntil: null,
		note: null,
		...over
	};
}

// ────────────────────────────────────────────────────────────────────────
// 1) Referral card render + copy
// ────────────────────────────────────────────────────────────────────────

describe('affiliates page · referral card', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let pageMod: typeof import('../../../routes/(user)/affiliates/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockReset();
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockReset();
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockReset();

		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReferral());
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});

		pageMod = await import('../../../routes/(user)/affiliates/+page.svelte');
	});

	it('renders code from mock and copies via navigator.clipboard.writeText', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true,
			writable: true
		});

		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getReferralInfo).toHaveBeenCalled());
		await waitFor(() => {
			const code = container.querySelector('[data-testid="affiliates-code"]');
			expect(code).not.toBeNull();
			expect(code?.textContent).toContain('ABCD1234');
		});

		const copyBtn = container.querySelector(
			'[data-testid="affiliates-copy-code-btn"]'
		) as HTMLButtonElement;
		expect(copyBtn).not.toBeNull();
		await fireEvent.click(copyBtn);

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('ABCD1234');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 2) Invited users list — 5 mocked rows
// ────────────────────────────────────────────────────────────────────────

describe('affiliates page · invited users', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let pageMod: typeof import('../../../routes/(user)/affiliates/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockReset();
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockReset();
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockReset();

		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReferral());
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				fakeInvitee({ userId: 1, email: 'alice@example.com' }),
				fakeInvitee({ userId: 2, email: 'bob@example.com' }),
				fakeInvitee({ userId: 3, email: 'carol@example.com' }),
				fakeInvitee({ userId: 4, email: 'dave@example.com' }),
				fakeInvitee({ userId: 5, email: 'eve@example.com' })
			],
			total: 5,
			pages: 1
		});
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});

		pageMod = await import('../../../routes/(user)/affiliates/+page.svelte');
	});

	it('renders 5 invited rows from mock with masked email', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listInvitedUsers).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="affiliates-invited-row"]');
			expect(rows.length).toBe(5);
		});

		// email mask 验证：alice → a****@example.com
		const firstEmail = container.querySelector(
			'[data-testid="affiliates-invited-email"]'
		);
		expect(firstEmail?.textContent).toContain('@example.com');
		expect(firstEmail?.textContent).not.toContain('alice@');
	});
});

// ────────────────────────────────────────────────────────────────────────
// 3) Rebate ledger — frozen + available mix + sentinel check
// ────────────────────────────────────────────────────────────────────────

describe('affiliates page · rebate ledger', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let pageMod: typeof import('../../../routes/(user)/affiliates/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockReset();
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockReset();
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockReset();

		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReferral());
		(api.listInvitedUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});
		(api.listRebateLedger as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				fakeRebate({ id: 'r-a', amount: 5, status: 'available' }),
				fakeRebate({
					id: 'r-f',
					amount: 3,
					status: 'frozen',
					frozenUntil: '2026-07-01T00:00:00Z'
				}),
				fakeRebate({ id: 'r-w', amount: 10, status: 'withdrawn' })
			],
			total: 3,
			pages: 1
		});

		pageMod = await import('../../../routes/(user)/affiliates/+page.svelte');
	});

	it('renders frozen + available mix + sentinel-safe status filter', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listRebateLedger).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="affiliates-rebate-row"]');
			expect(rows.length).toBe(3);
		});

		const available = container.querySelector(
			'[data-testid="affiliates-rebate-row"][data-status="available"]'
		);
		const frozen = container.querySelector(
			'[data-testid="affiliates-rebate-row"][data-status="frozen"]'
		);
		expect(available).not.toBeNull();
		expect(frozen).not.toBeNull();

		// Sentinel guard：status filter 含 __all__；严禁 value=""
		const sel = container.querySelector(
			'[data-testid="affiliates-rebate-status-filter"]'
		) as HTMLSelectElement;
		expect(sel).not.toBeNull();

		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		const allOpt = sel.querySelector('option[value="__all__"]');
		expect(allOpt).not.toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────
// 4) WithdrawalDialog — amount > available rejected, valid amount submits
// ────────────────────────────────────────────────────────────────────────

describe('WithdrawalDialog · form validation', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let WithdrawalDialog: typeof import('../../../lib/features/affiliates/WithdrawalDialog.svelte').default;

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.requestWithdrawal as ReturnType<typeof vi.fn>).mockReset();
		(api.requestWithdrawal as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 'wd-1',
			status: 'pending'
		});

		const mod = await import('../../../lib/features/affiliates/WithdrawalDialog.svelte');
		WithdrawalDialog = mod.default;
	});

	it('amount > available → requestWithdrawal NOT called; error shown', async () => {
		render(WithdrawalDialog, {
			props: { open: true, availableRebate: 50, minAmount: 10 }
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="withdrawal-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const amountInput = document.body.querySelector(
			'[data-testid="withdrawal-amount-input"]'
		) as HTMLInputElement;
		expect(amountInput).not.toBeNull();
		// 200 > availableRebate 50
		await fireEvent.input(amountInput, { target: { value: '200' } });

		const paypalEmail = document.body.querySelector(
			'[data-testid="withdrawal-detail-paypal-email"]'
		) as HTMLInputElement;
		await fireEvent.input(paypalEmail, { target: { value: 'me@example.com' } });

		const form = document.body.querySelector(
			'[data-testid="withdrawal-form"]'
		) as HTMLFormElement;
		await fireEvent.submit(form);

		await new Promise((r) => setTimeout(r, 50));
		expect(api.requestWithdrawal).not.toHaveBeenCalled();

		await waitFor(() => {
			const fieldErr = document.body.querySelector(
				'[data-testid="withdrawal-amount-error"]'
			);
			const formErr = document.body.querySelector('[data-testid="withdrawal-form-error"]');
			expect(fieldErr || formErr).not.toBeNull();
		});
	});

	it('amount valid + paypal email → requestWithdrawal called once', async () => {
		render(WithdrawalDialog, {
			props: { open: true, availableRebate: 100, minAmount: 10 }
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="withdrawal-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const amountInput = document.body.querySelector(
			'[data-testid="withdrawal-amount-input"]'
		) as HTMLInputElement;
		await fireEvent.input(amountInput, { target: { value: '50' } });

		const paypalEmail = document.body.querySelector(
			'[data-testid="withdrawal-detail-paypal-email"]'
		) as HTMLInputElement;
		await fireEvent.input(paypalEmail, { target: { value: 'me@example.com' } });

		const form = document.body.querySelector(
			'[data-testid="withdrawal-form"]'
		) as HTMLFormElement;
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(api.requestWithdrawal).toHaveBeenCalled();
				const args = (api.requestWithdrawal as ReturnType<typeof vi.fn>).mock
					.calls[0]?.[0];
				expect(args?.amount).toBe(50);
				expect(args?.destination).toBe('paypal');
				expect(args?.details?.email).toBe('me@example.com');
			},
			{ timeout: 2000 }
		);
	});

	it('destination select is sentinel-safe (no <option value="">)', async () => {
		render(WithdrawalDialog, {
			props: { open: true, availableRebate: 100, minAmount: 10 }
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="withdrawal-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const html = document.body.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		const sel = document.body.querySelector(
			'[data-testid="withdrawal-destination-select"]'
		) as HTMLSelectElement;
		expect(sel).not.toBeNull();
		// 4 destinations
		expect(sel.querySelectorAll('option').length).toBe(4);
	});
});
