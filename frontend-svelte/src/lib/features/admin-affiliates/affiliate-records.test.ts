import { describe, expect, it } from 'vitest';
import affiliatesApiSrc from '$lib/api/admin/affiliates.ts?raw';
import invitesPageSrc from '../../../routes/admin/affiliates/invites/+page.svelte?raw';
import rebatesPageSrc from '../../../routes/admin/affiliates/rebates/+page.svelte?raw';
import transfersPageSrc from '../../../routes/admin/affiliates/transfers/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	formatMoney,
	formatPercent,
	overviewStats,
	summarizeRebates,
	summarizeInvites,
	summarizeTransfers,
	userLabel
} from './affiliate-records';
import type {
	AffiliateInviteRecord,
	AffiliateRebateRecord,
	AffiliateTransferRecord,
	AffiliateUserOverview
} from '$lib/api/admin/affiliates';

describe('admin affiliate records helpers', () => {
	const rows: AffiliateInviteRecord[] = [
		{
			inviter_id: 1,
			inviter_email: 'root@example.com',
			inviter_username: 'root',
			invitee_id: 2,
			invitee_email: 'alice@example.com',
			invitee_username: 'alice',
			aff_code: 'ROOT',
			total_rebate: 1.25,
			created_at: '2026-01-01T00:00:00Z'
		},
		{
			inviter_id: 1,
			inviter_email: 'root@example.com',
			inviter_username: 'root',
			invitee_id: 3,
			invitee_email: 'bob@example.com',
			invitee_username: 'bob',
			aff_code: 'ROOT',
			total_rebate: 2,
			created_at: '2026-01-02T00:00:00Z'
		}
	];

	it('summarizes invite records and formats user display values', () => {
		expect(summarizeInvites(rows)).toEqual([
			{ label: 'Invites', value: 2 },
			{ label: 'Inviters', value: 1 },
			{ label: 'Invitees', value: 2 },
			{ label: 'Rebate', value: 3.25 }
		]);
		expect(userLabel(1, 'root@example.com', 'root')).toBe('#1 root@example.com / root');
		expect(formatMoney(3)).toBe('$3.00');
		expect(formatPercent(12.345)).toBe('12.35%');
	});

	it('formats overview stats', () => {
		const overview: AffiliateUserOverview = {
			user_id: 1,
			email: 'root@example.com',
			username: 'root',
			aff_code: 'ROOT',
			rebate_rate_percent: 8,
			invited_count: 4,
			rebated_invitee_count: 3,
			available_quota: 9.5,
			history_quota: 20
		};
		expect(overviewStats(overview).map((item) => item.value)).toEqual([
			'ROOT',
			'8%',
			'4',
			'3',
			'$9.50',
			'$20.00'
		]);
	});

	it('summarizes rebate and transfer records', () => {
		const rebates: AffiliateRebateRecord[] = [
			{
				order_id: 10,
				out_trade_no: 'out-10',
				inviter_id: 1,
				inviter_email: 'root@example.com',
				inviter_username: 'root',
				invitee_id: 2,
				invitee_email: 'alice@example.com',
				invitee_username: 'alice',
				order_amount: 20,
				pay_amount: 20,
				rebate_amount: 2.5,
				payment_type: 'stripe',
				order_status: 'COMPLETED',
				created_at: '2026-01-01T00:00:00Z'
			}
		];
		const transfers: AffiliateTransferRecord[] = [
			{
				ledger_id: 5,
				user_id: 1,
				user_email: 'root@example.com',
				username: 'root',
				amount: 3,
				snapshot_available: true,
				created_at: '2026-01-01T00:00:00Z'
			}
		];
		expect(summarizeRebates(rebates)).toEqual([
			{ label: 'Rebates', value: 1 },
			{ label: 'Inviters', value: 1 },
			{ label: 'Invitees', value: 1 },
			{ label: 'Amount', value: 2.5 }
		]);
		expect(summarizeTransfers(transfers)).toEqual([
			{ label: 'Transfers', value: 1 },
			{ label: 'Users', value: 1 },
			{ label: 'Amount', value: 3 },
			{ label: 'Snapshots', value: 1 }
		]);
	});

	it('keeps affiliate invite records wired to admin records endpoints and route alias', () => {
		expect(affiliatesApiSrc).toContain('listInviteRecords');
		expect(affiliatesApiSrc).toContain('listRebateRecords');
		expect(affiliatesApiSrc).toContain('listTransferRecords');
		expect(affiliatesApiSrc).toContain('getUserOverview');
		expect(affiliatesApiSrc).toContain('/api/v1/admin/affiliates/invites');
		expect(affiliatesApiSrc).not.toContain('/api/admin/affiliates');
		expect(invitesPageSrc).toContain('data-testid="admin-affiliate-invite-row"');
		expect(rebatesPageSrc).toContain('data-testid="admin-affiliate-rebate-row"');
		expect(transfersPageSrc).toContain('data-testid="admin-affiliate-transfer-row"');
		expect(invitesPageSrc).toContain('VirtualTable');
		expect(rebatesPageSrc).toContain('VirtualTable');
		expect(transfersPageSrc).toContain('VirtualTable');
		expect(rerouteSrc).toContain("'/admin/affiliates': '/admin/affiliates/invites'");
		expect(rerouteSrc).toContain("'/admin/orders/plans': '/admin/monetization/plans'");
		expect(rerouteSrc).toContain(
			"'/admin/subscriptions/legacy': '/admin/monetization/subscriptions'"
		);
	});
});
