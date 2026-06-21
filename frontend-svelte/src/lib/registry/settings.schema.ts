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
 *   - features → channelMonitor / availableChannels / riskControl / affiliate
 *                / affiliateCustomUsers  (M10c 落地)
 *   - gateway → claudeCode / scheduling / forwarding / usageRecords
 *                / overloadCooldown (special) / rateLimit429 (special)  (M11 落地)
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

/** 订阅到期提醒总开关。 */
export const emailSubscriptionExpirySection: SectionDef = {
	id: 'email.subscriptionExpiry',
	titleKey: 'admin.settings.subscriptionExpiryNotify.title',
	descriptionKey: 'admin.settings.subscriptionExpiryNotify.description',
	fields: [
		{
			key: 'subscription_expiry_notify_enabled',
			type: 'switch',
			labelKey: 'admin.settings.subscriptionExpiryNotify.enabled',
			descriptionKey: 'admin.settings.subscriptionExpiryNotify.enabledHint'
		}
	]
};

/** 邮件模板编辑器 special section —— 独立 lifecycle，不进 patchSettings。 */
export const emailTemplatesSection: SectionDef = {
	id: 'email.templates',
	titleKey: 'admin.settings.emailTemplates.title',
	descriptionKey: 'admin.settings.emailTemplates.description',
	special: 'email-templates'
};

/** 余额不足提醒配置。 */
export const emailBalanceNotifySection: SectionDef = {
	id: 'email.balanceNotify',
	titleKey: 'admin.settings.balanceNotify.title',
	descriptionKey: 'admin.settings.balanceNotify.description',
	fields: [
		{
			key: 'balance_low_notify_enabled',
			type: 'switch',
			labelKey: 'admin.settings.balanceNotify.enabled',
			descriptionKey: 'admin.settings.balanceNotify.description'
		},
		{
			key: 'balance_low_notify_threshold',
			type: 'number',
			labelKey: 'admin.settings.balanceNotify.threshold',
			descriptionKey: 'admin.settings.balanceNotify.thresholdHint',
			placeholder: 'admin.settings.balanceNotify.thresholdPlaceholder',
			min: 0,
			showWhen: (v) => !!v['balance_low_notify_enabled']
		},
		{
			key: 'balance_low_notify_recharge_url',
			type: 'text',
			labelKey: 'admin.settings.balanceNotify.rechargeUrl',
			descriptionKey: 'admin.settings.balanceNotify.rechargeUrlHint',
			placeholder: 'admin.settings.balanceNotify.rechargeUrlPlaceholder',
			showWhen: (v) => !!v['balance_low_notify_enabled']
		}
	]
};

/**
 * Quota notify special section（M10e · email tab）—— flat-form pipeline。
 * 端口自 Vue special/QuotaNotifySection.vue。整组 emails 以 flat key
 * `account_quota_notify_emails` 上抛 patch；主开关单独 flat key
 * `account_quota_notify_enabled`。
 */
export const emailQuotaNotifySection: SectionDef = {
	id: 'email.quotaNotify',
	titleKey: 'admin.settings.quotaNotify.title',
	descriptionKey: 'admin.settings.quotaNotify.description',
	special: 'quota-notify'
};

export const emailSection: SettingsSchema = [
	emailGeneralSection,
	smtpSection,
	testEmailSection,
	emailSubscriptionExpirySection,
	emailTemplatesSection,
	emailBalanceNotifySection,
	emailQuotaNotifySection
];

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
 * 与 Vue tree 对齐：group_id 由 UserDefaultsSection 通过 admin groups facade 渲染为
 * 下拉选择；加载失败或历史 ID 不在列表内时保留 custom ID 兜底。
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

// ── features tab ─────────────────────────────────────────────────────────────
//
// 端口自 frontend/src/views/admin/settings-registry/sections/features.ts +
// affiliateCustomUsers.ts。共 5 section：
//   - channelMonitor         enabled + 默认间隔 (showWhen)
//   - availableChannels      单字段开关
//   - riskControl            单字段开关
//   - affiliate              全局返利配置（rate/freeze/duration/cap，全部 showWhen）
//   - affiliateCustomUsers   special：per-user override CRUD（独立 lifecycle）
//
// 与 Vue tree 差异：none —— flat key + showWhen 直接复刻；special 独立组件承载
// 表格 + 模态框 + 批量编辑流程。

/** 渠道监控总开关 + 默认检测间隔。 */
export const featuresChannelMonitorSection: SectionDef = {
	id: 'features.channelMonitor',
	titleKey: 'admin.settings.features.channelMonitor.title',
	descriptionKey: 'admin.settings.features.channelMonitor.description',
	fields: [
		{
			key: 'channel_monitor_enabled',
			type: 'switch',
			labelKey: 'admin.settings.features.channelMonitor.enabled',
			descriptionKey: 'admin.settings.features.channelMonitor.enabledHint'
		},
		{
			key: 'channel_monitor_default_interval_seconds',
			type: 'number',
			labelKey: 'admin.settings.features.channelMonitor.defaultInterval',
			descriptionKey: 'admin.settings.features.channelMonitor.defaultIntervalHint',
			min: 15,
			max: 3600,
			showWhen: (v) => !!v['channel_monitor_enabled']
		}
	]
};

/** 可用渠道总开关。 */
export const featuresAvailableChannelsSection: SectionDef = {
	id: 'features.availableChannels',
	titleKey: 'admin.settings.features.availableChannels.title',
	descriptionKey: 'admin.settings.features.availableChannels.description',
	fields: [
		{
			key: 'available_channels_enabled',
			type: 'switch',
			labelKey: 'admin.settings.features.availableChannels.enabled',
			descriptionKey: 'admin.settings.features.availableChannels.enabledHint'
		}
	]
};

/** 风控中心总开关。 */
export const featuresRiskControlSection: SectionDef = {
	id: 'features.riskControl',
	titleKey: 'admin.settings.features.riskControl.title',
	descriptionKey: 'admin.settings.features.riskControl.description',
	fields: [
		{
			key: 'risk_control_enabled',
			type: 'switch',
			labelKey: 'admin.settings.features.riskControl.enabled',
			descriptionKey: 'admin.settings.features.riskControl.enabledHint'
		}
	]
};

/**
 * Affiliate 全局返利配置 —— flat keys，所有 sub-field showWhen 联动 affiliate_enabled。
 * 0 = 特殊语义（不冻结 / 永久有效 / 无上限），故 min 不显式约束 0 以避免 zod 拒绝。
 */
export const featuresAffiliateSection: SectionDef = {
	id: 'features.affiliate',
	titleKey: 'admin.settings.features.affiliate.title',
	descriptionKey: 'admin.settings.features.affiliate.description',
	fields: [
		{
			key: 'affiliate_enabled',
			type: 'switch',
			labelKey: 'admin.settings.features.affiliate.enabled',
			descriptionKey: 'admin.settings.features.affiliate.enabledHint'
		},
		{
			key: 'affiliate_rebate_rate',
			type: 'number',
			labelKey: 'admin.settings.features.affiliate.rebateRate',
			descriptionKey: 'admin.settings.features.affiliate.rebateRateHint',
			min: 0,
			max: 100,
			showWhen: (v) => !!v['affiliate_enabled']
		},
		{
			key: 'affiliate_rebate_freeze_hours',
			type: 'number',
			labelKey: 'admin.settings.features.affiliate.freezeHours',
			descriptionKey: 'admin.settings.features.affiliate.freezeHoursDesc',
			min: 0,
			showWhen: (v) => !!v['affiliate_enabled']
		},
		{
			key: 'affiliate_rebate_duration_days',
			type: 'number',
			labelKey: 'admin.settings.features.affiliate.durationDays',
			descriptionKey: 'admin.settings.features.affiliate.durationDaysDesc',
			min: 0,
			showWhen: (v) => !!v['affiliate_enabled']
		},
		{
			key: 'affiliate_rebate_per_invitee_cap',
			type: 'number',
			labelKey: 'admin.settings.features.affiliate.perInviteeCap',
			descriptionKey: 'admin.settings.features.affiliate.perInviteeCapDesc',
			min: 0,
			showWhen: (v) => !!v['affiliate_enabled']
		}
	]
};

/**
 * Affiliate per-user override CRUD（special section）—— 独立 lifecycle，不进 flat-form patch。
 * 端口自 Vue special/AffiliateCustomUsersSection.vue：搜索 / 分页 / Add+Edit modal / 批量
 * 设置比例 / 重置。当 affiliate_enabled=false 时仅展示 disabledHint，避免误操作。
 */
export const featuresAffiliateCustomUsersSection: SectionDef = {
	id: 'features.affiliateCustomUsers',
	titleKey: 'admin.settings.features.affiliate.customUsers.title',
	descriptionKey: 'admin.settings.features.affiliate.customUsers.description',
	special: 'affiliate-custom-users'
};

export const featuresSection: SettingsSchema = [
	featuresChannelMonitorSection,
	featuresAvailableChannelsSection,
	featuresRiskControlSection,
	featuresAffiliateSection,
	featuresAffiliateCustomUsersSection
];

// ── gateway tab ──────────────────────────────────────────────────────────────
//
// 端口自 frontend/src/views/admin/settings-registry/sections/gateway.ts +
// overloadCooldown.ts + rateLimit429.ts。共 6 section：
//
//   - claudeCode          min/max Claude Code 客户端版本闸（2 text fields）
//   - scheduling          Allow ungrouped key + OpenAI experimental scheduler 双开关
//   - forwarding          gateway 转发行为（9 字段，含 claude_oauth_system_prompt
//                          textarea + structured blocks JSON，由 enable_claude_oauth_system_prompt_injection
//                          联动 showWhen）
//   - usageRecords        允许用户查看自己的错误请求（1 switch）
//   - overloadCooldown    special：529 cooldown 独立 GET/PUT lifecycle
//   - rateLimit429        special：429 default cooldown 独立 GET/PUT lifecycle
//
// 复刻 Vue tree 的 16 个 flat key + 2 个 special section（剩下的
// webSearchConfig / streamTimeout / rectifier / betaPolicy / openaiFastPolicy
// 是 backlog，Vue tree 本身的 sections/gateway.ts 也尚未沉淀这些 special）。

/** Claude Code 客户端版本闸（min/max semver）。 */
export const gatewayClaudeCodeSection: SectionDef = {
	id: 'gateway.claudeCode',
	titleKey: 'admin.settings.claudeCode.title',
	descriptionKey: 'admin.settings.claudeCode.description',
	fields: [
		{
			key: 'min_claude_code_version',
			type: 'text',
			labelKey: 'admin.settings.claudeCode.minVersion',
			placeholder: 'e.g. 2.1.63',
			descriptionKey: 'admin.settings.claudeCode.minVersionHint'
		},
		{
			key: 'max_claude_code_version',
			type: 'text',
			labelKey: 'admin.settings.claudeCode.maxVersion',
			placeholder: 'e.g. 2.5.0',
			descriptionKey: 'admin.settings.claudeCode.maxVersionHint'
		}
	]
};

/**
 * Gateway 调度策略：未分组 Key 是否允许调度 + OpenAI 实验性调度策略总开关。
 * 两个独立 switch，无 cascading subfield。
 */
export const gatewaySchedulingSection: SectionDef = {
	id: 'gateway.scheduling',
	titleKey: 'admin.settings.scheduling.title',
	descriptionKey: 'admin.settings.scheduling.description',
	fields: [
		{
			key: 'allow_ungrouped_key_scheduling',
			type: 'switch',
			labelKey: 'admin.settings.scheduling.allowUngroupedKey',
			descriptionKey: 'admin.settings.scheduling.allowUngroupedKeyHint'
		},
		{
			key: 'openai_advanced_scheduler_enabled',
			type: 'switch',
			labelKey: 'admin.settings.openaiExperimentalScheduler.title',
			descriptionKey: 'admin.settings.openaiExperimentalScheduler.description'
		}
	]
};

/**
 * Gateway 转发行为（9 字段）：
 *   - fingerprint / metadata / cch_signing / oauth_system_prompt 4 switches
 *   - claude_oauth_system_prompt textarea + claude_oauth_system_prompt_blocks json
 *     （两者均 showWhen enable_claude_oauth_system_prompt_injection !== false，
 *      与 Vue tree 同语义 —— 默认开启即露面）
 *   - anthropic_cache_ttl_1h_injection / rewrite_message_cache_control 2 switches
 *   - antigravity_user_agent_version / openai_codex_user_agent 2 text
 *   - openai_allow_claude_code_codex_plugin 1 switch
 */
export const gatewayForwardingSection: SectionDef = {
	id: 'gateway.forwarding',
	titleKey: 'admin.settings.gatewayForwarding.title',
	descriptionKey: 'admin.settings.gatewayForwarding.description',
	fields: [
		{
			key: 'enable_fingerprint_unification',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.fingerprintUnification',
			descriptionKey: 'admin.settings.gatewayForwarding.fingerprintUnificationHint'
		},
		{
			key: 'enable_metadata_passthrough',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.metadataPassthrough',
			descriptionKey: 'admin.settings.gatewayForwarding.metadataPassthroughHint'
		},
		{
			key: 'enable_cch_signing',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.cchSigning',
			descriptionKey: 'admin.settings.gatewayForwarding.cchSigningHint'
		},
		{
			key: 'enable_claude_oauth_system_prompt_injection',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjection',
			descriptionKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjectionHint'
		},
		{
			key: 'claude_oauth_system_prompt',
			type: 'textarea',
			labelKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPrompt',
			placeholder: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptPlaceholder',
			descriptionKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptHint',
			// 默认开启 —— enable_claude_oauth_system_prompt_injection 未设置时也露面。
			showWhen: (v) => v['enable_claude_oauth_system_prompt_injection'] !== false
		},
		{
			key: 'claude_oauth_system_prompt_blocks',
			type: 'json',
			labelKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocks',
			placeholder: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocksPlaceholder',
			descriptionKey: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocksHint',
			showWhen: (v) => v['enable_claude_oauth_system_prompt_injection'] !== false
		},
		{
			key: 'enable_anthropic_cache_ttl_1h_injection',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.anthropicCacheTTL1hInjection',
			descriptionKey: 'admin.settings.gatewayForwarding.anthropicCacheTTL1hInjectionHint'
		},
		{
			key: 'rewrite_message_cache_control',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.rewriteMessageCacheControl',
			descriptionKey: 'admin.settings.gatewayForwarding.rewriteMessageCacheControlHint'
		},
		{
			key: 'antigravity_user_agent_version',
			type: 'text',
			labelKey: 'admin.settings.gatewayForwarding.antigravityUserAgentVersion',
			placeholder: 'admin.settings.gatewayForwarding.antigravityUserAgentVersionPlaceholder',
			descriptionKey: 'admin.settings.gatewayForwarding.antigravityUserAgentVersionHint'
		},
		{
			key: 'openai_codex_user_agent',
			type: 'text',
			labelKey: 'admin.settings.gatewayForwarding.openaiCodexUserAgent',
			placeholder: 'admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder',
			descriptionKey: 'admin.settings.gatewayForwarding.openaiCodexUserAgentHint'
		},
		{
			key: 'openai_allow_claude_code_codex_plugin',
			type: 'switch',
			labelKey: 'admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPlugin',
			descriptionKey: 'admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPluginDesc'
		}
	]
};

/** 用户可见错误请求 —— 单 switch。 */
export const gatewayUsageRecordsSection: SectionDef = {
	id: 'gateway.usageRecords',
	titleKey: 'admin.settings.usageRecords.title',
	descriptionKey: 'admin.settings.usageRecords.description',
	fields: [
		{
			key: 'allow_user_view_error_requests',
			type: 'switch',
			labelKey: 'admin.settings.user_error_view.label',
			descriptionKey: 'admin.settings.user_error_view.description'
		}
	]
};

/** 529 overload cooldown —— 独立 GET/PUT lifecycle，不进 patchSettings。 */
export const gatewayOverloadCooldownSection: SectionDef = {
	id: 'gateway.overloadCooldown',
	titleKey: 'admin.settings.overloadCooldown.title',
	descriptionKey: 'admin.settings.overloadCooldown.description',
	special: 'overload-cooldown'
};

/** 429 default cooldown —— 独立 GET/PUT lifecycle，不进 patchSettings。 */
export const gatewayRateLimit429Section: SectionDef = {
	id: 'gateway.rateLimit429',
	titleKey: 'admin.settings.rateLimit429Cooldown.title',
	descriptionKey: 'admin.settings.rateLimit429Cooldown.description',
	special: 'rate-limit-429'
};

/**
 * Stream timeout —— 独立 GET/PUT lifecycle，不进 patchSettings。
 * 端口自 Vue special/StreamTimeoutSection.vue + sections/streamTimeout.ts。
 */
export const gatewayStreamTimeoutSection: SectionDef = {
	id: 'gateway.streamTimeout',
	titleKey: 'admin.settings.streamTimeout.title',
	descriptionKey: 'admin.settings.streamTimeout.description',
	special: 'stream-timeout'
};

/**
 * Rectifier —— 独立 GET/PUT lifecycle，不进 patchSettings。
 * 端口自 Vue special/RectifierSection.vue + sections/rectifier.ts。
 */
export const gatewayRectifierSection: SectionDef = {
	id: 'gateway.rectifier',
	titleKey: 'admin.settings.rectifier.title',
	descriptionKey: 'admin.settings.rectifier.description',
	special: 'rectifier'
};

/**
 * Beta policy —— 独立 GET/PUT lifecycle，不进 patchSettings。
 * 端口自 Vue special/BetaPolicySection.vue + sections/betaPolicy.ts。
 * 服务端返回 rules: BetaPolicyRule[]；卡片化策略矩阵。
 */
export const gatewayBetaPolicySection: SectionDef = {
	id: 'gateway.betaPolicy',
	titleKey: 'admin.settings.betaPolicy.title',
	descriptionKey: 'admin.settings.betaPolicy.description',
	special: 'beta-policy'
};

/**
 * OpenAI fast/flex policy —— flat key special section。
 * 端口自 Vue special/OpenaiFastPolicySection.vue + sections/openaiFastPolicy.ts。
 * 整组 rules 以 flat key `openai_fast_policy_settings = { rules: [...] }` 上抛 patch。
 */
export const gatewayOpenaiFastPolicySection: SectionDef = {
	id: 'gateway.openaiFastPolicy',
	titleKey: 'admin.settings.openaiFastPolicy.title',
	descriptionKey: 'admin.settings.openaiFastPolicy.description',
	special: 'openai-fast-policy'
};

/**
 * Web search emulation —— 独立 GET/PUT lifecycle，不进 patchSettings。
 * 端口自 Vue special/WebSearchEmulationSection.vue + sections/webSearchEmulation.ts。
 *
 * 与 Vue tree 对齐：proxy_id 由 WebSearchEmulationSection 通过 admin proxies facade
 * 渲染为下拉选择；加载失败或历史 ID 不在列表内时保留 custom ID 兜底。
 */
export const gatewayWebSearchEmulationSection: SectionDef = {
	id: 'gateway.webSearchEmulation',
	titleKey: 'admin.settings.webSearchEmulation.title',
	descriptionKey: 'admin.settings.webSearchEmulation.description',
	special: 'web-search-emulation'
};

export const gatewaySection: SettingsSchema = [
	gatewayClaudeCodeSection,
	gatewaySchedulingSection,
	gatewayForwardingSection,
	gatewayUsageRecordsSection,
	gatewayOverloadCooldownSection,
	gatewayRateLimit429Section,
	gatewayStreamTimeoutSection,
	gatewayRectifierSection,
	gatewayBetaPolicySection,
	gatewayOpenaiFastPolicySection,
	gatewayWebSearchEmulationSection
];

// ── payment tab ──────────────────────────────────────────────────────────────
//
// 端口自 frontend/src/views/admin/settings-registry/sections/payment.ts
// + special/PaymentProviderListSection.vue。共 2 section：
//   - paymentConfig    18 flat 字段（payment_enabled 主开关 + 17 cascading subfield）
//   - paymentProviders special：payment_enabled_types 徽章 + provider 实例 CRUD
//                       (lifecycle 独立于 patchSettings，仅 enabled toggle 与 delete
//                        通过 admin/payment/providers 落库)
//
// 字段 key 与后端 SystemSettings 严格对齐（payment_* flat key）。
// 所有 subfield showWhen 联动 payment_enabled —— 主开关关闭时整 tab 折叠成单 toggle。
//
// 红线：本 tab 不引用 backend billing_service.GetModelPricing /
// /admin/channels/model-pricing；payment 配置与 model pricing 是两套独立表面。

/** Payment 全局配置 —— 18 flat 字段，全部 showWhen 联动 payment_enabled。 */
export const paymentConfigSection: SectionDef = {
	id: 'payment.config',
	titleKey: 'admin.settings.payment.title',
	descriptionKey: 'admin.settings.payment.description',
	fields: [
		{
			key: 'payment_enabled',
			type: 'switch',
			labelKey: 'admin.settings.payment.enabled',
			descriptionKey: 'admin.settings.payment.enabledHint'
		},
		{
			key: 'payment_product_name_prefix',
			type: 'text',
			labelKey: 'admin.settings.payment.productNamePrefix',
			placeholder: 'subme',
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_product_name_suffix',
			type: 'text',
			labelKey: 'admin.settings.payment.productNameSuffix',
			placeholder: 'CNY',
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_min_amount',
			type: 'number',
			labelKey: 'admin.settings.payment.minAmount',
			placeholder: 'admin.settings.payment.noLimit',
			min: 0,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_max_amount',
			type: 'number',
			labelKey: 'admin.settings.payment.maxAmount',
			placeholder: 'admin.settings.payment.noLimit',
			min: 0,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_daily_limit',
			type: 'number',
			labelKey: 'admin.settings.payment.dailyLimit',
			placeholder: 'admin.settings.payment.noLimit',
			min: 0,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_balance_recharge_multiplier',
			type: 'number',
			labelKey: 'admin.settings.payment.balanceRechargeMultiplier',
			descriptionKey: 'admin.settings.payment.balanceRechargeMultiplierHint',
			min: 0,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_recharge_fee_rate',
			type: 'number',
			labelKey: 'admin.settings.payment.rechargeFeeRate',
			descriptionKey: 'admin.settings.payment.rechargeFeeRateHint',
			min: 0,
			max: 100,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_order_timeout_minutes',
			type: 'number',
			labelKey: 'admin.settings.payment.orderTimeout',
			descriptionKey: 'admin.settings.payment.orderTimeoutHint',
			min: 1,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_max_pending_orders',
			type: 'number',
			labelKey: 'admin.settings.payment.maxPendingOrders',
			min: 0,
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_load_balance_strategy',
			type: 'select',
			labelKey: 'admin.settings.payment.loadBalanceStrategy',
			options: [
				{ value: 'random', labelKey: 'admin.settings.payment.strategyRandom' },
				{ value: 'round_robin', labelKey: 'admin.settings.payment.strategyRoundRobin' },
				{ value: 'least_conn', labelKey: 'admin.settings.payment.strategyLeastConn' }
			],
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_cancel_rate_limit_enabled',
			type: 'switch',
			labelKey: 'admin.settings.payment.cancelRateLimit',
			descriptionKey: 'admin.settings.payment.cancelRateLimitHint',
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_cancel_rate_limit_window_mode',
			type: 'select',
			labelKey: 'admin.settings.payment.cancelRateLimitWindowMode',
			options: [
				{
					value: 'rolling',
					labelKey: 'admin.settings.payment.cancelRateLimitWindowModeRolling'
				},
				{ value: 'fixed', labelKey: 'admin.settings.payment.cancelRateLimitWindowModeFixed' }
			],
			showWhen: (v) =>
				!!v['payment_enabled'] && !!v['payment_cancel_rate_limit_enabled']
		},
		{
			key: 'payment_cancel_rate_limit_window',
			type: 'number',
			labelKey: 'admin.settings.payment.cancelRateLimitWindow',
			min: 1,
			showWhen: (v) =>
				!!v['payment_enabled'] && !!v['payment_cancel_rate_limit_enabled']
		},
		{
			key: 'payment_cancel_rate_limit_unit',
			type: 'select',
			labelKey: 'admin.settings.payment.cancelRateLimitUnit',
			options: [
				{ value: 'minute', labelKey: 'admin.settings.payment.cancelRateLimitUnitMinute' },
				{ value: 'hour', labelKey: 'admin.settings.payment.cancelRateLimitUnitHour' },
				{ value: 'day', labelKey: 'admin.settings.payment.cancelRateLimitUnitDay' }
			],
			showWhen: (v) =>
				!!v['payment_enabled'] && !!v['payment_cancel_rate_limit_enabled']
		},
		{
			key: 'payment_cancel_rate_limit_max',
			type: 'number',
			labelKey: 'admin.settings.payment.cancelRateLimitMax',
			min: 1,
			showWhen: (v) =>
				!!v['payment_enabled'] && !!v['payment_cancel_rate_limit_enabled']
		},
		{
			key: 'payment_alipay_force_qrcode',
			type: 'switch',
			labelKey: 'admin.settings.payment.alipayForceQRCode',
			descriptionKey: 'admin.settings.payment.alipayForceQRCodeHint',
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_help_image_url',
			type: 'image',
			labelKey: 'admin.settings.payment.helpImage',
			showWhen: (v) => !!v['payment_enabled']
		},
		{
			key: 'payment_help_text',
			type: 'textarea',
			labelKey: 'admin.settings.payment.helpText',
			placeholder: 'admin.settings.payment.helpTextPlaceholder',
			showWhen: (v) => !!v['payment_enabled']
		}
	]
};

/**
 * Payment 服务商列表 —— special section。
 * 覆盖 payment_enabled_types 徽章切换 + provider 实例 CRUD（create/edit/toggle/delete）。
 * 复杂 credentials/limits 先用 JSON 表单直通，避免 Svelte 端未建模字段丢失；拖拽排序仍是后续增强。
 */
export const paymentProvidersSection: SectionDef = {
	id: 'payment.providers',
	titleKey: 'admin.settings.payment.enabledPaymentTypes',
	descriptionKey: 'admin.settings.payment.enabledPaymentTypesHint',
	special: 'payment-provider-list'
};

export const paymentSection: SettingsSchema = [paymentConfigSection, paymentProvidersSection];

// ── agreement tab ────────────────────────────────────────────────────────────
//
// 端口自 frontend/src/views/admin/settings-registry/sections/agreement.ts +
// special/AgreementDocumentsSection.vue。共 2 section：
//   - login_agreement   总开关 + 展示模式 + 更新日期（3 flat key + showWhen 联动）
//   - documents         special：[{id,title,content_md}] 多文档 Markdown 编辑器
//
// 字段 key 与后端 SystemSettings flat key 拍齐（login_agreement_*）。
// mode select 走 'modal' | 'checkbox'，绝不出空 value（sentinel 契约）。

/** 登录条款开关 + 展示模式 + 更新日期 —— 3 flat fields + cascading showWhen。 */
export const agreementLoginSection: SectionDef = {
	id: 'agreement.config',
	titleKey: 'admin.settings.agreement.configTitle',
	descriptionKey: 'admin.settings.agreement.configDescription',
	fields: [
		{
			key: 'login_agreement_enabled',
			type: 'switch',
			labelKey: 'admin.settings.agreement.enabledLabel',
			descriptionKey: 'admin.settings.agreement.enabledHint'
		},
		{
			key: 'login_agreement_mode',
			type: 'select',
			labelKey: 'admin.settings.agreement.modeLabel',
			descriptionKey: 'admin.settings.agreement.modeHint',
			options: [
				{ value: 'modal', labelKey: 'admin.settings.agreement.modeModal' },
				{ value: 'checkbox', labelKey: 'admin.settings.agreement.modeCheckbox' }
			],
			showWhen: (v) => !!v['login_agreement_enabled']
		},
		{
			key: 'login_agreement_updated_at',
			type: 'text',
			labelKey: 'admin.settings.agreement.updatedAtLabel',
			descriptionKey: 'admin.settings.agreement.updatedAtHint',
			placeholder: 'YYYY-MM-DD',
			showWhen: (v) => !!v['login_agreement_enabled']
		}
	]
};

/**
 * 登录条款 Markdown 文档列表 —— special section。
 * 端口自 special/AgreementDocumentsSection.vue。整组 docs 作为单一 flat key
 * `login_agreement_documents` 上抛 patch（与 form 同流水线）。
 */
export const agreementDocumentsSection: SectionDef = {
	id: 'agreement.documents',
	titleKey: 'admin.settings.agreement.documentsTitle',
	descriptionKey: 'admin.settings.agreement.documentsDescription',
	special: 'login-agreement-documents'
};

export const agreementSection: SettingsSchema = [
	agreementLoginSection,
	agreementDocumentsSection
];

// ── backup tab ───────────────────────────────────────────────────────────────
//
// 端口自 frontend/src/views/admin/settings-registry/sections/backup.ts +
// BackupView.vue（整张面板）。共 1 section（special）：
//   - backup.view  独立 lifecycle GET/PUT/POST/DELETE，与 patchSettings 解耦。
//
// 单一 special 包住三张子卡：S3 配置 / 定时备份 / 备份记录 + Restore。
// 后端路由组：admin.Group("/backups")（见 backend/internal/server/routes/admin.go）。

export const backupViewSection: SectionDef = {
	id: 'backup.view',
	titleKey: 'admin.backup.sectionTitle',
	descriptionKey: 'admin.backup.sectionDescription',
	special: 'backup'
};

export const backupSection: SettingsSchema = [backupViewSection];

// ── 顶层 tab 注册 ──────────────────────────────────────────────────────────

export interface SettingsTab {
	id: string;
	labelKey: string;
	sections: SettingsSchema;
}

export const settingsTabs: SettingsTab[] = [
	{ id: 'email', labelKey: 'admin.settings.email.title', sections: emailSection },
	{ id: 'general', labelKey: 'admin.settings.general.title', sections: generalSection },
	{ id: 'security', labelKey: 'admin.settings.security.title', sections: securitySection },
	{ id: 'users', labelKey: 'admin.settings.users.title', sections: usersSection },
	{ id: 'features', labelKey: 'admin.settings.features.title', sections: featuresSection },
	{ id: 'gateway', labelKey: 'admin.settings.gateway.title', sections: gatewaySection },
	{ id: 'payment', labelKey: 'admin.settings.payment.title', sections: paymentSection },
	{ id: 'agreement', labelKey: 'admin.settings.tabs.agreement', sections: agreementSection },
	{ id: 'backup', labelKey: 'admin.settings.tabs.backup', sections: backupSection }
];
