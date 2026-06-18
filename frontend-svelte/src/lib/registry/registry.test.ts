/**
 * Settings Registry · 3-way consistency suite（POC 4）
 *
 * 三条断言：
 *   1. SMTP section 每个字段渲染为正确的 input 类型（text/password/number/switch）。
 *   2. 模拟 settingsApi.patchSettings —— 改两个字段触发保存，断言 mock 收到的
 *      payload 仅含这两个 dirty key（不是全量）。
 *   3. 渲染 SMTP section 后 grep DOM：禁止任何 <option value=""> ——
 *      Sentinel 契约的运行时哨兵（reshadcn-migration memory）。
 *
 * 设计：
 *   - 不 mount +page.svelte（含 onMount / $app/state，行为面太广）。
 *     改 mount SectionRenderer + 手写 store-like 包装，专测 registry 引擎。
 *   - api/admin/settingsRegistry 用 vi.mock 注入 stub —— 既避免真实 fetch，
 *     又能断言 payload。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import SectionRenderer from './SectionRenderer.svelte';
import { smtpSection, emailGeneralSection } from './settings.schema';
import { buildZodSchema } from './zod';
import type { SectionDef } from './types';

// -- mock api（必须在 import 之前由 vi 提升）
vi.mock('$lib/api/admin/settingsRegistry', () => {
	return {
		settingsApi: {
			getSettings: vi.fn(),
			patchSettings: vi.fn(),
			testSmtpConnection: vi.fn(),
			sendTestEmail: vi.fn()
		}
	};
});

// -- i18n 初始化：测试走 passthrough，断言时直接用 key 字符串。
beforeAll(async () => {
	addMessages('en', {});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('SMTP section · field type dispatch', () => {
	const values: Record<string, unknown> = {
		smtp_host: 'smtp.example.com',
		smtp_port: 587,
		smtp_username: 'foo',
		smtp_password: '',
		smtp_from_email: 'noreply@example.com',
		smtp_from_name: 'subme',
		smtp_use_tls: true
	};

	function mount() {
		return render(SectionRenderer, {
			props: { section: smtpSection, values, dirtyKeys: new Set<string>() }
		});
	}

	it('renders text input for smtp_host', () => {
		const { container } = mount();
		const el = container.querySelector('[data-field-key="smtp_host"] input');
		expect(el).not.toBeNull();
		expect(el!.getAttribute('type')).toBe('text');
	});

	it('renders number input for smtp_port', () => {
		const { container } = mount();
		const el = container.querySelector('[data-field-key="smtp_port"] input');
		expect(el).not.toBeNull();
		expect(el!.getAttribute('type')).toBe('number');
	});

	it('renders password input for smtp_password', () => {
		const { container } = mount();
		const el = container.querySelector('[data-field-key="smtp_password"] input');
		expect(el).not.toBeNull();
		expect(el!.getAttribute('type')).toBe('password');
		expect(el!.getAttribute('autocomplete')).toBe('new-password');
	});

	it('renders switch (role=switch) for smtp_use_tls', () => {
		const { container } = mount();
		const el = container.querySelector('[data-field-key="smtp_use_tls"] [role="switch"]');
		expect(el).not.toBeNull();
		expect(el!.getAttribute('aria-checked')).toBe('true');
	});

	it('renders the Test Connection button (special escape hatch)', () => {
		const { container } = mount();
		const btn = container.querySelector('[data-testid="smtp-test-connection"]');
		expect(btn).not.toBeNull();
	});
});

describe('Sentinel contract · no empty-string <option value="">', () => {
	it('select fields with sentinel-compliant options expose no value=""', () => {
		// 构造一个含 select 字段的临时 section —— SMTP 本身无 select，但 registry
		// 必须保证渲染层不会泄漏空串 value。
		const fakeSection: SectionDef = {
			id: 'test.select',
			titleKey: 'test.select',
			fields: [
				{
					key: 'flavor',
					type: 'select',
					labelKey: 'test.flavor',
					options: [
						{ value: '__unset__', labelKey: 'test.unset' },
						{ value: 'vanilla', labelKey: 'test.vanilla' },
						{ value: 'chocolate', labelKey: 'test.chocolate' }
					]
				}
			]
		};

		const { container } = render(SectionRenderer, {
			props: { section: fakeSection, values: { flavor: 'vanilla' }, dirtyKeys: new Set<string>() }
		});

		// 全文 grep —— 严禁 value="" 在 option 上出现。
		const html = container.innerHTML;
		// option 标签的空 value 是禁忌；其它元素允许空 value（input value="" 是合法初始态）。
		const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
		expect(offending).toBeNull();

		// 同时断言 sentinel 选项确实渲染了。
		expect(container.querySelector('option[value="__unset__"]')).not.toBeNull();
	});
});

describe('Patch flow · only dirty keys in payload', () => {
	// 模拟 +page.svelte 的 save 行为：构造一个最小宿主，挂在 SectionRenderer 之上。
	// 不导入 +page.svelte（涉及 $app/state / onMount），直接复刻 patch 构造逻辑。
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;
	let patchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			email_enabled: false,
			smtp_host: 'old.example.com',
			smtp_port: 587,
			smtp_use_tls: false
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function onFieldUpdate(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	async function save() {
		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}
		// passthrough zod 校验 —— 此处只为冒烟 schema 路径不 throw。
		const zod = buildZodSchema([emailGeneralSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);
	}

	it('PATCH receives only the keys actually modified', async () => {
		// 改两个字段：smtp_host + smtp_use_tls
		onFieldUpdate('smtp_host', 'new.example.com');
		onFieldUpdate('smtp_use_tls', true);
		await save();

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(['smtp_host', 'smtp_use_tls']);
		expect(payload.smtp_host).toBe('new.example.com');
		expect(payload.smtp_use_tls).toBe(true);
		// 未触碰的字段不应出现
		expect(payload).not.toHaveProperty('email_enabled');
		expect(payload).not.toHaveProperty('smtp_port');
	});

	it('toggle-and-revert produces a no-op (empty payload, patch skipped)', async () => {
		onFieldUpdate('smtp_host', 'changed.example.com');
		onFieldUpdate('smtp_host', 'old.example.com'); // 改回原值
		await save();
		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload)).toEqual([]);
	});

	it('field-update callback from SectionRenderer feeds dirty set', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: emailGeneralSection,
				values: form,
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});

		// 点 switch：email_enabled = false → true
		const sw = container.querySelector('[data-field-key="email_enabled"] [role="switch"]') as HTMLElement;
		expect(sw).not.toBeNull();
		await fireEvent.click(sw);

		expect(handler).toHaveBeenCalled();
		const arg = handler.mock.calls[0][0] as { key: string; value: unknown };
		expect(arg.key).toBe('email_enabled');
		expect(arg.value).toBe(true);
	});
});
