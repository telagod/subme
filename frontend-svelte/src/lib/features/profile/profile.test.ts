/**
 * /(user)/profile · vitest 覆盖（M7 profile/security/connections/danger）
 *
 * 覆盖点：
 *   1. Tab nav：4 tabs 渲染，可切换；点击切到 security / connections / danger
 *      → 对应 panel 出现
 *   2. ChangePasswordForm：
 *        - 输入不匹配 → 提交不触发 API
 *        - 输入匹配 → 提交触发 changePassword API
 *   3. TotpEnrollDialog：mock enrollTotpStart 返回 secret + qr_code_url，
 *      mock dynamic-imported 'qrcode'.toDataURL → 渲染 <img>
 *   4. OAuthBindingsList：mock providers + bindings → 渲染所有行；
 *      点击 Unbind → confirm dialog 显示；确认 → unbindOAuth 被调
 *   5. Danger zone：输入错误 email → submit 按钮 disabled；
 *      输入正确 email + password → 按钮可用 → 点击触发 deleteAccount
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/user/profile' 一律替换为 vi.fn()
 *   - vi.mock 'qrcode'（dynamic-import 兜底，避免 jsdom canvas）
 *   - vi.mock '$lib/stores/toast.svelte'（静音）
 *   - vi.mock '$lib/stores/auth.svelte'（投喂 user fixture）
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

// vi.mock hoists —— 必须在 import +page.svelte 之前
vi.mock('$lib/api/user/profile', () => {
	return {
		updateBasicInfo: vi.fn(),
		changePassword: vi.fn(),
		enrollTotpStart: vi.fn(),
		enrollTotpConfirm: vi.fn(),
		disableTotp: vi.fn(),
		startOAuthBind: vi.fn(
			(p: string) => `/api/v1/auth/oauth/${p}/bind/start?redirect=%2Fprofile&intent=bind_current_user`
		),
		unbindOAuth: vi.fn(),
		deleteAccount: vi.fn(),
		userProfileApi: {}
	};
});

// qrcode dynamic-import 兜底：避免真模块加载触发 jsdom canvas warning，
// 同时返回稳定 dataURL 字符串供 <img src> 渲染断言。
vi.mock('qrcode', () => {
	return {
		default: {
			toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,STUB')
		},
		toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,STUB')
	};
});

// toast 静音
vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

// auth store stub —— 提供受控 user fixture
vi.mock('$lib/stores/auth.svelte', () => {
	const user = {
		id: 1,
		email: 'demo@example.com',
		username: 'demo',
		role: 'user',
		avatar_url: '',
		language: 'en',
		timezone: 'UTC',
		totp_enabled: false,
		auth_bindings: {
			github: { bound: true, display_name: 'octocat' },
			google: { bound: false }
		}
	};
	return {
		auth: {
			get user() {
				return user;
			},
			logout: vi.fn().mockResolvedValue(undefined),
			refreshUser: vi.fn().mockResolvedValue(undefined)
		}
	};
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {
		user: {
			profile: {
				title: 'Profile',
				description: 'desc',
				tabBasic: 'Basic Info',
				tabSecurity: 'Security',
				tabConnections: 'Connections',
				tabDanger: 'Danger Zone',
				basicsTitle: 'Basic',
				basicsDescription: 'sub',
				email: 'Email',
				avatar: 'Avatar',
				avatarEmpty: 'No avatar',
				username: 'Username',
				language: 'Language',
				timezone: 'Timezone',
				languages: { zh: '中文', en: 'English' },
				updateProfile: 'Update',
				updating: 'Updating…',
				updateSuccess: 'ok',
				updateFailed: 'fail'
			},
			security: {
				changePasswordTitle: 'Change password',
				changePasswordDescription: 'sub',
				currentPassword: 'Current',
				newPassword: 'New',
				confirmNewPassword: 'Confirm',
				changePasswordButton: 'Change',
				changingPassword: 'Changing…',
				passwordChangeSuccess: 'ok',
				errors: {
					CURRENT_REQUIRED: 'cur required',
					NEW_TOO_SHORT: 'too short',
					CONFIRM_TOO_SHORT: 'short',
					CONFIRM_MISMATCH: 'mismatch',
					UNKNOWN: 'unk'
				},
				totp: {
					title: '2FA',
					description: 'sub',
					enabled: 'On',
					notEnabled: 'Off',
					enable: 'Enable 2FA',
					disable: 'Disable 2FA',
					loading: 'Loading…',
					setupTitle: 'Set up',
					setupStep1: 'scan',
					manualEntry: 'manual',
					enterCode: 'code',
					verify: 'Verify',
					verifying: 'Verifying…',
					cancel: 'Cancel',
					invalidCode: 'bad',
					verifyFailed: 'fail',
					enableSuccess: 'ok',
					setupFailed: 'fail',
					qrFailed: 'qr fail',
					disableTitle: 'Disable?',
					disableWarning: 'warn',
					enterPassword: 'Password',
					confirmDisable: 'Confirm',
					disabling: '…',
					disableSuccess: 'off',
					disableFailed: 'fail',
					disableMissing: 'missing'
				}
			},
			connections: {
				title: 'Connections',
				description: 'desc',
				bind: 'Link',
				unbind: 'Unlink',
				cancel: 'Cancel',
				confirmUnbind: 'Unlink',
				unbinding: 'Unlinking…',
				unbindTitle: 'Unlink?',
				unbindDescription: 'warn {provider}',
				unbindSuccess: '{provider} unlinked',
				unbindFailed: 'fail',
				empty: 'empty',
				status: { bound: 'Linked', notBound: 'Not linked' },
				providers: {
					github: 'GitHub',
					google: 'Google',
					linuxdo: 'LinuxDo',
					dingtalk: 'DingTalk',
					wechat: 'WeChat',
					oidc: 'SSO'
				}
			},
			danger: {
				title: 'Delete account',
				description: 'warn',
				confirmEmail: 'Type {email}',
				password: 'Password',
				deleteButton: 'Delete',
				deleting: 'Deleting…',
				deleteSuccess: 'ok',
				deleteFailed: 'fail'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ────────────────────────────────────────────────────────────────
// Tab rendering + switching
// ────────────────────────────────────────────────────────────────

describe('profile page · tabs', () => {
	let pageMod: typeof import('../../../routes/(user)/profile/+page.svelte');

	beforeEach(async () => {
		pageMod = await import('../../../routes/(user)/profile/+page.svelte');
	});

	it('renders 4 tabs and switches panels on click', async () => {
		const { container } = render(pageMod.default);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="tab-basic"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="tab-security"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="tab-connections"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="tab-danger"]')).not.toBeNull();
		});

		// default: basic panel visible
		expect(container.querySelector('[data-testid="panel-basic"]')).not.toBeNull();

		// switch to security
		await fireEvent.click(
			container.querySelector('[data-testid="tab-security"]') as HTMLButtonElement
		);
		await waitFor(() => {
			expect(container.querySelector('[data-testid="panel-security"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="panel-basic"]')).toBeNull();
		});

		// switch to connections
		await fireEvent.click(
			container.querySelector('[data-testid="tab-connections"]') as HTMLButtonElement
		);
		await waitFor(() => {
			expect(container.querySelector('[data-testid="panel-connections"]')).not.toBeNull();
		});

		// switch to danger
		await fireEvent.click(
			container.querySelector('[data-testid="tab-danger"]') as HTMLButtonElement
		);
		await waitFor(() => {
			expect(container.querySelector('[data-testid="panel-danger"]')).not.toBeNull();
		});
	});
});

// ────────────────────────────────────────────────────────────────
// Change password form
// ────────────────────────────────────────────────────────────────

describe('profile page · change password', () => {
	let api: typeof import('$lib/api/user/profile');
	let pageMod: typeof import('../../../routes/(user)/profile/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/profile');
		(api.changePassword as ReturnType<typeof vi.fn>).mockReset();
		(api.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		pageMod = await import('../../../routes/(user)/profile/+page.svelte');
	});

	it('rejects mismatched new/confirm passwords', async () => {
		const { container } = render(pageMod.default);
		await fireEvent.click(
			container.querySelector('[data-testid="tab-security"]') as HTMLButtonElement
		);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="change-password-form"]')).not.toBeNull();
		});

		const cur = container.querySelector('[data-testid="cp-current"]') as HTMLInputElement;
		const nw = container.querySelector('[data-testid="cp-new"]') as HTMLInputElement;
		const cf = container.querySelector('[data-testid="cp-confirm"]') as HTMLInputElement;

		await fireEvent.input(cur, { target: { value: 'oldpassword' } });
		await fireEvent.input(nw, { target: { value: 'newpassword123' } });
		await fireEvent.input(cf, { target: { value: 'differentpwd' } });

		const form = container.querySelector('[data-testid="change-password-form"]') as HTMLFormElement;
		await fireEvent.submit(form);

		// 等待 superforms 校验完成；mismatch → API 不被调
		await new Promise((r) => setTimeout(r, 50));
		expect(api.changePassword).not.toHaveBeenCalled();
	});

	it('accepts matched passwords and calls API', async () => {
		const { container } = render(pageMod.default);
		await fireEvent.click(
			container.querySelector('[data-testid="tab-security"]') as HTMLButtonElement
		);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="change-password-form"]')).not.toBeNull();
		});

		const cur = container.querySelector('[data-testid="cp-current"]') as HTMLInputElement;
		const nw = container.querySelector('[data-testid="cp-new"]') as HTMLInputElement;
		const cf = container.querySelector('[data-testid="cp-confirm"]') as HTMLInputElement;

		await fireEvent.input(cur, { target: { value: 'oldpassword' } });
		await fireEvent.input(nw, { target: { value: 'newpassword123' } });
		await fireEvent.input(cf, { target: { value: 'newpassword123' } });

		const form = container.querySelector('[data-testid="change-password-form"]') as HTMLFormElement;
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(api.changePassword).toHaveBeenCalled();
				const args = (api.changePassword as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
				expect(args?.currentPassword).toBe('oldpassword');
				expect(args?.newPassword).toBe('newpassword123');
			},
			{ timeout: 2000 }
		);
	});
});

// ────────────────────────────────────────────────────────────────
// TOTP enroll dialog — API mock + qrcode dynamic-import mock
// ────────────────────────────────────────────────────────────────

describe('profile page · TOTP enroll', () => {
	let api: typeof import('$lib/api/user/profile');
	let pageMod: typeof import('../../../routes/(user)/profile/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/profile');
		(api.enrollTotpStart as ReturnType<typeof vi.fn>).mockReset();
		(api.enrollTotpStart as ReturnType<typeof vi.fn>).mockResolvedValue({
			secret: 'JBSWY3DPEHPK3PXP',
			qr_code_url: 'otpauth://totp/sub2api:demo@example.com?secret=JBSWY3DPEHPK3PXP&issuer=sub2api',
			setup_token: 'setup-tok-1'
		});
		pageMod = await import('../../../routes/(user)/profile/+page.svelte');
	});

	it('opens dialog → calls enrollTotpStart → renders QR image', async () => {
		const { container } = render(pageMod.default);
		await fireEvent.click(
			container.querySelector('[data-testid="tab-security"]') as HTMLButtonElement
		);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="totp-enable-btn"]')).not.toBeNull();
		});

		await fireEvent.click(
			container.querySelector('[data-testid="totp-enable-btn"]') as HTMLButtonElement
		);

		// Dialog 通过 bits-ui Portal 注入 document.body
		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="totp-enroll-dialog"]');
			expect(dlg).not.toBeNull();
		});

		await waitFor(
			() => {
				expect(api.enrollTotpStart).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		// QR image rendered after dynamic-import of 'qrcode' resolves
		await waitFor(
			() => {
				const img = document.body.querySelector(
					'[data-testid="totp-qr-img"]'
				) as HTMLImageElement | null;
				expect(img).not.toBeNull();
				expect(img?.src).toContain('data:image/png');
				const secret = document.body.querySelector('[data-testid="totp-secret"]');
				expect(secret?.textContent).toContain('JBSWY3DPEHPK3PXP');
			},
			{ timeout: 2000 }
		);
	});
});

// ────────────────────────────────────────────────────────────────
// OAuth bindings list
// ────────────────────────────────────────────────────────────────

describe('profile page · OAuth bindings', () => {
	let api: typeof import('$lib/api/user/profile');
	let pageMod: typeof import('../../../routes/(user)/profile/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/profile');
		(api.unbindOAuth as ReturnType<typeof vi.fn>).mockReset();
		(api.unbindOAuth as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
		pageMod = await import('../../../routes/(user)/profile/+page.svelte');
	});

	it('renders providers and triggers confirm dialog on Unbind', async () => {
		const { container } = render(pageMod.default);
		await fireEvent.click(
			container.querySelector('[data-testid="tab-connections"]') as HTMLButtonElement
		);

		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="oauth-bindings-row"]');
			// 6 providers from page-level enabledProviders list
			expect(rows.length).toBe(6);
		});

		// github is bound (per auth store fixture) → has unbind button
		const unbindBtn = container.querySelector(
			'[data-testid="oauth-unbind-btn"][data-provider="github"]'
		) as HTMLButtonElement;
		expect(unbindBtn).not.toBeNull();

		await fireEvent.click(unbindBtn);

		// confirm dialog shows
		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="oauth-unbind-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// confirm → unbindOAuth called with provider
		const confirmBtn = document.body.querySelector(
			'[data-testid="oauth-unbind-confirm"]'
		) as HTMLButtonElement;
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.unbindOAuth).toHaveBeenCalledWith('github');
		});
	});
});

// ────────────────────────────────────────────────────────────────
// Danger zone delete account
// ────────────────────────────────────────────────────────────────

describe('profile page · danger zone', () => {
	let api: typeof import('$lib/api/user/profile');
	let pageMod: typeof import('../../../routes/(user)/profile/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/profile');
		(api.deleteAccount as ReturnType<typeof vi.fn>).mockReset();
		(api.deleteAccount as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		pageMod = await import('../../../routes/(user)/profile/+page.svelte');
	});

	it('delete button disabled until email matches and password set', async () => {
		const { container } = render(pageMod.default);
		await fireEvent.click(
			container.querySelector('[data-testid="tab-danger"]') as HTMLButtonElement
		);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="dz-submit"]')).not.toBeNull();
		});

		const submit = container.querySelector('[data-testid="dz-submit"]') as HTMLButtonElement;
		expect(submit.disabled).toBe(true);

		const emailInput = container.querySelector('[data-testid="dz-email"]') as HTMLInputElement;
		const pwdInput = container.querySelector('[data-testid="dz-password"]') as HTMLInputElement;

		// wrong email → still disabled
		await fireEvent.input(emailInput, { target: { value: 'wrong@example.com' } });
		await fireEvent.input(pwdInput, { target: { value: 'pwd' } });
		await waitFor(() => {
			expect(
				(container.querySelector('[data-testid="dz-submit"]') as HTMLButtonElement).disabled
			).toBe(true);
		});

		// correct email + password → enabled
		await fireEvent.input(emailInput, { target: { value: 'demo@example.com' } });
		await waitFor(() => {
			expect(
				(container.querySelector('[data-testid="dz-submit"]') as HTMLButtonElement).disabled
			).toBe(false);
		});

		await fireEvent.click(
			container.querySelector('[data-testid="dz-submit"]') as HTMLButtonElement
		);

		await waitFor(() => {
			expect(api.deleteAccount).toHaveBeenCalled();
			const args = (api.deleteAccount as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(args?.email).toBe('demo@example.com');
			expect(args?.password).toBe('pwd');
		});
	});
});
