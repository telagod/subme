import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { page } from '$app/state';
import pageSrc from '../../../routes/auth/wechat/payment/callback/+page.svelte?raw';
import rerouteSrc from '$lib/routing/reroute.ts?raw';

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

vi.mock('$lib/stores/toast.svelte', () => ({
	showError: vi.fn(),
	showSuccess: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

beforeAll(async () => {
	addMessages('en', {
		auth: {
			wechatPayment: {
				callbackTitle: 'Resuming WeChat payment',
				callbackProcessing: 'Resuming WeChat payment...',
				backToPayment: 'Back to payment',
				callbackMissingResumeToken: 'The WeChat payment callback is missing the resume token.'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function setUrl(url: string) {
	(page as { url: URL }).url = new URL(url);
}

describe('wechat payment callback route', () => {
	beforeEach(() => {
		gotoSpy.mockReset();
	});

	it('keeps provider-specific auth callbacks mapped to the polymorphic route', () => {
		expect(rerouteSrc).toContain("'/auth/linuxdo/callback': '/auth/callback/linuxdo'");
		expect(rerouteSrc).toContain("'/auth/wechat/callback': '/auth/callback/wechat'");
		expect(rerouteSrc).toContain("'/auth/dingtalk/callback': '/auth/callback/dingtalk'");
		expect(rerouteSrc).toContain(
			"'/auth/dingtalk/email-completion': '/auth/callback/dingtalk/email-completion'"
		);
		expect(rerouteSrc).toContain("'/auth/oidc/callback': '/auth/callback/oidc'");
	});

	it('renders the WeChat payment callback shell and preserves safe redirect only', async () => {
		expect(pageSrc).toContain('data-testid="wechat-payment-callback-page"');
		expect(pageSrc).toContain('normalizeRedirectPath');

		setUrl(
			'http://localhost/auth/wechat/payment/callback?wechat_resume_token=resume-1&redirect=/payment?amount=20'
		);
		const pageMod = await import('../../../routes/auth/wechat/payment/callback/+page.svelte');
		render(pageMod.default);

		await waitFor(() =>
			expect(gotoSpy).toHaveBeenCalledWith(
				'/purchase?amount=20&wechat_resume=1&wechat_resume_token=resume-1',
				{ replaceState: true }
			)
		);
	});
});
