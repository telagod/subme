import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

const mockGetPublicSettings = vi.fn();

vi.mock('$lib/api/auth', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/auth')>();
	return {
		...actual,
		authApi: {
			...actual.authApi,
			getPublicSettings: (...args: unknown[]) => mockGetPublicSettings(...args)
		}
	};
});

const authState = {
	isAuthenticated: false,
	isAdmin: false,
	user: null as null | { email?: string }
};

vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		get isAuthenticated() {
			return authState.isAuthenticated;
		},
		get isAdmin() {
			return authState.isAdmin;
		},
		get user() {
			return authState.user;
		}
	}
}));

beforeAll(async () => {
	addMessages('en', {
		home: {
			viewDocs: 'View Documentation',
			docs: 'Docs',
			dashboard: 'Dashboard',
			login: 'Login',
			getStarted: 'Get Started',
			goToDashboard: 'Go to Dashboard',
			heroSubtitle: 'One Key, All AI Models',
			heroDescription: 'Access multiple AI services with one key.',
			quench: {
				eyebrow: 'AI API GATEWAY',
				stats: {
					providers: '4+ upstream providers',
					protocol: 'OpenAI-compatible API',
					billing: 'Per-second metering'
				},
				capabilitiesTitle: 'Built for Production',
				capabilitiesDesc: 'A complete gateway pipeline.',
				features: {
					realtimeUsage: 'Real-time Usage & Alerts',
					realtimeUsageDesc: 'Request-level usage details.',
					riskControl: 'Risk Control & Rate Limiting',
					riskControlDesc: 'Three-tier limits.',
					stickySession: 'Sticky Sessions',
					stickySessionDesc: 'Stable account routing.'
				},
				ctaTitle: 'Ready to integrate?',
				ctaDesc: 'Sign up to get a unified key.'
			},
			features: {
				unifiedGateway: 'One-Click Access',
				unifiedGatewayDesc: 'Get a single API key.',
				multiAccount: 'Always Reliable',
				multiAccountDesc: 'Smart routing across accounts.',
				balanceQuota: 'Pay What You Use',
				balanceQuotaDesc: 'Usage-based billing.'
			},
			providers: {
				title: 'Supported AI Models',
				description: 'One API, Multiple Choices',
				supported: 'Supported',
				soon: 'Soon',
				claude: 'Claude',
				gemini: 'Gemini',
				antigravity: 'Antigravity',
				more: 'More'
			},
			footer: {
				allRightsReserved: 'All rights reserved.'
			},
			tags: {
				subscriptionToApi: 'Subscription to API',
				stickySession: 'Sticky Sessions',
				realtimeBilling: 'Pay As You Go'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

beforeEach(() => {
	mockGetPublicSettings.mockReset();
	authState.isAuthenticated = false;
	authState.isAdmin = false;
	authState.user = null;
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

describe('/home page', () => {
	it('renders the default public home page from public settings', async () => {
		mockGetPublicSettings.mockResolvedValueOnce({
			site_name: 'Gateway',
			site_logo: '/logo.png',
			site_subtitle: 'One key',
			doc_url: 'https://docs.example.com'
		});

		const mod = await import('../../../routes/home/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => expect(mockGetPublicSettings).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.textContent).toContain('Gateway'));
		expect(container.querySelector('[data-testid="home-page"]')).not.toBeNull();
		expect(container.textContent).toContain('One key');
		expect(container.querySelector('a[href="/login"]')).not.toBeNull();
		expect(container.querySelector('a[href="https://docs.example.com/"]')).not.toBeNull();
	});

	it('uses dashboard CTA for authenticated admins', async () => {
		authState.isAuthenticated = true;
		authState.isAdmin = true;
		authState.user = { email: 'admin@example.com' };
		mockGetPublicSettings.mockResolvedValueOnce({ site_name: 'Gateway' });

		const mod = await import('../../../routes/home/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => expect(mockGetPublicSettings).toHaveBeenCalledTimes(1));
		expect(container.querySelector('a[href="/admin/dashboard"]')).not.toBeNull();
		expect(container.textContent).toContain('A');
	});

	it('renders custom home_content URL as iframe', async () => {
		mockGetPublicSettings.mockResolvedValueOnce({
			site_name: 'Gateway',
			home_content: 'https://status.example.com/embed'
		});

		const mod = await import('../../../routes/home/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="home-custom-iframe"]')).not.toBeNull();
		});
		expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
			'https://status.example.com/embed'
		);
	});

	it('renders custom home_content markdown as sanitized HTML', async () => {
		mockGetPublicSettings.mockResolvedValueOnce({
			site_name: 'Gateway',
			home_content: '# Hello\\n<script>alert(1)</script>'
		});

		const mod = await import('../../../routes/home/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="home-custom-html"]')).not.toBeNull();
		});
		expect(container.querySelector('h1')?.textContent).toContain('Hello');
		expect(container.querySelector('script')).toBeNull();
	});
});
