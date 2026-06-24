/**
 * /(user)/affiliates · vitest 覆盖（subme-only affiliate dashboard）
 *
 * BLOCKER fix 锚点：用户侧唯一可用动作是 POST /api/v1/user/aff/transfer
 * （quota → balance）。历史端口把主按钮接到不存在的 /aff/withdraw 幻影路由，
 * 本测试钉死：
 *   1. Referral card 渲染 + Copy。
 *   2. Invited users 列表来自 /aff inline invitees（无独立列表端点）。
 *   3. TransferDialog 提交 → transferAffiliateQuota() 被调用一次（=POST /aff/transfer）。
 *   4. 整个 affiliate cluster 源码不再出现 /aff/withdraw / requestWithdrawal /
 *      listRebateLedger / listWithdrawals 等幻影路由调用。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/user/affiliates' 一律替换为 vi.fn()。
 *   - vi.mock 'qrcode' dynamic-import 兜底（避免 jsdom canvas warning）。
 *   - vi.mock '$lib/stores/toast.svelte'（静音）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { ReferralInfo, AffiliateInvitee } from '$lib/api/user/affiliates';
import withdrawalDialogSrc from './WithdrawalDialog.svelte?raw';
import affiliatesApiSrc from '$lib/api/user/affiliates.ts?raw';
import affiliatesPageSrc from '../../../routes/(user)/affiliates/+page.svelte?raw';

// vi.mock hoists —— 必须在 import +page.svelte / WithdrawalDialog 之前
vi.mock('$lib/api/user/affiliates', () => {
	return {
		getReferralInfo: vi.fn(),
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
		affiliate: {
			transferFailed: 'Failed to transfer affiliate quota',
			stats: { rebateRate: 'My Rebate Rate' },
			transfer: {
				title: 'Transfer Rebate Quota',
				description: 'Move available rebate quota into your account balance',
				button: 'Transfer to Balance',
				transferring: 'Transferring...',
				empty: 'No available rebate quota',
				success: '{amount} has been transferred to your balance'
			}
		},
		user: {
			affiliates: {
				pageTitle: 'Affiliates',
				pageSubtitle: 'sub',
				refresh: 'Refresh',
				loadFailed: 'Failed to load',
				yourCode: 'Code',
				inviteLink: 'Link',
				copyCode: 'Copy',
				copyLink: 'Copy',
				copyFailed: 'copy fail',
				codeCopied: 'Code copied',
				linkCopied: 'Link copied',
				prevPage: 'Prev',
				nextPage: 'Next',
				pageOf: 'Page {page} of {pages}',
				stats: {
					totalInvited: 'Invited',
					totalRebate: 'Rebate',
					available: 'Available',
					frozen: 'Frozen'
				},
				invited: {
					title: 'Invited users',
					totalLabel: '{count} total',
					empty: 'none',
					colId: 'ID',
					colEmail: 'Email',
					colJoined: 'Joined',
					colSpend: 'Spend',
					colRebate: 'Rebate'
				}
			},
			withdrawal: { cancel: 'Cancel' }
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── fixtures ──────────────────────────────────────────────────────────

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

function fakeReferral(over: Partial<ReferralInfo> = {}): ReferralInfo {
	return {
		code: 'ABCD1234',
		link: 'http://localhost/register?ref=ABCD1234',
		rebateRatePercent: 10,
		totalInvited: 5,
		availableRebate: 50,
		frozenRebate: 20,
		totalRebate: 70,
		invitees: [
			fakeInvitee({ userId: 1, email: 'alice@example.com' }),
			fakeInvitee({ userId: 2, email: 'bob@example.com' }),
			fakeInvitee({ userId: 3, email: 'carol@example.com' }),
			fakeInvitee({ userId: 4, email: 'dave@example.com' }),
			fakeInvitee({ userId: 5, email: 'eve@example.com' })
		],
		...over
	};
}

// ────────────────────────────────────────────────────────────────────────
// 0) Phantom-route guard — source must NOT reference dead endpoints
// ────────────────────────────────────────────────────────────────────────

describe('affiliate cluster · phantom-route guard', () => {
	it('api module no longer calls /aff/withdraw, /aff/rebates, /aff/invitees, /aff/withdrawals', () => {
		expect(affiliatesApiSrc).not.toContain('/aff/withdraw');
		expect(affiliatesApiSrc).not.toContain('/aff/rebates');
		expect(affiliatesApiSrc).not.toContain('/aff/invitees');
		// the only POST endpoint must be the real transfer route
		expect(affiliatesApiSrc).toContain('/api/v1/user/aff/transfer');
		expect(affiliatesApiSrc).toContain('/api/v1/user/aff');
	});

	it('api module dropped dead handlers (requestWithdrawal / listRebateLedger / listWithdrawals)', () => {
		expect(affiliatesApiSrc).not.toContain('requestWithdrawal');
		expect(affiliatesApiSrc).not.toContain('listRebateLedger');
		expect(affiliatesApiSrc).not.toContain('listWithdrawals');
		expect(affiliatesApiSrc).toContain('transferAffiliateQuota');
	});

	it('dialog + page never import or call requestWithdrawal / phantom routes', () => {
		expect(withdrawalDialogSrc).not.toContain('requestWithdrawal');
		expect(withdrawalDialogSrc).not.toContain('/aff/withdraw');
		expect(withdrawalDialogSrc).toContain('transferAffiliateQuota');
		expect(affiliatesPageSrc).not.toContain('requestWithdrawal');
		expect(affiliatesPageSrc).not.toContain('listRebateLedger');
		expect(affiliatesPageSrc).not.toContain('/aff/withdraw');
	});
});

// ────────────────────────────────────────────────────────────────────────
// 1) Referral card render + copy
// ────────────────────────────────────────────────────────────────────────

describe('affiliates page · referral card', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let pageMod: typeof import('../../../routes/(user)/affiliates/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockReset();
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReferral());
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
// 2) Invited users list — rendered from inline /aff invitees (no extra fetch)
// ────────────────────────────────────────────────────────────────────────

describe('affiliates page · invited users', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let pageMod: typeof import('../../../routes/(user)/affiliates/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockReset();
		(api.getReferralInfo as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReferral());
		pageMod = await import('../../../routes/(user)/affiliates/+page.svelte');
	});

	it('renders 5 invited rows from inline referral data with masked email', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.getReferralInfo).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="affiliates-invited-row"]');
			expect(rows.length).toBe(5);
		});

		// email mask 验证：alice → a****@example.com
		const firstEmail = container.querySelector('[data-testid="affiliates-invited-email"]');
		expect(firstEmail?.textContent).toContain('@example.com');
		expect(firstEmail?.textContent).not.toContain('alice@');
	});
});

// ────────────────────────────────────────────────────────────────────────
// 3) TransferDialog — confirm submits transferAffiliateQuota (POST /aff/transfer)
// ────────────────────────────────────────────────────────────────────────

describe('TransferDialog · transfer action', () => {
	let api: typeof import('$lib/api/user/affiliates');
	let TransferDialog: typeof import('../../../lib/features/affiliates/WithdrawalDialog.svelte').default;

	beforeEach(async () => {
		api = await import('$lib/api/user/affiliates');
		(api.transferAffiliateQuota as ReturnType<typeof vi.fn>).mockReset();
		(api.transferAffiliateQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
			transferredQuota: 50,
			balance: 150
		});

		const mod = await import('../../../lib/features/affiliates/WithdrawalDialog.svelte');
		TransferDialog = mod.default;
	});

	it('submitting the dialog calls transferAffiliateQuota exactly once with no args', async () => {
		render(TransferDialog, {
			props: { open: true, availableRebate: 50 }
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="withdrawal-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const form = document.body.querySelector(
			'[data-testid="withdrawal-form"]'
		) as HTMLFormElement;
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(api.transferAffiliateQuota).toHaveBeenCalledTimes(1);
			},
			{ timeout: 2000 }
		);
		// backend transfer takes no request body → the wrapper takes no args
		const callArgs = (api.transferAffiliateQuota as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs).toEqual([]);
	});

	it('disables submit + does not call transfer when no available quota', async () => {
		render(TransferDialog, {
			props: { open: true, availableRebate: 0 }
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="withdrawal-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const submitBtn = document.body.querySelector(
			'[data-testid="withdrawal-submit-btn"]'
		) as HTMLButtonElement;
		expect(submitBtn).not.toBeNull();
		expect(submitBtn.disabled).toBe(true);

		const form = document.body.querySelector(
			'[data-testid="withdrawal-form"]'
		) as HTMLFormElement;
		await fireEvent.submit(form);

		await new Promise((r) => setTimeout(r, 50));
		expect(api.transferAffiliateQuota).not.toHaveBeenCalled();
	});

	it('uses StandardDialog instead of a hand-rolled bits overlay', () => {
		expect(withdrawalDialogSrc).toContain('StandardDialog');
		expect(withdrawalDialogSrc).toContain('data-testid="withdrawal-dialog"');
		expect(withdrawalDialogSrc).not.toContain('Dialog.Overlay');
		expect(withdrawalDialogSrc).not.toContain('fixed inset-0');
	});
});
