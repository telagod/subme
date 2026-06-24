import type { PromoCode } from '$lib/api/admin/promo';
import type { RedeemCode } from '$lib/api/admin/redeem';

export const ALL = '__all__';
export const PAGE_SIZE = 20;

export function summarizeRedeemCodes(rows: RedeemCode[]) {
	return [
		{ label: 'Total', value: rows.length },
		{ label: 'Active', value: rows.filter((r) => r.status === 'active' || r.status === 'unused').length },
		{ label: 'Used', value: rows.filter((r) => r.status === 'used').length },
		{ label: 'Value', value: round2(rows.reduce((sum, r) => sum + numeric(r.value), 0)) }
	];
}

export function summarizePromoCodes(rows: PromoCode[]) {
	return [
		{ label: 'Total', value: rows.length },
		{ label: 'Active', value: rows.filter((r) => r.status === 'active').length },
		{ label: 'Used', value: rows.reduce((sum, r) => sum + numeric(r.used_count), 0) },
		{ label: 'Bonus', value: round2(rows.reduce((sum, r) => sum + numeric(r.bonus_amount), 0)) }
	];
}

export function formatCodeValue(row: RedeemCode): string {
	switch (row.type) {
		case 'balance':
			return formatMoney(row.value);
		case 'concurrency':
			return `${row.value} concurrency`;
		case 'subscription':
			return row.group?.name
				? `${row.group.name}${row.validity_days ? ` / ${row.validity_days}d` : ''}`
				: `${row.validity_days ?? row.value} days`;
		case 'invitation':
			return `${row.value || 1} invite`;
		default:
			return String(row.value);
	}
}

export function formatUsage(used: number, max: number): string {
	return `${used} / ${max === 0 ? '∞' : max}`;
}

export function formatMoney(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	return `$${(value as number).toFixed(2)}`;
}

export function formatDate(value?: string | number | null): string {
	if (!value) return '—';
	const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleDateString();
}

export function statusTone(status: string): string {
	switch (status) {
		case 'active':
		case 'unused':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'used':
			return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
		case 'expired':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		case 'disabled':
			return 'border-zinc-400/30 bg-zinc-400/10 text-muted-foreground';
		default:
			return 'border-border bg-muted text-muted-foreground';
	}
}

function numeric(value?: number | null): number {
	return Number.isFinite(value ?? Number.NaN) ? (value as number) : 0;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}
