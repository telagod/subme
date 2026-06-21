import { describe, expect, it, vi } from 'vitest';
import {
	AFFILIATE_REFERRAL_CODE_KEY,
	EMAIL_OAUTH_PENDING_PROVIDER_KEY,
	OAUTH_AFFILIATE_CODE_KEY,
	buildEmailOAuthStartUrl,
	buildProviderCallbackUrl,
	clearAllAffiliateReferralCodes,
	clearPendingEmailOAuthProvider,
	hasOAuthTokenResponse,
	loadOAuthAffiliateCode,
	normalizeOAuthAffiliateCode,
	oauthAffiliatePayload,
	parseFragmentParams,
	readPendingEmailOAuthProvider,
	readTokenResponse,
	sanitizeRedirectPath,
	storeOAuthAffiliateCode,
	storePendingEmailOAuthProvider,
	type StorageWriter
} from './email-oauth';

function memoryStorage(initial: Record<string, string> = {}): StorageWriter {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => data.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			data.delete(key);
		})
	};
}

describe('email-oauth helpers · fragment tokens', () => {
	it('reads access token fragments and optional token metadata', () => {
		const params = parseFragmentParams(
			'#access_token=ACCESS&refresh_token=REFRESH&expires_in=3600&token_type=Bearer'
		);
		expect(readTokenResponse(params)).toEqual({
			access_token: 'ACCESS',
			refresh_token: 'REFRESH',
			expires_in: 3600,
			token_type: 'Bearer'
		});
	});

	it('ignores fragments without access_token', () => {
		expect(readTokenResponse(parseFragmentParams('#error=access_denied'))).toBeNull();
		expect(hasOAuthTokenResponse({ access_token: 'tok' })).toBe(true);
		expect(hasOAuthTokenResponse({ access_token: ' ' })).toBe(false);
	});
});

describe('email-oauth helpers · redirect safety', () => {
	it('keeps only local absolute redirect paths', () => {
		expect(sanitizeRedirectPath('/dashboard')).toBe('/dashboard');
		expect(sanitizeRedirectPath('/profile?tab=connections')).toBe('/profile?tab=connections');
		expect(sanitizeRedirectPath('https://evil.test')).toBe('/dashboard');
		expect(sanitizeRedirectPath('//evil.test/path')).toBe('/dashboard');
		expect(sanitizeRedirectPath('/safe\nLocation: https://evil.test')).toBe('/dashboard');
		expect(sanitizeRedirectPath('dashboard')).toBe('/dashboard');
		expect(sanitizeRedirectPath(null)).toBe('/dashboard');
	});

	it('builds backend provider callback URL from current query params', () => {
		const url = new URL('https://app.test/auth/oauth/callback?code=c&state=s&scope=a+b');
		expect(buildProviderCallbackUrl('github', url, '/api/v1/')).toBe(
			'/api/v1/auth/oauth/github/callback?code=c&state=s&scope=a+b'
		);
	});
});

describe('email-oauth helpers · provider and affiliate storage', () => {
	it('accepts only github/google as pending email OAuth providers', () => {
		expect(
			readPendingEmailOAuthProvider(memoryStorage({ [EMAIL_OAUTH_PENDING_PROVIDER_KEY]: 'github' }))
		).toBe('github');
		expect(
			readPendingEmailOAuthProvider(memoryStorage({ [EMAIL_OAUTH_PENDING_PROVIDER_KEY]: 'google' }))
		).toBe('google');
		expect(
			readPendingEmailOAuthProvider(memoryStorage({ [EMAIL_OAUTH_PENDING_PROVIDER_KEY]: 'oidc' }))
		).toBeNull();
	});

	it('loads affiliate payload and clears temporary referral keys', () => {
		const session = memoryStorage({ [OAUTH_AFFILIATE_CODE_KEY]: ' AFF123 ' });
		const local = memoryStorage({ [AFFILIATE_REFERRAL_CODE_KEY]: 'stored' });
		expect(normalizeOAuthAffiliateCode([' A '])).toBe('A');
		expect(loadOAuthAffiliateCode(session)).toBe('AFF123');
		expect(oauthAffiliatePayload('AFF123')).toEqual({ aff_code: 'AFF123' });
		expect(oauthAffiliatePayload('  ')).toEqual({});

		clearAllAffiliateReferralCodes(session, local);
		expect(session.removeItem).toHaveBeenCalledWith(OAUTH_AFFILIATE_CODE_KEY);
		expect(local.removeItem).toHaveBeenCalledWith(AFFILIATE_REFERRAL_CODE_KEY);
	});

	it('stores and clears pending provider + affiliate keys', () => {
		const storage = memoryStorage({ [EMAIL_OAUTH_PENDING_PROVIDER_KEY]: 'github' });
		storePendingEmailOAuthProvider('google', storage);
		expect(storage.setItem).toHaveBeenCalledWith(EMAIL_OAUTH_PENDING_PROVIDER_KEY, 'google');
		storeOAuthAffiliateCode(' AFF789 ', storage);
		expect(storage.setItem).toHaveBeenCalledWith(OAUTH_AFFILIATE_CODE_KEY, 'AFF789');
		clearPendingEmailOAuthProvider(storage);
		expect(storage.removeItem).toHaveBeenCalledWith(EMAIL_OAUTH_PENDING_PROVIDER_KEY);
	});

	it('builds provider start URLs with safe redirect and optional affiliate code', () => {
		expect(
			buildEmailOAuthStartUrl('github', {
				redirect: '/profile',
				affCode: 'AFF',
				apiBase: '/api/v1/'
			})
		).toBe('/api/v1/auth/oauth/github/start?redirect=%2Fprofile&aff_code=AFF');
		expect(
			buildEmailOAuthStartUrl('google', {
				redirect: 'https://evil.test',
				apiBase: '/api/v1'
			})
		).toBe('/api/v1/auth/oauth/google/start?redirect=%2Fdashboard');
	});
});
