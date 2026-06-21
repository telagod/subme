export interface SanitizeUrlOptions {
	allowRelative?: boolean;
	allowDataUrl?: boolean;
}

export function sanitizeUrl(value: string | null | undefined, options: SanitizeUrlOptions = {}): string {
	const trimmed = (value ?? '').trim();
	if (!trimmed) return '';

	if (options.allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
		return trimmed;
	}

	if (options.allowDataUrl && trimmed.startsWith('data:image/')) {
		return trimmed;
	}

	if (!/^https?:\/\//i.test(trimmed)) {
		return '';
	}

	try {
		const parsed = new URL(trimmed);
		const protocol = parsed.protocol.toLowerCase();
		if (protocol !== 'http:' && protocol !== 'https:') return '';
		return parsed.toString();
	} catch {
		return '';
	}
}

export function isHttpUrl(value: string | null | undefined): boolean {
	const trimmed = (value ?? '').trim();
	return /^https?:\/\//i.test(trimmed);
}

export function detectTheme(): 'light' | 'dark' {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function buildEmbeddedUrl(
	baseUrl: string,
	userId?: number,
	authToken?: string | null,
	theme: 'light' | 'dark' = 'light',
	lang?: string | null
): string {
	if (!baseUrl) return baseUrl;
	try {
		const url = new URL(baseUrl);
		if (userId) url.searchParams.set('user_id', String(userId));
		if (authToken) url.searchParams.set('token', authToken);
		url.searchParams.set('theme', theme);
		if (lang) url.searchParams.set('lang', lang);
		url.searchParams.set('ui_mode', 'embedded');
		if (typeof window !== 'undefined') {
			url.searchParams.set('src_host', window.location.origin);
			url.searchParams.set('src_url', window.location.href);
		}
		return url.toString();
	} catch {
		return baseUrl;
	}
}
