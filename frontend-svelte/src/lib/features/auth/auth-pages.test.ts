/**
 * /auth/{register,forgot,reset,verify-email,verify-email-sent} · vitest 覆盖（M7）
 *
 * 覆盖点：
 *   1. Register
 *      - confirm 不匹配 → 不触发 API
 *      - URL ?aff=XYZ → sessionStorage.oauth_aff_code = XYZ；hidden input 同步
 *   2. Forgot
 *      - 空 email / 非法 email → 不触发 API
 *   3. Reset
 *      - 缺 token → 直接渲染 "invalid" 卡片
 *   4. Verify-email
 *      - onMount POST verifyEmail 成功（默认） → 渲染 success 卡片
 *      - onMount status='already_verified' → 渲染 already 卡片
 *      - onMount status='expired' → 渲染 expired 卡片 + 按钮可见
 *      - 缺 token → 直接 invalid 卡片，且不调用 API
 *
 * 策略：
 *   - vi.mock '$lib/api/auth' 替换为 vi.fn()，每个 case 前重置。
 *   - vi.mock '$app/state' 注入可控 url 参数（覆盖默认 stub）。
 *   - toast/auth store 静音。
 *   - svelte-i18n 提前注入英文最小 fixture。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// ── API mock ───────────────────────────────────────────────────────
const mockRegister = vi.fn();
const mockRequestPasswordReset = vi.fn();
const mockConfirmPasswordReset = vi.fn();
const mockVerifyEmail = vi.fn();
const mockResendVerificationEmail = vi.fn();

vi.mock('$lib/api/auth', () => ({
	authApi: {
		login: vi.fn(),
		logout: vi.fn(),
		me: vi.fn(),
		register: (...args: unknown[]) => mockRegister(...args),
		forgotPassword: vi.fn(),
		requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
		resetPassword: vi.fn(),
		confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
		verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
		resendVerificationEmail: (...args: unknown[]) => mockResendVerificationEmail(...args)
	},
	isTotpChallenge: vi.fn(() => false)
}));

// toast store 静音
vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

// auth store stub —— 不做真实持久化
vi.mock('$lib/stores/auth.svelte', () => ({
	auth: {
		setSession: vi.fn(),
		_clearLocal: vi.fn()
	}
}));

// $app/state 可控注入 —— 每个 case 都能改 url 参数。
const pageState = { url: new URL('http://localhost/') };
vi.mock('$app/state', () => ({
	page: pageState
}));

// $app/navigation: goto 等
const mockGoto = vi.fn().mockResolvedValue(undefined);
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
}

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
	window.sessionStorage.clear();
});

beforeAll(async () => {
	addMessages('en', {
		auth: {
			oauthOrContinue: 'or continue with others',
			emailLabel: 'Email',
			emailPlaceholder: 'you@example.com',
			rememberedPassword: 'Remembered your password?',
			backToLogin: 'Back to sign in',
			forgotPasswordTitle: 'Reset your password',
			forgotPasswordHint: 'Enter your email and we will send a reset link.',
			sendResetLink: 'Send reset link',
			sendingResetLink: 'Sending...',
			resetEmailSent: 'Check your email',
			resetEmailSentHint: 'If an account exists you will get a link.',
			resetPasswordTitle: 'Set new password',
			resetPasswordHint: 'Enter your new password below.',
			resetPassword: 'Reset password',
			resettingPassword: 'Resetting...',
			newPassword: 'New password',
			newPasswordPlaceholder: 'Enter new password',
			confirmPassword: 'Confirm password',
			confirmPasswordPlaceholder: 'Repeat the new password',
			invalidResetLink: 'Invalid reset link',
			invalidResetLinkHint: 'Link is invalid or expired.',
			requestNewResetLink: 'Request new reset link',
			invalidOrExpiredToken: 'The reset link is invalid or has expired.',
			accountCreatedSuccess: 'Account created!',
			passwordResetSuccess: 'Password reset successfully',
			errors: {
				EMAIL_REQUIRED: 'Email is required.',
				EMAIL_INVALID: 'Enter a valid email address.',
				PASSWORD_REQUIRED: 'Password is required.',
				PASSWORD_TOO_SHORT: 'Password must be at least 6 characters.',
				NETWORK_ERROR: 'Network error.',
				UNKNOWN: 'Something went wrong.'
			},
			register: {
				title: 'Create account',
				subtitle: 'Get started.',
				emailLabel: 'Email',
				emailPlaceholder: 'you@example.com',
				passwordLabel: 'Password',
				passwordPlaceholder: 'At least 8 characters',
				passwordHint: 'At least 8 chars',
				confirmPasswordLabel: 'Confirm password',
				confirmPasswordPlaceholder: 'Repeat',
				agreementPrefix: 'I agree',
				termsLink: 'Terms',
				privacyLink: 'Privacy',
				and: 'and',
				show: 'Show',
				hide: 'Hide',
				submit: 'Create account',
				submitting: 'Creating...',
				alreadyHaveAccount: 'Have account?',
				signInLink: 'Sign in',
				errors: {
					PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
					PASSWORD_NEEDS_LETTER: 'Password must contain at least one letter.',
					PASSWORD_NEEDS_DIGIT: 'Password must contain at least one digit.',
					PASSWORD_MISMATCH: 'Passwords do not match.',
					CONFIRM_REQUIRED: 'Please confirm your password.',
					EMAIL_IN_USE: 'Email already registered.',
					BAD_REQUEST: 'Bad request.',
					SERVER_ERROR: 'Server error.',
					UNKNOWN: 'Failed.'
				}
			},
			forgot: {
				errors: {
					BAD_REQUEST: 'Bad request.',
					SERVER_ERROR: 'Server error.',
					UNKNOWN: 'Failed to send.'
				}
			},
			reset: {
				errors: {
					BAD_REQUEST: 'Bad request.',
					SERVER_ERROR: 'Server error.',
					UNKNOWN: 'Failed to reset.'
				}
			},
			verifyEmail: {
				title: 'Verify email',
				subtitle: 'Confirming...',
				pending: 'Verifying...',
				successTitle: 'Email verified',
				successHint: 'You can sign in.',
				alreadyTitle: 'Already verified',
				alreadyHint: 'Sign in.',
				expiredTitle: 'Link expired',
				expiredHint: 'Request a new one.',
				invalidTitle: 'Invalid link',
				invalidHint: 'Link is invalid.',
				signIn: 'Sign in',
				registerAgain: 'Back to register',
				resend: 'Resend verification',
				resending: 'Sending...',
				resendSuccess: 'Verification email sent.',
				errors: {
					NEED_EMAIL: 'Email missing.',
					RESEND_FAILED: 'Failed to resend.'
				}
			},
			verifyEmailSent: {
				title: 'Verify your email',
				subtitle: 'Sent.',
				body: 'Sent to {email}.',
				bodyNoEmail: 'Sent.',
				checkSpam: 'Check spam.',
				resend: 'Resend verification email'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

beforeEach(() => {
	mockRegister.mockReset();
	mockRequestPasswordReset.mockReset();
	mockConfirmPasswordReset.mockReset();
	mockVerifyEmail.mockReset();
	mockResendVerificationEmail.mockReset();
	mockGoto.mockReset();
	mockGoto.mockResolvedValue(undefined);
	pageState.url = new URL('http://localhost/');
});

// ────────────────────────────────────────────────────────────────
// Register
// ────────────────────────────────────────────────────────────────

describe('register page · form validation', () => {
	it('confirmPassword mismatch keeps API untouched', async () => {
		const mod = await import('../../../routes/auth/register/+page.svelte');
		const { container } = render(mod.default);

		const form = container.querySelector('[data-testid="register-form"]') as HTMLFormElement;
		expect(form).not.toBeNull();

		const email = container.querySelector('[data-testid="register-email"]') as HTMLInputElement;
		const pwd = container.querySelector('[data-testid="register-password"]') as HTMLInputElement;
		const confirm = container.querySelector('[data-testid="register-confirm"]') as HTMLInputElement;

		await fireEvent.input(email, { target: { value: 'a@b.com' } });
		await fireEvent.input(pwd, { target: { value: 'Aa11aa11' } });
		await fireEvent.input(confirm, { target: { value: 'Aa11aa22' } });
		await fireEvent.submit(form);

		// Give superforms a microtask to validate; mismatch must block the API.
		await new Promise((r) => setTimeout(r, 50));
		expect(mockRegister).not.toHaveBeenCalled();
	});

	it('captures ?aff=XYZ into sessionStorage on mount', async () => {
		setPageUrl('http://localhost/auth/register?aff=AFFXYZ');
		const mod = await import('../../../routes/auth/register/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(window.sessionStorage.getItem('oauth_aff_code')).toBe('AFFXYZ');
		});

		const hidden = container.querySelector('[data-testid="register-aff"]') as HTMLInputElement;
		expect(hidden).not.toBeNull();
		// Hidden input should be set via $form.affCode binding once onMount fires.
		await waitFor(() => {
			expect(hidden.value).toBe('AFFXYZ');
		});
	});
});

// ────────────────────────────────────────────────────────────────
// Forgot
// ────────────────────────────────────────────────────────────────

describe('forgot page · form validation', () => {
	it('blocks submit when email empty', async () => {
		const mod = await import('../../../routes/auth/forgot/+page.svelte');
		const { container } = render(mod.default);

		const form = container.querySelector('[data-testid="forgot-form"]') as HTMLFormElement;
		await fireEvent.submit(form);
		await new Promise((r) => setTimeout(r, 50));

		expect(mockRequestPasswordReset).not.toHaveBeenCalled();
		// success panel must NOT appear — form still rendered.
		expect(container.querySelector('[data-testid="forgot-success"]')).toBeNull();
	});

	it('blocks submit when email invalid format', async () => {
		const mod = await import('../../../routes/auth/forgot/+page.svelte');
		const { container } = render(mod.default);

		const email = container.querySelector('[data-testid="forgot-email"]') as HTMLInputElement;
		await fireEvent.input(email, { target: { value: 'not-an-email' } });

		const form = container.querySelector('[data-testid="forgot-form"]') as HTMLFormElement;
		await fireEvent.submit(form);
		await new Promise((r) => setTimeout(r, 50));

		expect(mockRequestPasswordReset).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="forgot-success"]')).toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────
// Reset
// ────────────────────────────────────────────────────────────────

describe('reset page · invalid link handling', () => {
	it('renders invalid card when token query missing', async () => {
		setPageUrl('http://localhost/auth/reset');
		const mod = await import('../../../routes/auth/reset/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="reset-invalid"]')).not.toBeNull();
		});
		expect(container.querySelector('[data-testid="reset-form"]')).toBeNull();
	});

	it('renders form when token present in query', async () => {
		setPageUrl('http://localhost/auth/reset?token=abc123');
		const mod = await import('../../../routes/auth/reset/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="reset-form"]')).not.toBeNull();
		});
		expect(container.querySelector('[data-testid="reset-invalid"]')).toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────
// Verify email · 3 states
// ────────────────────────────────────────────────────────────────

describe('verify-email page · onMount API + states', () => {
	it('success state after API resolves verified', async () => {
		setPageUrl('http://localhost/auth/verify-email?token=tok.success');
		mockVerifyEmail.mockResolvedValueOnce({ ok: true, status: 'verified' });

		const mod = await import('../../../routes/auth/verify-email/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(mockVerifyEmail).toHaveBeenCalledWith('tok.success');
			expect(container.querySelector('[data-testid="verify-success"]')).not.toBeNull();
		});
	});

	it('already_verified state', async () => {
		setPageUrl('http://localhost/auth/verify-email?token=tok.already');
		mockVerifyEmail.mockResolvedValueOnce({ status: 'already_verified' });

		const mod = await import('../../../routes/auth/verify-email/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="verify-already"]')).not.toBeNull();
		});
	});

	it('expired state surfaces resend button', async () => {
		setPageUrl('http://localhost/auth/verify-email?token=tok.expired&email=e@x.com');
		mockVerifyEmail.mockResolvedValueOnce({ status: 'expired' });

		const mod = await import('../../../routes/auth/verify-email/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="verify-expired"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="verify-resend"]')).not.toBeNull();
		});
	});

	it('renders invalid card when token missing and skips API call', async () => {
		setPageUrl('http://localhost/auth/verify-email');
		const mod = await import('../../../routes/auth/verify-email/+page.svelte');
		const { container } = render(mod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="verify-invalid"]')).not.toBeNull();
		});
		expect(mockVerifyEmail).not.toHaveBeenCalled();
	});
});
