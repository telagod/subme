import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

const mockExchangePendingOAuthCompletion = vi.fn();
const mockCompleteEmailOAuthRegistration = vi.fn();
const mockSetSession = vi.fn();
const mockSetToken = vi.fn();
const mockRefreshUser = vi.fn();
const mockShowError = vi.fn();
const mockShowInfo = vi.fn();
const mockShowSuccess = vi.fn();
const mockGoto = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/api/auth', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/auth')>();
	return {
		...actual,
		authApi: {
			...actual.authApi,
			exchangePendingOAuthCompletion: (...args: unknown[]) =>
				mockExchangePendingOAuthCompletion(...args),
			completeEmailOAuthRegistration: (...args: unknown[]) =>
				mockCompleteEmailOAuthRegistration(...args)
		}
	};
});

const authState = { user: null as null | { id: number; email: string; role?: string } };
vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		get user() {
			return authState.user;
		},
		setSession: (...args: unknown[]) => mockSetSession(...args),
		setToken: (...args: unknown[]) => mockSetToken(...args),
		refreshUser: (...args: unknown[]) => mockRefreshUser(...args)
	}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showError: (...args: unknown[]) => mockShowError(...args),
	showInfo: (...args: unknown[]) => mockShowInfo(...args),
	showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

const pageState = { url: new URL('http://localhost/auth/callback'), params: {} };
vi.mock('$app/state', () => ({
	page: pageState
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => mockGoto(...args),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn(),
	invalidate: vi.fn().mockResolvedValue(undefined),
	invalidateAll: vi.fn().mockResolvedValue(undefined),
	preloadData: vi.fn().mockResolvedValue({}),
	preloadCode: vi.fn().mockResolvedValue(undefined),
	pushState: vi.fn(),
	replaceState: vi.fn(),
	onNavigate: vi.fn(),
	disableScrollHandling: vi.fn()
}));

function setPageUrl(href: string): void {
	pageState.url = new URL(href);
	window.history.replaceState({}, '', pageState.url.pathname + pageState.url.search + pageState.url.hash);
}

beforeAll(async () => {
	addMessages('en', {
		auth: {
			loginSuccess: 'Signed in successfully.',
			loginFailed: 'Sign-in failed.',
			backToLogin: 'Back to sign in',
			emailLabel: 'Email',
			errors: {
				EMAIL_REQUIRED: 'Email is required.',
				PASSWORD_TOO_SHORT: 'Password must be at least 6 characters.'
			},
			register: {
				passwordLabel: 'Password',
				confirmPasswordLabel: 'Confirm password',
				errors: {
					PASSWORD_MISMATCH: 'Passwords do not match.'
				}
			},
			callback: {
				title: 'Signing you in with {provider}',
				subtitle: 'Completing sign-in...',
				processing: 'Completing {provider} sign-in, please wait...',
				completed: 'Redirecting...',
				totpSubmitting: 'Verifying...',
				errors: {
					MALFORMED: 'Sign-in response was malformed.',
					PROVIDER_ERROR: '{provider} sign-in failed.',
					UNKNOWN: 'Sign-in failed. Please try again.'
				}
			},
			emailCompletion: {
				title: 'Complete sign-in',
				submit: 'Complete sign-in'
			},
			oauth: {
				code: 'Code',
				state: 'State',
				fullUrl: 'Full URL'
			}
		},
		common: {
			copy: 'Copy',
			copied: 'Copied.'
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

beforeEach(() => {
	mockExchangePendingOAuthCompletion.mockReset();
	mockCompleteEmailOAuthRegistration.mockReset();
	mockSetSession.mockReset();
	mockSetToken.mockReset();
	mockRefreshUser.mockReset();
	mockShowError.mockReset();
	mockShowInfo.mockReset();
	mockShowSuccess.mockReset();
	mockGoto.mockReset().mockResolvedValue(undefined);
	authState.user = null;
	window.sessionStorage.clear();
	window.localStorage.clear();
	setPageUrl('http://localhost/auth/callback');
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	window.sessionStorage.clear();
	window.localStorage.clear();
});

describe('/auth/callback generic page', () => {
	it('finalizes fragment token by setting token, refreshing user, and redirecting safely', async () => {
		setPageUrl(
			'http://localhost/auth/callback#access_token=TOK&refresh_token=REF&expires_in=3600&redirect=%2Fprofile'
		);
		mockRefreshUser.mockImplementationOnce(async () => {
			authState.user = { id: 1, email: 'u@example.com', role: 'user' };
		});

		const mod = await import('../../../routes/auth/callback/+page.svelte');
		render(mod.default);

		await waitFor(() => {
			expect(mockSetToken).toHaveBeenCalledWith('TOK');
			expect(mockRefreshUser).toHaveBeenCalledTimes(1);
			expect(mockGoto).toHaveBeenCalledWith('/profile', { replaceState: true });
		});
		expect(mockSetSession).not.toHaveBeenCalled();
		expect(mockShowSuccess).toHaveBeenCalledWith('Signed in successfully.');
	});

	it('renders pending email OAuth registration and submits invitation plus affiliate code', async () => {
		setPageUrl('http://localhost/auth/oauth/callback');
		window.sessionStorage.setItem('oauth_aff_code', 'AFF456');
		mockExchangePendingOAuthCompletion.mockResolvedValueOnce({
			error: 'invitation_required',
			provider: 'google',
			resolved_email: 'new@example.com',
			redirect: '/dashboard'
		});
		mockCompleteEmailOAuthRegistration.mockResolvedValueOnce({
			access_token: 'NEW_TOKEN',
			user: { id: 9, email: 'new@example.com', role: 'user' }
		});

		const mod = await import('../../../routes/auth/callback/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(mockExchangePendingOAuthCompletion).toHaveBeenCalledTimes(1);
			expect(container.querySelector('[data-testid="oauth-registration-form"]')).not.toBeNull();
		});

		const email = container.querySelector(
			'[data-testid="oauth-registration-email"]'
		) as HTMLInputElement;
		const password = container.querySelector(
			'[data-testid="oauth-registration-password"]'
		) as HTMLInputElement;
		const confirm = container.querySelector(
			'[data-testid="oauth-registration-confirm"]'
		) as HTMLInputElement;
		const invitation = container.querySelector(
			'[data-testid="oauth-registration-invitation"]'
		) as HTMLInputElement;
		const form = container.querySelector(
			'[data-testid="oauth-registration-form"]'
		) as HTMLFormElement;

		expect(email.value).toBe('new@example.com');
		await fireEvent.input(password, { target: { value: 'secret1' } });
		await fireEvent.input(confirm, { target: { value: 'secret1' } });
		await fireEvent.input(invitation, { target: { value: 'INVITE' } });
		await fireEvent.submit(form);

		await waitFor(() => {
			expect(mockCompleteEmailOAuthRegistration).toHaveBeenCalledWith('google', {
				password: 'secret1',
				aff_code: 'AFF456',
				invitation_code: 'INVITE'
			});
			expect(mockSetSession).toHaveBeenCalledWith('NEW_TOKEN', {
				id: 9,
				email: 'new@example.com',
				role: 'user'
			});
			expect(mockGoto).toHaveBeenCalledWith('/dashboard', { replaceState: true });
		});
	});
});
