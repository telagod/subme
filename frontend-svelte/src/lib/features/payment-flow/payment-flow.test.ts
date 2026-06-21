import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { page } from '$app/state';
import apiSrc from '$lib/api/user/payment.ts?raw';
import resultPageSrc from '../../../routes/(user)/payment/result/+page.svelte?raw';
import qrPageSrc from '../../../routes/(user)/payment/qrcode/+page.svelte?raw';
import stripePageSrc from '../../../routes/(user)/payment/stripe/+page.svelte?raw';
import airwallexPageSrc from '../../../routes/(user)/payment/airwallex/+page.svelte?raw';
import stripePopupPageSrc from '../../../routes/(user)/payment/stripe-popup/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';
import {
	baseAmount,
	countdownDisplay,
	feeAmount,
	paymentMethodLabel,
	paymentPhase,
	secondsUntil
} from './payment-flow';
import type { UserPaymentOrder } from '$lib/api/user/payment';

const gotoSpy = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoSpy(...args),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	preloadData: vi.fn(),
	preloadCode: vi.fn(),
	pushState: vi.fn(),
	replaceState: vi.fn(),
	onNavigate: vi.fn(),
	disableScrollHandling: vi.fn()
}));

vi.mock('qrcode', () => ({
	default: {
		toCanvas: vi.fn().mockResolvedValue(undefined)
	},
	toCanvas: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/user/payment', async () => {
	const actual = await vi.importActual<typeof import('$lib/api/user/payment')>('$lib/api/user/payment');
	return {
		...actual,
		getPaymentConfig: vi.fn(),
		getMyOrder: vi.fn(),
		verifyPublicOrderByOutTradeNo: vi.fn(),
		resolvePublicOrderByResumeToken: vi.fn(),
		cancelMyOrder: vi.fn()
	};
});

vi.mock('$lib/payments/stripe', () => ({
	getStripe: vi.fn(),
	resetStripeCache: vi.fn()
}));

vi.mock('$lib/payments/airwallex', () => ({
	getAirwallex: vi.fn(),
	resetAirwallexCache: vi.fn()
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

beforeAll(async () => {
	addMessages('en', {
		common: { processing: 'Processing' },
		payment: {
			result: {
				success: 'Payment Successful',
				processing: 'Payment Processing',
				processingHint: 'Processing hint',
				failed: 'Payment Failed',
				backToRecharge: 'Back to Recharge',
				viewOrders: 'View Orders'
			},
			qr: {
				scanToPay: 'Scan to Pay',
				scanAlipay: 'Alipay QR Payment',
				scanWxpay: 'WeChat QR Payment',
				scanAlipayHint: 'Alipay hint',
				scanWxpayHint: 'WeChat hint',
				payInNewWindow: 'Complete Payment in New Window',
				payInNewWindowHint: 'Window hint',
				openPayWindow: 'Reopen Payment Page',
				expiresIn: 'Expires in',
				expired: 'Order Expired',
				waitingPayment: 'Waiting for payment...',
				cancelOrder: 'Cancel Order'
			},
			orders: {
				orderId: 'Order ID',
				orderNo: 'Order No.',
				baseAmount: 'Base Amount',
				fee: 'Fee',
				payAmount: 'Paid',
				paymentMethod: 'Payment Method',
				status: 'Status'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeOrder(over: Partial<UserPaymentOrder> = {}): UserPaymentOrder {
	return {
		id: 9,
		user_id: 1,
		amount: 100,
		pay_amount: 103,
		currency: 'USD',
		fee_rate: 3,
		payment_type: 'alipay_qr',
		out_trade_no: 'out-9',
		status: 'COMPLETED',
		order_type: 'balance',
		created_at: '2026-06-18T00:00:00Z',
		expires_at: '2026-06-18T00:30:00Z',
		refund_amount: 0,
		...over
	};
}

function setUrl(url: string) {
	(page as { url: URL }).url = new URL(url);
}

describe('payment-flow helpers', () => {
	it('normalizes phases, money, fees and countdown display', () => {
		const order = fakeOrder();
		expect(paymentPhase('PAID')).toBe('success');
		expect(paymentPhase('PENDING')).toBe('pending');
		expect(paymentPhase('FAILED')).toBe('failed');
		expect(baseAmount(order)).toBe(100);
		expect(feeAmount(order)).toBe(3);
		expect(paymentMethodLabel('wxpay_native')).toBe('Wxpay Native');
		expect(countdownDisplay(65)).toBe('01:05');
		expect(secondsUntil('2026-06-18T00:01:05Z', new Date('2026-06-18T00:00:00Z'))).toBe(65);
	});
});

describe('payment legacy route contracts', () => {
	it('keeps Vue payment result/qrcode routes and backend endpoints wired', () => {
		expect(rerouteSrc).not.toContain("'/payment'");
		expect(apiSrc).toContain('/api/v1/payment/orders/');
		expect(apiSrc).toContain('/api/v1/payment/public/orders/verify');
		expect(apiSrc).toContain('/api/v1/payment/public/orders/resolve');
		expect(resultPageSrc).toContain('data-testid="payment-result-page"');
		expect(qrPageSrc).toContain('data-testid="payment-qrcode-page"');
		expect(qrPageSrc).toContain("import QRCode from 'qrcode'");
		expect(stripePageSrc).toContain('data-testid="payment-stripe-page"');
		expect(airwallexPageSrc).toContain('data-testid="payment-airwallex-page"');
		expect(stripePopupPageSrc).toContain('data-testid="payment-stripe-popup-page"');
		expect(stripePageSrc).toContain("from '$lib/payments/stripe'");
		expect(airwallexPageSrc).toContain("from '$lib/payments/airwallex'");
		expect(stripePopupPageSrc).toContain("from '$lib/payments/stripe'");
		expect(resultPageSrc).not.toContain('@stripe/stripe-js');
		expect(qrPageSrc).not.toContain('@stripe/stripe-js');
		expect(stripePageSrc).not.toContain('@stripe/stripe-js');
		expect(airwallexPageSrc).not.toContain('@airwallex/components-sdk');
		expect(stripePopupPageSrc).not.toContain('@stripe/stripe-js');
	});
});

describe('payment result page', () => {
	let api: typeof import('$lib/api/user/payment');
	let pageMod: typeof import('../../../routes/(user)/payment/result/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/payment');
		(api.getMyOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.verifyPublicOrderByOutTradeNo as ReturnType<typeof vi.fn>).mockReset();
		(api.resolvePublicOrderByResumeToken as ReturnType<typeof vi.fn>).mockReset();
		gotoSpy.mockReset();
		setUrl('http://localhost/payment/result?order_id=9');
		pageMod = await import('../../../routes/(user)/payment/result/+page.svelte');
	});

	it('loads authenticated order_id and renders payment summary', async () => {
		(api.getMyOrder as ReturnType<typeof vi.fn>).mockResolvedValue(fakeOrder());

		const { getByTestId, getByText } = render(pageMod.default);

		await waitFor(() => expect(api.getMyOrder).toHaveBeenCalledWith(9));
		await waitFor(() => expect(getByTestId('payment-result-order')).toBeTruthy());
		expect(getByText('Payment Successful')).toBeTruthy();
		expect(getByText('#9')).toBeTruthy();
		expect(getByText('out-9')).toBeTruthy();
	});
});

describe('payment qrcode page', () => {
	let api: typeof import('$lib/api/user/payment');
	let pageMod: typeof import('../../../routes/(user)/payment/qrcode/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/payment');
		(api.getMyOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.cancelMyOrder as ReturnType<typeof vi.fn>).mockReset();
		gotoSpy.mockReset();
		setUrl(
			'http://localhost/payment/qrcode?order_id=9&qr=otpauth%3A%2F%2Fdemo&payment_type=alipay&expires_at=2999-01-01T00%3A00%3A00Z'
		);
		pageMod = await import('../../../routes/(user)/payment/qrcode/+page.svelte');
	});

	it('renders QR payment page and cancels pending order', async () => {
		(api.cancelMyOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		const { getByTestId, getByText } = render(pageMod.default);

		await waitFor(() => expect(getByTestId('payment-qrcode-page')).toBeTruthy());
		expect(getByText('Alipay QR Payment')).toBeTruthy();

		await fireEvent.click(getByTestId('payment-qrcode-cancel'));
		await waitFor(() => expect(api.cancelMyOrder).toHaveBeenCalledWith(9));
		expect(gotoSpy).toHaveBeenCalledWith('/purchase');
	});
});

describe('payment stripe route', () => {
	let api: typeof import('$lib/api/user/payment');
	let stripe: typeof import('$lib/payments/stripe');
	let pageMod: typeof import('../../../routes/(user)/payment/stripe/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/payment');
		stripe = await import('$lib/payments/stripe');
		(api.getMyOrder as ReturnType<typeof vi.fn>).mockReset();
		(api.getPaymentConfig as ReturnType<typeof vi.fn>).mockReset();
		(stripe.getStripe as ReturnType<typeof vi.fn>).mockReset();
		setUrl('http://localhost/payment/stripe?order_id=9&client_secret=cs_test');
		pageMod = await import('../../../routes/(user)/payment/stripe/+page.svelte');
	});

	it('loads config through facade and mounts generic Stripe element', async () => {
		const mount = vi.fn();
		(api.getMyOrder as ReturnType<typeof vi.fn>).mockResolvedValue(fakeOrder({ payment_type: 'stripe' }));
		(api.getPaymentConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ stripe_publishable_key: 'pk_test' });
		(stripe.getStripe as ReturnType<typeof vi.fn>).mockResolvedValue({
			elements: vi.fn(() => ({
				create: vi.fn(() => ({
					mount,
					on: (_event: string, cb: () => void) => cb()
				}))
			})),
			confirmPayment: vi.fn().mockResolvedValue({})
		});

		const { getByTestId } = render(pageMod.default);

		await waitFor(() => expect(stripe.getStripe).toHaveBeenCalledWith('pk_test'));
		await waitFor(() => expect(getByTestId('payment-stripe-element-card')).toBeTruthy());
		expect(mount).toHaveBeenCalledWith('#stripe-payment-element');
	});
});

describe('payment airwallex route', () => {
	let airwallex: typeof import('$lib/payments/airwallex');
	let pageMod: typeof import('../../../routes/(user)/payment/airwallex/+page.svelte');

	beforeEach(async () => {
		airwallex = await import('$lib/payments/airwallex');
		(airwallex.getAirwallex as ReturnType<typeof vi.fn>).mockReset();
		window.localStorage.clear();
		window.localStorage.setItem(
			'payment.recovery.current',
			JSON.stringify({
				orderId: 9,
				amount: 100,
				qrCode: '',
				expiresAt: '2999-01-01T00:00:00Z',
				paymentType: 'airwallex',
				payUrl: '/payment/airwallex?order_id=9',
				outTradeNo: 'out-9',
				clientSecret: 'awx_secret',
				intentId: 'int_9',
				currency: 'USD',
				countryCode: 'US',
				paymentEnv: 'demo',
				payAmount: 100,
				orderType: 'balance',
				paymentMode: 'hosted',
				resumeToken: 'resume-9',
				createdAt: Date.now()
			})
		);
		setUrl('http://localhost/payment/airwallex?order_id=9&resume_token=resume-9');
		pageMod = await import('../../../routes/(user)/payment/airwallex/+page.svelte');
	});

	it('restores recovery snapshot and calls Airwallex hosted checkout facade', async () => {
		const redirectToCheckout = vi.fn();
		(airwallex.getAirwallex as ReturnType<typeof vi.fn>).mockResolvedValue({ redirectToCheckout });

		const { getByTestId } = render(pageMod.default);

		await waitFor(() => expect(airwallex.getAirwallex).toHaveBeenCalledWith('demo'));
		await waitFor(() => expect(getByTestId('payment-airwallex-redirecting')).toBeTruthy());
		expect(redirectToCheckout).toHaveBeenCalledWith(
			expect.objectContaining({
				intent_id: 'int_9',
				client_secret: 'awx_secret',
				currency: 'USD',
				country_code: 'US'
			})
		);
	});
});
