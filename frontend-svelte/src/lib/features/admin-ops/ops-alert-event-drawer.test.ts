/**
 * OpsAlertEventDetailDrawer · vitest 覆盖
 *
 * 覆盖点：
 *   1. open + event → getOpsAlertEvent(id) 被调用（权威 detail refetch）
 *   2. 详情字段渲染：metric_value / threshold_value pair + status label
 *   3. Silence 表单提交 → createOpsAlertSilence 收到 rule_id/platform/group_id/RFC3339 until
 *   4. Manual-resolve → updateOpsAlertEventStatus(id,'manual_resolved') + onResolved 回调
 *   5. 红线 grep：源码 Zinc-only —— 无裸 hex（#rgb/#rrggbb）；i18n 用 $_ 带 default fallback
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

import drawerSrc from '$lib/features/admin-ops/OpsAlertEventDetailDrawer.svelte?raw';
import type { AlertEvent } from '$lib/api/admin/ops';

vi.mock('$lib/api/admin/ops', () => ({
	getOpsAlertEvent: vi.fn(),
	updateOpsAlertEventStatus: vi.fn(),
	createOpsAlertSilence: vi.fn()
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	dismiss: vi.fn(),
	toasts: { list: [] }
}));

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeEvent(over: Partial<AlertEvent> = {}): AlertEvent {
	return {
		id: 42,
		rule_id: 7,
		severity: 'P1',
		status: 'firing',
		title: 'High error rate',
		description: 'errors above threshold',
		metric_value: 12.5,
		threshold_value: 5,
		dimensions: { platform: 'openai', group_id: 3, region: 'us' },
		fired_at: '2026-06-20T00:00:00Z',
		resolved_at: null,
		email_sent: true,
		created_at: '2026-06-20T00:00:00Z',
		...over
	};
}

describe('OpsAlertEventDetailDrawer', () => {
	let api: typeof import('$lib/api/admin/ops');
	let mod: typeof import('$lib/features/admin-ops/OpsAlertEventDetailDrawer.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/ops');
		(api.getOpsAlertEvent as ReturnType<typeof vi.fn>).mockReset();
		(api.updateOpsAlertEventStatus as ReturnType<typeof vi.fn>).mockReset();
		(api.createOpsAlertSilence as ReturnType<typeof vi.fn>).mockReset();
		(api.getOpsAlertEvent as ReturnType<typeof vi.fn>).mockImplementation(async (id: number) =>
			fakeEvent({ id })
		);
		(api.updateOpsAlertEventStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		(api.createOpsAlertSilence as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		mod = await import('$lib/features/admin-ops/OpsAlertEventDetailDrawer.svelte');
	}, 30000);

	it('refetches authoritative detail when opened', async () => {
		render(mod.default, {
			props: { open: true, event: fakeEvent(), onClose: vi.fn(), onResolved: vi.fn() }
		});
		await waitFor(() => expect(api.getOpsAlertEvent).toHaveBeenCalledWith(42));
	});

	it('renders metric/threshold pair', async () => {
		render(mod.default, {
			props: { open: true, event: fakeEvent(), onClose: vi.fn(), onResolved: vi.fn() }
		});
		await waitFor(() => {
			const metric = document.querySelector('[data-testid="ops-alert-event-metric"]');
			expect(metric?.textContent).toContain('12.50 / 5.00');
		});
	});

	it('silence submit calls createOpsAlertSilence with RFC3339 until', async () => {
		render(mod.default, {
			props: { open: true, event: fakeEvent(), onClose: vi.fn(), onResolved: vi.fn() }
		});
		await waitFor(() => expect(api.getOpsAlertEvent).toHaveBeenCalled());

		const btn = document.querySelector('[data-testid="ops-silence-submit"]') as HTMLButtonElement;
		expect(btn).not.toBeNull();
		await fireEvent.click(btn);

		await waitFor(() => expect(api.createOpsAlertSilence).toHaveBeenCalled());
		const arg = (api.createOpsAlertSilence as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(arg.rule_id).toBe(7);
		expect(arg.platform).toBe('openai');
		expect(arg.group_id).toBe(3);
		// RFC3339 / ISO 8601 with trailing Z
		expect(typeof arg.until).toBe('string');
		expect(arg.until.endsWith('Z')).toBe(true);
		expect(Number.isNaN(new Date(arg.until).getTime())).toBe(false);
	});

	it('manual-resolve calls updateOpsAlertEventStatus + onResolved', async () => {
		const onResolved = vi.fn();
		render(mod.default, {
			props: { open: true, event: fakeEvent(), onClose: vi.fn(), onResolved }
		});
		await waitFor(() => expect(api.getOpsAlertEvent).toHaveBeenCalled());

		const btn = document.querySelector(
			'[data-testid="ops-alert-manual-resolve"]'
		) as HTMLButtonElement;
		expect(btn).not.toBeNull();
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(api.updateOpsAlertEventStatus).toHaveBeenCalledWith(42, 'manual_resolved')
		);
		await waitFor(() => expect(onResolved).toHaveBeenCalled());
	});

	it('source is Zinc-only (no raw hex) and uses $_ with default fallback', () => {
		// 无裸 hex 颜色字面量
		const hex = drawerSrc.match(/#[0-9a-fA-F]{3,8}\b/g);
		expect(hex).toBeNull();
		// i18n 带 default fallback，防 hardcoded-English finding
		expect(drawerSrc).toContain("$_('admin.ops.alertEvents.detail.title'");
		expect(drawerSrc).toContain('default:');
	});
});
