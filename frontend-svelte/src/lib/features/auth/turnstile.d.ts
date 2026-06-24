/**
 * Global type augmentation for Cloudflare Turnstile.
 */

interface TurnstileRenderOptions {
	sitekey: string;
	callback: (token: string) => void;
	'expired-callback'?: () => void;
	'error-callback'?: () => void;
	theme?: 'light' | 'dark' | 'auto';
	size?: 'normal' | 'compact' | 'flexible';
}

interface TurnstileAPI {
	render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
	reset: (widgetId?: string) => void;
	remove: (widgetId?: string) => void;
}

declare global {
	interface Window {
		turnstile?: TurnstileAPI;
		onTurnstileLoad?: () => void;
	}
}

export {};
