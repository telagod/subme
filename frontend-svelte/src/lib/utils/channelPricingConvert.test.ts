import { describe, it, expect } from 'vitest';
import { MTOK, mTokToPerToken, perTokenToMTok } from './pricing';
import channelFormSrc from '$lib/features/supply/ChannelFormDialog.svelte?raw';
import pricingUtilSrc from '$lib/utils/pricing.ts?raw';
import supplySrc from '$lib/features/supply/supply.ts?raw';
import availableChannelsSrc from '$lib/features/available-channels/available-channels.ts?raw';

/**
 * Billing red line: channel model-pricing is stored PER-TOKEN by the backend
 * (input_price 3e-6 == $3 / MTok) but the form edits in $/MTok. These helpers
 * are the ONLY conversion boundary; a regression writes prices 1,000,000x wrong.
 */
describe('channel pricing $/MTok <-> per-token conversion', () => {
	it('perTokenToMTok scales up by 1e6', () => {
		expect(perTokenToMTok(3e-6)).toBe(3);
		expect(perTokenToMTok(5e-8)).toBe(0.05);
		expect(perTokenToMTok(0)).toBe(0);
	});

	it('mTokToPerToken scales down by 1e6', () => {
		expect(mTokToPerToken(3)).toBe(3e-6);
		expect(mTokToPerToken(0.05)).toBe(5e-8);
		expect(mTokToPerToken('3')).toBe(3e-6); // form values arrive as strings
		expect(mTokToPerToken(0)).toBe(0);
	});

	it('toPrecision(10) kills float error: 5e-8 * 1e6 rounds to 0.05 not 0.049999...', () => {
		// without toPrecision this would be 0.04999999999999999
		expect(perTokenToMTok(5e-8)).toBe(0.05);
		expect(Number.isInteger(perTokenToMTok(3e-6))).toBe(true);
	});

	it('round-trip is stable for representative prices', () => {
		for (const perToken of [3e-6, 1.5e-5, 5e-8, 6e-7, 1e-3, 0]) {
			expect(mTokToPerToken(perTokenToMTok(perToken))).toBe(perToken);
		}
		for (const mtok of [3, 0.05, 15, 0.6, 1000, 0]) {
			expect(perTokenToMTok(mTokToPerToken(mtok))).toBe(mtok);
		}
	});

	it('null / undefined / empty string pass through as null', () => {
		expect(perTokenToMTok(null)).toBeNull();
		expect(perTokenToMTok(undefined)).toBeNull();
		expect(mTokToPerToken(null)).toBeNull();
		expect(mTokToPerToken(undefined)).toBeNull();
		expect(mTokToPerToken('')).toBeNull();
		expect(mTokToPerToken('   ')).toBeNull();
	});

	it('MTOK constant is one million', () => {
		expect(MTOK).toBe(1_000_000);
	});
});

/**
 * Mirror the load (pricingEntryFromChannel) and save (buildPricingEntry) wiring
 * in routes/admin/channels/+page.svelte. Those functions are not exported from
 * the .svelte module, so we reproduce the exact field-by-field composition and
 * assert the load->save round-trip preserves the backend per-token values, while
 * per_request_price is NEVER converted.
 */
const CONVERTED_FIELDS = ['input_price', 'output_price', 'cache_write_price', 'cache_read_price'] as const;

type SampleChannelPricing = {
	input_price: number | null;
	output_price: number | null;
	cache_write_price: number | null;
	cache_read_price: number | null;
	image_output_price: number | null;
	per_request_price: number | null;
};

const priceText = (value: number | null | undefined): string =>
	value === null || value === undefined ? '' : String(value);

// LOAD: backend per-token -> form $/MTok text
function loadEntry(p: SampleChannelPricing) {
	return {
		inputPrice: priceText(perTokenToMTok(p.input_price)),
		outputPrice: priceText(perTokenToMTok(p.output_price)),
		cacheWritePrice: priceText(perTokenToMTok(p.cache_write_price)),
		cacheReadPrice: priceText(perTokenToMTok(p.cache_read_price)),
		imageOutputPrice: priceText(perTokenToMTok(p.image_output_price)),
		perRequestPrice: priceText(p.per_request_price)
	};
}

const parseOptionalPrice = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;
	return Number(trimmed);
};

// SAVE: form $/MTok text -> backend per-token
function buildEntry(entry: ReturnType<typeof loadEntry>): SampleChannelPricing {
	return {
		input_price: mTokToPerToken(parseOptionalPrice(entry.inputPrice)),
		output_price: mTokToPerToken(parseOptionalPrice(entry.outputPrice)),
		cache_write_price: mTokToPerToken(parseOptionalPrice(entry.cacheWritePrice)),
		cache_read_price: mTokToPerToken(parseOptionalPrice(entry.cacheReadPrice)),
		image_output_price: mTokToPerToken(parseOptionalPrice(entry.imageOutputPrice)),
		per_request_price: parseOptionalPrice(entry.perRequestPrice)
	};
}

describe('load -> save round-trip on a sample channel', () => {
	const sample: SampleChannelPricing = {
		input_price: 3e-6,
		output_price: 1.5e-5,
		cache_write_price: 5e-8,
		cache_read_price: 6e-7,
		image_output_price: 4e-5,
		per_request_price: 0.02 // flat fee, stored raw
	};

	it('form shows $/MTok after load', () => {
		const form = loadEntry(sample);
		expect(form.inputPrice).toBe('3'); // $3 / MTok
		expect(form.cacheWritePrice).toBe('0.05');
		expect(form.perRequestPrice).toBe('0.02'); // unchanged
	});

	it('save writes back the original per-token values (no 1e6 drift)', () => {
		const rebuilt = buildEntry(loadEntry(sample));
		expect(rebuilt).toEqual(sample);
		for (const f of CONVERTED_FIELDS) {
			expect(rebuilt[f]).toBe(sample[f]);
		}
	});

	it('per_request_price is NOT scaled by 1e6', () => {
		const rebuilt = buildEntry(loadEntry(sample));
		expect(rebuilt.per_request_price).toBe(0.02);
		expect(rebuilt.per_request_price).not.toBe(0.02 / MTOK);
	});

	it('null fields survive the round-trip as null', () => {
		const sparse: SampleChannelPricing = {
			input_price: 3e-6,
			output_price: null,
			cache_write_price: null,
			cache_read_price: null,
			image_output_price: null,
			per_request_price: null
		};
		expect(buildEntry(loadEntry(sparse))).toEqual(sparse);
	});
});

/**
 * Source-level red-line tests: assert that conversion functions exist in
 * every file that handles channel pricing. A regression here means prices
 * get written 1,000,000x wrong, corrupting billing data.
 */
describe('source-level conversion guards', () => {
	it('pricing.ts exports mTokToPerToken and perTokenToMTok with 1e6 constant', () => {
		expect(pricingUtilSrc).toContain('export function mTokToPerToken');
		expect(pricingUtilSrc).toContain('export function perTokenToMTok');
		expect(pricingUtilSrc).toContain('1_000_000');
		expect(pricingUtilSrc).toMatch(/n\s*\/\s*MTOK/); // divides by MTOK on save
		expect(pricingUtilSrc).toMatch(/val\s*\*\s*MTOK/); // multiplies by MTOK on load
	});

	it('ChannelFormDialog imports and uses both conversion functions', () => {
		expect(channelFormSrc).toContain("import { mTokToPerToken, perTokenToMTok } from '$lib/utils/pricing'");
		// LOAD path: perTokenToMTok on API data -> form
		expect(channelFormSrc).toContain('perTokenToMTok(p.input_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(p.output_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(p.cache_write_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(p.cache_read_price)');
		expect(channelFormSrc).toMatch(/perTokenToMTok\(p\.image_output_price/);
		// SAVE path: mTokToPerToken on form -> API data
		expect(channelFormSrc).toContain('mTokToPerToken(');
		// per_request_price must NOT go through mTokToPerToken
		expect(channelFormSrc).not.toMatch(/mTokToPerToken\([^)]*perRequestPrice/);
		expect(channelFormSrc).not.toMatch(/mTokToPerToken\([^)]*per_request_price/);
	});

	it('ChannelFormDialog also converts interval prices on both load and save', () => {
		// LOAD: intervals use perTokenToMTok
		expect(channelFormSrc).toContain('perTokenToMTok(iv.input_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(iv.output_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(iv.cache_write_price)');
		expect(channelFormSrc).toContain('perTokenToMTok(iv.cache_read_price)');
		// SAVE: intervals use mTokToPerToken (via buildPricingEntry)
		const idx = channelFormSrc.indexOf('function buildPricingEntry') !== -1
			? channelFormSrc.indexOf('function buildPricingEntry')
			: channelFormSrc.indexOf('function buildEntry');
		const buildEntryBlock = channelFormSrc.slice(idx);
		expect(buildEntryBlock).toContain('mTokToPerToken(');
	});

	it('read-only pricing table imports perTokenToMTok for display', () => {
		// ChannelFormDialog must use perTokenToMTok on the load path
		expect(channelFormSrc).toContain('perTokenToMTok');
		// available-channels must import for display
		expect(availableChannelsSrc).toContain('perTokenToMTok');
	});

	it('user-side available-channels converts per-token prices to $/MTok', () => {
		expect(availableChannelsSrc).toContain("import { perTokenToMTok } from '$lib/utils/pricing'");
		expect(availableChannelsSrc).toContain('perTokenToMTok(');
	});
});
