/**
 * Settings Registry API · 管理端入口（POC 4）
 *
 * 端点与 Vue tree (frontend/src/api/admin/settings.ts) 同源；后端 handler 仍是
 * /api/admin/settings 系列。本 POC 仅落地邮件相关四个端点，其余等 M10 全量铺开。
 *
 * 契约要点：
 *   - patchSettings 只发 dirty key —— 调用方（+page.svelte）负责构造增量 payload。
 *     后端将"键缺失"等同"保持原值"。本层不二次过滤，保留调用方完全控制权。
 *   - 敏感字段（如 smtp_password）：空字符串/未传 → 后端保留原值；非空 → 覆盖。
 *     server 永不回传明文，所以 GET 不会有 smtp_password 字段，只有 *_configured 镜像。
 *   - testSmtpConnection / sendTestEmail：out-of-band 测试，body 走实时表单值
 *     （包括未保存的脏值）—— 调用方拼装。
 */
import { apiClient } from '../client';

export type SettingsMap = Record<string, unknown>;

export interface TestSmtpRequest {
	smtp_host: string;
	smtp_port: number;
	smtp_username: string;
	smtp_password: string;
	smtp_use_tls: boolean;
}

export interface SendTestEmailRequest extends TestSmtpRequest {
	email: string;
	smtp_from_email: string;
	smtp_from_name: string;
}

export interface ApiActionResult {
	success: boolean;
	message?: string;
}

export const settingsApi = {
	/** 拉取后端全量 settings 快照。 */
	getSettings(): Promise<SettingsMap> {
		return apiClient.get<SettingsMap>('/api/admin/settings');
	},

	/**
	 * 提交增量 patch。仅含调用方判定的 dirty key。
	 * 返回 void —— 后端可能回完整 SystemSettings，这里不暴露给调用方避免双源同步；
	 * 调用方应在 success 后用 form 视图覆盖 savedSettings 快照。
	 */
	async patchSettings(payload: SettingsMap): Promise<void> {
		await apiClient.patch<SettingsMap>('/api/admin/settings', payload);
	},

	/** 用表单实时值测 SMTP 连接（不持久化）。 */
	async testSmtpConnection(body: TestSmtpRequest): Promise<ApiActionResult> {
		const res = await apiClient.post<{ message?: string }>(
			'/api/admin/settings/test-smtp',
			body
		);
		return { success: true, message: res?.message };
	},

	/** 用表单实时值发测试邮件（不持久化）。 */
	async sendTestEmail(body: SendTestEmailRequest): Promise<ApiActionResult> {
		const res = await apiClient.post<{ message?: string }>(
			'/api/admin/settings/send-test-email',
			body
		);
		return { success: true, message: res?.message };
	}
};
