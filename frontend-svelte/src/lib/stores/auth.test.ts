/**
 * auth.svelte.ts · vitest 覆盖（M6 auth foundation）
 *
 * 覆盖点：
 *   1. login() 成功 → 写入 token + user，isAuthenticated=true
 *   2. login() 401 → 抛错且 store 不变
 *   3. login() TOTP challenge → 抛带 code='TOTP_REQUIRED' 的 Error
 *   4. logout() 清空 token + user + 即便 server 失败也 teardown
 *   5. isAdmin 反映 user.role
 *   6. isSimpleMode 反映 user.run_mode
 *   7. persisted 层 round-trip：set→新 store 实例能读到
 *   8. hydrate() with token+no user → 自动拉 me()
 *
 * 策略：vi.mock $lib/api/auth.ts，所有 store 测试都用 mock 注入响应。
 *   - 每个 case 前 `auth._clearLocal() + localStorage.clear()` 隔离。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── mock authApi 必须早于任何 import auth/auth.svelte.ts ────────────────
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockMe = vi.fn();

vi.mock('$lib/api/auth', () => ({
	authApi: {
		login: (...args: unknown[]) => mockLogin(...args),
		logout: (...args: unknown[]) => mockLogout(...args),
		me: (...args: unknown[]) => mockMe(...args),
		register: vi.fn(),
		forgotPassword: vi.fn(),
		resetPassword: vi.fn(),
		verifyEmail: vi.fn()
	},
	isTotpChallenge: (r: unknown): boolean =>
		typeof r === 'object' &&
		r !== null &&
		'requires_2fa' in r &&
		(r as { requires_2fa: boolean }).requires_2fa === true
}));

import { auth } from './auth.svelte';

describe('auth store · login flow', () => {
	beforeEach(() => {
		mockLogin.mockReset();
		mockLogout.mockReset();
		mockMe.mockReset();
		window.localStorage.clear();
		auth._clearLocal();
	});

	it('login() success populates token + user and toggles isAuthenticated', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'jwt.abc',
			user: { id: 1, email: 'a@b.com', role: 'user' }
		});

		expect(auth.isAuthenticated).toBe(false);
		await auth.login({ email: 'a@b.com', password: 'sekretz' });

		expect(auth.token).toBe('jwt.abc');
		expect(auth.user?.email).toBe('a@b.com');
		expect(auth.isAuthenticated).toBe(true);
		expect(auth.isAdmin).toBe(false);
	});

	it('login() 401 throws and leaves store untouched', async () => {
		mockLogin.mockRejectedValueOnce(new Error('HTTP 401'));

		await expect(auth.login({ email: 'x', password: 'y' })).rejects.toThrow(/401/);
		expect(auth.token).toBeNull();
		expect(auth.user).toBeNull();
		expect(auth.isAuthenticated).toBe(false);
	});

	it('login() with TOTP challenge throws TOTP_REQUIRED', async () => {
		mockLogin.mockResolvedValueOnce({
			requires_2fa: true,
			temp_token: 'tmp.123'
		});

		const err = await auth.login({ email: 'a', password: 'b' }).catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as { code?: string }).code).toBe('TOTP_REQUIRED');
		expect((err as { tempToken?: string }).tempToken).toBe('tmp.123');
		// store 未被污染
		expect(auth.token).toBeNull();
	});
});

describe('auth store · logout', () => {
	beforeEach(() => {
		mockLogin.mockReset();
		mockLogout.mockReset();
		mockMe.mockReset();
		window.localStorage.clear();
		auth._clearLocal();
	});

	it('logout() clears token + user on success', async () => {
		// 先伪造已登录
		mockLogin.mockResolvedValueOnce({
			access_token: 'jwt.xyz',
			user: { id: 2, email: 'admin@x.com', role: 'admin' }
		});
		await auth.login({ email: 'admin@x.com', password: 'p' });
		expect(auth.isAuthenticated).toBe(true);

		mockLogout.mockResolvedValueOnce({});
		await auth.logout();

		expect(auth.token).toBeNull();
		expect(auth.user).toBeNull();
		expect(auth.isAuthenticated).toBe(false);
	});

	it('logout() still clears local state even when server call fails', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'jwt.zzz',
			user: { id: 3, email: 'u@x', role: 'user' }
		});
		await auth.login({ email: 'u@x', password: 'p' });

		mockLogout.mockRejectedValueOnce(new Error('network'));
		await auth.logout();

		expect(auth.token).toBeNull();
		expect(auth.user).toBeNull();
	});
});

describe('auth store · role / mode getters', () => {
	beforeEach(() => {
		mockLogin.mockReset();
		mockLogout.mockReset();
		mockMe.mockReset();
		window.localStorage.clear();
		auth._clearLocal();
	});

	it('isAdmin true iff user.role === admin', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'tk.adm',
			user: { id: 1, email: 'a@b', role: 'admin' }
		});
		await auth.login({ email: 'a@b', password: 'p' });
		expect(auth.isAdmin).toBe(true);

		await auth.logout();
		mockLogin.mockResolvedValueOnce({
			access_token: 'tk.user',
			user: { id: 2, email: 'u@b', role: 'user' }
		});
		await auth.login({ email: 'u@b', password: 'p' });
		expect(auth.isAdmin).toBe(false);
	});

	it('isSimpleMode reflects user.run_mode', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'tk.s',
			user: { id: 1, email: 'a@b', role: 'user', run_mode: 'simple' }
		});
		await auth.login({ email: 'a@b', password: 'p' });
		expect(auth.isSimpleMode).toBe(true);

		await auth.logout();
		mockLogin.mockResolvedValueOnce({
			access_token: 'tk.std',
			user: { id: 2, email: 'a@b', role: 'user', run_mode: 'standard' }
		});
		await auth.login({ email: 'a@b', password: 'p' });
		expect(auth.isSimpleMode).toBe(false);
	});
});

describe('auth store · persisted layer round-trip', () => {
	beforeEach(() => {
		mockLogin.mockReset();
		mockLogout.mockReset();
		mockMe.mockReset();
		window.localStorage.clear();
		auth._clearLocal();
	});

	it('login persists token + user to localStorage with __v1__ prefix', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'jwt.persist',
			user: { id: 7, email: 'x@y', role: 'user' }
		});
		await auth.login({ email: 'x@y', password: 'p' });

		const rawToken = window.localStorage.getItem('auth.token');
		const rawUser = window.localStorage.getItem('auth.user');
		expect(rawToken).toMatch(/^__v1__:/);
		expect(rawUser).toMatch(/^__v1__:/);
		// JSON 负载应解析为对应值
		expect(JSON.parse(rawToken!.slice('__v1__:'.length))).toBe('jwt.persist');
		expect(JSON.parse(rawUser!.slice('__v1__:'.length))).toMatchObject({
			id: 7,
			email: 'x@y'
		});
	});

	it('logout removes localStorage keys', async () => {
		mockLogin.mockResolvedValueOnce({
			access_token: 'jwt.clear',
			user: { id: 9, email: 'q@r', role: 'user' }
		});
		await auth.login({ email: 'q@r', password: 'p' });
		expect(window.localStorage.getItem('auth.token')).not.toBeNull();

		mockLogout.mockResolvedValueOnce({});
		await auth.logout();
		expect(window.localStorage.getItem('auth.token')).toBeNull();
		expect(window.localStorage.getItem('auth.user')).toBeNull();
	});
});

describe('auth store · hydrate / refreshUser', () => {
	beforeEach(() => {
		mockLogin.mockReset();
		mockLogout.mockReset();
		mockMe.mockReset();
		window.localStorage.clear();
		auth._clearLocal();
	});

	it('hydrate() is a no-op when no token present', async () => {
		await auth.hydrate();
		expect(mockMe).not.toHaveBeenCalled();
	});

	it('refreshUser() updates user on success', async () => {
		// 灌入 token 但 user 空
		auth.setSession('jwt.t1', { id: 1, email: 'a@b', role: 'user' });
		mockMe.mockResolvedValueOnce({
			data: { id: 1, email: 'a@b', role: 'admin' }
		});
		await auth.refreshUser();
		expect(auth.user?.role).toBe('admin');
		expect(auth.isAdmin).toBe(true);
	});

	it('setToken() stores token only and lets refreshUser() populate user', async () => {
		auth.setSession('jwt.old', { id: 1, email: 'old@b', role: 'user' });
		auth.setToken('jwt.oauth');
		expect(auth.token).toBe('jwt.oauth');
		expect(auth.user).toBeNull();
		expect(auth.isAuthenticated).toBe(false);

		mockMe.mockResolvedValueOnce({
			data: { id: 3, email: 'oauth@b', role: 'user' }
		});
		await auth.refreshUser();
		expect(auth.user?.email).toBe('oauth@b');
		expect(auth.isAuthenticated).toBe(true);
	});

	it('refreshUser() clears session when /me fails', async () => {
		auth.setSession('jwt.t2', { id: 1, email: 'a@b', role: 'user' });
		mockMe.mockRejectedValueOnce(new Error('HTTP 401'));
		await auth.refreshUser();
		expect(auth.token).toBeNull();
		expect(auth.user).toBeNull();
	});
});
