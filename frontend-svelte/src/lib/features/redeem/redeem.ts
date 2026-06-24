import type { RedeemHistoryItem, RedeemResult } from '$lib/api/user/redeem';

export function isBalanceType(type: string): boolean {
	return type === 'balance' || type === 'admin_balance';
}

export function isSubscriptionType(type: string): boolean {
	return type === 'subscription';
}

export function isAdminAdjustment(type: string): boolean {
	return type === 'admin_balance' || type === 'admin_concurrency';
}

export function historyTitleKey(item: RedeemHistoryItem): string {
	switch (item.type) {
		case 'balance':
			return 'redeem.balanceAddedRedeem';
		case 'admin_balance':
			return item.value >= 0 ? 'redeem.balanceAddedAdmin' : 'redeem.balanceDeductedAdmin';
		case 'concurrency':
			return 'redeem.concurrencyAddedRedeem';
		case 'admin_concurrency':
			return item.value >= 0 ? 'redeem.concurrencyAddedAdmin' : 'redeem.concurrencyReducedAdmin';
		case 'subscription':
			return 'redeem.subscriptionAssigned';
		default:
			return 'common.unknown';
	}
}

export function formatMoney(value: number | null | undefined): string {
	const n = Number(value ?? 0);
	return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export function formatHistoryValue(item: RedeemHistoryItem): string {
	if (isBalanceType(item.type)) {
		const sign = item.value >= 0 ? '+' : '';
		return `${sign}${formatMoney(item.value)}`;
	}
	if (isSubscriptionType(item.type)) {
		const days = item.validity_days || Math.round(item.value);
		const groupName = item.group?.name || '';
		return groupName ? `${days} days - ${groupName}` : `${days} days`;
	}
	const sign = item.value >= 0 ? '+' : '';
	return `${sign}${item.value} requests`;
}

export function formatResultDetail(result: RedeemResult): string {
	if (result.type === 'balance') return `${formatMoney(result.value)} added`;
	if (result.type === 'concurrency') return `${result.value} requests added`;
	if (result.type === 'subscription') {
		const bits = [result.group_name, result.validity_days ? `${result.validity_days} days` : '']
			.filter(Boolean);
		return bits.length ? bits.join(' · ') : 'Subscription assigned';
	}
	return result.message;
}

export function formatDateTime(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}
