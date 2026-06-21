/**
 * Pricing · POC 5 测试（editable drawer 重写）
 *
 * 覆盖点：
 *   1. listModels 被调用，VirtualTable 渲染 ≥ 1 行
 *   2. provider filter Select 用 '__all__' 哨兵，DOM 不含 <option value="">
 *   3. 行点击 → drawer 打开 → getModel(slug) 被调用
 *   4. sort Select 切换 → sortedModels 顺序变化
 *   5. drawer auto mode + 已 overridden → 点 Restore → deleteOverride 调用 + override-saved 派发
 *   6. ProviderVerifyDrawer 使用 StandardDrawer，不再手写 bits overlay
 *   7. RED LINE grep: pricing 源码不出现 billing_service / /admin/channels/model-pricing
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
// 红线 grep test —— 不引 @types/node，改用 Vite `?raw` import 把源码字符串
// 在构建期落到测试，svelte-check 看不见 node:fs，但 vitest 通过 vite 解析没问题。
import drawerSrc from '$lib/features/pricing/ProviderVerifyDrawer.svelte?raw';
import apiSrc from '$lib/api/admin/modelCatalog.ts?raw';
import utilSrc from '$lib/utils/pricing.ts?raw';
import pageSrc from '../../../routes/admin/monetization/pricing/+page.svelte?raw';
import type {
	CatalogListResponse,
	CatalogModelDetail,
	CatalogModelListItem,
	ModelPriceOverride
} from '$lib/api/admin/modelCatalog';

// vi.mock hoists —— mock 必须在 page 真 import 之前。
vi.mock('$lib/api/admin/modelCatalog', () => {
	return {
		modelCatalogApi: {
			listModels: vi.fn(),
			getModel: vi.fn(),
			syncCatalog: vi.fn(),
			syncModel: vi.fn(),
			upsertOverride: vi.fn(),
			deleteOverride: vi.fn()
		}
	};
});

beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

function fakeRows(n: number): CatalogModelListItem[] {
	// 用白名单内 provider（anthropic/openai/google），保证 mainstream filter 不滤掉
	const providers = ['anthropic', 'openai', 'google'];
	return Array.from({ length: n }, (_, i) => {
		const p = providers[i % providers.length];
		return {
			id: `${p}/model-${i}`,
			name: `Model ${i}`,
			context_len: 100_000 + i * 1000,
			baseline: {
				input: (i + 1) * 1e-6,
				output: (i + 2) * 1e-6,
				cache_read: 0.5e-6,
				cache_write: 1e-6,
				source: 'openrouter'
			},
			has_override: i % 5 === 0,
			provider_count: 3
		} satisfies CatalogModelListItem;
	});
}

function fakeListResponse(n: number): CatalogListResponse {
	return { models: fakeRows(n), last_updated: '2026-06-18T00:00:00Z' };
}

function fakeDetail(slug: string, overridden = true): CatalogModelDetail {
	const ov: ModelPriceOverride | undefined = overridden
		? {
				model_id: slug,
				pinned_provider_tag: 'anthropic',
				updated_at: '2026-06-18T00:00:00Z'
			}
		: undefined;
	return {
		id: slug,
		name: slug,
		description: 'fake model',
		context_len: 200_000,
		capabilities: ['reasoning', 'tools'],
		providers: [
			{ provider: 'Anthropic', tag: 'anthropic', input: 1e-6, output: 2e-6, uptime_1d: 0.99 },
			{ provider: 'OpenAI', tag: 'openai', input: 2e-6, output: 4e-6, uptime_1d: 0.92 }
		],
		baseline: { input: 1e-6, output: 2e-6, source: 'anthropic' },
		overridden,
		override: ov ?? null
	};
}

describe('Pricing page · listModels + filter + drawer wiring', () => {
	let pageMod: typeof import('../../../routes/admin/monetization/pricing/+page.svelte');
	let apiMod: typeof import('$lib/api/admin/modelCatalog');
	let listSpy: ReturnType<typeof vi.fn>;
	let getSpy: ReturnType<typeof vi.fn>;
	let deleteSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		apiMod = await import('$lib/api/admin/modelCatalog');
		listSpy = apiMod.modelCatalogApi.listModels as unknown as ReturnType<typeof vi.fn>;
		getSpy = apiMod.modelCatalogApi.getModel as unknown as ReturnType<typeof vi.fn>;
		deleteSpy = apiMod.modelCatalogApi.deleteOverride as unknown as ReturnType<typeof vi.fn>;
		listSpy.mockReset();
		getSpy.mockReset();
		deleteSpy.mockReset();
		listSpy.mockResolvedValue(fakeListResponse(30));
		getSpy.mockImplementation(async (slug: string) => fakeDetail(slug, true));
		deleteSpy.mockResolvedValue(undefined);

		pageMod = await import('../../../routes/admin/monetization/pricing/+page.svelte');
	});

	it('renders rows from listModels (fallback or virtual)', async () => {
		const { container } = render(pageMod.default);

		await waitFor(
			() => {
				expect(listSpy).toHaveBeenCalled();
				const rows = container.querySelectorAll('[data-testid="pricing-row"]');
				expect(rows.length).toBeGreaterThan(0);
			},
			{ timeout: 2000 }
		);
	});

	it('provider filter uses __all__ sentinel; NO empty-string options anywhere', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(listSpy).toHaveBeenCalled());
		// give derived providerTabs a microtask to settle
		await waitFor(() => {
			const allOpt = container.querySelector('[data-testid="pricing-provider-filter"] option[value="__all__"]');
			expect(allOpt).not.toBeNull();
		});

		// 严禁 <option value=""> 出现（兼容自闭合属性等价写法 value='' 也要拦）。
		const html = container.innerHTML;
		// disable+hidden placeholder allowed only inside drawer (not in main page);
		// 这里仅检查主页面 container HTML。
		const offending = html.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		// drawer mounts in document.body via Portal, not inside container, so this is page-only.
		expect(offending).toBeNull();

		// 控件 testid 命中
		const sel = container.querySelector('[data-testid="pricing-provider-filter"]');
		expect(sel).not.toBeNull();

		// pill tabs 第一个 = __all__
		const firstPill = container.querySelector('[data-testid="pricing-provider-pill"]');
		expect(firstPill?.getAttribute('data-pill-key')).toBe('__all__');
	});

	it('clicking a row opens drawer and calls getModel with that slug', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="pricing-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		const firstRow = container.querySelector('[data-testid="pricing-row"]') as HTMLElement;
		const expectedId = firstRow.getAttribute('data-model-id');
		expect(expectedId).toBeTruthy();

		await fireEvent.click(firstRow);

		// drawer 注入 document.body via bits-ui Portal
		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="provider-verify-drawer"]');
			expect(drawer).not.toBeNull();
		});

		await waitFor(() => {
			expect(getSpy).toHaveBeenCalledWith(expectedId);
		});
	});

	it('sort Select change reorders rows', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="pricing-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		// 当前默认 alpha-asc。切到 input-desc。
		const sortSel = container.querySelector('[data-testid="pricing-sort"]') as HTMLSelectElement;
		expect(sortSel).not.toBeNull();

		const beforeIds = Array.from(
			container.querySelectorAll('[data-testid="pricing-row"]')
		).map((r) => r.getAttribute('data-model-id'));

		await fireEvent.change(sortSel, { target: { value: 'input-desc' } });

		await waitFor(() => {
			const afterIds = Array.from(
				container.querySelectorAll('[data-testid="pricing-row"]')
			).map((r) => r.getAttribute('data-model-id'));
			// 顺序应该不同（alpha-asc vs input-desc）
			expect(afterIds.join(',')).not.toBe(beforeIds.join(','));
		});
	});

	it('drawer Restore (auto mode + overridden) → deleteOverride + override-saved emitted → refetch', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="pricing-row"]');
			expect(rows.length).toBeGreaterThan(0);
		});

		// 打开第一行（fakeDetail 默认 overridden=true）
		const firstRow = container.querySelector('[data-testid="pricing-row"]') as HTMLElement;
		await fireEvent.click(firstRow);

		// 等 drawer 渲染完
		await waitFor(() => {
			const drawer = document.body.querySelector('[data-testid="provider-verify-drawer"]');
			expect(drawer).not.toBeNull();
		});

		// drawer 已 getModel —— 等异步 effect 落地
		await waitFor(() => {
			expect(getSpy).toHaveBeenCalled();
		});

		// 展开编辑面板
		await waitFor(() => {
			const editToggle = document.body.querySelector(
				'[data-testid="provider-verify-edit-toggle"]'
			) as HTMLButtonElement;
			expect(editToggle).not.toBeNull();
		});

		const editToggle = document.body.querySelector(
			'[data-testid="provider-verify-edit-toggle"]'
		) as HTMLButtonElement;
		await fireEvent.click(editToggle);

		// 编辑面板出现 + Restore 按钮（mode 默认从 seedForm 选成 'pinned'，
		// 因为 fakeDetail.override 含 pinned_provider_tag）。点 auto radio 切到 auto。
		await waitFor(() => {
			const autoRadio = document.body.querySelector(
				'[data-testid="provider-verify-mode-auto"] input[type="radio"]'
			) as HTMLInputElement;
			expect(autoRadio).not.toBeNull();
		});
		const autoRadio = document.body.querySelector(
			'[data-testid="provider-verify-mode-auto"] input[type="radio"]'
		) as HTMLInputElement;
		await fireEvent.click(autoRadio);

		// Restore 出现（仅当 mode=auto + detail.overridden=true）
		await waitFor(() => {
			const restoreBtn = document.body.querySelector(
				'[data-testid="provider-verify-restore"]'
			) as HTMLButtonElement;
			expect(restoreBtn).not.toBeNull();
		});

		const restoreBtn = document.body.querySelector(
			'[data-testid="provider-verify-restore"]'
		) as HTMLButtonElement;
		await fireEvent.click(restoreBtn);

		await waitFor(() => {
			expect(deleteSpy).toHaveBeenCalled();
		});

		// override-saved 派发 → 父组件触发 fetchList 重拉 → listSpy ≥ 2 次
		await waitFor(() => {
			expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('ProviderVerifyDrawer uses StandardDrawer instead of a hand-rolled bits overlay', () => {
		expect(drawerSrc).toContain('StandardDrawer');
		expect(drawerSrc).toContain('data-testid="provider-verify-drawer"');
		expect(drawerSrc).not.toContain('Dialog.Root');
		expect(drawerSrc).not.toContain('Dialog.Overlay');
		expect(drawerSrc).not.toContain('fixed inset-0');
	});
});

describe('RED LINE · pricing UI must not reference billing_service or channels/model-pricing', () => {
	it('no source file under pricing surface references the red-line strings', () => {
		const sources: Array<[string, string]> = [
			['ProviderVerifyDrawer.svelte', drawerSrc as unknown as string],
			['modelCatalog.ts', apiSrc as unknown as string],
			['utils/pricing.ts', utilSrc as unknown as string],
			['pricing/+page.svelte', pageSrc as unknown as string]
		];
		const forbidden = ['billing_service', '/admin/channels/model-pricing', 'GetModelPricing'];
		for (const [label, src] of sources) {
			for (const needle of forbidden) {
				expect(src.includes(needle), `${label} contains forbidden string "${needle}"`).toBe(false);
			}
		}
	});
});
