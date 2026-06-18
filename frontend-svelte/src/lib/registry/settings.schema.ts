/**
 * Settings Registry · Section schema 集合（POC 4）
 *
 * POC 4 仅落地 email 相关 section（M10 才铺 general / security / gateway 等）。
 *
 * 三段：
 *   1. email.general —— 邮件总开关 + 主题渲染等"普通字段"
 *   2. email.smtp    —— SMTP 配置 + Test Connection（special: 'smtp'）
 *   3. email.test    —— 发测试邮件（special: 'test-email'）
 *
 * 排序：与 Vue tree 同序（general → smtp → test）。
 */
import type { SectionDef, SettingsSchema } from './types';

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

/** 顶层导出 —— +page.svelte 直接消费。 */
export const emailSection: SettingsSchema = [
	emailGeneralSection,
	smtpSection,
	testEmailSection
];

/** 所有可见 tab —— POC 4 仅 email；M10 起补全。 */
export interface SettingsTab {
	id: string;
	labelKey: string;
	sections: SettingsSchema;
	placeholder?: boolean;
}

export const settingsTabs: SettingsTab[] = [
	{ id: 'email', labelKey: 'admin.settings.email.title', sections: emailSection },
	{ id: 'general', labelKey: 'admin.settings.general.title', sections: [], placeholder: true },
	{ id: 'security', labelKey: 'admin.settings.security.title', sections: [], placeholder: true },
	{ id: 'gateway', labelKey: 'admin.settings.gateway.title', sections: [], placeholder: true }
];
