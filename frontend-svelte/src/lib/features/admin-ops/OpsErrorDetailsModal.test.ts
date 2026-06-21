import { describe, expect, it } from 'vitest';
import modalSrc from './OpsErrorDetailsModal.svelte?raw';
import { titleFor, descriptionFor, type OpsErrorType } from './OpsErrorDetailsModal.svelte';

describe('OpsErrorDetailsModal · title/description by errorType', () => {
	it('maps request vs upstream to distinct title keys', () => {
		expect(titleFor('request').key).toBe('admin.ops.errorDetails.requestTitle');
		expect(titleFor('upstream').key).toBe('admin.ops.errorDetails.upstreamTitle');
		expect(titleFor('request').key).not.toBe(titleFor('upstream').key);
	});

	it('every errorType yields a non-empty English fallback for title and description', () => {
		for (const t of ['request', 'upstream'] as OpsErrorType[]) {
			expect(titleFor(t).fallback.length).toBeGreaterThan(0);
			expect(descriptionFor(t).fallback.length).toBeGreaterThan(0);
		}
	});
});

describe('OpsErrorDetailsModal · hard rules', () => {
	it('wraps lib/ui StandardDialog (no hand-rolled dialog)', () => {
		expect(modalSrc).toMatch(/\$lib\/ui\/StandardDialog\.svelte/);
	});

	it('hosts OpsErrorLogTable and forwards the filter context props', () => {
		expect(modalSrc).toMatch(/import OpsErrorLogTable from '\.\/OpsErrorLogTable\.svelte'/);
		expect(modalSrc).toMatch(/<OpsErrorLogTable/);
		expect(modalSrc).toMatch(/\{errorType\}/);
		expect(modalSrc).toMatch(/\{timeRange\}/);
		expect(modalSrc).toMatch(/\{platform\}/);
		expect(modalSrc).toMatch(/\{groupId\}/);
		expect(modalSrc).toMatch(/\{onOpenErrorDetail\}/);
	});

	it('is a wide dialog (width="lg" + widened max-w override)', () => {
		expect(modalSrc).toMatch(/width="lg"/);
		expect(modalSrc).toMatch(/max-w-5xl/);
	});

	it('exposes exactly the wiring props the route expects', () => {
		expect(modalSrc).toMatch(/open\s*=\s*\$bindable/);
		expect(modalSrc).toMatch(/errorType/);
		expect(modalSrc).toMatch(/timeRange/);
		expect(modalSrc).toMatch(/platform/);
		expect(modalSrc).toMatch(/groupId/);
		expect(modalSrc).toMatch(/onClose/);
		expect(modalSrc).toMatch(/onOpenErrorDetail/);
	});

	it('calls onClose when the dialog closes (one-modal-at-a-time handoff)', () => {
		expect(modalSrc).toMatch(/onOpenChange=\{handleOpenChange\}/);
		expect(modalSrc).toMatch(/onClose\(\)/);
	});

	it('imports no ops API endpoints directly (data lives in OpsErrorLogTable)', () => {
		expect(modalSrc).not.toMatch(/from '\$lib\/api\/admin\/ops'/);
	});

	it('has no top-level chart.js import (TDZ vendor-chunk trap)', () => {
		expect(modalSrc).not.toMatch(/^\s*import .* from ['"]chart\.js['"]/m);
	});

	it('uses i18n with default fallbacks (no locale edits, no hardcoded findings)', () => {
		expect(modalSrc).toMatch(/\$_\(/);
		expect(modalSrc).toMatch(/default:/);
	});

	it('uses no raw hex colors (Zinc-only palette via tokens)', () => {
		const hex = modalSrc.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
		expect(hex).toEqual([]);
	});
});
