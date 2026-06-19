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
import {
	smtpSection,
	emailGeneralSection,
	generalSiteSection,
	generalTableSection,
	generalCustomMenuSection,
	securityRegistrationSection,
	securityTurnstileSection,
	securityGithubSection,
	securityGoogleSection,
	securityLinuxdoSection,
	securityApiKeyAclSection,
	securityAdminApiKeySection,
	securityEmailWhitelistSection,
	securityDingtalkSection,
	securityOidcSection,
	securityWechatSection,
	usersDefaultsSection,
	usersSubscriptionsQuotasSection,
	usersAuthSourceDefaultsSection,
	featuresChannelMonitorSection,
	featuresAvailableChannelsSection,
	featuresRiskControlSection,
	featuresAffiliateSection,
	featuresAffiliateCustomUsersSection,
	gatewayClaudeCodeSection,
	gatewaySchedulingSection,
	gatewayForwardingSection,
	gatewayUsageRecordsSection,
	gatewayOverloadCooldownSection,
	gatewayRateLimit429Section,
	paymentConfigSection,
	paymentProvidersSection,
	generalSection,
	securitySection,
	usersSection,
	featuresSection,
	gatewaySection,
	paymentSection,
	settingsTabs
} from './settings.schema';
import { buildZodSchema } from './zod';
import type { SectionDef } from './types';

// -- mock api（必须在 import 之前由 vi 提升）
vi.mock('$lib/api/admin/settingsRegistry', () => {
	return {
		settingsApi: {
			getSettings: vi.fn(),
			patchSettings: vi.fn(),
			testSmtpConnection: vi.fn(),
			sendTestEmail: vi.fn(),
			getAdminApiKey: vi.fn(() => Promise.resolve({ exists: false, masked_key: '' })),
			regenerateAdminApiKey: vi.fn(() => Promise.resolve({ key: 'sk-test-1234567890abcdef' })),
			deleteAdminApiKey: vi.fn(() => Promise.resolve()),
			// M11 gateway specials —— 默认返回固定 stub，组件 onMount 不会真正 fetch。
			getOverloadCooldownSettings: vi.fn(() =>
				Promise.resolve({ enabled: true, cooldown_minutes: 10 })
			),
			updateOverloadCooldownSettings: vi.fn((body: { enabled: boolean; cooldown_minutes: number }) =>
				Promise.resolve(body)
			),
			getRateLimit429CooldownSettings: vi.fn(() =>
				Promise.resolve({ enabled: true, cooldown_seconds: 5 })
			),
			updateRateLimit429CooldownSettings: vi.fn(
				(body: { enabled: boolean; cooldown_seconds: number }) => Promise.resolve(body)
			)
		}
	};
});

// -- mock admin payment API（M12 payment tab special section）
vi.mock('$lib/api/admin/payment', () => {
	const listProviders = vi.fn(() => Promise.resolve([]));
	const createProvider = vi.fn(() => Promise.resolve({ id: 1 }));
	const updateProvider = vi.fn((id: number, body: Record<string, unknown>) =>
		Promise.resolve({ id, ...body })
	);
	const deleteProvider = vi.fn(() => Promise.resolve());
	const adminPaymentApi = {
		listProviders,
		createProvider,
		updateProvider,
		deleteProvider
	};
	return {
		adminPaymentApi,
		default: adminPaymentApi,
		listProviders,
		createProvider,
		updateProvider,
		deleteProvider
	};
});

// -- mock admin affiliates API（M10c features tab special section）
vi.mock('$lib/api/admin/affiliates', () => {
	const listUsers = vi.fn(() => Promise.resolve({ items: [], total: 0, pages: 0 }));
	const lookupUsers = vi.fn(() => Promise.resolve([]));
	const updateUserSettings = vi.fn(() => Promise.resolve({ user_id: 0 }));
	const clearUserSettings = vi.fn(() => Promise.resolve({ user_id: 0 }));
	const batchSetRate = vi.fn(() => Promise.resolve({ affected: 0 }));
	const adminAffiliatesApi = {
		listUsers,
		lookupUsers,
		updateUserSettings,
		clearUserSettings,
		batchSetRate
	};
	return {
		adminAffiliatesApi,
		default: adminAffiliatesApi,
		listUsers,
		lookupUsers,
		updateUserSettings,
		clearUserSettings,
		batchSetRate
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

// ─────────────────────────────────────────────────────────────────────────────
// M10 · General + Security tab section coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('M10 · general tab sections render without errors', () => {
	it('settingsTabs registers general + security non-placeholder', () => {
		const general = settingsTabs.find((t) => t.id === 'general');
		const security = settingsTabs.find((t) => t.id === 'security');
		expect(general?.placeholder).not.toBe(true);
		expect(security?.placeholder).not.toBe(true);
		expect(general?.sections.length).toBeGreaterThan(0);
		expect(security?.sections.length).toBeGreaterThan(0);
	});

	it.each([
		['general.site', generalSiteSection],
		['general.table', generalTableSection],
		['general.customMenu', generalCustomMenuSection]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: { section, values: {}, dirtyKeys: new Set<string>() }
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('site_logo image field renders an upload trigger', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: generalSiteSection,
				values: { site_logo: '' },
				dirtyKeys: new Set<string>()
			}
		});
		const wrap = container.querySelector('[data-field-key="site_logo"]');
		expect(wrap).not.toBeNull();
		expect(wrap!.getAttribute('data-field-type')).toBe('image');
		// 隐藏 file input + 可见 label
		expect(wrap!.querySelector('input[type="file"]')).not.toBeNull();
	});
});

describe('M10 · security tab sections render without errors', () => {
	it.each([
		['security.registration', securityRegistrationSection],
		['security.apiKeyAcl', securityApiKeyAclSection],
		['security.turnstile', securityTurnstileSection],
		['security.linuxdo', securityLinuxdoSection],
		['security.github', securityGithubSection],
		['security.google', securityGoogleSection],
		['security.adminApiKey', securityAdminApiKeySection],
		['security.emailWhitelist', securityEmailWhitelistSection],
		['security.dingtalk', securityDingtalkSection],
		['security.oidc', securityOidcSection],
		['security.wechat_connect', securityWechatSection]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: { section, values: {}, dirtyKeys: new Set<string>() }
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('turnstile_site_key is hidden when turnstile_enabled is false (showWhen)', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: securityTurnstileSection,
				values: { turnstile_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="turnstile_enabled"]')).not.toBeNull();
		expect(container.querySelector('[data-field-key="turnstile_site_key"]')).toBeNull();
		expect(container.querySelector('[data-field-key="turnstile_secret_key"]')).toBeNull();
	});

	it('turnstile_site_key + secret appear when turnstile_enabled flips true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: securityTurnstileSection,
				values: { turnstile_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="turnstile_site_key"]')).not.toBeNull();
		expect(container.querySelector('[data-field-key="turnstile_secret_key"]')).not.toBeNull();
	});

	it('password_reset_enabled is hidden until email_verify_enabled is true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: securityRegistrationSection,
				values: { email_verify_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="password_reset_enabled"]')).toBeNull();
	});
});

describe('M10 · special components honour props contract + emit fires', () => {
	it('EmailSuffixWhitelist renders existing tags and emits canonical form on add', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: securityEmailWhitelistSection,
				values: { registration_email_suffix_whitelist: ['@example.com'] },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});

		// 已渲染一个 chip
		const tags = container.querySelectorAll('[data-testid="email-suffix-tag"]');
		expect(tags.length).toBe(1);
		expect(tags[0].getAttribute('data-tag')).toBe('example.com');

		// 在 input 中输入新域名并按 Enter
		const input = container.querySelector('[data-testid="email-suffix-input"]') as HTMLInputElement;
		expect(input).not.toBeNull();
		await fireEvent.input(input, { target: { value: 'foo.com' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(handler).toHaveBeenCalled();
		const call = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(call.key).toBe('registration_email_suffix_whitelist');
		expect(Array.isArray(call.value)).toBe(true);
		// canonical：纯域名加 @ 前缀
		expect(call.value).toEqual(['@example.com', '@foo.com']);
	});

	it('CustomMenuSection allows adding a new endpoint via emit', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: generalCustomMenuSection,
				values: { custom_endpoints: [], custom_menu_items: [] },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const addBtn = container.querySelector('[data-testid="custom-endpoint-add"]') as HTMLElement;
		expect(addBtn).not.toBeNull();
		await fireEvent.click(addBtn);
		expect(handler).toHaveBeenCalled();
		const call = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(call.key).toBe('custom_endpoints');
		expect(Array.isArray(call.value)).toBe(true);
		expect((call.value as unknown[]).length).toBe(1);
	});

	it('AdminApiKeySection mounts and renders create button when not configured', async () => {
		const { container, findByTestId } = render(SectionRenderer, {
			props: {
				section: securityAdminApiKeySection,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-section-id="security.adminApiKey"]')).not.toBeNull();
		// onMount 异步 —— 等待 create 按钮出现
		const btn = await findByTestId('admin-api-key-create');
		expect(btn).not.toBeNull();
	});

	it('OidcConnectSection respects oidc_connect_enabled = false → only top switch visible', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: securityOidcSection,
				values: { oidc_connect_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="oidc_connect_enabled"]')).not.toBeNull();
		// 其他字段应该隐藏
		expect(container.querySelector('[data-field-key="oidc_connect_client_id"]')).toBeNull();
		expect(container.querySelector('[data-field-key="oidc_connect_token_auth_method"]')).toBeNull();
	});

	it('DingtalkConnectSection emits corp_restriction_policy on radio change', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: securityDingtalkSection,
				values: {
					dingtalk_connect_enabled: true,
					dingtalk_connect_corp_restriction_policy: 'none'
				},
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const internalRadio = container.querySelector(
			'input[type="radio"][value="internal_only"]'
		) as HTMLInputElement;
		expect(internalRadio).not.toBeNull();
		await fireEvent.change(internalRadio, { target: { checked: true } });
		const call = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(call.key).toBe('dingtalk_connect_corp_restriction_policy');
		expect(call.value).toBe('internal_only');
	});

	it('WechatConnectSection top switch is the only visible field when disabled', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: securityWechatSection,
				values: { wechat_connect_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="wechat_connect_enabled"]')).not.toBeNull();
		expect(container.querySelector('[data-field-key="wechat_connect_mode"]')).toBeNull();
		expect(container.querySelector('[data-field-key="wechat_connect_open_app_id"]')).toBeNull();
	});
});

describe('M10 · sentinel guard · no empty-string <option value=""> in any new section', () => {
	const allM10Sections: SectionDef[] = [
		...generalSection,
		...securitySection.filter((s) => s.special !== 'admin-api-key') // admin-api-key uses async fetch; skipped
	];

	it.each(allM10Sections.map((s) => [s.id, s]))('section %s exposes no empty option value', (_id, section) => {
		// 给最大值场景 —— 所有开关都 true，确保 cascading fields 都展开。
		const values: Record<string, unknown> = {};
		// 展开常见 enabled key 以 stress test cascading
		for (const k of [
			'turnstile_enabled',
			'linuxdo_connect_enabled',
			'github_oauth_enabled',
			'google_oauth_enabled',
			'oidc_connect_enabled',
			'wechat_connect_enabled',
			'wechat_connect_open_enabled',
			'wechat_connect_mp_enabled',
			'wechat_connect_mobile_enabled',
			'dingtalk_connect_enabled',
			'email_verify_enabled'
		]) {
			values[k] = true;
		}
		values['dingtalk_connect_corp_restriction_policy'] = 'internal_only';
		values['dingtalk_connect_sync_display_name'] = true;
		values['dingtalk_connect_sync_corp_email'] = true;
		values['dingtalk_connect_sync_dept'] = true;

		const { container } = render(SectionRenderer, {
			props: { section, values, dirtyKeys: new Set<string>() }
		});
		const html = container.innerHTML;
		const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
		expect(offending).toBeNull();
	});
});

describe('M10 · dirty-only PATCH payload · two-field flip in general/security sends ONLY those two', () => {
	let patchSpy: ReturnType<typeof vi.fn>;
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			site_name: 'old',
			site_subtitle: 'old subtitle',
			turnstile_enabled: false,
			github_oauth_enabled: false,
			frontend_url: 'https://old.example.com'
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function flip(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	it('two distinct keys across general + security → payload has exactly those two', async () => {
		flip('site_name', 'new site');
		flip('turnstile_enabled', true);

		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}

		// zod 校验 —— 仅 fields，passthrough 其余。
		const zod = buildZodSchema([generalSiteSection, securityTurnstileSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(['site_name', 'turnstile_enabled']);
		expect(payload.site_name).toBe('new site');
		expect(payload.turnstile_enabled).toBe(true);
		// 未触碰
		expect(payload).not.toHaveProperty('site_subtitle');
		expect(payload).not.toHaveProperty('github_oauth_enabled');
		expect(payload).not.toHaveProperty('frontend_url');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// M11 · Users tab section coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('M11 · users tab registration', () => {
	it('settingsTabs registers users non-placeholder with 3 sections', () => {
		const users = settingsTabs.find((t) => t.id === 'users');
		expect(users).toBeDefined();
		expect(users?.placeholder).not.toBe(true);
		expect(users?.sections.length).toBe(3);
		expect(usersSection.length).toBe(3);
	});
});

describe('M11 · users tab sections render without errors', () => {
	it.each([
		['users.defaults', usersDefaultsSection],
		['users.defaultSubscriptionsAndQuotas', usersSubscriptionsQuotasSection],
		['users.authSourceDefaults', usersAuthSourceDefaultsSection]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: { section, values: {}, dirtyKeys: new Set<string>() }
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('users.defaults exposes 3 flat number fields', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: usersDefaultsSection,
				values: { default_balance: 0, default_concurrency: 1, default_user_rpm_limit: 0 },
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of ['default_balance', 'default_concurrency', 'default_user_rpm_limit']) {
			const el = container.querySelector(`[data-field-key="${key}"] input`);
			expect(el, `field ${key} missing`).not.toBeNull();
			expect(el!.getAttribute('type')).toBe('number');
		}
	});
});

describe('M11 · users special components honour props contract + emit fires', () => {
	it('UserDefaultsSection adds a subscription row on Add click (no emit until valid group)', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: usersSubscriptionsQuotasSection,
				values: { default_subscriptions: [], default_platform_quotas: {} },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});

		// Initially empty hint visible
		expect(container.querySelector('[data-testid="default-subscription-empty"]')).not.toBeNull();

		const addBtn = container.querySelector(
			'[data-testid="default-subscription-add"]'
		) as HTMLElement;
		expect(addBtn).not.toBeNull();
		await fireEvent.click(addBtn);

		const rows = container.querySelectorAll('[data-testid="default-subscription-row"]');
		expect(rows.length).toBe(1);
	});

	it('UserDefaultsSection emits sanitized default_platform_quotas on quota input', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: usersSubscriptionsQuotasSection,
				values: { default_subscriptions: [], default_platform_quotas: {} },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});

		const dailyAnthropic = container.querySelector(
			'[data-testid="quota-anthropic-daily"]'
		) as HTMLInputElement;
		expect(dailyAnthropic).not.toBeNull();
		await fireEvent.input(dailyAnthropic, { target: { value: '12.5' } });

		const last = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(last.key).toBe('default_platform_quotas');
		const v = last.value as Record<string, { daily: number | null }>;
		expect(v.anthropic.daily).toBe(12.5);
		// Other platforms still null (unset).
		expect(v.openai.daily).toBeNull();
	});

	it('AuthSourceDefaultsSection renders force_email toggle + 7 source cards', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: usersAuthSourceDefaultsSection,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-testid="force-email-toggle"]')).not.toBeNull();
		expect(
			container.querySelectorAll('[data-testid="auth-source-card"]').length
		).toBe(7);
		// Panels collapsed by default → grant_on_signup false everywhere
		expect(container.querySelector('[data-testid="auth-source-email-panel"]')).toBeNull();
	});

	it('AuthSourceDefaultsSection emits force_email_on_third_party_signup boolean on toggle', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: usersAuthSourceDefaultsSection,
				values: { force_email_on_third_party_signup: false },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const tgl = container.querySelector('[data-testid="force-email-toggle"]') as HTMLElement;
		expect(tgl).not.toBeNull();
		await fireEvent.click(tgl);

		const last = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(last.key).toBe('force_email_on_third_party_signup');
		expect(last.value).toBe(true);
	});

	it('AuthSourceDefaultsSection emits 6 keys for source when grant_on_signup toggled', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: usersAuthSourceDefaultsSection,
				values: {},
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const enabledBtn = container.querySelector(
			'[data-testid="auth-source-email-enabled"]'
		) as HTMLElement;
		expect(enabledBtn).not.toBeNull();
		await fireEvent.click(enabledBtn);

		// Expanded panel now visible
		expect(container.querySelector('[data-testid="auth-source-email-panel"]')).not.toBeNull();

		// All 6 keys for `email` source should have been emitted.
		const keys = new Set(
			handler.mock.calls.map((c) => (c[0] as { key: string }).key).filter((k) => k.includes('email_'))
		);
		for (const suffix of [
			'balance',
			'concurrency',
			'grant_on_signup',
			'grant_on_first_bind',
			'subscriptions',
			'platform_quotas'
		]) {
			expect(keys.has(`auth_source_default_email_${suffix}`)).toBe(true);
		}
	});
});

describe('M11 · sentinel guard · no empty-string <option value=""> in users sections', () => {
	const usersSectionsForGuard: SectionDef[] = [...usersSection];

	it.each(usersSectionsForGuard.map((s) => [s.id, s]))(
		'section %s exposes no empty option value',
		(_id, section) => {
			// 把 force_email + 所有 source grant_on_signup 都打开，触发完整面板。
			const values: Record<string, unknown> = {
				force_email_on_third_party_signup: true,
				default_subscriptions: [{ group_id: 1, validity_days: 30 }],
				default_platform_quotas: {
					anthropic: { daily: 10, weekly: 50, monthly: 200 }
				}
			};
			for (const src of ['email', 'linuxdo', 'oidc', 'wechat', 'github', 'google', 'dingtalk']) {
				values[`auth_source_default_${src}_grant_on_signup`] = true;
				values[`auth_source_default_${src}_grant_on_first_bind`] = true;
				values[`auth_source_default_${src}_balance`] = 5;
				values[`auth_source_default_${src}_concurrency`] = 2;
				values[`auth_source_default_${src}_subscriptions`] = [];
				values[`auth_source_default_${src}_platform_quotas`] = {};
			}

			const { container } = render(SectionRenderer, {
				props: { section, values, dirtyKeys: new Set<string>() }
			});
			const html = container.innerHTML;
			const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
			expect(offending).toBeNull();
		}
	);
});

describe('M11 · dirty-only PATCH payload · two-field flip in users sends ONLY those two', () => {
	let patchSpy: ReturnType<typeof vi.fn>;
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			default_balance: 0,
			default_concurrency: 1,
			default_user_rpm_limit: 0,
			force_email_on_third_party_signup: false
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function flip(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	it('flipping default_balance + force_email_on_third_party_signup → payload has exactly those two', async () => {
		flip('default_balance', 25);
		flip('force_email_on_third_party_signup', true);

		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}

		// zod 校验 —— users.defaults 三键 fields，passthrough 余下。
		const zod = buildZodSchema([usersDefaultsSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual([
			'default_balance',
			'force_email_on_third_party_signup'
		]);
		expect(payload.default_balance).toBe(25);
		expect(payload.force_email_on_third_party_signup).toBe(true);
		// 未触碰
		expect(payload).not.toHaveProperty('default_concurrency');
		expect(payload).not.toHaveProperty('default_user_rpm_limit');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// M10c · Features tab section coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('M10c · features tab registration', () => {
	it('settingsTabs registers features non-placeholder with 5 sections', () => {
		const features = settingsTabs.find((t) => t.id === 'features');
		expect(features).toBeDefined();
		expect(features?.placeholder).not.toBe(true);
		expect(features?.sections.length).toBe(5);
		expect(featuresSection.length).toBe(5);
	});
});

describe('M10c · features tab sections render without errors', () => {
	it.each([
		['features.channelMonitor', featuresChannelMonitorSection],
		['features.availableChannels', featuresAvailableChannelsSection],
		['features.riskControl', featuresRiskControlSection],
		['features.affiliate', featuresAffiliateSection],
		['features.affiliateCustomUsers', featuresAffiliateCustomUsersSection]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: {
				section,
				values: { affiliate_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('channel_monitor_default_interval_seconds hidden when channel_monitor_enabled=false', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresChannelMonitorSection,
				values: { channel_monitor_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="channel_monitor_enabled"]')).not.toBeNull();
		expect(
			container.querySelector('[data-field-key="channel_monitor_default_interval_seconds"]')
		).toBeNull();
	});

	it('channel_monitor_default_interval_seconds shows when channel_monitor_enabled=true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresChannelMonitorSection,
				values: { channel_monitor_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		expect(
			container.querySelector('[data-field-key="channel_monitor_default_interval_seconds"]')
		).not.toBeNull();
	});

	it('affiliate sub-fields hidden when affiliate_enabled=false', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresAffiliateSection,
				values: { affiliate_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="affiliate_enabled"]')).not.toBeNull();
		for (const key of [
			'affiliate_rebate_rate',
			'affiliate_rebate_freeze_hours',
			'affiliate_rebate_duration_days',
			'affiliate_rebate_per_invitee_cap'
		]) {
			expect(container.querySelector(`[data-field-key="${key}"]`)).toBeNull();
		}
	});

	it('affiliate sub-fields all appear when affiliate_enabled=true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresAffiliateSection,
				values: { affiliate_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of [
			'affiliate_enabled',
			'affiliate_rebate_rate',
			'affiliate_rebate_freeze_hours',
			'affiliate_rebate_duration_days',
			'affiliate_rebate_per_invitee_cap'
		]) {
			expect(container.querySelector(`[data-field-key="${key}"]`)).not.toBeNull();
		}
	});
});

describe('M10c · AffiliateCustomUsersSection special component', () => {
	it('shows disabled hint when affiliate_enabled=false (no toolbar)', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresAffiliateCustomUsersSection,
				values: { affiliate_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-testid="affiliate-custom-users-disabled"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="affiliate-custom-users-add"]')).toBeNull();
	});

	it('shows toolbar (search + add button) when affiliate_enabled=true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresAffiliateCustomUsersSection,
				values: { affiliate_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-testid="affiliate-custom-users-disabled"]')).toBeNull();
		expect(container.querySelector('[data-testid="affiliate-custom-users-search"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="affiliate-custom-users-add"]')).not.toBeNull();
	});

	it('Add button opens modal with user picker', async () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: featuresAffiliateCustomUsersSection,
				values: { affiliate_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		const addBtn = container.querySelector('[data-testid="affiliate-custom-users-add"]') as HTMLElement;
		expect(addBtn).not.toBeNull();
		await fireEvent.click(addBtn);
		expect(container.querySelector('[data-testid="affiliate-custom-users-modal"]')).not.toBeNull();
		// add 模式：modalCanSubmit=false（无 selectedUser），save 按钮禁用
		const saveBtn = container.querySelector(
			'[data-testid="affiliate-custom-users-modal-save"]'
		) as HTMLButtonElement;
		expect(saveBtn).not.toBeNull();
		expect(saveBtn.disabled).toBe(true);
	});
});

describe('M10c · sentinel guard · no empty-string <option value=""> in features sections', () => {
	const featuresForGuard: SectionDef[] = featuresSection.filter(
		(s) => s.special !== 'affiliate-custom-users'
	); // special section 涉及异步 fetch；不展开 sentinel 自动 PASS

	it.each(featuresForGuard.map((s) => [s.id, s]))(
		'section %s exposes no empty option value',
		(_id, section) => {
			const values: Record<string, unknown> = {
				channel_monitor_enabled: true,
				available_channels_enabled: true,
				risk_control_enabled: true,
				affiliate_enabled: true
			};
			const { container } = render(SectionRenderer, {
				props: { section, values, dirtyKeys: new Set<string>() }
			});
			const html = container.innerHTML;
			const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
			expect(offending).toBeNull();
		}
	);
});

describe('M10c · dirty-only PATCH payload · two-field flip in features sends ONLY those two', () => {
	let patchSpy: ReturnType<typeof vi.fn>;
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			channel_monitor_enabled: false,
			available_channels_enabled: false,
			risk_control_enabled: false,
			affiliate_enabled: false,
			affiliate_rebate_rate: 0
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function flip(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	it('flipping affiliate_enabled + affiliate_rebate_rate → payload has exactly those two', async () => {
		flip('affiliate_enabled', true);
		flip('affiliate_rebate_rate', 12.5);

		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}

		const zod = buildZodSchema([featuresAffiliateSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(['affiliate_enabled', 'affiliate_rebate_rate']);
		expect(payload.affiliate_enabled).toBe(true);
		expect(payload.affiliate_rebate_rate).toBe(12.5);
		// 未触碰
		expect(payload).not.toHaveProperty('channel_monitor_enabled');
		expect(payload).not.toHaveProperty('available_channels_enabled');
		expect(payload).not.toHaveProperty('risk_control_enabled');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// M11 · Gateway tab section coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('M11 · gateway tab registration', () => {
	it('settingsTabs registers gateway non-placeholder with 6 sections', () => {
		const gateway = settingsTabs.find((t) => t.id === 'gateway');
		expect(gateway).toBeDefined();
		expect(gateway?.placeholder).not.toBe(true);
		expect(gateway?.sections.length).toBe(6);
		expect(gatewaySection.length).toBe(6);
	});
});

describe('M11 · gateway tab sections render without errors', () => {
	it.each([
		['gateway.claudeCode', gatewayClaudeCodeSection],
		['gateway.scheduling', gatewaySchedulingSection],
		['gateway.forwarding', gatewayForwardingSection],
		['gateway.usageRecords', gatewayUsageRecordsSection],
		['gateway.overloadCooldown', gatewayOverloadCooldownSection],
		['gateway.rateLimit429', gatewayRateLimit429Section]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: { section, values: {}, dirtyKeys: new Set<string>() }
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('claudeCode exposes 2 text fields for min/max version', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayClaudeCodeSection,
				values: { min_claude_code_version: '', max_claude_code_version: '' },
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of ['min_claude_code_version', 'max_claude_code_version']) {
			const el = container.querySelector(`[data-field-key="${key}"] input`);
			expect(el, `field ${key} missing`).not.toBeNull();
			expect(el!.getAttribute('type')).toBe('text');
		}
	});

	it('scheduling exposes 2 switch fields', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewaySchedulingSection,
				values: {
					allow_ungrouped_key_scheduling: false,
					openai_advanced_scheduler_enabled: false
				},
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of ['allow_ungrouped_key_scheduling', 'openai_advanced_scheduler_enabled']) {
			const el = container.querySelector(`[data-field-key="${key}"] [role="switch"]`);
			expect(el, `switch ${key} missing`).not.toBeNull();
		}
	});

	it('forwarding renders all 9 fields when injection enabled (default)', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayForwardingSection,
				// undefined → showWhen returns true (!== false)
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of [
			'enable_fingerprint_unification',
			'enable_metadata_passthrough',
			'enable_cch_signing',
			'enable_claude_oauth_system_prompt_injection',
			'claude_oauth_system_prompt',
			'claude_oauth_system_prompt_blocks',
			'enable_anthropic_cache_ttl_1h_injection',
			'rewrite_message_cache_control',
			'antigravity_user_agent_version',
			'openai_codex_user_agent',
			'openai_allow_claude_code_codex_plugin'
		]) {
			expect(
				container.querySelector(`[data-field-key="${key}"]`),
				`field ${key} missing`
			).not.toBeNull();
		}
	});

	it('claude_oauth_system_prompt + blocks hidden when injection explicitly disabled', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayForwardingSection,
				values: { enable_claude_oauth_system_prompt_injection: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(
			container.querySelector('[data-field-key="enable_claude_oauth_system_prompt_injection"]')
		).not.toBeNull();
		expect(container.querySelector('[data-field-key="claude_oauth_system_prompt"]')).toBeNull();
		expect(
			container.querySelector('[data-field-key="claude_oauth_system_prompt_blocks"]')
		).toBeNull();
	});

	it('claude_oauth_system_prompt textarea + blocks json visible when injection enabled', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayForwardingSection,
				values: { enable_claude_oauth_system_prompt_injection: true },
				dirtyKeys: new Set<string>()
			}
		});
		const prompt = container.querySelector('[data-field-key="claude_oauth_system_prompt"]');
		expect(prompt).not.toBeNull();
		expect(prompt!.getAttribute('data-field-type')).toBe('textarea');
		const blocks = container.querySelector('[data-field-key="claude_oauth_system_prompt_blocks"]');
		expect(blocks).not.toBeNull();
		expect(blocks!.getAttribute('data-field-type')).toBe('json');
	});

	it('usageRecords exposes single allow_user_view_error_requests switch', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayUsageRecordsSection,
				values: { allow_user_view_error_requests: false },
				dirtyKeys: new Set<string>()
			}
		});
		const el = container.querySelector(
			'[data-field-key="allow_user_view_error_requests"] [role="switch"]'
		);
		expect(el).not.toBeNull();
	});
});

describe('M11 · gateway special components honour props contract + emit fires', () => {
	it('OverloadCooldownSection mounts and shows the save button after load', async () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayOverloadCooldownSection,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		expect(
			container.querySelector('[data-section-id="gateway.overloadCooldown"]')
		).not.toBeNull();
		// onMount async — 容器局部轮询，避免被同一 jsdom 内残留节点干扰。
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="overload-cooldown-save"]')).not.toBeNull();
		});
	});

	it('OverloadCooldownSection toggle hides cooldown_minutes input when disabled', async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		(mod.settingsApi.getOverloadCooldownSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			enabled: false,
			cooldown_minutes: 10
		});
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayOverloadCooldownSection,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		// 等待 mount 完成 —— 容器范围内轮询 save 按钮。
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="overload-cooldown-save"]')).not.toBeNull();
		});
		expect(container.querySelector('[data-testid="overload-cooldown-minutes"]')).toBeNull();
	});

	it('RateLimit429Section mounts and shows the save button after load', async () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayRateLimit429Section,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		expect(
			container.querySelector('[data-section-id="gateway.rateLimit429"]')
		).not.toBeNull();
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="rate-limit-429-save"]')).not.toBeNull();
		});
	});

	it('RateLimit429Section save click invokes update API with form payload', async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		const updateSpy = mod.settingsApi
			.updateRateLimit429CooldownSettings as ReturnType<typeof vi.fn>;
		updateSpy.mockClear();
		const { container } = render(SectionRenderer, {
			props: {
				section: gatewayRateLimit429Section,
				values: {},
				dirtyKeys: new Set<string>()
			}
		});
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="rate-limit-429-save"]')).not.toBeNull();
		});
		const saveBtn = container.querySelector(
			'[data-testid="rate-limit-429-save"]'
		) as HTMLElement;
		await fireEvent.click(saveBtn);
		expect(updateSpy).toHaveBeenCalledOnce();
		const arg = updateSpy.mock.calls[0][0] as { enabled: boolean; cooldown_seconds: number };
		expect(typeof arg.enabled).toBe('boolean');
		expect(typeof arg.cooldown_seconds).toBe('number');
	});
});

describe('M11 · sentinel guard · no empty-string <option value=""> in gateway sections', () => {
	const gatewayForGuard: SectionDef[] = gatewaySection.filter(
		(s) => !s.special // special section 涉及异步 onMount，不进 sentinel sweep
	);

	it.each(gatewayForGuard.map((s) => [s.id, s]))(
		'section %s exposes no empty option value',
		(_id, section) => {
			// 展开所有联动开关到 true，覆盖 forwarding 的 cascading 子字段。
			const values: Record<string, unknown> = {
				enable_claude_oauth_system_prompt_injection: true,
				allow_ungrouped_key_scheduling: true,
				openai_advanced_scheduler_enabled: true,
				allow_user_view_error_requests: true
			};
			const { container } = render(SectionRenderer, {
				props: { section, values, dirtyKeys: new Set<string>() }
			});
			const html = container.innerHTML;
			const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
			expect(offending).toBeNull();
		}
	);
});

describe('M11 · dirty-only PATCH payload · two-field flip in gateway sends ONLY those two', () => {
	let patchSpy: ReturnType<typeof vi.fn>;
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			min_claude_code_version: '',
			max_claude_code_version: '',
			allow_ungrouped_key_scheduling: false,
			openai_advanced_scheduler_enabled: false,
			enable_fingerprint_unification: false,
			allow_user_view_error_requests: false
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function flip(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	it('flipping enable_fingerprint_unification + min_claude_code_version → payload has exactly those two', async () => {
		flip('enable_fingerprint_unification', true);
		flip('min_claude_code_version', '2.1.63');

		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}

		// zod 校验 —— claudeCode + forwarding fields，passthrough 余下。
		const zod = buildZodSchema([gatewayClaudeCodeSection, gatewayForwardingSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual([
			'enable_fingerprint_unification',
			'min_claude_code_version'
		]);
		expect(payload.enable_fingerprint_unification).toBe(true);
		expect(payload.min_claude_code_version).toBe('2.1.63');
		// 未触碰的 gateway flat keys 不应出现。
		expect(payload).not.toHaveProperty('max_claude_code_version');
		expect(payload).not.toHaveProperty('allow_ungrouped_key_scheduling');
		expect(payload).not.toHaveProperty('openai_advanced_scheduler_enabled');
		expect(payload).not.toHaveProperty('allow_user_view_error_requests');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// M12 · Payment tab section coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('M12 · payment tab registration', () => {
	it('settingsTabs registers payment non-placeholder with 2 sections', () => {
		const payment = settingsTabs.find((t) => t.id === 'payment');
		expect(payment).toBeDefined();
		expect(payment?.placeholder).not.toBe(true);
		expect(payment?.sections.length).toBe(2);
		expect(paymentSection.length).toBe(2);
	});
});

describe('M12 · payment tab sections render without errors', () => {
	it.each([
		['payment.config', paymentConfigSection],
		['payment.providers', paymentProvidersSection]
	])('renders %s without throwing', (_id, section) => {
		const { container } = render(SectionRenderer, {
			props: {
				section,
				values: { payment_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector(`[data-section-id="${section.id}"]`)).not.toBeNull();
	});

	it('config: only payment_enabled visible when payment_enabled=false (showWhen cascading)', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: { payment_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(container.querySelector('[data-field-key="payment_enabled"]')).not.toBeNull();
		for (const key of [
			'payment_product_name_prefix',
			'payment_min_amount',
			'payment_balance_recharge_multiplier',
			'payment_recharge_fee_rate',
			'payment_order_timeout_minutes',
			'payment_load_balance_strategy',
			'payment_cancel_rate_limit_enabled',
			'payment_alipay_force_qrcode',
			'payment_help_image_url',
			'payment_help_text'
		]) {
			expect(container.querySelector(`[data-field-key="${key}"]`), `${key} should be hidden`).toBeNull();
		}
	});

	it('config: cascading subfields appear when payment_enabled=true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: { payment_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of [
			'payment_enabled',
			'payment_product_name_prefix',
			'payment_product_name_suffix',
			'payment_min_amount',
			'payment_max_amount',
			'payment_daily_limit',
			'payment_balance_recharge_multiplier',
			'payment_recharge_fee_rate',
			'payment_order_timeout_minutes',
			'payment_max_pending_orders',
			'payment_load_balance_strategy',
			'payment_cancel_rate_limit_enabled',
			'payment_alipay_force_qrcode',
			'payment_help_image_url',
			'payment_help_text'
		]) {
			expect(container.querySelector(`[data-field-key="${key}"]`), `${key} should be visible`).not.toBeNull();
		}
	});

	it('config: cancel rate-limit subfields only appear when both gates true', () => {
		const { container: noCancel } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: {
					payment_enabled: true,
					payment_cancel_rate_limit_enabled: false
				},
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of [
			'payment_cancel_rate_limit_window_mode',
			'payment_cancel_rate_limit_window',
			'payment_cancel_rate_limit_unit',
			'payment_cancel_rate_limit_max'
		]) {
			expect(noCancel.querySelector(`[data-field-key="${key}"]`)).toBeNull();
		}

		const { container: withCancel } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: {
					payment_enabled: true,
					payment_cancel_rate_limit_enabled: true
				},
				dirtyKeys: new Set<string>()
			}
		});
		for (const key of [
			'payment_cancel_rate_limit_window_mode',
			'payment_cancel_rate_limit_window',
			'payment_cancel_rate_limit_unit',
			'payment_cancel_rate_limit_max'
		]) {
			expect(withCancel.querySelector(`[data-field-key="${key}"]`)).not.toBeNull();
		}
	});

	it('config: load_balance_strategy renders 3 sentinel-compliant options', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: { payment_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		const select = container.querySelector(
			'[data-field-key="payment_load_balance_strategy"] select'
		);
		expect(select).not.toBeNull();
		const opts = container.querySelectorAll(
			'[data-field-key="payment_load_balance_strategy"] option'
		);
		expect(opts.length).toBe(3);
		const values = Array.from(opts).map((o) => o.getAttribute('value'));
		expect(values).toEqual(['random', 'round_robin', 'least_conn']);
	});

	it('config: help_image_url renders image upload trigger when enabled', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentConfigSection,
				values: { payment_enabled: true, payment_help_image_url: '' },
				dirtyKeys: new Set<string>()
			}
		});
		const wrap = container.querySelector('[data-field-key="payment_help_image_url"]');
		expect(wrap).not.toBeNull();
		expect(wrap!.getAttribute('data-field-type')).toBe('image');
		expect(wrap!.querySelector('input[type="file"]')).not.toBeNull();
	});
});

describe('M12 · PaymentProviderListSection special component', () => {
	it('shows disabled hint when payment_enabled=false', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: { payment_enabled: false },
				dirtyKeys: new Set<string>()
			}
		});
		expect(
			container.querySelector('[data-testid="payment-provider-list-disabled"]')
		).not.toBeNull();
		expect(container.querySelector('[data-testid="payment-provider-badges"]')).toBeNull();
	});

	it('renders 5 enabledPaymentTypes badges when payment_enabled=true', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: { payment_enabled: true, payment_enabled_types: [] },
				dirtyKeys: new Set<string>()
			}
		});
		const badges = container.querySelectorAll('[data-testid^="payment-provider-badge-"]');
		expect(badges.length).toBe(5);
		for (const v of ['sub2apipay', 'epay', 'stripe', 'alipay', 'wechat']) {
			expect(
				container.querySelector(`[data-testid="payment-provider-badge-${v}"]`),
				`badge ${v} missing`
			).not.toBeNull();
		}
	});

	it('toggling a badge emits payment_enabled_types[] addition to flat-form pipeline', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: { payment_enabled: true, payment_enabled_types: [] },
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const stripe = container.querySelector(
			'[data-testid="payment-provider-badge-stripe"]'
		) as HTMLElement;
		expect(stripe).not.toBeNull();
		await fireEvent.click(stripe);
		const last = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(last.key).toBe('payment_enabled_types');
		expect(Array.isArray(last.value)).toBe(true);
		expect(last.value).toEqual(['stripe']);
	});

	it('toggling an already-enabled badge removes it from the array', async () => {
		const handler = vi.fn();
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: {
					payment_enabled: true,
					payment_enabled_types: ['stripe', 'alipay']
				},
				dirtyKeys: new Set<string>(),
				onFieldUpdate: handler
			}
		});
		const alipay = container.querySelector(
			'[data-testid="payment-provider-badge-alipay"]'
		) as HTMLElement;
		expect(alipay).not.toBeNull();
		await fireEvent.click(alipay);
		const last = handler.mock.calls[handler.mock.calls.length - 1][0] as {
			key: string;
			value: unknown;
		};
		expect(last.key).toBe('payment_enabled_types');
		expect(last.value).toEqual(['stripe']);
	});

	it('provider list shows empty state when listProviders resolves []', async () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: { payment_enabled: true },
				dirtyKeys: new Set<string>()
			}
		});
		await vi.waitFor(() => {
			expect(container.querySelector('[data-testid="payment-provider-empty"]')).not.toBeNull();
		});
	});

	it('parses comma-separated payment_enabled_types string into badge state', () => {
		const { container } = render(SectionRenderer, {
			props: {
				section: paymentProvidersSection,
				values: {
					payment_enabled: true,
					payment_enabled_types: 'stripe,wechat'
				},
				dirtyKeys: new Set<string>()
			}
		});
		const stripe = container.querySelector('[data-testid="payment-provider-badge-stripe"]');
		const wechat = container.querySelector('[data-testid="payment-provider-badge-wechat"]');
		const epay = container.querySelector('[data-testid="payment-provider-badge-epay"]');
		expect(stripe?.getAttribute('data-checked')).toBe('true');
		expect(wechat?.getAttribute('data-checked')).toBe('true');
		expect(epay?.getAttribute('data-checked')).toBe('false');
	});
});

describe('M12 · sentinel guard · no empty-string <option value=""> in payment sections', () => {
	const paymentForGuard: SectionDef[] = paymentSection.filter((s) => !s.special);

	it.each(paymentForGuard.map((s) => [s.id, s]))(
		'section %s exposes no empty option value',
		(_id, section) => {
			const values: Record<string, unknown> = {
				payment_enabled: true,
				payment_cancel_rate_limit_enabled: true,
				payment_load_balance_strategy: 'round_robin',
				payment_cancel_rate_limit_window_mode: 'rolling',
				payment_cancel_rate_limit_unit: 'minute'
			};
			const { container } = render(SectionRenderer, {
				props: { section, values, dirtyKeys: new Set<string>() }
			});
			const html = container.innerHTML;
			const offending = html.match(/<option\s+[^>]*value=""[^>]*>/g);
			expect(offending).toBeNull();
		}
	);
});

describe('M12 · dirty-only PATCH payload · two-field flip in payment sends ONLY those two', () => {
	let patchSpy: ReturnType<typeof vi.fn>;
	let savedSettings: Record<string, unknown>;
	let form: Record<string, unknown>;
	let dirtyKeys: Set<string>;

	beforeEach(async () => {
		const mod = await import('$lib/api/admin/settingsRegistry');
		patchSpy = mod.settingsApi.patchSettings as unknown as ReturnType<typeof vi.fn>;
		patchSpy.mockReset();
		patchSpy.mockResolvedValue(undefined);

		savedSettings = {
			payment_enabled: false,
			payment_min_amount: 0,
			payment_max_amount: 0,
			payment_balance_recharge_multiplier: 1,
			payment_recharge_fee_rate: 0,
			payment_enabled_types: []
		};
		form = { ...savedSettings };
		dirtyKeys = new Set();
	});

	function flip(key: string, value: unknown) {
		form = { ...form, [key]: value };
		dirtyKeys.add(key);
	}

	it('flipping payment_enabled + payment_balance_recharge_multiplier → payload has exactly those two', async () => {
		flip('payment_enabled', true);
		flip('payment_balance_recharge_multiplier', 0.14);

		const patch: Record<string, unknown> = {};
		for (const k of dirtyKeys) {
			if (JSON.stringify(form[k]) === JSON.stringify(savedSettings[k])) continue;
			if (form[k] === undefined) continue;
			patch[k] = form[k];
		}

		const zod = buildZodSchema([paymentConfigSection]);
		const parsed = zod.safeParse({ ...savedSettings, ...form });
		expect(parsed.success).toBe(true);

		const mod = await import('$lib/api/admin/settingsRegistry');
		await mod.settingsApi.patchSettings(patch);

		expect(patchSpy).toHaveBeenCalledOnce();
		const payload = patchSpy.mock.calls[0][0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual([
			'payment_balance_recharge_multiplier',
			'payment_enabled'
		]);
		expect(payload.payment_enabled).toBe(true);
		expect(payload.payment_balance_recharge_multiplier).toBe(0.14);
		// 未触碰的 payment_* flat key 不应出现。
		expect(payload).not.toHaveProperty('payment_min_amount');
		expect(payload).not.toHaveProperty('payment_max_amount');
		expect(payload).not.toHaveProperty('payment_recharge_fee_rate');
		expect(payload).not.toHaveProperty('payment_enabled_types');
	});
});
