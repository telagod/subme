import { describe, expect, it } from 'vitest';
import cardSrc from './OpsAlertRulesCard.svelte?raw';

/**
 * Source-level contract tests for OpsAlertRulesCard.
 *
 * The card mounts svelte-i18n + bits-ui dialogs and self-fetches on mount, so a
 * full render harness is brittle here; we assert the load-bearing wiring against
 * the raw component source instead (same approach as the sibling
 * OpsAlertRuleEditDialog.test.ts).
 */
describe('OpsAlertRulesCard · hard rules', () => {
	it('uses listOpsAlertRules + deleteOpsAlertRule from $lib/api/admin/ops', () => {
		expect(cardSrc).toMatch(/listOpsAlertRules/);
		expect(cardSrc).toMatch(/deleteOpsAlertRule/);
		expect(cardSrc).toMatch(/\$lib\/api\/admin\/ops/);
	});

	it('delegates create/edit to the shared OpsAlertRuleEditDialog (no duplicated editor)', () => {
		expect(cardSrc).toMatch(/from '\.\/OpsAlertRuleEditDialog\.svelte'/);
		expect(cardSrc).toMatch(/<OpsAlertRuleEditDialog/);
		// must NOT call createOpsAlertRule itself — that's the dialog's job.
		expect(cardSrc).not.toMatch(/createOpsAlertRule/);
	});

	it('supports inline enable/disable toggle via updateOpsAlertRule', () => {
		expect(cardSrc).toMatch(/updateOpsAlertRule/);
		expect(cardSrc).toMatch(/toggleEnabled/);
		expect(cardSrc).toMatch(/ops-alert-rule-toggle/);
		expect(cardSrc).toMatch(/togglingIds/);
	});

	it('owns a delete-confirm StandardDialog gated behind an explicit confirm action', () => {
		expect(cardSrc).toMatch(/StandardDialog/);
		expect(cardSrc).toMatch(/confirmDelete/);
		expect(cardSrc).toMatch(/ops-alert-rule-delete-confirm/);
	});

	it('never top-level imports chart.js (TDZ vendor-chunk trap)', () => {
		expect(cardSrc).not.toMatch(/^\s*import\s+.*['"]chart\.js['"]/m);
	});

	it('only uses lib/ui primitives, no raw shadcn/ table-primitive hand-rolls beyond a plain table', () => {
		// reuse path: imports come from $lib/ui/*
		expect(cardSrc).toMatch(/\$lib\/ui\/Button\.svelte/);
		expect(cardSrc).toMatch(/\$lib\/ui\/StandardDialog\.svelte/);
		// no raw hex colors (Zinc-only / semantic tokens)
		expect(cardSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});

	it('renders loading / empty / error states', () => {
		expect(cardSrc).toMatch(/ops-alert-rule-empty/);
		expect(cardSrc).toMatch(/ops-alert-rule-error/);
		expect(cardSrc).toMatch(/alertRules\.loading/);
	});

	it('surfaces every i18n key with an English {default} fallback (no hardcoded English findings)', () => {
		const calls = cardSrc.match(/\$_\(\s*'[^']+'/g) ?? [];
		expect(calls.length).toBeGreaterThan(0);
		// every $_( ... ) invocation in the source must carry a `default:` fallback.
		const withoutDefault = cardSrc.match(/\$_\(\s*'[^']+'\s*\)/g) ?? [];
		expect(withoutDefault).toEqual([]);
	});
});
