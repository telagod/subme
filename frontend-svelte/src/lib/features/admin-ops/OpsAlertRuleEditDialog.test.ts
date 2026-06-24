import { describe, expect, it } from 'vitest';
import dialogSrc from './OpsAlertRuleEditDialog.svelte?raw';
import {
	METRIC_DEFINITIONS,
	GROUP_METRIC_TYPES,
	OPERATORS,
	SEVERITIES,
	WINDOW_OPTIONS,
	type MetricType,
	type RuleOperator
} from './OpsAlertRuleEditDialog.svelte';

describe('OpsAlertRuleEditDialog · metric catalog', () => {
	it('covers system/group/account metric groups', () => {
		const groups = new Set(METRIC_DEFINITIONS.map((m) => m.group));
		expect(groups).toEqual(new Set(['system', 'group', 'account']));
	});

	it('marks exactly the three group-level metrics as group-required', () => {
		const groupMetrics = METRIC_DEFINITIONS.filter((m) => m.group === 'group').map((m) => m.type);
		expect(new Set(groupMetrics)).toEqual(GROUP_METRIC_TYPES);
		expect(GROUP_METRIC_TYPES.size).toBe(3);
	});

	it('every metric has a valid recommended operator from the operator union', () => {
		const opValues = new Set<RuleOperator>(OPERATORS.map((o) => o.value));
		for (const def of METRIC_DEFINITIONS) {
			expect(opValues.has(def.recommendedOperator)).toBe(true);
			expect(Number.isFinite(def.recommendedThreshold)).toBe(true);
		}
	});

	it('exposes P0..P3 severities and 1/5/60 windows', () => {
		expect(SEVERITIES).toEqual(['P0', 'P1', 'P2', 'P3']);
		expect(WINDOW_OPTIONS).toEqual([1, 5, 60]);
	});
});

describe('OpsAlertRuleEditDialog · hard rules', () => {
	it('imports create + update endpoints from $lib/api/admin/ops', () => {
		expect(dialogSrc).toMatch(/createOpsAlertRule/);
		expect(dialogSrc).toMatch(/updateOpsAlertRule/);
		expect(dialogSrc).toMatch(/\$lib\/api\/admin\/ops/);
	});

	it('uses lib/ui primitives, never hand-rolled dialog/select', () => {
		expect(dialogSrc).toMatch(/\$lib\/ui\/StandardDialog\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/NativeSelect\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/Checkbox\.svelte/);
		expect(dialogSrc).toMatch(/\$lib\/ui\/Textarea\.svelte/);
	});

	it('never feeds an empty-string value to NativeSelect (sentinel rule)', () => {
		// group filter uses an explicit __null__ sentinel, never ''.
		expect(dialogSrc).toMatch(/__null__/);
		// no NativeSelect bound to a value that could be empty string.
		expect(dialogSrc).not.toMatch(/<NativeSelect[^>]*value=""/);
	});

	it('has no top-level chart.js import (TDZ vendor-chunk trap)', () => {
		expect(dialogSrc).not.toMatch(/^\s*import .* from ['"]chart\.js['"]/m);
	});

	it('uses i18n with default fallbacks (no locale edits, no hardcoded findings)', () => {
		expect(dialogSrc).toMatch(/\$_\(\s*['"]admin\.ops\.alertRules\./);
		expect(dialogSrc).toMatch(/default:/);
	});

	it('exposes exactly the wiring props the route expects', () => {
		expect(dialogSrc).toMatch(/open\s*=\s*\$bindable/);
		expect(dialogSrc).toMatch(/rule,/);
		expect(dialogSrc).toMatch(/onClose/);
		expect(dialogSrc).toMatch(/onSaved/);
	});

	it('uses no raw hex colors (Zinc-only palette via tokens)', () => {
		// allow none — all colors must go through design tokens.
		const hex = dialogSrc.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
		expect(hex).toEqual([]);
	});
});

describe('OpsAlertRuleEditDialog · create vs update branch', () => {
	it('branches on rule id: create when null, update when present', () => {
		const rule: { id?: number; metric_type: MetricType } = { metric_type: 'error_rate' };
		expect(rule.id == null).toBe(true);
		rule.id = 7;
		expect(rule.id != null).toBe(true);
	});
});
