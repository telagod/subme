import type { UserOrderStatus, UserPaymentOrder } from '$lib/api/user/payment';

export const PAGE_SIZE = 20;
export const STATUS_ALL = '__all__';

export const ORDER_STATUSES: UserOrderStatus[] = [
	'PENDING',
	'COMPLETED',
	'FAILED',
	'REFUNDED',
	'REFUND_REQUESTED',
	'CANCELLED'
];

export function canCancel(order: UserPaymentOrder): boolean {
	return order.status === 'PENDING';
}

export function canRequestRefund(order: UserPaymentOrder, eligibleProviders: Set<string>): boolean {
	return (
		order.status === 'COMPLETED' &&
		Boolean(order.provider_instance_id) &&
		eligibleProviders.has(order.provider_instance_id as string)
	);
}

export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
	const n = Number(value ?? 0);
	const safe = Number.isFinite(n) ? n : 0;
	const abs = Math.abs(safe).toFixed(2);
	const sign = safe < 0 ? '-' : '';
	if (currency === 'USD') return `${sign}$${abs}`;
	if (currency === 'CNY') return `${sign}¥${abs}`;
	if (currency === 'EUR') return `${sign}€${abs}`;
	return `${sign}${abs} ${currency}`;
}

export function formatDate(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function statusTone(status: string): string {
	switch (status) {
		case 'COMPLETED':
		case 'PAID':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'PENDING':
		case 'RECHARGING':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		case 'FAILED':
		case 'EXPIRED':
		case 'CANCELLED':
		case 'REFUND_FAILED':
			return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
		case 'REFUND_REQUESTED':
		case 'REFUNDING':
		case 'PARTIALLY_REFUNDED':
		case 'REFUNDED':
			return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}

export function orderTypeLabel(order: UserPaymentOrder): string {
	if (order.order_type === 'subscription') return 'Subscription';
	if (order.order_type === 'balance') return 'Balance top-up';
	return order.order_type || 'Order';
}
