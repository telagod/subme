import type { UserPaymentOrder } from '$lib/api/user/payment';

export const SUCCESS_STATUSES = new Set(['COMPLETED', 'PAID', 'RECHARGING', 'SUCCEEDED', 'SUCCESS']);
export const PENDING_STATUSES = new Set(['PENDING', 'CREATED', 'WAITING', 'PROCESSING']);
export const FAILED_STATUSES = new Set(['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED']);
export const PAYMENT_RECOVERY_STORAGE_KEY = 'payment.recovery.current';

export interface PaymentRecoverySnapshot {
	orderId: number;
	amount: number;
	qrCode: string;
	expiresAt: string;
	paymentType: string;
	payUrl: string;
	outTradeNo: string;
	clientSecret: string;
	intentId: string;
	currency: string;
	countryCode: string;
	paymentEnv: string;
	payAmount: number;
	orderType: 'balance' | 'subscription' | '';
	paymentMode: string;
	resumeToken: string;
	createdAt: number;
}

export function normalizeOrderStatus(status: string | null | undefined): string {
	return String(status ?? '').trim().toUpperCase();
}

export function paymentPhase(status: string | null | undefined): 'success' | 'pending' | 'failed' {
	const s = normalizeOrderStatus(status);
	if (SUCCESS_STATUSES.has(s)) return 'success';
	if (PENDING_STATUSES.has(s)) return 'pending';
	return 'failed';
}

export function isTerminalFailure(status: string | null | undefined): boolean {
	return FAILED_STATUSES.has(normalizeOrderStatus(status));
}

export function formatGatewayAmount(
	value: number | null | undefined,
	currency = 'USD',
	locale?: string
): string {
	const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: currency || 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	} catch {
		return `${currency || 'USD'} ${amount.toFixed(2)}`;
	}
}

export function baseAmount(order: UserPaymentOrder | null): number {
	if (!order) return 0;
	const feeRate = Number(order.fee_rate) || 0;
	if (feeRate <= 0) return order.pay_amount ?? 0;
	return Math.round((order.pay_amount / (1 + feeRate / 100)) * 100) / 100;
}

export function feeAmount(order: UserPaymentOrder | null): number {
	if (!order) return 0;
	const feeRate = Number(order.fee_rate) || 0;
	if (feeRate <= 0) return 0;
	return Math.round((order.pay_amount - baseAmount(order)) * 100) / 100;
}

export function paymentMethodLabel(paymentType: string | null | undefined): string {
	const normalized = String(paymentType ?? '').trim().toLowerCase();
	if (!normalized) return '-';
	return normalized
		.split(/[_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export function countdownDisplay(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	const m = Math.floor(safe / 60);
	const s = safe % 60;
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function secondsUntil(expiresAt: string | null | undefined, now = new Date()): number {
	if (!expiresAt) return 30 * 60;
	const expires = new Date(expiresAt);
	if (Number.isNaN(expires.getTime())) return 30 * 60;
	return Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));
}

export function readPaymentRecoverySnapshot(
	raw: string | null | undefined,
	options: { now?: number; resumeToken?: string } = {}
): PaymentRecoverySnapshot | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<PaymentRecoverySnapshot>;
		if (
			typeof parsed.orderId !== 'number' ||
			typeof parsed.amount !== 'number' ||
			typeof parsed.qrCode !== 'string' ||
			typeof parsed.expiresAt !== 'string' ||
			typeof parsed.paymentType !== 'string' ||
			typeof parsed.payUrl !== 'string' ||
			(parsed.outTradeNo != null && typeof parsed.outTradeNo !== 'string') ||
			typeof parsed.clientSecret !== 'string' ||
			(parsed.intentId != null && typeof parsed.intentId !== 'string') ||
			(parsed.currency != null && typeof parsed.currency !== 'string') ||
			(parsed.countryCode != null && typeof parsed.countryCode !== 'string') ||
			(parsed.paymentEnv != null && typeof parsed.paymentEnv !== 'string') ||
			typeof parsed.payAmount !== 'number' ||
			typeof parsed.paymentMode !== 'string' ||
			typeof parsed.resumeToken !== 'string' ||
			typeof parsed.createdAt !== 'number'
		) {
			return null;
		}
		const now = options.now ?? Date.now();
		const expiresAt = Date.parse(parsed.expiresAt);
		if (Number.isFinite(expiresAt) && expiresAt <= now) return null;
		if (options.resumeToken && parsed.resumeToken !== options.resumeToken) return null;
		return {
			orderId: parsed.orderId,
			amount: parsed.amount,
			qrCode: parsed.qrCode,
			expiresAt: parsed.expiresAt,
			paymentType: parsed.paymentType,
			payUrl: parsed.payUrl,
			outTradeNo: parsed.outTradeNo || '',
			clientSecret: parsed.clientSecret,
			intentId: parsed.intentId || '',
			currency: parsed.currency || '',
			countryCode: parsed.countryCode || '',
			paymentEnv: parsed.paymentEnv || '',
			payAmount: parsed.payAmount,
			orderType: parsed.orderType === 'subscription' ? 'subscription' : 'balance',
			paymentMode: parsed.paymentMode,
			resumeToken: parsed.resumeToken,
			createdAt: parsed.createdAt
		};
	} catch {
		return null;
	}
}

export function successUrlFromSnapshot(snapshot: PaymentRecoverySnapshot, origin: string): string {
	const url = new URL('/payment/result', origin);
	if (snapshot.orderId > 0) url.searchParams.set('order_id', String(snapshot.orderId));
	if (snapshot.outTradeNo) url.searchParams.set('out_trade_no', snapshot.outTradeNo);
	if (snapshot.resumeToken) url.searchParams.set('resume_token', snapshot.resumeToken);
	return url.toString();
}
