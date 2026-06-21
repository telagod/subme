import { describe, expect, it, vi } from 'vitest';
import {
	buildEmbeddedUrl,
	isHttpUrl,
	sanitizeUrl
} from './url';
import {
	buildKeyUsageQueryParams,
	buildRingItems,
	fetchKeyUsage,
	summarizeUsageStats
} from './key-usage';
import {
	buildPageImageUrl,
	isRelativeMarkdownAsset,
	rewriteMarkdownImageSources
} from './markdown';
import { documentIconForTitle, findLegalDocument } from './legal';
import { homeBrand, homeCapabilities, homeProviders, isHomeContentIframeUrl } from './home';

describe('public page helpers', () => {
	it('sanitizes legal/logo URLs with the same protocol rules as Vue', () => {
		expect(sanitizeUrl('/logo.png', { allowRelative: true })).toBe('/logo.png');
		expect(sanitizeUrl('//evil.example/logo.png', { allowRelative: true })).toBe('');
		expect(sanitizeUrl('javascript:alert(1)')).toBe('');
		expect(sanitizeUrl('data:image/png;base64,xxx', { allowDataUrl: true })).toBe(
			'data:image/png;base64,xxx'
		);
		expect(isHttpUrl('https://example.com/page')).toBe(true);
	});

	it('builds embedded URLs with auth and source context', () => {
		const url = buildEmbeddedUrl('https://example.com/app?x=1', 7, 'TOK', 'dark', 'en');
		const parsed = new URL(url);
		expect(parsed.searchParams.get('x')).toBe('1');
		expect(parsed.searchParams.get('user_id')).toBe('7');
		expect(parsed.searchParams.get('token')).toBe('TOK');
		expect(parsed.searchParams.get('theme')).toBe('dark');
		expect(parsed.searchParams.get('lang')).toBe('en');
		expect(parsed.searchParams.get('ui_mode')).toBe('embedded');
	});

	it('rewrites only safe relative markdown images', () => {
		expect(isRelativeMarkdownAsset('images/a b.png?x=1')).toBe(true);
		expect(isRelativeMarkdownAsset('../secret.png')).toBe(false);
		expect(isRelativeMarkdownAsset('https://example.com/a.png')).toBe(false);
		expect(buildPageImageUrl('docs', 'images/a b.png?x=1')).toBe(
			'/api/v1/pages/docs/images/images/a%20b.png?x=1'
		);
		expect(rewriteMarkdownImageSources('docs', '![alt](a.png) ![x](../x.png)')).toContain(
			'![alt](/api/v1/pages/docs/images/a.png)'
		);
		expect(rewriteMarkdownImageSources('docs', '![x](../x.png)')).toBe('![x](../x.png)');
	});

	it('finds legal docs and assigns title icons', () => {
		const settings = {
			login_agreement_documents: [{ id: 'privacy', title: '隐私政策', content_md: '# Privacy' }]
		};
		expect(findLegalDocument(settings, 'privacy')?.title).toBe('隐私政策');
		expect(documentIconForTitle('隐私政策')).toBe('shield');
		expect(documentIconForTitle('支持的国家和地区')).toBe('globe');
		expect(documentIconForTitle('服务特定条款')).toBe('cog');
		expect(documentIconForTitle('Terms')).toBe('document');
	});

	it('normalizes home brand settings and custom content modes', () => {
		const brand = homeBrand({
			site_name: ' Test Site ',
			site_logo: '/logo.png',
			site_subtitle: ' One key ',
			doc_url: 'https://docs.example.com/start',
			home_content: ' https://example.com/embed '
		});
		expect(brand).toMatchObject({
			siteName: 'Test Site',
			siteLogo: '/logo.png',
			siteSubtitle: 'One key',
			docUrl: 'https://docs.example.com/start',
			homeContent: 'https://example.com/embed'
		});
		expect(isHomeContentIframeUrl(brand.homeContent)).toBe(true);
		expect(isHomeContentIframeUrl('<h1>Welcome</h1>')).toBe(false);
		expect(homeCapabilities()).toHaveLength(6);
		expect(homeProviders().filter((p) => !p.soon)).toHaveLength(4);
	});

	it('builds /v1/usage query params with date range, days, and timezone', () => {
		const query = buildKeyUsageQueryParams({
			range: '7d',
			dailyUsageDays: 30,
			now: new Date('2026-06-19T12:00:00.000Z'),
			timezone: 'Asia/Shanghai'
		});
		const params = new URLSearchParams(query);
		expect(params.get('start_date')).toBe('2026-06-12');
		expect(params.get('end_date')).toBe('2026-06-19');
		expect(params.get('days')).toBe('30');
		expect(params.get('timezone')).toBe('Asia/Shanghai');
	});

	it('fetches key usage with the queried API key as bearer token', async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ mode: 'quota_limited', usage: { today: { requests: 1 } } })
		});
		const result = await fetchKeyUsage('sk-test', 'days=7', fetcher as unknown as typeof fetch);
		expect(result.mode).toBe('quota_limited');
		expect(fetcher).toHaveBeenCalledWith('/v1/usage?days=7', {
			headers: { Authorization: 'Bearer sk-test' }
		});
	});

	it('summarizes usage stats and ring quota rows', () => {
		const data = {
			mode: 'quota_limited',
			quota: { used: 1, limit: 10, remaining: 9 },
			usage: {
				today: { requests: 2, actual_cost: 0.01 },
				total: { total_tokens: 340, actual_cost: 0.12 },
				rpm: 3,
				tpm: 4
			}
		};
		expect(buildRingItems(data)[0]).toMatchObject({
			title: 'Total Quota',
			pct: 10,
			amount: '$1.00 / $10.00'
		});
		expect(summarizeUsageStats(data).map((cell) => cell.value)).toContain('3 / 4');
		expect(summarizeUsageStats(data).map((cell) => cell.value)).toContain('$0.12');
	});
});
