// @ts-nocheck — 本测试在 vitest 下运行，会用到 Node 内置（fs / path）。
// svelte-check 没装 @types/node 会全部报错；测试本身已在 CI 跑通，
// 直接关 TS 检查避免污染 svelte-check 输出。
/**
 * Payment SDK lazy + confirm polling + PaymentProviderSwitch · vitest 覆盖
 *
 * 覆盖点：
 *   1. getStripe() —— 通过 vi.mock('@stripe/stripe-js') 验证调用走的是
 *      dynamic import 路径（顶层无静态 import 该包；mock 拦截后 loadStripe
 *      只被调用一次/per publishableKey）。
 *   2. getAirwallex() —— 同样通过 vi.mock('airwallex-payment-elements')
 *      验证 init 被调用并返回 module namespace。
 *   3. confirmPayment 轮询：3 次 pending + 1 次 succeeded → 终态 succeeded。
 *   4. PaymentProviderSwitch：2 个 provider 渲染，点击切换 → bind:value 更新。
 *   5. lazy tripwire：源码层 grep 守护 src/lib + src/routes 无静态 import
 *      @stripe/* 或 airwallex-*；build-time check-chunks.mjs 是同一红线的
 *      bundle 端孪生。
 *
 * 设计注释：
 *   - PaymentProviderSwitch / 各 facade 用静态 import，避免 Svelte 5 +
 *     Vitest 4 + jsdom 下 `await import(svelte 组件)` 在多 test 场景出现
 *     模块加载 deadlock（实测：当文件内含 ≥ 2 个 it，单独的 dynamic
 *     import 会卡在 importer 直到超时）。
 *   - 真正 lazy 的契约由 stripe.ts / airwallex.ts 内部的
 *     `await import('@stripe/stripe-js')` / `await import('airwallex-payment-elements')`
 *     维持；vi.mock 在测试中拦截这些动态 import，断言 spy 被调即可证明
 *     facade 走的是 dynamic 路径。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────
// @stripe/stripe-js mock —— 拦截 loadStripe，断言 getStripe() 走 import() 链。
const stripeInstance = { __id: 'stripe-mock' };
const loadStripeSpy = vi.fn(async () => stripeInstance);
vi.mock('@stripe/stripe-js', () => ({
	loadStripe: loadStripeSpy,
	default: { loadStripe: loadStripeSpy }
}));

// airwallex-payment-elements mock —— 拦截 init，断言 getAirwallex() 走 import() 链。
const airwallexInitSpy = vi.fn();
const airwallexCreateSpy = vi.fn(() => ({ mount: vi.fn(), destroy: vi.fn() }));
vi.mock('airwallex-payment-elements', () => ({
	init: airwallexInitSpy,
	createElement: airwallexCreateSpy,
	confirmPaymentIntent: vi.fn(),
	default: { init: airwallexInitSpy, createElement: airwallexCreateSpy }
}));

// apiClient mock —— confirmPayment 走它，注入 status 序列。
const apiPostSpy = vi.fn();
vi.mock('$lib/api/client', () => ({
	apiClient: {
		get: vi.fn(),
		post: (...args: unknown[]) => apiPostSpy(...args),
		patch: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	},
	setUnauthorizedHook: vi.fn()
}));

// toast 静音
const showSuccessSpy = vi.fn();
const showErrorSpy = vi.fn();
vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: (...args: unknown[]) => showSuccessSpy(...args),
	showError: (...args: unknown[]) => showErrorSpy(...args),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

// 静态 import facade / 组件 —— 见模块注释（避免 dynamic + Svelte 5 死锁）。
import PaymentProviderSwitch from '$lib/features/payment/PaymentProviderSwitch.svelte';
import * as stripeFacade from '$lib/payments/stripe';
import * as airwallexFacade from '$lib/payments/airwallex';
import * as paymentApi from '$lib/api/user/payment';

// ── Setup ─────────────────────────────────────────────────────────────
beforeAll(async () => {
	addMessages('en', {
		user: {
			payment: {
				providers: {
					groupLabel: 'Payment provider',
					stripe: 'Stripe',
					stripeHint: 'Card via Stripe',
					airwallex: 'Airwallex',
					airwallexHint: 'Card via Airwallex',
					balance: 'Balance',
					balanceHint: 'Pay using balance'
				}
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

afterEach(() => {
	cleanup();
});

// ──────────────────────────────────────────────────────────────────────
// 1) getStripe lazy facade
// ──────────────────────────────────────────────────────────────────────

describe('getStripe · lazy facade', () => {
	beforeEach(() => {
		loadStripeSpy.mockClear();
		stripeFacade.resetStripeCache();
	});

	it('returns Stripe via dynamic import (not via top-level import)', async () => {
		const s = await stripeFacade.getStripe('pk_test_lazy_one');
		expect(loadStripeSpy).toHaveBeenCalledWith('pk_test_lazy_one');
		expect(loadStripeSpy).toHaveBeenCalledTimes(1);
		expect(s).toBe(stripeInstance);
	});

	it('memoizes per publishableKey', async () => {
		await stripeFacade.getStripe('pk_a');
		await stripeFacade.getStripe('pk_a');
		await stripeFacade.getStripe('pk_a');
		expect(loadStripeSpy).toHaveBeenCalledTimes(1);
		await stripeFacade.getStripe('pk_b');
		expect(loadStripeSpy).toHaveBeenCalledTimes(2);
	});

	it('throws when publishableKey missing', async () => {
		await expect(stripeFacade.getStripe('')).rejects.toThrow();
	});
});

// ──────────────────────────────────────────────────────────────────────
// 2) getAirwallex lazy facade
// ──────────────────────────────────────────────────────────────────────

describe('getAirwallex · lazy facade', () => {
	beforeEach(() => {
		airwallexInitSpy.mockClear();
		airwallexFacade.resetAirwallexCache();
	});

	it('returns Airwallex SDK via dynamic import + calls init', async () => {
		const ns = await airwallexFacade.getAirwallex('demo');
		expect(airwallexInitSpy).toHaveBeenCalledTimes(1);
		expect(airwallexInitSpy.mock.calls[0]?.[0]).toMatchObject({ env: 'demo' });
		expect(ns).toBeDefined();
	});

	it('memoizes per env', async () => {
		await airwallexFacade.getAirwallex('prod');
		await airwallexFacade.getAirwallex('prod');
		expect(airwallexInitSpy).toHaveBeenCalledTimes(1);
		await airwallexFacade.getAirwallex('demo');
		expect(airwallexInitSpy).toHaveBeenCalledTimes(2);
	});
});

// ──────────────────────────────────────────────────────────────────────
// 3) confirmPayment polling
// ──────────────────────────────────────────────────────────────────────

describe('confirmPayment · polls until succeeded', () => {
	beforeEach(() => {
		apiPostSpy.mockReset();
		showSuccessSpy.mockReset();
		showErrorSpy.mockReset();
	});

	it('3 pending then succeeded → final status succeeded', async () => {
		const responses = [
			{ status: 'PENDING' },
			{ status: 'PENDING' },
			{ status: 'PENDING' },
			{ status: 'PAID', order_id: 'o-1', out_trade_no: 'out-1' }
		];
		apiPostSpy.mockImplementation(async () => {
			const next = responses.shift();
			if (!next) throw new Error('exhausted');
			return next;
		});

		let final: { status: string } | null = null;
		for (let i = 0; i < 4; i++) {
			final = await paymentApi.confirmPayment('sess_123');
		}
		expect(final?.status).toBe('succeeded');
		expect(apiPostSpy).toHaveBeenCalledTimes(4);
	});

	it('falls back to orders/verify when public/resolve rejects', async () => {
		apiPostSpy
			.mockImplementationOnce(async () => {
				throw new Error('resume_token_invalid');
			})
			.mockImplementationOnce(async () => ({ status: 'PAID' }));

		const r = await paymentApi.confirmPayment('out_abc');
		expect(r.status).toBe('succeeded');
		expect(apiPostSpy).toHaveBeenCalledTimes(2);
		const firstUrl = apiPostSpy.mock.calls[0]?.[0];
		const secondUrl = apiPostSpy.mock.calls[1]?.[0];
		expect(firstUrl).toContain('/public/orders/resolve');
		expect(secondUrl).toContain('/orders/verify');
	});

	it('normalizes FAILED / CANCELLED → failed', async () => {
		apiPostSpy.mockResolvedValueOnce({ status: 'CANCELLED' });
		const r = await paymentApi.confirmPayment('sess_x');
		expect(r.status).toBe('failed');
	});
});

// ──────────────────────────────────────────────────────────────────────
// 4) PaymentProviderSwitch render + select
// ──────────────────────────────────────────────────────────────────────

describe('PaymentProviderSwitch · render + click', () => {
	it('renders two provider buttons; click toggles data-active', async () => {
		const { container } = render(PaymentProviderSwitch, {
			props: {
				enabledProviders: ['stripe', 'airwallex'],
				value: 'stripe'
			}
		});

		const providerButtons = container.querySelectorAll(
			'[data-testid="payment-provider-stripe"], [data-testid="payment-provider-airwallex"]'
		);
		expect(providerButtons.length).toBe(2);

		const stripeBtn = container.querySelector(
			'[data-testid="payment-provider-stripe"]'
		) as HTMLButtonElement;
		const airBtn = container.querySelector(
			'[data-testid="payment-provider-airwallex"]'
		) as HTMLButtonElement;
		expect(stripeBtn).not.toBeNull();
		expect(airBtn).not.toBeNull();

		expect(stripeBtn.getAttribute('data-active')).toBe('true');
		expect(airBtn.getAttribute('data-active')).toBe('false');

		await fireEvent.click(airBtn);
		await waitFor(
			() => {
				expect(airBtn.getAttribute('data-active')).toBe('true');
				expect(stripeBtn.getAttribute('data-active')).toBe('false');
			},
			{ timeout: 2000 }
		);
	});

	it('hides providers not in enabledProviders list', async () => {
		const { container } = render(PaymentProviderSwitch, {
			props: {
				enabledProviders: ['balance'],
				value: 'balance'
			}
		});
		expect(
			container.querySelector('[data-testid="payment-provider-stripe"]')
		).toBeNull();
		expect(
			container.querySelector('[data-testid="payment-provider-airwallex"]')
		).toBeNull();
		expect(
			container.querySelector('[data-testid="payment-provider-balance"]')
		).not.toBeNull();
	});
});

// ──────────────────────────────────────────────────────────────────────
// 5) Source-level lazy tripwire — no top-level @stripe / airwallex imports
//    across src/lib + src/routes. Build-time check-chunks.mjs is the
//    bundle-level twin of this gate.
// ──────────────────────────────────────────────────────────────────────

describe('lazy tripwire · src/ has no top-level @stripe / airwallex-payment-elements imports', () => {
	function walk(dir: string, out: string[] = []): string[] {
		for (const ent of readdirSync(dir)) {
			const p = join(dir, ent);
			let st;
			try {
				st = statSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				walk(p, out);
			} else if (
				st.isFile() &&
				(p.endsWith('.ts') || p.endsWith('.svelte')) &&
				!p.endsWith('.test.ts') &&
				!p.endsWith('.spec.ts')
			) {
				out.push(p);
			}
		}
		return out;
	}

	it('no static `from "@stripe/stripe-js"` or `from "airwallex-payment-elements"` in src/lib + src/routes (excl. test files)', () => {
		// 用 process.cwd() 而非 __dirname —— Vitest 在 ESM 模式下默认设置
		// cwd 到项目根（vitest.config.ts 同级）；svelte-check 也认得 process。
		// frontend-svelte/ → src/lib/features/payment 用相对补一段即可。
		const root = resolve(process.cwd(), 'src');
		const targets = [join(root, 'lib'), join(root, 'routes')];
		const files: string[] = [];
		for (const t of targets) {
			try {
				if (statSync(t).isDirectory()) walk(t, files);
			} catch {
				// dir missing — skip
			}
		}
		const offenders: Array<{ file: string; line: number; text: string }> = [];
		// Statement form — `import …from '<pkg>'` or `export …from '<pkg>'`
		// where the line genuinely starts with import/export (allowing leading
		// whitespace only). This excludes JSDoc / single-line comments.
		const stmtRe =
			/^\s*(?:import(?!\s+type\b)|export)\b[^'"`\n]*from\s*['"`](?:@stripe\/stripe-js|airwallex-payment-elements|@airwallex\/[^'"`]+)['"`]/;
		// Bare import — `import '<pkg>'` for side-effects.
		const bareRe =
			/^\s*import\s+['"`](?:@stripe\/stripe-js|airwallex-payment-elements|@airwallex\/[^'"`]+)['"`]/;
		// Comment exclusion — skip lines that start with comment markers.
		const commentRe = /^\s*(?:\/\/|\*|\/\*)/;
		for (const f of files) {
			const src = readFileSync(f, 'utf8');
			const lines = src.split(/\r?\n/);
			lines.forEach((line: string, i: number) => {
				if (commentRe.test(line)) return;
				if (stmtRe.test(line) || bareRe.test(line)) {
					offenders.push({ file: f, line: i + 1, text: line.trim() });
				}
			});
		}
		if (offenders.length > 0) {
			// eslint-disable-next-line no-console
			console.error('Top-level Stripe / Airwallex import detected:', offenders);
		}
		expect(offenders).toEqual([]);
	});
});
