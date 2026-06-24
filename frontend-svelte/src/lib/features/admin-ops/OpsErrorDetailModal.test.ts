/**
 * OpsErrorDetailModal · vitest 覆盖
 *
 * 覆盖点：
 *   1. open + errorType='request' → getOpsRequestErrorDetail(id) +
 *      listOpsRequestErrorUpstreamErrors(id, _, {include_detail:true}) 被调用
 *   2. open + errorType='upstream' → getOpsUpstreamErrorDetail(id)，且不拉 correlated
 *   3. summary grid 渲染权威 detail 字段（request_id / status_code）
 *   4. 嵌套 upstream-errors 列表渲染（status + message）
 *   5. 红线 grep：源码 Zinc-only —— 无裸 hex；i18n 用 $_ 带 default fallback
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

import modalSrc from '$lib/features/admin-ops/OpsErrorDetailModal.svelte?raw';
import type { OpsErrorDetail } from '$lib/api/admin/ops';

vi.mock('$lib/api/admin/ops', () => ({
	getOpsRequestErrorDetail: vi.fn(),
	getOpsUpstreamErrorDetail: vi.fn(),
	listOpsRequestErrorUpstreamErrors: vi.fn()
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

function fakeDetail(over: Partial<OpsErrorDetail> = {}): OpsErrorDetail {
	return {
		id: 101,
		created_at: '2026-06-20T00:00:00Z',
		request_id: 'req-abc',
		status_code: 503,
		platform: 'openai',
		message: 'upstream exploded',
		error_body: '{"error":{"type":"x","message":"boom"}}',
		auth_latency_ms: 12,
		upstream_latency_ms: 800,
		...over
	} as OpsErrorDetail;
}

function fakeUpstream(id: number): OpsErrorDetail {
	return {
		id,
		created_at: '2026-06-20T00:00:00Z',
		status_code: 500,
		message: `upstream #${id}`,
		type: 'upstream_error',
		error_body: '{"k":"v"}'
	} as OpsErrorDetail;
}

describe('OpsErrorDetailModal', () => {
	let api: typeof import('$lib/api/admin/ops');
	let mod: typeof import('$lib/features/admin-ops/OpsErrorDetailModal.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/ops');
		(api.getOpsRequestErrorDetail as ReturnType<typeof vi.fn>).mockReset();
		(api.getOpsUpstreamErrorDetail as ReturnType<typeof vi.fn>).mockReset();
		(api.listOpsRequestErrorUpstreamErrors as ReturnType<typeof vi.fn>).mockReset();

		(api.getOpsRequestErrorDetail as ReturnType<typeof vi.fn>).mockImplementation(
			async (id: number) => fakeDetail({ id })
		);
		(api.getOpsUpstreamErrorDetail as ReturnType<typeof vi.fn>).mockImplementation(
			async (id: number) => fakeDetail({ id, phase: 'upstream', error_owner: 'provider' })
		);
		(api.listOpsRequestErrorUpstreamErrors as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [fakeUpstream(201), fakeUpstream(202)],
			total: 2,
			page: 1,
			page_size: 100
		});

		mod = await import('$lib/features/admin-ops/OpsErrorDetailModal.svelte');
	}, 30000);

	it('fetches request-error detail + correlated upstream errors when opened', async () => {
		render(mod.default, {
			props: { open: true, errorId: 101, errorType: 'request', onClose: vi.fn() }
		});
		await waitFor(() => expect(api.getOpsRequestErrorDetail).toHaveBeenCalledWith(101));
		await waitFor(() => {
			expect(api.listOpsRequestErrorUpstreamErrors).toHaveBeenCalled();
			const call = (api.listOpsRequestErrorUpstreamErrors as ReturnType<typeof vi.fn>).mock
				.calls[0];
			expect(call[0]).toBe(101);
			expect(call[2]).toEqual({ include_detail: true });
		});
		expect(api.getOpsUpstreamErrorDetail).not.toHaveBeenCalled();
	});

	it('fetches upstream-error detail and skips correlated list', async () => {
		render(mod.default, {
			props: { open: true, errorId: 55, errorType: 'upstream', onClose: vi.fn() }
		});
		await waitFor(() => expect(api.getOpsUpstreamErrorDetail).toHaveBeenCalledWith(55));
		expect(api.listOpsRequestErrorUpstreamErrors).not.toHaveBeenCalled();
		expect(api.getOpsRequestErrorDetail).not.toHaveBeenCalled();
	});

	it('renders summary grid with authoritative fields', async () => {
		render(mod.default, {
			props: { open: true, errorId: 101, errorType: 'request', onClose: vi.fn() }
		});
		await waitFor(() => {
			const summary = document.querySelector('[data-testid="ops-error-detail-summary"]');
			expect(summary?.textContent).toContain('req-abc');
			expect(summary?.textContent).toContain('503');
		});
	});

	it('renders nested upstream-errors list', async () => {
		render(mod.default, {
			props: { open: true, errorId: 101, errorType: 'request', onClose: vi.fn() }
		});
		await waitFor(() => {
			const list = document.querySelector('[data-testid="ops-error-detail-upstream-list"]');
			expect(list?.textContent).toContain('upstream #201');
			expect(list?.textContent).toContain('upstream #202');
		});
	});

	it('source is Zinc-only (no raw hex) and uses $_ with default fallback', () => {
		const hex = modalSrc.match(/#[0-9a-fA-F]{3,8}\b/g);
		expect(hex).toBeNull();
		expect(modalSrc).toContain("$_('admin.ops.errorDetail.title'");
		expect(modalSrc).toContain('default:');
	});
});
