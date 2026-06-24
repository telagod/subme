import type { EmailOAuthProvider, OAuthTokenResponse } from '$lib/api/auth';

export const EMAIL_OAUTH_PENDING_PROVIDER_KEY = 'email_oauth_pending_provider';
export const OAUTH_AFFILIATE_CODE_KEY = 'oauth_aff_code';
export const AFFILIATE_REFERRAL_CODE_KEY = 'affiliate_referral_code';
const DEFAULT_REDIRECT_PATH = '/dashboard';

export interface StorageReader {
	getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function browserSessionStorage(): StorageWriter | null {
	if (typeof window === 'undefined') return null;
	return window.sessionStorage;
}

function browserLocalStorage(): StorageWriter | null {
	if (typeof window === 'undefined') return null;
	return window.localStorage;
}

export function normalizeOAuthAffiliateCode(value?: unknown): string {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' ? raw.trim() : '';
}

export function loadOAuthAffiliateCode(storage: StorageReader | null = browserSessionStorage()): string {
	if (!storage) return '';
	try {
		return normalizeOAuthAffiliateCode(storage.getItem(OAUTH_AFFILIATE_CODE_KEY));
	} catch {
		return '';
	}
}

export function storeOAuthAffiliateCode(
	value?: unknown,
	storage: StorageWriter | null = browserSessionStorage()
): void {
	if (!storage) return;
	const code = normalizeOAuthAffiliateCode(value);
	try {
		if (code) storage.setItem(OAUTH_AFFILIATE_CODE_KEY, code);
		else storage.removeItem(OAUTH_AFFILIATE_CODE_KEY);
	} catch {
		// ignore unavailable storage
	}
}

export function oauthAffiliatePayload(value?: unknown): { aff_code?: string } {
	const code = normalizeOAuthAffiliateCode(value);
	return code ? { aff_code: code } : {};
}

export function clearAllAffiliateReferralCodes(
	session: StorageWriter | null = browserSessionStorage(),
	local: StorageWriter | null = browserLocalStorage()
): void {
	try {
		session?.removeItem(OAUTH_AFFILIATE_CODE_KEY);
	} catch {
		// ignore unavailable storage
	}
	try {
		local?.removeItem(AFFILIATE_REFERRAL_CODE_KEY);
	} catch {
		// ignore unavailable storage
	}
}

export function parseFragmentParams(hash: string): URLSearchParams {
	const clean = hash.startsWith('#') ? hash.slice(1) : hash;
	return new URLSearchParams(clean);
}

export function readTokenResponse(params: URLSearchParams): OAuthTokenResponse | null {
	const accessToken = params.get('access_token')?.trim() || '';
	if (!accessToken) return null;

	const response: OAuthTokenResponse = { access_token: accessToken };
	const refreshToken = params.get('refresh_token')?.trim() || '';
	if (refreshToken) response.refresh_token = refreshToken;

	const expiresIn = Number.parseInt(params.get('expires_in')?.trim() || '', 10);
	if (Number.isFinite(expiresIn) && expiresIn > 0) response.expires_in = expiresIn;

	const tokenType = params.get('token_type')?.trim() || '';
	if (tokenType) response.token_type = tokenType;

	return response;
}

export function hasOAuthTokenResponse(value: Partial<OAuthTokenResponse>): value is OAuthTokenResponse {
	return typeof value.access_token === 'string' && value.access_token.trim() !== '';
}

export function sanitizeRedirectPath(path: string | null | undefined): string {
	if (!path) return DEFAULT_REDIRECT_PATH;
	if (!path.startsWith('/')) return DEFAULT_REDIRECT_PATH;
	if (path.startsWith('//')) return DEFAULT_REDIRECT_PATH;
	if (path.includes('://')) return DEFAULT_REDIRECT_PATH;
	if (path.includes('\n') || path.includes('\r')) return DEFAULT_REDIRECT_PATH;
	return path;
}

export function readPendingEmailOAuthProvider(
	storage: StorageReader | null = browserSessionStorage()
): EmailOAuthProvider | null {
	if (!storage) return null;
	try {
		const provider = storage.getItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY);
		return provider === 'github' || provider === 'google' ? provider : null;
	} catch {
		return null;
	}
}

export function clearPendingEmailOAuthProvider(
	storage: StorageWriter | null = browserSessionStorage()
): void {
	try {
		storage?.removeItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY);
	} catch {
		// ignore unavailable storage
	}
}

export function storePendingEmailOAuthProvider(
	provider: EmailOAuthProvider,
	storage: StorageWriter | null = browserSessionStorage()
): void {
	try {
		storage?.setItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY, provider);
	} catch {
		// ignore unavailable storage
	}
}

export function buildEmailOAuthStartUrl(
	provider: EmailOAuthProvider,
	options: { redirect?: string | null; affCode?: string | null; apiBase?: string } = {}
): string {
	const normalizedBase = (options.apiBase || '/api/v1').replace(/\/$/, '');
	const params = new URLSearchParams({
		redirect: sanitizeRedirectPath(options.redirect || '/dashboard')
	});
	const affCode = normalizeOAuthAffiliateCode(options.affCode);
	if (affCode) params.set('aff_code', affCode);
	return `${normalizedBase}/auth/oauth/${provider}/start?${params.toString()}`;
}

export function buildProviderCallbackUrl(
	provider: EmailOAuthProvider,
	currentUrl: URL,
	apiBase = '/api/v1'
): string {
	const normalizedBase = (apiBase || '/api/v1').replace(/\/$/, '');
	const params = new URLSearchParams(currentUrl.searchParams);
	const suffix = params.toString() ? `?${params.toString()}` : '';
	return `${normalizedBase}/auth/oauth/${provider}/callback${suffix}`;
}
