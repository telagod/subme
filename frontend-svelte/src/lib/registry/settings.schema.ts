/**
 * Settings Registry · Section schema 集合（M10）
 *
 * POC 4 仅落地 email 相关 section；M10 全量铺开 general + security 两个 tab。
 *
 * 总 section 分布：
 *   - email   →  general / smtp / test  (POC 4 落地)
 *   - general →  site / table / customMenu  (M10 落地)
 *   - security → registration / apiKeyAcl / turnstile / linuxdo / github
 *                / google / adminApiKey / emailWhitelist / dingtalk / oidc
 *                / wechat_connect  (M10 落地)
 *   - users   →  defaults / defaultSubscriptionsAndQuotas / authSourceDefaults  (M10 落地)
 *   - gateway → 仍 placeholder（M11+）
 *
 * 排序：与 Vue tree `registry.ts` import 顺序严格同步，避免视觉漂移。
 *
 * 字段 key 严格与后端 SystemSettings flat key 拍齐（analyze 给出全表）；
 * showWhen 谓词用于 *_enabled 主开关展开 cascading subfields，复刻 Vue tree 行为。
 */
import type { SectionDef, SettingsSchema } from './types';

// ── email tab ────────────────────────────────────────────────────────────────

/** 邮件总开关 / 通用配置 —— 单字段 section，演示普通 fields 路径。 */
export const emailGeneralSection: SectionDef = {
	id: 'email.general',
	titleKey: 'admin.settings.email.title',
	descriptionKey: 'admin.settings.email.description',
	fields: [
		{
			key: 'email_enabled',
			type: 'switch',
			labelKey: 'admin.settings.email.enabled',
			descriptionKey: 'admin.settings.email.enabledHint'
		}
	]
};

/** SMTP special section —— fields 由 SmtpSection.svelte 自带。 */
export const smtpSection: SectionDef = {
	id: 'email.smtp',
	titleKey: 'admin.settings.smtp.title',
	descriptionKey: 'admin.settings.smtp.description',
	special: 'smtp'
};

/** Test email special section —— 仅 recipient + Send 按钮。 */
export const testEmailSection: SectionDef = {
	id: 'email.test',
	titleKey: 'admin.settings.testEmail.title',
	descriptionKey: 'admin.settings.testEmail.description',
	special: 'test-email'
};

export const emailSection: SettingsSchema = [emailGeneralSection, smtpSection, testEmailSection];

// ── general tab ──────────────────────────────────────────────────────────────

/** 站点品牌 / OEM / 显示偏好。 */
export const generalSiteSection: SectionDef = {
	id: 'general.site',
	titleKey: 'admin.settings.site.title',
	descriptionKey: 'admin.settings.site.description',
	fields: [
		{
			key: 'backend_mode_enabled',
			type: 'switch',
			labelKey: 'admin.settings.site.backendMode',
			descriptionKey: 'admin.settings.site.backendModeDescription'
		},
		{
			key: 'site_name',
			type: 'text',
			labelKey: 'admin.settings.site.siteName',
			placeholder: 'subme',
			descriptionKey: 'admin.settings.site.siteNameHint'
		},
		{
			key: 'site_subtitle',
			type: 'text',
			labelKey: 'admin.settings.site.siteSubtitle',
			descriptionKey: 'admin.settings.site.siteSubtitleHint'
		},
		{
			key: 'api_base_url',
			type: 'text',
			labelKey: 'admin.settings.site.apiBaseUrl',
			descriptionKey: 'admin.settings.site.apiBaseUrlHint'
		},
		{
			key: 'frontend_url',
			type: 'text',
			labelKey: 'admin.settings.registration.frontendUrl',
			descriptionKey: 'admin.settings.registration.frontendUrlHint'
		},
		{
			key: 'contact_info',
			type: 'text',
			labelKey: 'admin.settings.site.contactInfo',
			descriptionKey: 'admin.settings.site.contactInfoHint'
		},
		{
			key: 'doc_url',
			type: 'text',
			labelKey: 'admin.settings.site.docUrl',
			descriptionKey: 'admin.settings.site.docUrlHint'
		},
		{
			key: 'site_logo',
			type: 'image',
			labelKey: 'admin.settings.site.siteLogo',
			descriptionKey: 'admin.settings.site.logoHint'
		},
		{
			key: 'home_content',
			type: 'textarea',
			labelKey: 'admin.settings.site.homeContent',
			descriptionKey: 'admin.settings.site.homeContentHint'
		},
		{
			key: 'hide_ccs_import_button',
			type: 'switch',
			labelKey: 'admin.settings.site.hideCcsImportButton',
			descriptionKey: 'admin.settings.site.hideCcsImportButtonHint'
		}
	]
};

/** 表格分页偏好。 */
export const generalTableSection: SectionDef = {
	id: 'general.table',
	titleKey: 'admin.settings.site.tablePreferencesTitle',
	descriptionKey: 'admin.settings.site.tablePreferencesDescription',
	fields: [
		{
			key: 'table_default_page_size',
			type: 'number',
			labelKey: 'admin.settings.site.tableDefaultPageSize',
			descriptionKey: 'admin.settings.site.tableDefaultPageSizeHint',
			min: 5,
			max: 1000
		},
		{
			key: 'table_page_size_options',
			type: 'text',
			labelKey: 'admin.settings.site.tablePageSizeOptions',
			descriptionKey: 'admin.settings.site.tablePageSizeOptionsHint'
		}
	]
};

/** 自定义菜单 / endpoints special section。 */
export const generalCustomMenuSection: SectionDef = {
	id: 'general.customMenu',
	titleKey: 'admin.settings.customMenu.title',
	special: 'custom-menu'
};

export const generalSection: SettingsSchema = [
	generalSiteSection,
	generalTableSection,
	generalCustomMenuSection
];

// ── security tab ─────────────────────────────────────────────────────────────

/** 注册策略：邮件验证 / 邀请 / 重置 / 2FA 等。 */
export const securityRegistrationSection: SectionDef = {
	id: 'security.registration',
	titleKey: 'admin.settings.registration.title',
	descriptionKey: 'admin.settings.registration.description',
	fields: [
		{
			key: 'registration_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.enableRegistration',
			descriptionKey: 'admin.settings.registration.enableRegistrationHint'
		},
		{
			key: 'email_verify_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.emailVerification',
			descriptionKey: 'admin.settings.registration.emailVerificationHint'
		},
		{
			key: 'promo_code_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.promoCode',
			descriptionKey: 'admin.settings.registration.promoCodeHint'
		},
		{
			key: 'invitation_code_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.invitationCode',
			descriptionKey: 'admin.settings.registration.invitationCodeHint'
		},
		{
			key: 'password_reset_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.passwordReset',
			descriptionKey: 'admin.settings.registration.passwordResetHint',
			showWhen: (v) => !!v['email_verify_enabled']
		},
		{
			key: 'totp_enabled',
			type: 'switch',
			labelKey: 'admin.settings.registration.totp',
			descriptionKey: 'admin.settings.registration.totpHint'
		}
	]
};

export const securityApiKeyAclSection: SectionDef = {
	id: 'security.apiKeyAcl',
	titleKey: 'admin.settings.apiKeyAcl.title',
	descriptionKey: 'admin.settings.apiKeyAcl.description',
	fields: [
		{
			key: 'api_key_acl_trust_forwarded_ip',
			type: 'switch',
			labelKey: 'admin.settings.apiKeyAcl.trustForwardedIp',
			descriptionKey: 'admin.settings.apiKeyAcl.trustForwardedIpHint'
		}
	]
};

export const securityTurnstileSection: SectionDef = {
	id: 'security.turnstile',
	titleKey: 'admin.settings.turnstile.title',
	descriptionKey: 'admin.settings.turnstile.description',
	fields: [
		{
			key: 'turnstile_enabled',
			type: 'switch',
			labelKey: 'admin.settings.turnstile.enabled'
		},
		{
			key: 'turnstile_site_key',
			type: 'text',
			labelKey: 'admin.settings.turnstile.siteKey',
			showWhen: (v) => !!v['turnstile_enabled']
		},
		{
			key: 'turnstile_secret_key',
			type: 'password',
			labelKey: 'admin.settings.turnstile.secretKey',
			sensitive: true,
			showWhen: (v) => !!v['turnstile_enabled']
		}
	]
};

export const securityLinuxdoSection: SectionDef = {
	id: 'security.linuxdo',
	titleKey: 'admin.settings.linuxdo.title',
	descriptionKey: 'admin.settings.linuxdo.description',
	fields: [
		{
			key: 'linuxdo_connect_enabled',
			type: 'switch',
			labelKey: 'admin.settings.linuxdo.enabled'
		},
		{
			key: 'linuxdo_connect_client_id',
			type: 'text',
			labelKey: 'admin.settings.linuxdo.clientId',
			showWhen: (v) => !!v['linuxdo_connect_enabled']
		},
		{
			key: 'linuxdo_connect_client_secret',
			type: 'password',
			labelKey: 'admin.settings.linuxdo.clientSecret',
			sensitive: true,
			showWhen: (v) => !!v['linuxdo_connect_enabled']
		},
		{
			key: 'linuxdo_connect_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.linuxdo.redirectUrl',
			showWhen: (v) => !!v['linuxdo_connect_enabled']
		}
	]
};

export const securityGithubSection: SectionDef = {
	id: 'security.github',
	titleKey: 'admin.settings.github.title',
	descriptionKey: 'admin.settings.github.description',
	fields: [
		{
			key: 'github_oauth_enabled',
			type: 'switch',
			labelKey: 'admin.settings.github.enabled'
		},
		{
			key: 'github_oauth_client_id',
			type: 'text',
			labelKey: 'admin.settings.github.clientId',
			showWhen: (v) => !!v['github_oauth_enabled']
		},
		{
			key: 'github_oauth_client_secret',
			type: 'password',
			labelKey: 'admin.settings.github.clientSecret',
			sensitive: true,
			showWhen: (v) => !!v['github_oauth_enabled']
		},
		{
			key: 'github_oauth_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.github.redirectUrl',
			showWhen: (v) => !!v['github_oauth_enabled']
		},
		{
			key: 'github_oauth_frontend_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.github.frontendRedirectUrl',
			showWhen: (v) => !!v['github_oauth_enabled']
		}
	]
};

export const securityGoogleSection: SectionDef = {
	id: 'security.google',
	titleKey: 'admin.settings.google.title',
	descriptionKey: 'admin.settings.google.description',
	fields: [
		{
			key: 'google_oauth_enabled',
			type: 'switch',
			labelKey: 'admin.settings.google.enabled'
		},
		{
			key: 'google_oauth_client_id',
			type: 'text',
			labelKey: 'admin.settings.google.clientId',
			showWhen: (v) => !!v['google_oauth_enabled']
		},
		{
			key: 'google_oauth_client_secret',
			type: 'password',
			labelKey: 'admin.settings.google.clientSecret',
			sensitive: true,
			showWhen: (v) => !!v['google_oauth_enabled']
		},
		{
			key: 'google_oauth_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.google.redirectUrl',
			showWhen: (v) => !!v['google_oauth_enabled']
		},
		{
			key: 'google_oauth_frontend_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.google.frontendRedirectUrl',
			showWhen: (v) => !!v['google_oauth_enabled']
		}
	]
};

export const securityAdminApiKeySection: SectionDef = {
	id: 'security.adminApiKey',
	titleKey: 'admin.settings.adminApiKey.title',
	descriptionKey: 'admin.settings.adminApiKey.description',
	special: 'admin-api-key'
};

export const securityEmailWhitelistSection: SectionDef = {
	id: 'security.emailWhitelist',
	titleKey: 'admin.settings.registration.emailSuffixWhitelist',
	descriptionKey: 'admin.settings.registration.emailSuffixWhitelistHint',
	special: 'email-suffix-whitelist'
};

export const securityDingtalkSection: SectionDef = {
	id: 'security.dingtalk',
	titleKey: 'admin.settings.dingtalk.title',
	descriptionKey: 'admin.settings.dingtalk.description',
	special: 'dingtalk-connect'
};

export const securityOidcSection: SectionDef = {
	id: 'security.oidc',
	titleKey: 'admin.settings.oidc.title',
	descriptionKey: 'admin.settings.oidc.description',
	special: 'oidc-connect'
};

export const securityWechatSection: SectionDef = {
	id: 'security.wechat_connect',
	titleKey: 'admin.settings.wechatConnect.title',
	descriptionKey: 'admin.settings.wechatConnect.description',
	special: 'wechat-connect'
};

export const securitySection: SettingsSchema = [
	securityRegistrationSection,
	securityEmailWhitelistSection,
	securityApiKeyAclSection,
	securityTurnstileSection,
	securityAdminApiKeySection,
	securityLinuxdoSection,
	securityGithubSection,
	securityGoogleSection,
	securityDingtalkSection,
	securityOidcSection,
	securityWechatSection
];

// ── users tab ────────────────────────────────────────────────────────────────

/**
 * 新用户默认值 —— flat 三键。
 * 端口自 frontend/src/views/admin/settings-registry/sections/users.ts 的 userDefaults。
 */
export const usersDefaultsSection: SectionDef = {
	id: 'users.defaults',
	titleKey: 'admin.settings.defaults.title',
	descriptionKey: 'admin.settings.defaults.description',
	fields: [
		{
			key: 'default_balance',
			type: 'number',
			labelKey: 'admin.settings.defaults.defaultBalance',
			descriptionKey: 'admin.settings.defaults.defaultBalanceHint',
			placeholder: '0.00',
			min: 0
		},
		{
			key: 'default_concurrency',
			type: 'number',
			labelKey: 'admin.settings.defaults.defaultConcurrency',
			descriptionKey: 'admin.settings.defaults.defaultConcurrencyHint',
			placeholder: '1',
			min: 1
		},
		{
			key: 'default_user_rpm_limit',
			type: 'number',
			labelKey: 'admin.settings.defaults.defaultUserRpmLimit',
			descriptionKey: 'admin.settings.defaults.defaultUserRpmLimitHint',
			placeholder: '0',
			min: 0
		}
	]
};

/**
 * 默认订阅 + 平台限额矩阵 special section。
 * 端口自 sections/userDefaults.ts → UserDefaultsSection.vue。
 *
 * 字段：default_subscriptions (Array<{group_id, validity_days}>),
 *       default_platform_quotas (4 × {daily, weekly, monthly}).
 *
 * 与 Vue tree 的差异：Svelte 仓库尚未有 adminAPI.groups —— group_id 退化为 number input
 * （Vue tree 是带 GroupBadge 的 Select）。后端契约同源（flat key + 同形 payload），
 * 后续接入 groups API 时切换为 select 即可，不破坏 schema。
 */
export const usersSubscriptionsQuotasSection: SectionDef = {
	id: 'users.defaultSubscriptionsAndQuotas',
	titleKey: 'admin.settings.defaults.defaultSubscriptions',
	descriptionKey: 'admin.settings.defaults.defaultSubscriptionsHint',
	special: 'user-defaults'
};

/**
 * 第三方注册默认值矩阵 special section。
 * 端口自 sections/users.ts → AuthSourceDefaultsSection.vue。
 *
 * 字段：force_email_on_third_party_signup (flat boolean) +
 *       auth_source_default_<source>_<balance|concurrency|grant_on_signup|
 *       grant_on_first_bind|subscriptions|platform_quotas> × 7 sources.
 */
export const usersAuthSourceDefaultsSection: SectionDef = {
	id: 'users.authSourceDefaults',
	titleKey: 'admin.settings.authSourceDefaults.title',
	descriptionKey: 'admin.settings.authSourceDefaults.description',
	special: 'auth-source-defaults'
};

export const usersSection: SettingsSchema = [
	usersDefaultsSection,
	usersSubscriptionsQuotasSection,
	usersAuthSourceDefaultsSection
];

// ── 顶层 tab 注册 ──────────────────────────────────────────────────────────

export interface SettingsTab {
	id: string;
	labelKey: string;
	sections: SettingsSchema;
	placeholder?: boolean;
}

export const settingsTabs: SettingsTab[] = [
	{ id: 'email', labelKey: 'admin.settings.email.title', sections: emailSection },
	{ id: 'general', labelKey: 'admin.settings.general.title', sections: generalSection },
	{ id: 'security', labelKey: 'admin.settings.security.title', sections: securitySection },
	{ id: 'users', labelKey: 'admin.settings.users.title', sections: usersSection },
	{ id: 'gateway', labelKey: 'admin.settings.gateway.title', sections: [], placeholder: true }
];
