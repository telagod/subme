import { describe, expect, it } from 'vitest';
import dialogSrc from './OpsSettingsDialog.svelte?raw';
import {
	SEVERITY_ALL,
	SEVERITY_OPTIONS,
	REFRESH_INTERVALS,
	OPS_SETTINGS_SECTIONS,
	DEFAULT_METRIC_THRESHOLDS,
	IGNORE_FLAGS,
	isValidEmailAddress,
	fractionToPercent,
	percentToFraction
} from './OpsSettingsDialog.svelte';

describe('OpsSettingsDialog · module exports', () => {
	it('declares the four required sections in order', () => {
		expect(OPS_SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
			'email',
			'runtime',
			'advanced',
			'thresholds'
		]);
	});

	it('uses a non-empty severity sentinel for "all"', () => {
		expect(SEVERITY_ALL).toBe('__all__');
		expect(SEVERITY_ALL.length).toBeGreaterThan(0);
		// every severity option carries a non-empty value (NativeSelect sentinel rule).
		for (const opt of SEVERITY_OPTIONS) {
			expect(opt.value).not.toBe('');
		}
	});

	it('offers exactly the 15/30/60s refresh intervals', () => {
		expect(REFRESH_INTERVALS).toEqual([15, 30, 60]);
	});

	it('lists the five ignore-* advanced flags', () => {
		expect(IGNORE_FLAGS).toEqual([
			'ignore_count_tokens_errors',
			'ignore_context_canceled',
			'ignore_no_available_accounts',
			'ignore_invalid_api_key_errors',
			'ignore_insufficient_balance_errors'
		]);
	});

	it('ships sane default metric thresholds', () => {
		expect(DEFAULT_METRIC_THRESHOLDS.sla_percent_min).toBe(99.5);
		expect(DEFAULT_METRIC_THRESHOLDS.ttft_p99_ms_max).toBe(500);
		expect(DEFAULT_METRIC_THRESHOLDS.request_error_rate_percent_max).toBe(5);
		expect(DEFAULT_METRIC_THRESHOLDS.upstream_error_rate_percent_max).toBe(5);
	});
});

describe('OpsSettingsDialog · helpers', () => {
	it('validates email addresses', () => {
		expect(isValidEmailAddress('a@b.co')).toBe(true);
		expect(isValidEmailAddress('not-an-email')).toBe(false);
		expect(isValidEmailAddress('a@b')).toBe(false);
		expect(isValidEmailAddress('')).toBe(false);
	});

	it('round-trips quota fraction <-> percent (backend 0..1, UI 0..100)', () => {
		expect(fractionToPercent(0.5)).toBe(50);
		expect(fractionToPercent(0)).toBeNull();
		expect(fractionToPercent(null)).toBeNull();
		expect(percentToFraction(50)).toBe(0.5);
		expect(percentToFraction(null)).toBe(0);
		expect(percentToFraction(0)).toBe(0);
	});
});

describe('OpsSettingsDialog · hard rules', () => {
	it('loads all four sections from $lib/api/admin/ops on open', () => {
		expect(dialogSrc).toMatch(/getOpsAlertRuntimeSettings/);
		expect(dialogSrc).toMatch(/getOpsEmailNotificationConfig/);
		expect(dialogSrc).toMatch(/getOpsAdvancedSettings/);
		expect(dialogSrc).toMatch(/getOpsMetricThresholds/);
		expect(dialogSrc).toMatch(/Promise\.all/);
		expect(dialogSrc).toMatch(/\$lib\/api\/admin\/ops/);
	});

	it('saves every section via the matching update endpoints', () => {
		expect(dialogSrc).toMatch(/updateOpsAlertRuntimeSettings/);
		expect(dialogSrc).toMatch(/updateOpsEmailNotificationConfig/);
		expect(dialogSrc).toMatch(/updateOpsAdvancedSettings/);
		expect(dialogSrc).toMatch(/updateOpsMetricThresholds/);
	});

	it('exposes exactly the wiring props the route expects', () => {
		expect(dialogSrc).toMatch(/open\s*=\s*\$bindable/);
		expect(dialogSrc).toMatch(/onClose/);
		expect(dialogSrc).toMatch(/onSaved/);
	});

	it('uses lib/ui primitives, never hand-rolled dialog/select', () => {
		expect(dialogSrc).toMatch(/\$lib\/ui\/StandardDialog\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/NativeSelect\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/Checkbox\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/Input\.svelte/);
	});

	it('never feeds an empty-string value to NativeSelect (sentinel rule)', () => {
		expect(dialogSrc).toMatch(/__all__/);
		expect(dialogSrc).not.toMatch(/<NativeSelect[^>]*value=""/);
	});

	it('has no top-level chart.js import (TDZ vendor-chunk trap)', () => {
		expect(dialogSrc).not.toMatch(/^\s*import .* from ['"]chart\.js['"]/m);
	});

	it('uses i18n with default fallbacks (no locale edits, no hardcoded findings)', () => {
		expect(dialogSrc).toMatch(/\$_\(\s*['"]admin\.ops\.settings\./);
		expect(dialogSrc).toMatch(/default:/);
	});

	it('uses no raw hex colours (Zinc-only palette)', () => {
		// strip data-testid / placeholders, then look for #rrggbb literals.
		expect(dialogSrc).not.toMatch(/#[0-9a-fA-F]{6}\b/);
		expect(dialogSrc).not.toMatch(/#[0-9a-fA-F]{3}\b/);
	});
});
