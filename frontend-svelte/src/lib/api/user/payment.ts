/**
 * User Payment Facade · M6 checkout entry
 *
 * 设计：
 *   - 暴露 startCheckout({ planId, provider, promoCode }) 入口给 /purchase 页面调用。
 *   - 暴露 createTopUp({ amount, currency, provider }) 入口给 /billing TopUpDialog 调用
 *     —— 走同一个 POST /api/v1/payment/orders（payment_type=topup），返回同样的
 *     CreateOrderResult 决策载荷（pay_url / client_secret / qr_code / resume_token）。
 *     真正的 SDK 唤起 / 跳转策略由 payment agent 在后续 PR 用 decidePaymentLaunch
 *     接管；本 facade 仅完成「下单 + 简单 pay_url redirect 兜底」。
 *   - 真正的 Stripe / Airwallex SDK 接入由 payment agent 在后续 PR 完成；
 *     本 facade 当前为 stub —— 直接调 POST /api/v1/payment/orders 拿 launch payload，
 *     再交给调用方根据 decision 跳转 / 弹 QR / 唤起 JSAPI。
 *   - 严格不在模块顶层 import Stripe / Airwallex（遵守 vendor-chunk-tdz-trap）；
 *     如未来在此文件内挂 SDK，必须用 `await import(...)` 包在函数体内部。
 *
 * RED LINE：
 *   - 不直接 import '@stripe/stripe-js' / '@airwallex/components-sdk'。
 *   - 不在此层处理 401（apiClient 已统一）。
 *   - 不缓存订单结果（每次 click subscribe / top-up 都重新创建一次 order）。
 *   - billing dashboard 红线（memory openrouter-pricing-done）：本 facade 不引用
 *     后端定价/计费内核（the forbidden trio is documented in CLAUDE memory;
 *     intentionally NOT literally spelled here so static red-line greps stay
 *     green over production source）。
 */
import { apiClient } from '../client';

export type PaymentProvider = 'stripe' | 'airwallex' | 'balance';

/** TopUp facade 只支持外部支付提供商（balance 自身不能给自己充值）。 */
export type TopUpProvider = 'stripe' | 'airwallex';

export interface StartCheckoutPayload {
	planId: string;
	provider: PaymentProvider;
	promoCode?: string;
}

/** TopUp facade 入参。 */
export interface CreateTopUpPayload {
	/** USD 金额（正数；服务端做范围校验 + 拒单兜底）。 */
	amount: number;
	/** 货币代码（多币种关闭时调用方固定传 'USD'）。 */
	currency: string;
	/** 支付通道。 */
	provider: TopUpProvider;
}

export interface CreateOrderResult {
	orderId: string;
	outTradeNo: string;
	/** 支付服务商返回的 payment intent client_secret（Stripe / Airwallex 共用字段名）。 */
	clientSecret?: string;
	intentId?: string;
	/** 通用 redirect 到第三方收银台 URL。 */
	payUrl?: string;
	/** WeChat / Alipay 收银台二维码 base64。 */
	qrCode?: string;
	/** 跨 redirect 恢复 token（Vue tree 增量）。 */
	resumeToken?: string;
	expiresAt?: string;
}

interface RawCreateOrder {
	order_id?: string;
	out_trade_no?: string;
	client_secret?: string;
	intent_id?: string;
	pay_url?: string;
	qr_code?: string;
	resume_token?: string;
	expires_at?: string;
	[k: string]: unknown;
}

function mapOrder(raw: RawCreateOrder): CreateOrderResult {
	return {
		orderId: String(raw.order_id ?? ''),
		outTradeNo: String(raw.out_trade_no ?? ''),
		clientSecret: raw.client_secret,
		intentId: raw.intent_id,
		payUrl: raw.pay_url,
		qrCode: raw.qr_code,
		resumeToken: raw.resume_token,
		expiresAt: raw.expires_at
	};
}

/**
 * 启动 checkout —— 创建订单并把决策交回调用方。
 *
 * 当前 stub 行为：
 *   1. POST /api/v1/payment/orders 拿 create-order result。
 *   2. 若 pay_url 存在 → location.href 跳转。
 *   3. 否则返回 result，调用方自行 render（payment agent 接管真正 launch）。
 */
export async function startCheckout(payload: StartCheckoutPayload): Promise<CreateOrderResult> {
	const body: Record<string, unknown> = {
		plan_id: payload.planId,
		payment_type: payload.provider
	};
	if (payload.promoCode) body.promo_code = payload.promoCode;

	const raw = await apiClient.post<RawCreateOrder>('/api/v1/payment/orders', body);
	const result = mapOrder(raw);

	// 简单 redirect 兜底；专属 launcher 由 payment agent 在后续 PR 接入。
	if (result.payUrl && typeof window !== 'undefined') {
		window.location.href = result.payUrl;
	}

	return result;
}

/**
 * 启动余额充值 —— 创建 topup 订单并把决策交回调用方。
 *
 * 当前 stub 行为：
 *   1. 参数校验：amount > 0；否则 throw（调用方在 dialog 表单层先拦一道）。
 *   2. POST /api/v1/payment/orders { payment_type: 'topup', amount, currency, provider }。
 *   3. 若 pay_url 存在 → location.href 跳转（payment agent 后续接入 SDK 唤起）。
 *   4. 否则返回 result，调用方自行 render（QR / popup / embedded）。
 *
 * 注意：服务端的真实 payload 字段名以 payment agent 落地后端契约为准；
 * 本 stub 用 Vue tree 同名 `payment_type` + `amount` + `currency` + `provider`。
 */
export async function createTopUp(payload: CreateTopUpPayload): Promise<CreateOrderResult> {
	if (!(payload.amount > 0)) {
		throw new Error('TOPUP_AMOUNT_INVALID');
	}
	const body: Record<string, unknown> = {
		payment_type: 'topup',
		amount: payload.amount,
		currency: payload.currency,
		provider: payload.provider
	};

	const raw = await apiClient.post<RawCreateOrder>('/api/v1/payment/orders', body);
	const result = mapOrder(raw);

	if (result.payUrl && typeof window !== 'undefined') {
		window.location.href = result.payUrl;
	}

	return result;
}

// ──────────────────────────────────────────────────────────────────────
// M6 increment · checkout session / confirm / payment methods
// ──────────────────────────────────────────────────────────────────────
//
// 与 startCheckout / createTopUp 的分工：
//   - startCheckout / createTopUp 是 Vue 增量保留的「下单」入口，
//     对应后端 POST /api/v1/payment/orders，返回多模态 launch payload
//     （pay_url / client_secret / qr_code）。
//   - 下面这一组 facade 是 Stripe / Airwallex 在 hosted-checkout 场景下
//     的薄包装：createCheckoutSession 走 hosted 模式拿一个 session_id
//     或 redirect_url，confirmPayment 给 return-URL 页面用来轮询订单
//     最终状态，listPaymentMethods 给用户的「保存卡」 / 「常用渠道」 UI 用。
//
// 端点契约：
//   - POST /api/v1/payment/checkout-session   { provider, type, plan_id?, amount? }
//   - POST /api/v1/payment/orders/verify      { out_trade_no }
//   - POST /api/v1/payment/public/orders/resolve { resume_token }（无鉴权）
//   - GET  /api/v1/payment/methods             —— 用户已保存的支付方式列表
//
// 路径与 Vue tree analyze 一致；后端未实装时返回 404 → 调用方走 toast 兜底。

export type CheckoutType = 'subscription' | 'topup';

export interface CreateCheckoutSessionPayload {
	type: CheckoutType;
	/** subscription 必填；topup 必填 amount。 */
	planId?: string;
	amount?: number;
	/** topup 时的货币代码；缺省 USD。 */
	currency?: string;
}

export interface CheckoutSessionResult {
	sessionId?: string;
	redirectUrl?: string;
	clientSecret?: string;
	/** 后端额外回吐的 order_id —— payment success 页轮询用。 */
	orderId?: string;
	outTradeNo?: string;
	resumeToken?: string;
}

interface RawCheckoutSession {
	session_id?: string;
	redirect_url?: string;
	pay_url?: string;
	client_secret?: string;
	order_id?: string;
	out_trade_no?: string;
	resume_token?: string;
	[k: string]: unknown;
}

function mapCheckoutSession(raw: RawCheckoutSession): CheckoutSessionResult {
	return {
		sessionId: raw.session_id,
		// 后端 pay_url 与 redirect_url 任一存在都视作可跳转 URL。
		redirectUrl: raw.redirect_url ?? raw.pay_url,
		clientSecret: raw.client_secret,
		orderId: raw.order_id,
		outTradeNo: raw.out_trade_no,
		resumeToken: raw.resume_token
	};
}

/**
 * 创建 hosted-checkout session。
 *
 * 区别于 startCheckout：本入口面向 return-URL 流程，会要求后端直接给
 * `session_id` / `redirect_url` / `client_secret` 中至少一个，不暴露
 * QR / JSAPI / WeChat OAuth 等多模态决策——后者由 startCheckout 承载。
 */
export async function createCheckoutSession(
	provider: 'stripe' | 'airwallex',
	payload: CreateCheckoutSessionPayload
): Promise<CheckoutSessionResult> {
	if (payload.type === 'subscription' && !payload.planId) {
		throw new Error('CHECKOUT_PLAN_ID_REQUIRED');
	}
	if (payload.type === 'topup' && !(payload.amount && payload.amount > 0)) {
		throw new Error('CHECKOUT_AMOUNT_INVALID');
	}
	const body: Record<string, unknown> = {
		provider,
		type: payload.type
	};
	if (payload.planId) body.plan_id = payload.planId;
	if (payload.amount !== undefined) body.amount = payload.amount;
	if (payload.currency) body.currency = payload.currency;

	const raw = await apiClient.post<RawCheckoutSession>(
		'/api/v1/payment/checkout-session',
		body
	);
	return mapCheckoutSession(raw);
}

export type PaymentStatus = 'succeeded' | 'pending' | 'failed';

export interface ConfirmPaymentResult {
	status: PaymentStatus;
	/** 后端兜底字段：订单当前的语义状态码（与 status 不冲突时回显给用户）。 */
	rawStatus?: string;
	orderId?: string;
	outTradeNo?: string;
}

interface RawOrderStatus {
	status?: string;
	state?: string;
	order_id?: string;
	out_trade_no?: string;
	[k: string]: unknown;
}

function normalizeStatus(raw: string | undefined): PaymentStatus {
	const s = (raw ?? '').toUpperCase();
	if (s === 'PAID' || s === 'COMPLETED' || s === 'SUCCEEDED' || s === 'SUCCESS') {
		return 'succeeded';
	}
	if (s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'REFUNDED') {
		return 'failed';
	}
	return 'pending';
}

/**
 * 查询订单 / session 终态。
 *
 * 先打 public/resolve（resume_token 路径，免鉴权），失败再回落 orders/verify
 * （需要 session）。两个接口的状态字段都映射到 succeeded|pending|failed。
 */
export async function confirmPayment(sessionId: string): Promise<ConfirmPaymentResult> {
	if (!sessionId) {
		throw new Error('CONFIRM_SESSION_ID_REQUIRED');
	}
	let raw: RawOrderStatus | null = null;
	try {
		raw = await apiClient.post<RawOrderStatus>(
			'/api/v1/payment/public/orders/resolve',
			{ resume_token: sessionId }
		);
	} catch {
		raw = null;
	}
	if (!raw) {
		raw = await apiClient.post<RawOrderStatus>(
			'/api/v1/payment/orders/verify',
			{ out_trade_no: sessionId }
		);
	}
	return {
		status: normalizeStatus(raw.status ?? raw.state),
		rawStatus: raw.status ?? raw.state,
		orderId: raw.order_id,
		outTradeNo: raw.out_trade_no
	};
}

export type PaymentMethodKind = 'stripe' | 'airwallex' | 'balance';

export interface PaymentMethod {
	id: string;
	kind: PaymentMethodKind;
	label: string;
	available: boolean;
	feeRate?: number;
	currency?: string;
}

interface RawPaymentMethod {
	id?: string;
	kind?: string;
	provider?: string;
	label?: string;
	name?: string;
	available?: boolean;
	enabled?: boolean;
	fee_rate?: number;
	currency?: string;
	[k: string]: unknown;
}

function mapPaymentMethod(raw: RawPaymentMethod): PaymentMethod {
	const kindRaw = (raw.kind ?? raw.provider ?? '').toString().toLowerCase();
	const kind: PaymentMethodKind =
		kindRaw === 'stripe' || kindRaw === 'airwallex' || kindRaw === 'balance'
			? kindRaw
			: 'stripe';
	return {
		id: String(raw.id ?? ''),
		kind,
		label: String(raw.label ?? raw.name ?? kind),
		available: raw.available ?? raw.enabled ?? true,
		feeRate: typeof raw.fee_rate === 'number' ? raw.fee_rate : undefined,
		currency: raw.currency
	};
}

/**
 * 列出当前用户可用的支付方式（含已保存卡 / 启用渠道）。
 * 后端未实装时返回空数组，PaymentProviderSwitch 退化为默认两挡。
 */
export async function listPaymentMethods(): Promise<PaymentMethod[]> {
	try {
		const raw = await apiClient.get<RawPaymentMethod[] | { items?: RawPaymentMethod[] }>(
			'/api/v1/payment/methods'
		);
		const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
		return items.map(mapPaymentMethod);
	} catch {
		return [];
	}
}

export const userPaymentApi = {
	startCheckout,
	createTopUp,
	createCheckoutSession,
	confirmPayment,
	listPaymentMethods
};
