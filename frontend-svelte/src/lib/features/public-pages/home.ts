import { sanitizeUrl } from './url';
import type { PublicSettings } from '$lib/api/auth';

export const HOME_GITHUB_URL = 'https://github.com/telagod/subme';

export interface HomeBrand {
	siteName: string;
	siteLogo: string;
	siteSubtitle: string;
	docUrl: string;
	homeContent: string;
}

export interface HomeCapability {
	key: 'gateway' | 'accounts' | 'billing' | 'usage' | 'risk' | 'sessions';
	titleKey: string;
	descKey: string;
}

export interface HomeProvider {
	mark: string;
	nameKey?: string;
	name?: string;
	soon: boolean;
}

export function homeBrand(settings: PublicSettings | null | undefined): HomeBrand {
	return {
		siteName: settings?.site_name?.trim() || 'subme',
		siteLogo: sanitizeUrl(settings?.site_logo, { allowRelative: true, allowDataUrl: true }) || '/logo.svg',
		siteSubtitle: settings?.site_subtitle?.trim() || '',
		docUrl: sanitizeUrl(settings?.doc_url),
		homeContent: settings?.home_content?.trim() || ''
	};
}

export function isHomeContentIframeUrl(value: string | null | undefined): boolean {
	return Boolean(sanitizeUrl(value));
}

export function homeCapabilities(): HomeCapability[] {
	return [
		{ key: 'gateway', titleKey: 'home.features.unifiedGateway', descKey: 'home.features.unifiedGatewayDesc' },
		{ key: 'accounts', titleKey: 'home.features.multiAccount', descKey: 'home.features.multiAccountDesc' },
		{ key: 'billing', titleKey: 'home.features.balanceQuota', descKey: 'home.features.balanceQuotaDesc' },
		{ key: 'usage', titleKey: 'home.quench.features.realtimeUsage', descKey: 'home.quench.features.realtimeUsageDesc' },
		{ key: 'risk', titleKey: 'home.quench.features.riskControl', descKey: 'home.quench.features.riskControlDesc' },
		{ key: 'sessions', titleKey: 'home.quench.features.stickySession', descKey: 'home.quench.features.stickySessionDesc' }
	];
}

export function homeProviders(): HomeProvider[] {
	return [
		{ mark: 'C', nameKey: 'home.providers.claude', soon: false },
		{ mark: 'G', name: 'GPT', soon: false },
		{ mark: 'G', nameKey: 'home.providers.gemini', soon: false },
		{ mark: 'A', nameKey: 'home.providers.antigravity', soon: false },
		{ mark: '+', nameKey: 'home.providers.more', soon: true }
	];
}
