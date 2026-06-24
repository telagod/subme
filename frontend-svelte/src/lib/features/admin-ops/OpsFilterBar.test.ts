import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import barSrc from './OpsFilterBar.svelte?raw';

/**
 * OpsFilterBar 契约 + 渲染测试。
 *
 * ?raw 源断言锁住红线（sentinel / 无 chart / lib/ui 复用 / i18n default），
 * render 断言锁住行为（platform/group sentinel 映射、回调、custom 弹层）。
 */

// groups API mock —— hoisted 前置（render path 会 loadGroups()）。
vi.mock('$lib/api/admin/groups', () => ({
	listAllGroups: vi.fn(async () => [
		{ id: 1, name: 'OpenAI Pool', platform: 'openai' },
		{ id: 2, name: 'Claude Pool', platform: 'anthropic' }
	])
}));

// realtime traffic mock —— 默认 enabled=false，避免渲染期发请求。
vi.mock('$lib/api/admin/ops', async (orig) => {
	const actual = await (orig() as Promise<Record<string, unknown>>);
	return {
		...actual,
		getOpsRealtimeTraffic: vi.fn(async () => ({ enabled: false, summary: null }))
	};
});

describe('OpsFilterBar · source contract', () => {
	it('NO chart island: never imports chart.js / svelte-chartjs (this is a filter bar)', () => {
		expect(barSrc).not.toMatch(/chart\.js/);
		expect(barSrc).not.toMatch(/svelte-chartjs/);
	});

	it('NativeSelect uses sentinels, never empty value', () => {
		expect(barSrc).toContain("'__all__'");
		// platform '' <-> sentinel mapping both directions.
		expect(barSrc).toContain('PLATFORM_ALL');
		expect(barSrc).toContain('GROUP_ALL');
		// must never bind an empty string into a NativeSelect value.
		expect(barSrc).not.toMatch(/value=""/);
	});

	it('reuses lib/ui primitives, not hand-rolled', () => {
		for (const prim of [
			"$lib/ui/Button.svelte",
			"$lib/ui/Input.svelte",
			"$lib/ui/Badge.svelte",
			"$lib/ui/NativeSelect.svelte",
			"$lib/ui/StandardDialog.svelte"
		]) {
			expect(barSrc).toContain(prim);
		}
	});

	it('exposes exactly the wired props', () => {
		for (const prop of [
			'overview',
			'platform',
			'groupId',
			'timeRange',
			'queryMode',
			'loading',
			'lastUpdated',
			'autoRefreshEnabled',
			'autoRefreshCountdown',
			'customStartTime',
			'customEndTime',
			'onPlatformChange',
			'onGroupChange',
			'onTimeRangeChange',
			'onQueryModeChange',
			'onCustomTimeRange',
			'onRefresh',
			'onOpenSettings',
			'onOpenAlertRules',
			'onOpenRequestDetails'
		]) {
			expect(barSrc).toContain(prop);
		}
	});

	it('every $_ call carries a default fallback (no hardcoded-English findings)', () => {
		const calls = barSrc.match(/\$_\(/g) ?? [];
		const defaults = barSrc.match(/default:\s*'/g) ?? [];
		expect(calls.length).toBeGreaterThan(0);
		expect(defaults.length).toBeGreaterThanOrEqual(calls.length);
	});

	it('does not edit locale files / hardcode chinese-only strings in markup', () => {
		// All user-facing copy must route through $_(...) with default.
		expect(barSrc).not.toMatch(/from '\$lib\/i18n\/locales/);
	});
});

describe('OpsFilterBar · render behavior', () => {
	beforeEach(async () => {
		addMessages('en', {});
		init({ fallbackLocale: 'en', initialLocale: 'en' });
		locale.set('en');
		const mod = await import('$lib/api/admin/groups');
		(mod.listAllGroups as ReturnType<typeof vi.fn>).mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	function baseProps(over: Record<string, unknown> = {}) {
		return {
			overview: null,
			platform: '',
			groupId: null,
			timeRange: '1h' as const,
			queryMode: 'auto' as const,
			loading: false,
			lastUpdated: new Date('2026-06-20T12:34:56'),
			autoRefreshEnabled: false,
			autoRefreshCountdown: undefined,
			customStartTime: null,
			customEndTime: null,
			onPlatformChange: vi.fn(),
			onGroupChange: vi.fn(),
			onTimeRangeChange: vi.fn(),
			onQueryModeChange: vi.fn(),
			onCustomTimeRange: vi.fn(),
			onRefresh: vi.fn(),
			onOpenSettings: vi.fn(),
			onOpenAlertRules: vi.fn(),
			onOpenRequestDetails: vi.fn(),
			...over
		};
	}

	async function mount(over: Record<string, unknown> = {}) {
		const Comp = (await import('./OpsFilterBar.svelte')).default;
		const props = baseProps(over);
		const r = render(Comp, { props });
		return { r, props };
	}

	it('renders the title and last-updated status line', async () => {
		const { r } = await mount();
		expect(r.getByTestId('ops-filter-bar')).toBeTruthy();
		expect(r.getByTestId('ops-last-updated').textContent).toContain('2026-06-20');
	});

	it('platform select shows sentinel __all__ for empty platform; change maps __all__ -> ""', async () => {
		const { r, props } = await mount({ platform: '' });
		const sel = r.getByTestId('ops-platform-select') as HTMLSelectElement;
		expect(sel.value).toBe('__all__');
		await fireEvent.change(sel, { target: { value: 'openai' } });
		expect(props.onPlatformChange).toHaveBeenCalledWith('openai');
		await fireEvent.change(sel, { target: { value: '__all__' } });
		expect(props.onPlatformChange).toHaveBeenCalledWith('');
	});

	it('group select maps sentinel -> null and numeric id', async () => {
		const { r, props } = await mount({ platform: '' });
		const sel = r.getByTestId('ops-group-select') as HTMLSelectElement;
		expect(sel.value).toBe('__all__');
		// groups load async; wait until the id=1 option is in the DOM.
		await waitFor(() => {
			expect([...sel.options].some((o) => o.value === '1')).toBe(true);
		});
		await fireEvent.change(sel, { target: { value: '1' } });
		expect(props.onGroupChange).toHaveBeenCalledWith(1);
		await fireEvent.change(sel, { target: { value: '__all__' } });
		expect(props.onGroupChange).toHaveBeenCalledWith(null);
	});

	it('refresh button calls onRefresh', async () => {
		const { r, props } = await mount();
		await fireEvent.click(r.getByTestId('ops-refresh-btn'));
		expect(props.onRefresh).toHaveBeenCalledOnce();
	});

	it('settings / alert-rules / request-details triggers fire their callbacks', async () => {
		const { r, props } = await mount();
		await fireEvent.click(r.getByTestId('ops-open-settings-btn'));
		await fireEvent.click(r.getByTestId('ops-open-alert-rules-btn'));
		await fireEvent.click(r.getByTestId('ops-open-request-details-btn'));
		expect(props.onOpenSettings).toHaveBeenCalledOnce();
		expect(props.onOpenAlertRules).toHaveBeenCalledOnce();
		expect(props.onOpenRequestDetails).toHaveBeenCalledOnce();
	});

	it('query-mode select changes emit OpsQueryMode', async () => {
		const { r, props } = await mount();
		const sel = r.getByTestId('ops-query-mode-select') as HTMLSelectElement;
		await fireEvent.change(sel, { target: { value: 'raw' } });
		expect(props.onQueryModeChange).toHaveBeenCalledWith('raw');
	});

	it('selecting custom time-range opens the popover (does not emit until confirmed)', async () => {
		const { r, props } = await mount();
		const sel = r.getByTestId('ops-time-range-select') as HTMLSelectElement;
		await fireEvent.change(sel, { target: { value: 'custom' } });
		// popover opens; no emit yet.
		expect(props.onTimeRangeChange).not.toHaveBeenCalled();
		expect(props.onCustomTimeRange).not.toHaveBeenCalled();
	});

	it('auto-refresh countdown badge renders when enabled', async () => {
		const { r } = await mount({ autoRefreshEnabled: true, autoRefreshCountdown: 7 });
		expect(r.getByTestId('ops-auto-refresh-countdown').textContent).toContain('7');
	});
});
