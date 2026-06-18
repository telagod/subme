/**
 * /(user)/keys · vitest 覆盖（M6）
 *
 * 覆盖点：
 *   1. 列表渲染：mock listKeys 返回 3 行 → 行数 = 3
 *   2. 空态：listKeys 返回 [] → 渲染 CTA 「Create your first key」
 *   3. Create flow：打开 dialog → 填表 → 提交 → POST /keys 调用 + reveal 面板出现
 *   4. Revoke flow：点行的 revoke → 确认 → DELETE 调用 + list 重新拉
 *   5. Sentinel guard：状态筛选 Select 不含 value=""
 *
 * Mock 策略：vi.mock '$lib/api/user/apiKeys' 一律替换为 vi.fn()，
 *   beforeEach 重置 + 重新装载页面模块。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { ApiKey } from '$lib/api/user/apiKeys';

// vi.mock hoists —— 必须在 import +page.svelte 之前
vi.mock('$lib/api/user/apiKeys', () => {
	return {
		listKeys: vi.fn(),
		getKey: vi.fn(),
		createKey: vi.fn(),
		revokeKey: vi.fn(),
		userApiKeysApi: {
			listKeys: vi.fn(),
			getKey: vi.fn(),
			createKey: vi.fn(),
			revokeKey: vi.fn()
		}
	};
});

// toast store 静音，避免 setTimeout 残留干扰
vi.mock('$lib/stores/toast.svelte', async () => {
	return {
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		dismiss: vi.fn(),
		toasts: { list: [] }
	};
});

afterEach(() => {
	// 卸载所有 testing-library 挂载组件 + 清理 bits-ui Portal 注入到 document.body 的节点。
	cleanup();
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});

beforeAll(async () => {
	addMessages('en', {
		user: {
			keys: {
				pageTitle: 'API Keys',
				pageSubtitle: 'sub',
				newKey: 'New API Key',
				refresh: 'Refresh',
				retry: 'Retry',
				loading: 'Loading…',
				cancel: 'Cancel',
				done: 'Done',
				apiKey: 'API Key',
				unlimited: 'Unlimited',
				statusFilter: 'Status',
				allStatus: 'All status',
				colName: 'Name',
				colKey: 'Key',
				colQuota: 'Quota',
				colStatus: 'Status',
				colCreated: 'Created',
				colLastUsed: 'Last used',
				colActions: 'Actions',
				status: {
					active: 'Active',
					inactive: 'Inactive',
					quota_exhausted: 'Quota exhausted',
					expired: 'Expired'
				},
				emptyTitle: 'No API keys yet',
				emptyDescription: 'Create your first key',
				createFirstKey: 'Create your first key',
				createTitle: 'Create API key',
				createDescription: 'Generate a new key for API access.',
				revealTitle: 'Save your new API key',
				revealDescription: 'Copy this key now.',
				revealWarning: 'one-time',
				mustSaveKeyWarning: 'must save',
				savedAcknowledge: 'saved',
				copyToClipboard: 'Copy',
				copiedToast: 'Copied',
				copyFailed: 'fail',
				create: 'Create',
				creating: 'Creating...',
				nameLabel: 'Name',
				namePlaceholder: 'name',
				quotaLabel: 'Quota',
				quotaPlaceholder: 'q',
				expiresLabel: 'Expires',
				expiresPlaceholder: 'e',
				createSuccess: 'ok',
				failedToLoad: 'load fail',
				revoke: 'Revoke',
				revoking: 'Revoking...',
				revokeAria: 'Revoke key',
				revokeTitle: 'Revoke?',
				revokeDescription: 'Will revoke {prefix} {suffix}',
				revokeSuccess: 'revoked',
				revokeError: 'revoke fail',
				errors: {
					NAME_REQUIRED: 'Name is required',
					NAME_TOO_LONG: 'long',
					QUOTA_NEGATIVE: 'neg',
					EXPIRES_INT: 'int',
					EXPIRES_MIN: 'min',
					EXPIRES_MAX: 'max',
					UNKNOWN: 'unk'
				}
			}
		},
		nav: { apiKeys: 'API Keys' }
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeKey(over: Partial<ApiKey> = {}): ApiKey {
	return {
		id: 1,
		name: 'demo',
		prefix: 'sk-mirror',
		suffix: 'abcd',
		quotaUsed: 0.5,
		quotaTotal: 10,
		status: 'active',
		createdAt: '2026-06-01T00:00:00Z',
		lastUsedAt: null,
		expiresAt: null,
		...over
	};
}

describe('keys page · list rendering', () => {
	let api: typeof import('$lib/api/user/apiKeys');
	let pageMod: typeof import('../../../routes/(user)/keys/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/apiKeys');
		(api.listKeys as ReturnType<typeof vi.fn>).mockReset();
		(api.createKey as ReturnType<typeof vi.fn>).mockReset();
		(api.revokeKey as ReturnType<typeof vi.fn>).mockReset();

		(api.listKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [
				fakeKey({ id: 1, name: 'alpha', prefix: 'sk-A', suffix: 'wxyz' }),
				fakeKey({ id: 2, name: 'beta', prefix: 'sk-B', suffix: 'qrst' }),
				fakeKey({ id: 3, name: 'gamma', prefix: 'sk-C', suffix: 'mnop', status: 'inactive' })
			],
			total: 3,
			pages: 1
		});

		pageMod = await import('../../../routes/(user)/keys/+page.svelte');
	});

	it('renders 3 rows from mock fixture', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listKeys).toHaveBeenCalled());
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="keys-row"]');
			expect(rows.length).toBe(3);
		});
	});

	it('status filter Select uses non-empty values (sentinel guard)', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listKeys).toHaveBeenCalled());

		const sel = container.querySelector('[data-testid="keys-status-filter"]') as HTMLSelectElement;
		expect(sel).not.toBeNull();

		// 严禁任何 <option value=""> ——reshadcn-migration 红线
		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		// __all__ sentinel 必须存在
		const allOpt = sel.querySelector('option[value="__all__"]');
		expect(allOpt).not.toBeNull();
	});
});

describe('keys page · empty state', () => {
	let api: typeof import('$lib/api/user/apiKeys');
	let pageMod: typeof import('../../../routes/(user)/keys/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/apiKeys');
		(api.listKeys as ReturnType<typeof vi.fn>).mockReset();
		(api.listKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [],
			total: 0,
			pages: 0
		});
		pageMod = await import('../../../routes/(user)/keys/+page.svelte');
	});

	it('shows CTA when no keys exist', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listKeys).toHaveBeenCalled());
		await waitFor(() => {
			const cta = container.querySelector('[data-testid="keys-empty-create-btn"]');
			expect(cta).not.toBeNull();
		});
	});
});

describe('keys page · create flow', () => {
	let api: typeof import('$lib/api/user/apiKeys');
	let pageMod: typeof import('../../../routes/(user)/keys/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/apiKeys');
		(api.listKeys as ReturnType<typeof vi.fn>).mockReset();
		(api.createKey as ReturnType<typeof vi.fn>).mockReset();

		(api.listKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [fakeKey({ id: 99, name: 'existing' })],
			total: 1,
			pages: 1
		});
		(api.createKey as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakeKey({
				id: 100,
				name: 'fresh',
				key: 'sk-mirror-FULL-PLAINTEXT-1234567890',
				prefix: 'sk-mirror',
				suffix: '7890'
			})
		);

		pageMod = await import('../../../routes/(user)/keys/+page.svelte');
	});

	it('open dialog → submit → POST called → reveal panel shows full key', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listKeys).toHaveBeenCalled());

		const createBtn = container.querySelector('[data-testid="keys-create-btn"]') as HTMLButtonElement;
		expect(createBtn).not.toBeNull();
		await fireEvent.click(createBtn);

		// dialog 通过 bits-ui Portal 注入 document.body
		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="create-key-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const nameInput = document.body.querySelector(
			'[data-testid="create-key-name"]'
		) as HTMLInputElement;
		expect(nameInput).not.toBeNull();

		// superforms v2 通过 bind:value 拉 store；input + DOM event 双触发以覆盖。
		await fireEvent.input(nameInput, { target: { value: 'fresh' } });

		const form = document.body.querySelector(
			'[data-testid="create-key-form"]'
		) as HTMLFormElement;
		expect(form).not.toBeNull();

		// 直接派 submit 事件，superforms 的 use:enhance 会拦截 + 走 onUpdate
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(api.createKey).toHaveBeenCalled();
				const args = (api.createKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
				expect(args?.name).toBe('fresh');
			},
			{ timeout: 2000 }
		);

		// reveal panel + plaintext key 可见
		await waitFor(() => {
			const reveal = document.body.querySelector('[data-testid="reveal-key-panel"]');
			expect(reveal).not.toBeNull();
			const value = document.body.querySelector('[data-testid="reveal-key-value"]');
			expect(value?.textContent).toContain('sk-mirror-FULL-PLAINTEXT-1234567890');
		});
	});
});

describe('keys page · revoke flow', () => {
	let api: typeof import('$lib/api/user/apiKeys');
	let pageMod: typeof import('../../../routes/(user)/keys/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/user/apiKeys');
		(api.listKeys as ReturnType<typeof vi.fn>).mockReset();
		(api.revokeKey as ReturnType<typeof vi.fn>).mockReset();

		(api.listKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
			items: [fakeKey({ id: 42, name: 'to-die' })],
			total: 1,
			pages: 1
		});
		(api.revokeKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		pageMod = await import('../../../routes/(user)/keys/+page.svelte');
	});

	it('click row revoke → confirm → DELETE called → list refetched', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listKeys).toHaveBeenCalled());

		// 等行落地 —— listKeys mock 是 microtask 后填 state，需要 waitFor。
		await waitFor(() => {
			const btn = container.querySelector(
				'[data-testid="keys-revoke-btn"][data-key-id="42"]'
			);
			expect(btn).not.toBeNull();
		});

		const revokeBtn = container.querySelector(
			'[data-testid="keys-revoke-btn"][data-key-id="42"]'
		) as HTMLButtonElement;
		await fireEvent.click(revokeBtn);

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="revoke-key-dialog"]');
			expect(dlg).not.toBeNull();
		});

		const confirmBtn = document.body.querySelector(
			'[data-testid="revoke-confirm-btn"]'
		) as HTMLButtonElement;
		expect(confirmBtn).not.toBeNull();
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.revokeKey).toHaveBeenCalledWith(42);
		});
		// 撤销后应触发 refresh —— listKeys ≥ 2 次
		await waitFor(() => {
			expect((api.listKeys as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});
});
