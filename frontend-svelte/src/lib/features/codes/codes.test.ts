import { describe, expect, it } from 'vitest';
import redeemApiSrc from '$lib/api/admin/redeem.ts?raw';
import promoApiSrc from '$lib/api/admin/promo.ts?raw';
import redeemPageSrc from '../../../routes/admin/redeem/+page.svelte?raw';
import promoPageSrc from '../../../routes/admin/promo-codes/+page.svelte?raw';
import {
	formatCodeValue,
	formatMoney,
	formatUsage,
	statusTone,
	summarizePromoCodes,
	summarizeRedeemCodes
} from './codes';
import type { PromoCode } from '$lib/api/admin/promo';
import type { RedeemCode } from '$lib/api/admin/redeem';

describe('admin redeem and promo code helpers', () => {
	it('summarizes and formats redeem codes', () => {
		const rows: RedeemCode[] = [
			{ id: 1, code: 'BAL', type: 'balance', value: 10, status: 'unused', used_by: null, used_at: null, created_at: '2026-01-01' },
			{ id: 2, code: 'SUB', type: 'subscription', value: 30, status: 'used', used_by: 7, used_at: '2026-01-02', created_at: '2026-01-01', group: { id: 1, name: 'Pro' }, validity_days: 30 }
		];
		expect(summarizeRedeemCodes(rows)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Used', value: 1 },
			{ label: 'Value', value: 40 }
		]);
		expect(formatCodeValue(rows[0])).toBe('$10.00');
		expect(formatCodeValue(rows[1])).toBe('Pro / 30d');
		expect(statusTone('used')).toContain('blue');
	});

	it('summarizes and formats promo codes', () => {
		const rows: PromoCode[] = [
			{ id: 1, code: 'A', bonus_amount: 5, max_uses: 0, used_count: 2, status: 'active', expires_at: null, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
			{ id: 2, code: 'B', bonus_amount: 2.5, max_uses: 10, used_count: 1, status: 'disabled', expires_at: null, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
		];
		expect(summarizePromoCodes(rows)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Used', value: 3 },
			{ label: 'Bonus', value: 7.5 }
		]);
		expect(formatUsage(2, 0)).toBe('2 / ∞');
		expect(formatMoney(3)).toBe('$3.00');
	});

	it('keeps pages on existing Vue-compatible admin endpoints', () => {
		expect(redeemApiSrc).toContain("const REDEEM_BASE = '/api/v1/admin/redeem-codes'");
		expect(promoApiSrc).toContain("const PROMO_BASE = '/api/v1/admin/promo-codes'");
		expect(redeemApiSrc).not.toContain("const REDEEM_BASE = '/admin/redeem-codes'");
		expect(promoApiSrc).not.toContain("const PROMO_BASE = '/admin/promo-codes'");
		expect(redeemPageSrc).toContain('data-testid="admin-redeem-row"');
		expect(promoPageSrc).toContain('data-testid="admin-promo-row"');
		expect(redeemPageSrc).toContain('VirtualTable');
		expect(promoPageSrc).toContain('VirtualTable');
	});
});
