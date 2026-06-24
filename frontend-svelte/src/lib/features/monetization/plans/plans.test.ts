/**
 * /(admin)/monetization/plans · vitest 覆盖（M22）
 *
 * 覆盖点：
 *   1. List render —— mock listPlans 返回 5 张套餐 → 5 个 PlanCard 出现，
 *      stats bar 数字与 on-sale/archived 计数一致。
 *   2. Filter Select sentinel —— platform / status 两个 filter 必须用真实
 *      sentinel（'__all__'），严禁 <option value=""> 出现（reshadcn-migration 铁律）。
 *   3. PlanEditDialog tab switching —— 打开 → 四个 tab（basic/pricing/quotas/features）
 *      可切换 → 在表单完整填写后 submit 触发 createPlan。
 *   4. PlanEditDialog 使用 StandardDialog，不再手写 bits overlay。
 *   5. Duplicate flow —— 点 PlanCard 的 Duplicate 按钮触发 duplicatePlan API。
 *   6. Archive confirm —— 点 Delete 触发原生 confirm dialog（页面内 lightweight 弹窗），
 *      点 Confirm 触发 deletePlan，并 reload。
 *
 * Mock 策略：
 *   - vi.mock '$lib/api/admin/plans' 一律替换为 vi.fn()。
 *   - vi.mock '$lib/stores/toast.svelte'（静音）。
 *   - dynamic-import 走 vi.dynamicImportSettled / waitFor 等待 PlanEditDialog 异步落地。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import type { AdminPlan, AdminGroupLite } from '$lib/api/admin/plans';
import dialogSrc from './PlanEditDialog.svelte?raw';

// vi.mock hoists —— 必须在 import +page.svelte / PlanEditDialog 之前
vi.mock('$lib/api/admin/plans', () => {
	return {
		listPlans: vi.fn(),
		listGroups: vi.fn(),
		getPlan: vi.fn(),
		createPlan: vi.fn(),
		updatePlan: vi.fn(),
		deletePlan: vi.fn(),
		duplicatePlan: vi.fn(),
		archivePlan: vi.fn(),
		restorePlan: vi.fn(),
		persistSortOrder: vi.fn(),
		adminPlansApi: {}
	};
});

// toast 静音
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
	addMessages('en', {
		common: {
			refresh: 'Refresh',
			confirm: 'Confirm',
			cancel: 'Cancel',
			delete: 'Delete',
			edit: 'Edit',
			create: 'Add',
			save: 'Save',
			saved: 'Saved',
			deleted: 'Deleted',
			submitting: 'Submitting',
			status: 'Status',
			close: 'Close',
			next: 'Next',
			back: 'Previous',
			error: 'Error'
		},
		payment: {
			admin: {
				createPlan: 'New Plan',
				editPlan: 'Edit Plan',
				deletePlan: 'Delete Plan',
				deletePlanConfirm: 'Confirm delete?',
				planName: 'Plan Name',
				planDescription: 'Description',
				originalPrice: 'Original Price',
				price: 'Price',
				validityDays: 'Validity (days)',
				validityUnit: 'Validity Unit',
				sortOrder: 'Sort Order',
				forSale: 'For Sale',
				group: 'Group',
				groupInfo: 'Group Info',
				platform: 'Platform',
				rateMultiplierLabel: 'Rate',
				dailyLimit: 'Daily',
				weeklyLimit: 'Weekly',
				monthlyLimit: 'Monthly',
				selectGroup: 'Select a group',
				groupRequired: 'Please select a group',
				priceRequired: 'Price must be > 0',
				validityDaysRequired: 'Validity > 0',
				features: 'Features',
				featuresHint: 'one per line',
				featuresPlaceholder: 'Enter features'
			}
		},
		admin: {
			plansCatalog: {
				title: 'Plan Catalog',
				desc: 'mirror',
				statTotal: 'Total',
				statOnSale: 'On Sale',
				statOffSale: 'Archived',
				emptyText: 'no plans yet',
				onSale: 'On Sale',
				offSale: 'Archived',
				moveUp: 'Up',
				moveDown: 'Down',
				groupMissingFmt: 'Group #{id} missing',
				dailyLimitFmt: 'Daily limit ${v}',
				unlimited: 'Unlimited',
				moreFeaturesFmt: '+{n} more',
				toggleOnTitle: 'archive',
				toggleOffTitle: 'publish',
				periodMonths: '{n} month(s)',
				periodWeeks: '{n} week(s)',
				periodDays: '{n} day(s)',
				duplicate: 'Duplicate',
				duplicated: 'Plan duplicated',
				archived: 'Plan archived',
				published: 'Plan published',
				searchPlaceholder: 'Search…',
				platformAll: 'All platforms',
				statusAll: 'All statuses',
				tabBasic: 'Basic',
				tabPricing: 'Pricing',
				tabQuotas: 'Quotas',
				tabFeatures: 'Features',
				dialogDesc: 'desc',
				quotasFromGroup: 'inherited',
				quotasNeedGroup: 'pick group first',
				unitDays: 'Days',
				unitWeeks: 'Weeks',
				unitMonths: 'Months'
			}
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

// ── fixtures ──────────────────────────────────────────────────────────

function fakeGroup(over: Partial<AdminGroupLite> = {}): AdminGroupLite {
	return {
		id: 1,
		name: 'Pro',
		platform: 'anthropic',
		rate_multiplier: 1,
		subscription_type: 'subscription',
		daily_limit_usd: 10,
		weekly_limit_usd: 50,
		monthly_limit_usd: 200,
		...over
	};
}

function fakePlan(over: Partial<AdminPlan> = {}): AdminPlan {
	return {
		id: 1,
		group_id: 1,
		name: 'Plan A',
		description: 'demo',
		price: 19.99,
		original_price: 29.99,
		validity_days: 30,
		validity_unit: 'days',
		features: ['feat-1', 'feat-2'],
		for_sale: true,
		sort_order: 0,
		...over
	};
}

// ────────────────────────────────────────────────────────────────────────
// 1) List render — 5 plans + stats
// ────────────────────────────────────────────────────────────────────────

describe('plans page · list render', () => {
	let api: typeof import('$lib/api/admin/plans');
	let pageMod: typeof import('../../../../routes/admin/monetization/plans/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/plans');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();
		(api.listGroups as ReturnType<typeof vi.fn>).mockReset();

		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
			fakePlan({ id: 1, name: 'Plan One', sort_order: 0, for_sale: true }),
			fakePlan({ id: 2, name: 'Plan Two', sort_order: 1, for_sale: true }),
			fakePlan({ id: 3, name: 'Plan Three', sort_order: 2, for_sale: true }),
			fakePlan({ id: 4, name: 'Plan Four', sort_order: 3, for_sale: false }),
			fakePlan({ id: 5, name: 'Plan Five', sort_order: 4, for_sale: false })
		]);
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue([fakeGroup()]);

		pageMod = await import('../../../../routes/admin/monetization/plans/+page.svelte');
	});

	it('renders 5 plan cards from mock', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listPlans).toHaveBeenCalled());
		await waitFor(() => {
			const cards = container.querySelectorAll('[data-testid="admin-plan-card"]');
			expect(cards.length).toBe(5);
		});
	});

	it('stats bar reflects on-sale / archived split', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => expect(api.listPlans).toHaveBeenCalled());
		await waitFor(() => {
			const onSale = container.querySelector('[data-testid="plans-stat-on-sale"]');
			const archived = container.querySelector('[data-testid="plans-stat-archived"]');
			expect(onSale?.textContent?.trim()).toBe('3');
			expect(archived?.textContent?.trim()).toBe('2');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 2) Filter sentinel — no empty-string option
// ────────────────────────────────────────────────────────────────────────

describe('plans page · filter sentinels', () => {
	let api: typeof import('$lib/api/admin/plans');
	let pageMod: typeof import('../../../../routes/admin/monetization/plans/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/plans');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();
		(api.listGroups as ReturnType<typeof vi.fn>).mockReset();
		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([fakePlan()]);
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue([fakeGroup()]);

		pageMod = await import('../../../../routes/admin/monetization/plans/+page.svelte');
	});

	it('platform + status filters use __all__ sentinel; no <option value="">', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const platformSel = container.querySelector(
				'[data-testid="plans-platform-filter"]'
			);
			const statusSel = container.querySelector('[data-testid="plans-status-filter"]');
			expect(platformSel).not.toBeNull();
			expect(statusSel).not.toBeNull();
		});

		// Sentinel guard: 严禁 <option value="">
		const filtersBar = container.querySelector('[data-testid="plans-filters"]');
		expect(filtersBar).not.toBeNull();
		const offending = filtersBar!.innerHTML.match(/<option\s+[^>]*\bvalue="(?:|\s*)"[^>]*>/g);
		expect(offending).toBeNull();

		const platformSel = container.querySelector(
			'[data-testid="plans-platform-filter"]'
		) as HTMLSelectElement;
		const statusSel = container.querySelector(
			'[data-testid="plans-status-filter"]'
		) as HTMLSelectElement;
		expect(platformSel.querySelector('option[value="__all__"]')).not.toBeNull();
		expect(statusSel.querySelector('option[value="__all__"]')).not.toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────
// 3) PlanEditDialog — tab switching + submit
// ────────────────────────────────────────────────────────────────────────

describe('PlanEditDialog · tabs + submit', () => {
	let api: typeof import('$lib/api/admin/plans');
	let PlanEditDialog: typeof import('./PlanEditDialog.svelte').default;

	beforeEach(async () => {
		api = await import('$lib/api/admin/plans');
		(api.createPlan as ReturnType<typeof vi.fn>).mockReset();
		(api.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(fakePlan({ id: 99 }));

		const mod = await import('./PlanEditDialog.svelte');
		PlanEditDialog = mod.default;
	});

	it('switches between basic / pricing / quotas / features tabs', async () => {
		render(PlanEditDialog, {
			props: {
				open: true,
				plan: null,
				groups: [fakeGroup()]
			}
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="plan-edit-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// basic 应默认激活
		await waitFor(() => {
			const basicPanel = document.body.querySelector('[data-testid="plan-edit-panel-basic"]');
			expect(basicPanel).not.toBeNull();
		});

		const tabs = document.body.querySelectorAll('[data-testid="plan-edit-tab"]');
		// 4 tabs
		expect(tabs.length).toBe(4);

		// 切到 pricing
		const pricingTab = Array.from(tabs).find(
			(el) => (el as HTMLElement).dataset.tabKey === 'pricing'
		) as HTMLButtonElement;
		await fireEvent.click(pricingTab);
		await waitFor(() => {
			const panel = document.body.querySelector('[data-testid="plan-edit-panel-pricing"]');
			expect(panel).not.toBeNull();
		});

		// 切到 quotas
		const quotasTab = Array.from(tabs).find(
			(el) => (el as HTMLElement).dataset.tabKey === 'quotas'
		) as HTMLButtonElement;
		await fireEvent.click(quotasTab);
		await waitFor(() => {
			const panel = document.body.querySelector('[data-testid="plan-edit-panel-quotas"]');
			expect(panel).not.toBeNull();
		});

		// 切到 features
		const featuresTab = Array.from(tabs).find(
			(el) => (el as HTMLElement).dataset.tabKey === 'features'
		) as HTMLButtonElement;
		await fireEvent.click(featuresTab);
		await waitFor(() => {
			const panel = document.body.querySelector('[data-testid="plan-edit-panel-features"]');
			expect(panel).not.toBeNull();
		});
	});

	it('submit with valid form calls createPlan once', async () => {
		render(PlanEditDialog, {
			props: {
				open: true,
				plan: null,
				groups: [fakeGroup()]
			}
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="plan-edit-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// 填 name
		const nameInput = document.body.querySelector(
			'[data-testid="plan-edit-name"]'
		) as HTMLInputElement;
		await fireEvent.input(nameInput, { target: { value: 'New Plan' } });

		// 选 group
		const groupSel = document.body.querySelector(
			'[data-testid="plan-edit-group"]'
		) as HTMLSelectElement;
		await fireEvent.change(groupSel, { target: { value: '1' } });

		// 切到 pricing
		const tabs = document.body.querySelectorAll('[data-testid="plan-edit-tab"]');
		const pricingTab = Array.from(tabs).find(
			(el) => (el as HTMLElement).dataset.tabKey === 'pricing'
		) as HTMLButtonElement;
		await fireEvent.click(pricingTab);

		// 填 price
		const priceInput = await waitFor(() => {
			const el = document.body.querySelector(
				'[data-testid="plan-edit-price"]'
			) as HTMLInputElement;
			expect(el).not.toBeNull();
			return el;
		});
		await fireEvent.input(priceInput, { target: { value: '29.99' } });

		// submit
		const form = document.body.querySelector(
			'[data-testid="plan-edit-form"]'
		) as HTMLFormElement;
		await fireEvent.submit(form);

		await waitFor(
			() => {
				expect(api.createPlan).toHaveBeenCalled();
				const args = (api.createPlan as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
				expect(args?.name).toBe('New Plan');
				expect(args?.group_id).toBe(1);
				expect(args?.price).toBeCloseTo(29.99, 2);
			},
			{ timeout: 2000 }
		);
	});

	it('validity unit select is sentinel-safe (no <option value="">)', async () => {
		render(PlanEditDialog, {
			props: {
				open: true,
				plan: null,
				groups: [fakeGroup()]
			}
		});

		await waitFor(() => {
			const dlg = document.body.querySelector('[data-testid="plan-edit-dialog"]');
			expect(dlg).not.toBeNull();
		});

		// 跳到 pricing tab 才能看到 validity-unit
		const tabs = document.body.querySelectorAll('[data-testid="plan-edit-tab"]');
		const pricingTab = Array.from(tabs).find(
			(el) => (el as HTMLElement).dataset.tabKey === 'pricing'
		) as HTMLButtonElement;
		await fireEvent.click(pricingTab);

		const sel = await waitFor(() => {
			const el = document.body.querySelector(
				'[data-testid="plan-edit-validity-unit"]'
			) as HTMLSelectElement;
			expect(el).not.toBeNull();
			return el;
		});
		// 3 options，全部非空
		const opts = Array.from(sel.querySelectorAll('option'));
		expect(opts.length).toBe(3);
		for (const o of opts) {
			expect(o.value).not.toBe('');
		}
	});

	it('uses StandardDialog instead of a hand-rolled bits overlay', () => {
		expect(dialogSrc).toContain('StandardDialog');
		expect(dialogSrc).toContain('data-testid="plan-edit-dialog"');
		expect(dialogSrc).not.toContain('Dialog.Root');
		expect(dialogSrc).not.toContain('Dialog.Overlay');
		expect(dialogSrc).not.toContain('fixed inset-0');
	});
});

// ────────────────────────────────────────────────────────────────────────
// 4) Duplicate flow — click Duplicate → duplicatePlan called
// ────────────────────────────────────────────────────────────────────────

describe('plans page · duplicate flow', () => {
	let api: typeof import('$lib/api/admin/plans');
	let pageMod: typeof import('../../../../routes/admin/monetization/plans/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/plans');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();
		(api.listGroups as ReturnType<typeof vi.fn>).mockReset();
		(api.duplicatePlan as ReturnType<typeof vi.fn>).mockReset();

		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
			fakePlan({ id: 7, name: 'Source Plan' })
		]);
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue([fakeGroup()]);
		(api.duplicatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
			fakePlan({ id: 8, name: 'Source Plan (copy)' })
		);

		pageMod = await import('../../../../routes/admin/monetization/plans/+page.svelte');
	});

	it('clicking Duplicate calls duplicatePlan API with snapshot', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const cards = container.querySelectorAll('[data-testid="admin-plan-card"]');
			expect(cards.length).toBe(1);
		});

		const dupBtn = container.querySelector(
			'[data-testid="plan-duplicate-btn"]'
		) as HTMLButtonElement;
		expect(dupBtn).not.toBeNull();
		await fireEvent.click(dupBtn);

		await waitFor(() => {
			expect(api.duplicatePlan).toHaveBeenCalled();
			const arg = (api.duplicatePlan as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
				| AdminPlan
				| undefined;
			expect(arg?.id).toBe(7);
			expect(arg?.name).toBe('Source Plan');
		});
	});
});

// ────────────────────────────────────────────────────────────────────────
// 5) Archive (delete) confirm flow — click Delete → confirm → deletePlan
// ────────────────────────────────────────────────────────────────────────

describe('plans page · delete confirm flow', () => {
	let api: typeof import('$lib/api/admin/plans');
	let pageMod: typeof import('../../../../routes/admin/monetization/plans/+page.svelte');

	beforeEach(async () => {
		api = await import('$lib/api/admin/plans');
		(api.listPlans as ReturnType<typeof vi.fn>).mockReset();
		(api.listGroups as ReturnType<typeof vi.fn>).mockReset();
		(api.deletePlan as ReturnType<typeof vi.fn>).mockReset();

		(api.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
			fakePlan({ id: 42, name: 'Doomed' })
		]);
		(api.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue([fakeGroup()]);
		(api.deletePlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		pageMod = await import('../../../../routes/admin/monetization/plans/+page.svelte');
	});

	it('Delete button opens confirm; Confirm triggers deletePlan(id)', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const cards = container.querySelectorAll('[data-testid="admin-plan-card"]');
			expect(cards.length).toBe(1);
		});

		const delBtn = container.querySelector(
			'[data-testid="plan-delete-btn"]'
		) as HTMLButtonElement;
		expect(delBtn).not.toBeNull();
		await fireEvent.click(delBtn);

		// Confirm dialog 出现
		await waitFor(() => {
			const confirm = document.body.querySelector('[data-testid="plans-delete-confirm"]');
			expect(confirm).not.toBeNull();
		});

		const confirmBtn = document.body.querySelector(
			'[data-testid="plans-delete-confirm-btn"]'
		) as HTMLButtonElement;
		expect(confirmBtn).not.toBeNull();
		await fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(api.deletePlan).toHaveBeenCalledWith(42);
		});
	});

	it('Cancel button on confirm dialog does NOT call deletePlan', async () => {
		const { container } = render(pageMod.default);
		await waitFor(() => {
			const cards = container.querySelectorAll('[data-testid="admin-plan-card"]');
			expect(cards.length).toBe(1);
		});

		const delBtn = container.querySelector(
			'[data-testid="plan-delete-btn"]'
		) as HTMLButtonElement;
		await fireEvent.click(delBtn);

		await waitFor(() => {
			const confirm = document.body.querySelector('[data-testid="plans-delete-confirm"]');
			expect(confirm).not.toBeNull();
		});

		const cancelBtn = document.body.querySelector(
			'[data-testid="plans-delete-cancel"]'
		) as HTMLButtonElement;
		await fireEvent.click(cancelBtn);

		await new Promise((r) => setTimeout(r, 50));
		expect(api.deletePlan).not.toHaveBeenCalled();
	});
});
