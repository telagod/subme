/**
 * callbacks.ts · M8 unified OAuth callback dispatch table coverage
 *
 * 覆盖点（任务约束）：
 *   1. 6 个 provider strategy 都注册了，且每个都打到对应 /auth/oauth/<p>/callback。
 *   2. 未知 provider → UnknownProviderError。
 *   3. AuthResponse → kind='auth' + intent='login' + setSession 由 page 层完成
 *      （这里只断 dispatch 返回 shape；page 行为已被 page-level 集成测试覆盖）。
 *   4. requires_2fa → kind='totp' + tempToken 透传。
 *   5. state 含 bind_current_user → intent='bind'。
 *   6. classifyOAuthErrorParam: access_denied → ACCESS_DENIED i18n key。
 *
 * 策略：vi.mock('$lib/api/auth') 完全替换 authApi，避免真打 fetch。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockOauthCallback = vi.fn();

vi.mock('$lib/api/auth', () => ({
	authApi: {
		oauthCallback: (...args: unknown[]) => mockOauthCallback(...args)
	},
	isTotpChallenge: (r: unknown) =>
		typeof r === 'object' &&
		r !== null &&
		'requires_2fa' in r &&
		(r as { requires_2fa?: unknown }).requires_2fa === true,
	isEmailCompletionRequired: (r: unknown) =>
		typeof r === 'object' &&
		r !== null &&
		'requires_email_completion' in r &&
		(r as { requires_email_completion?: unknown }).requires_email_completion === true
}));

import {
	CALLBACK_DISPATCH,
	PROVIDER_CONFIG,
	UnknownProviderError,
	classifyOAuthErrorParam,
	deriveIntent,
	dispatchCallback
} from './callbacks';

beforeEach(() => {
	mockOauthCallback.mockReset();
});

describe('CALLBACK_DISPATCH · registration', () => {
	it('registers all 6 supported providers', () => {
		const keys = Object.keys(CALLBACK_DISPATCH).sort();
		expect(keys).toEqual(['dingtalk', 'github', 'google', 'linuxdo', 'oidc', 'wechat']);
	});

	it('PROVIDER_CONFIG covers each dispatch entry', () => {
		for (const p of Object.keys(CALLBACK_DISPATCH)) {
			expect(PROVIDER_CONFIG[p]).toBeDefined();
			expect(typeof PROVIDER_CONFIG[p].displayName).toBe('string');
			expect(PROVIDER_CONFIG[p].displayName.length).toBeGreaterThan(0);
		}
	});

	it('only DingTalk advertises email-completion support', () => {
		expect(PROVIDER_CONFIG.dingtalk.supportsEmailCompletion).toBe(true);
		for (const [p, cfg] of Object.entries(PROVIDER_CONFIG)) {
			if (p === 'dingtalk') continue;
			expect(cfg.supportsEmailCompletion).toBe(false);
		}
	});
});

describe('dispatchCallback · provider routing', () => {
	it('each provider hits authApi.oauthCallback with its own slug', async () => {
		mockOauthCallback.mockResolvedValue({
			access_token: 'TOK',
			user: { id: 1, email: 'u@e.com' }
		});

		for (const provider of ['linuxdo', 'dingtalk', 'oidc', 'wechat', 'github', 'google']) {
			mockOauthCallback.mockClear();
			await dispatchCallback(provider, { code: 'c', state: 's' });
			expect(mockOauthCallback).toHaveBeenCalledTimes(1);
			expect(mockOauthCallback).toHaveBeenCalledWith(provider, {
				code: 'c',
				state: 's',
				mode: undefined
			});
		}
	});

	it('passes mode through for WeChat (open/mp)', async () => {
		mockOauthCallback.mockResolvedValue({
			access_token: 'TOK',
			user: { id: 1, email: 'u@e.com' }
		});
		await dispatchCallback('wechat', { code: 'c', state: 's', mode: 'mp' });
		expect(mockOauthCallback).toHaveBeenCalledWith('wechat', {
			code: 'c',
			state: 's',
			mode: 'mp'
		});
	});

	it('unknown provider throws UnknownProviderError', async () => {
		await expect(dispatchCallback('myspace', { code: 'c', state: 's' })).rejects.toBeInstanceOf(
			UnknownProviderError
		);
	});

	it('does not call the API for unknown providers', async () => {
		await expect(dispatchCallback('myspace', { code: 'c', state: 's' })).rejects.toThrow();
		expect(mockOauthCallback).not.toHaveBeenCalled();
	});
});

describe('dispatchCallback · response classification', () => {
	it('auth-shape response → kind=auth + intent=login by default', async () => {
		mockOauthCallback.mockResolvedValueOnce({
			access_token: 'TOK',
			user: { id: 7, email: 'u@e.com' }
		});
		const r = await dispatchCallback('linuxdo', { code: 'c', state: 's' });
		expect(r.kind).toBe('auth');
		if (r.kind === 'auth') {
			expect(r.intent).toBe('login');
			expect(r.response.access_token).toBe('TOK');
			expect(r.response.user?.id).toBe(7);
		}
	});

	it('requires_2fa → kind=totp + temp_token forwarded', async () => {
		mockOauthCallback.mockResolvedValueOnce({
			requires_2fa: true,
			temp_token: 'TMP_TOKEN'
		});
		const r = await dispatchCallback('oidc', { code: 'c', state: 's' });
		expect(r.kind).toBe('totp');
		if (r.kind === 'totp') {
			expect(r.response.requires_2fa).toBe(true);
			expect(r.response.temp_token).toBe('TMP_TOKEN');
		}
	});

	it('requires_email_completion → kind=emailCompletion (DingTalk path)', async () => {
		mockOauthCallback.mockResolvedValueOnce({
			requires_email_completion: true,
			partial_auth_token: 'PARTIAL',
			provider_email_hint: 'hint@x.com'
		});
		const r = await dispatchCallback('dingtalk', { code: 'c', state: 's' });
		expect(r.kind).toBe('emailCompletion');
		if (r.kind === 'emailCompletion') {
			expect(r.response.partial_auth_token).toBe('PARTIAL');
			expect(r.response.provider_email_hint).toBe('hint@x.com');
		}
	});

	it('state with bind_current_user marks intent=bind', async () => {
		mockOauthCallback.mockResolvedValueOnce({
			access_token: 'TOK',
			user: { id: 1, email: 'u@e.com' }
		});
		const r = await dispatchCallback('github', {
			code: 'c',
			state: 'something.bind_current_user.extra'
		});
		expect(r.kind).toBe('auth');
		if (r.kind === 'auth') expect(r.intent).toBe('bind');
	});

	it('state intent=bind alt-form also marks bind', () => {
		expect(deriveIntent('foo.intent=bind.bar')).toBe('bind');
		expect(deriveIntent('foo.bind_current_user.bar')).toBe('bind');
		expect(deriveIntent('foo.bar')).toBe('login');
		expect(deriveIntent('')).toBe('login');
	});
});

describe('classifyOAuthErrorParam', () => {
	it('access_denied → ACCESS_DENIED i18n key', () => {
		expect(classifyOAuthErrorParam('access_denied')).toBe('auth.callback.errors.ACCESS_DENIED');
		expect(classifyOAuthErrorParam('ACCESS_DENIED')).toBe('auth.callback.errors.ACCESS_DENIED');
		expect(classifyOAuthErrorParam('user_cancelled')).toBe('auth.callback.errors.ACCESS_DENIED');
	});

	it('invalid_state / csrf → INVALID_STATE', () => {
		expect(classifyOAuthErrorParam('invalid_state')).toBe('auth.callback.errors.INVALID_STATE');
		expect(classifyOAuthErrorParam('csrf')).toBe('auth.callback.errors.INVALID_STATE');
	});

	it('server_error / temporarily_unavailable → PROVIDER_ERROR', () => {
		expect(classifyOAuthErrorParam('server_error')).toBe('auth.callback.errors.PROVIDER_ERROR');
		expect(classifyOAuthErrorParam('temporarily_unavailable')).toBe(
			'auth.callback.errors.PROVIDER_ERROR'
		);
	});

	it('unknown error string → UNKNOWN', () => {
		expect(classifyOAuthErrorParam('weird_thing')).toBe('auth.callback.errors.UNKNOWN');
	});

	it('null / empty → empty string (no-op caller)', () => {
		expect(classifyOAuthErrorParam(null)).toBe('');
		expect(classifyOAuthErrorParam(undefined)).toBe('');
		expect(classifyOAuthErrorParam('')).toBe('');
	});
});
