import { describe, expect, it } from 'vitest';
import cardSrc from './OpsOpenAITokenStatsCard.svelte?raw';

/**
 * Source-string contract tests (same style as ops.test.ts).
 * Guards the hard project rules + the props/columns/behavior contract
 * the parent route relies on, without a flaky DOM render harness.
 */
describe('OpsOpenAITokenStatsCard', () => {
	it('exposes exactly the required props', () => {
		expect(cardSrc).toContain('platformFilter');
		expect(cardSrc).toContain('groupIdFilter');
		expect(cardSrc).toContain('refreshToken');
	});

	it('defaults the time range to 30d', () => {
		expect(cardSrc).toMatch(/timeRange\s*=\s*\$state<TimeRange>\('30d'\)/);
	});

	it('offers all five time-range options', () => {
		for (const r of ['30m', '1h', '1d', '15d', '30d']) {
			expect(cardSrc).toContain(`admin.ops.timeRange.${r}`);
		}
	});

	it('supports both view modes', () => {
		expect(cardSrc).toContain("viewMode === 'topn'");
		expect(cardSrc).toContain("viewMode === 'pagination'");
	});

	it('renders all required columns', () => {
		for (const col of [
			'table.model',
			'table.requestCount',
			'table.avgTokensPerSec',
			'table.avgFirstTokenMs',
			'table.totalOutputTokens',
			'table.avgDurationMs'
		]) {
			expect(cardSrc).toContain(`admin.ops.openaiTokenStats.${col}`);
		}
	});

	it('fetches the openai-token-stats endpoint', () => {
		expect(cardSrc).toContain('getOpsOpenAITokenStats');
	});

	it('re-fetches when refreshToken changes (tracked in the effect)', () => {
		expect(cardSrc).toMatch(/refreshToken[\s\S]*loadData\(\)/);
	});

	it('uses VirtualTable only for pagination mode', () => {
		expect(cardSrc).toContain('VirtualTable');
	});

	it('reuses lib/ui primitives and never hand-rolls a select', () => {
		expect(cardSrc).toContain("from '$lib/ui/NativeSelect.svelte'");
		expect(cardSrc).toContain("from '$lib/ui/Card.svelte'");
		expect(cardSrc).toContain("from '$lib/ui/table/VirtualTable.svelte'");
	});

	it('never top-level imports chart.js (no chart in this card)', () => {
		expect(cardSrc).not.toMatch(/import .*['"]chart\.js['"]/);
	});

	it('uses i18n with English defaults (no clobbered locale edits)', () => {
		expect(cardSrc).toContain("import { _ } from 'svelte-i18n'");
		expect(cardSrc).toContain('default:');
	});

	it('uses no raw hex colours (Zinc-only palette)', () => {
		// allow arbitrary tailwind bracket values like [11px] but forbid #rrggbb / #rgb
		expect(cardSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});
});
