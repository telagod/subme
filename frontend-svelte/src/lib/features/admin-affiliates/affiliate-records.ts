import type {
	AffiliateInviteRecord,
	AffiliateRebateRecord,
	AffiliateTransferRecord,
	AffiliateUserOverview
} from '$lib/api/admin/affiliates';

export const PAGE_SIZE = 20;

export type AffiliateRecord = AffiliateInviteRecord | AffiliateRebateRecord | AffiliateTransferRecord;

export function formatMoney(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '$0.00';
	return `$${(value as number).toFixed(2)}`;
}

export function formatPercent(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '0%';
	const rounded = Math.round((value as number) * 100) / 100;
	return `${rounded}%`;
}

export function formatDateTime(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function userLabel(id?: number | null, email?: string | null, username?: string | null): string {
	const identity = [email, username].map((v) => (v ?? '').trim()).filter(Boolean).join(' / ');
	return identity ? `#${id ?? '—'} ${identity}` : `#${id ?? '—'}`;
}

export function summarizeInvites(rows: AffiliateInviteRecord[]) {
	return [
		{ label: 'Invites', value: rows.length },
		{ label: 'Inviters', value: new Set(rows.map((row) => row.inviter_id)).size },
		{ label: 'Invitees', value: new Set(rows.map((row) => row.invitee_id)).size },
		{ label: 'Rebate', value: round2(rows.reduce((sum, row) => sum + numeric(row.total_rebate), 0)) }
	];
}

export function summarizeRebates(rows: AffiliateRebateRecord[]) {
	return [
		{ label: 'Rebates', value: rows.length },
		{ label: 'Inviters', value: new Set(rows.map((row) => row.inviter_id)).size },
		{ label: 'Invitees', value: new Set(rows.map((row) => row.invitee_id)).size },
		{ label: 'Amount', value: round2(rows.reduce((sum, row) => sum + numeric(row.rebate_amount), 0)) }
	];
}

export function summarizeTransfers(rows: AffiliateTransferRecord[]) {
	return [
		{ label: 'Transfers', value: rows.length },
		{ label: 'Users', value: new Set(rows.map((row) => row.user_id)).size },
		{ label: 'Amount', value: round2(rows.reduce((sum, row) => sum + numeric(row.amount), 0)) },
		{
			label: 'Snapshots',
			value: rows.filter((row) => row.snapshot_available).length
		}
	];
}

export function overviewStats(overview: AffiliateUserOverview) {
	return [
		{ label: 'Aff code', value: overview.aff_code || '—' },
		{ label: 'Rebate rate', value: formatPercent(overview.rebate_rate_percent) },
		{ label: 'Invited', value: String(overview.invited_count) },
		{ label: 'Rebated', value: String(overview.rebated_invitee_count) },
		{ label: 'Available', value: formatMoney(overview.available_quota) },
		{ label: 'History', value: formatMoney(overview.history_quota) }
	];
}

function numeric(value?: number | null): number {
	return Number.isFinite(value ?? Number.NaN) ? (value as number) : 0;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}
