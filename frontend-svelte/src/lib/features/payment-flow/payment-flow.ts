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

// ── Payment launch decision engine (ported from Vue paymentFlow.ts) ────

const VISIBLE_METHOD_ALIASES: Record<string, VisiblePaymentMethod> = {
	alipay: 'alipay',
	alipay_direct: 'alipay',
	wxpay: 'wxpay',
	wxpay_direct: 'wxpay',
	stripe: 'stripe',
	airwallex: 'airwallex'
};

export type VisiblePaymentMethod = 'alipay' | 'wxpay' | 'stripe' | 'airwallex';
export type PaymentLaunchKind =
	| 'qr_waiting'
	| 'redirect_waiting'
	| 'stripe_popup'
	| 'stripe_route'
	| 'airwallex_route'
	| 'wechat_oauth'
	| 'wechat_jsapi'
	| 'balance_deduct'
	| 'unhandled';

export type OrderType = 'balance' | 'subscription';

export interface PaymentLaunchContext {
	visibleMethod: string;
	orderType: OrderType;
	isMobile: boolean;
	isWechatBrowser?: boolean;
	forceQRCode?: boolean;
	stripePopupUrl?: string;
	stripeRouteUrl?: string;
	airwallexRouteUrl?: string;
}

export interface PaymentLaunchDecision {
	kind: PaymentLaunchKind;
	paymentState: PaymentRecoverySnapshot;
	recovery: PaymentRecoverySnapshot;
}

/** Raw create-order response from backend. */
export interface CreateOrderFlowResult {
	order_id: number;
	amount: number;
	qr_code?: string;
	expires_at?: string;
	pay_url?: string;
	out_trade_no?: string;
	client_secret?: string;
	intent_id?: string;
	currency?: string;
	country_code?: string;
	payment_env?: string;
	pay_amount: number;
	payment_mode?: string;
	resume_token?: string;
	result_type?: string;
	oauth?: { authorize_url?: string };
	jsapi?: Record<string, unknown>;
	jsapi_payload?: Record<string, unknown>;
}

export interface BuildCreateOrderPayloadInput {
	amount: number;
	paymentType: string;
	orderType: OrderType;
	planId?: string;
	origin?: string;
	isMobile: boolean;
	isWechatBrowser: boolean;
	forceQRCode?: boolean;
}

export function normalizeVisibleMethod(method: string): VisiblePaymentMethod | '' {
	return VISIBLE_METHOD_ALIASES[method.trim()] ?? '';
}

export function buildCreateOrderPayload(input: BuildCreateOrderPayloadInput): Record<string, unknown> {
	const visibleMethod = normalizeVisibleMethod(input.paymentType) || input.paymentType.trim();
	const normalizedOrigin = (input.origin || '').trim().replace(/\/+$/, '');
	const effectiveMobile =
		input.forceQRCode && visibleMethod === 'alipay' ? false : input.isMobile;
	const payload: Record<string, unknown> = {
		amount: input.amount,
		payment_type: visibleMethod,
		order_type: input.orderType,
		is_mobile: effectiveMobile,
		payment_source:
			visibleMethod === 'wxpay' && input.isWechatBrowser
				? 'wechat_in_app_resume'
				: 'hosted_redirect'
	};
	if (input.planId) payload.plan_id = input.planId;
	if (normalizedOrigin) payload.return_url = `${normalizedOrigin}/payment/result`;
	return payload;
}

export function createPaymentRecoverySnapshot(
	state: Omit<PaymentRecoverySnapshot, 'createdAt'>,
	now = Date.now()
): PaymentRecoverySnapshot {
	return { ...state, createdAt: now };
}

export function writePaymentRecoverySnapshot(
	storage: Pick<Storage, 'setItem'>,
	snapshot: PaymentRecoverySnapshot,
	key = PAYMENT_RECOVERY_STORAGE_KEY
): void {
	storage.setItem(key, JSON.stringify(snapshot));
}

export function clearPaymentRecoverySnapshot(
	storage: Pick<Storage, 'removeItem'>,
	key = PAYMENT_RECOVERY_STORAGE_KEY
): void {
	storage.removeItem(key);
}

/**
 * Decide how to launch a payment based on the create-order result.
 * Port of Vue paymentFlow.decidePaymentLaunch.
 */
export function decidePaymentLaunch(
	result: CreateOrderFlowResult,
	context: PaymentLaunchContext
): PaymentLaunchDecision {
	const visibleMethod = normalizeVisibleMethod(context.visibleMethod) || context.visibleMethod;

	const baseState = createPaymentRecoverySnapshot({
		orderId: result.order_id,
		amount: result.amount,
		qrCode: result.qr_code || '',
		expiresAt: result.expires_at || '',
		paymentType: visibleMethod,
		payUrl: result.pay_url || '',
		outTradeNo: result.out_trade_no || '',
		clientSecret: result.client_secret || '',
		intentId: result.intent_id || '',
		currency: result.currency || '',
		countryCode: result.country_code || '',
		paymentEnv: result.payment_env || '',
		payAmount: result.pay_amount,
		orderType: context.orderType,
		paymentMode: (result.payment_mode || '').trim(),
		resumeToken: result.resume_token || ''
	});

	// Airwallex route
	if (visibleMethod === 'airwallex' && baseState.clientSecret && baseState.intentId) {
		if (!context.airwallexRouteUrl) {
			return { kind: 'unhandled', paymentState: baseState, recovery: baseState };
		}
		const paymentState = { ...baseState, payUrl: context.airwallexRouteUrl };
		return { kind: 'airwallex_route', paymentState, recovery: paymentState };
	}

	// Stripe (client_secret present)
	if (baseState.clientSecret) {
		const isStripeButton = visibleMethod === 'stripe';
		const stripeMethod = isStripeButton
			? undefined
			: visibleMethod === 'wxpay'
				? 'wechat_pay'
				: 'alipay';
		const kind: PaymentLaunchKind =
			stripeMethod === 'alipay' && !context.isMobile ? 'stripe_popup' : 'stripe_route';
		const payUrl =
			kind === 'stripe_popup'
				? context.stripePopupUrl || context.stripeRouteUrl || ''
				: context.stripeRouteUrl || context.stripePopupUrl || '';
		const paymentState = { ...baseState, payUrl };
		return { kind, paymentState, recovery: paymentState };
	}

	// WeChat OAuth required
	if (result.result_type === 'oauth_required' && result.oauth?.authorize_url) {
		return { kind: 'wechat_oauth', paymentState: baseState, recovery: baseState };
	}

	// WeChat JSAPI
	const jsapiPayload = result.jsapi ?? result.jsapi_payload;
	if (result.result_type === 'jsapi_ready' && jsapiPayload) {
		return { kind: 'wechat_jsapi', paymentState: baseState, recovery: baseState };
	}

	// QR / redirect decision
	const normalizedPaymentMode = baseState.paymentMode.trim().toLowerCase();
	const effectiveMobile =
		context.forceQRCode && visibleMethod === 'alipay' ? false : context.isMobile;
	const prefersRedirect =
		normalizedPaymentMode === 'redirect' ||
		normalizedPaymentMode === 'popup' ||
		(effectiveMobile && !!baseState.payUrl);
	const prefersQr =
		normalizedPaymentMode === 'qrcode' ||
		normalizedPaymentMode === 'native' ||
		(!prefersRedirect && !!baseState.qrCode);

	// WeChat in-app redirect
	if (
		visibleMethod === 'wxpay' &&
		context.isWechatBrowser &&
		baseState.payUrl &&
		!baseState.qrCode
	) {
		return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState };
	}

	if (prefersRedirect && baseState.payUrl) {
		return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState };
	}

	if (prefersQr && baseState.qrCode) {
		return { kind: 'qr_waiting', paymentState: baseState, recovery: baseState };
	}

	if (baseState.payUrl) {
		return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState };
	}

	return { kind: 'unhandled', paymentState: baseState, recovery: baseState };
}
