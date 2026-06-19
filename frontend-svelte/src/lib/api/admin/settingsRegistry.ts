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

/** Admin API Key 状态 —— GET /api/admin/settings/admin-api-key 返回。 */
export interface AdminApiKeyStatus {
	exists: boolean;
	masked_key: string;
}

/** Admin API Key 回执 —— POST regenerate / 新建时返回明文一次（前端必须立刻显示）。 */
export interface AdminApiKeyResult {
	key: string;
}

/** 529 Overload cooldown settings —— 独立 GET/PUT，不入 patchSettings 流水线。 */
export interface OverloadCooldownSettings {
	enabled: boolean;
	cooldown_minutes: number;
}

/** 429 default cooldown settings —— 独立 GET/PUT，不入 patchSettings 流水线。 */
export interface RateLimit429CooldownSettings {
	enabled: boolean;
	cooldown_seconds: number;
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
	},

	// ── Admin API Key CRUD（独立 lifecycle，不进 patchSettings 流水线） ────────────

	/** GET 当前 admin API key 状态（masked）。 */
	getAdminApiKey(): Promise<AdminApiKeyStatus> {
		return apiClient.get<AdminApiKeyStatus>('/api/admin/settings/admin-api-key');
	},

	/** POST 重新生成 admin API key —— 返回一次性明文，前端必须立刻显示给管理员。 */
	regenerateAdminApiKey(): Promise<AdminApiKeyResult> {
		return apiClient.post<AdminApiKeyResult>('/api/admin/settings/admin-api-key/regenerate', {});
	},

	/** DELETE 当前 admin API key。 */
	async deleteAdminApiKey(): Promise<void> {
		await apiClient.delete('/api/admin/settings/admin-api-key');
	},

	// ── M11 gateway 自管理 endpoints ──────────────────────────────────────────────

	/** GET 当前 529 overload cooldown 设置。 */
	getOverloadCooldownSettings(): Promise<OverloadCooldownSettings> {
		return apiClient.get<OverloadCooldownSettings>('/api/admin/settings/overload-cooldown');
	},

	/** PUT 完整 529 overload cooldown 配置 —— 不是 patch，整体替换。 */
	updateOverloadCooldownSettings(
		body: OverloadCooldownSettings
	): Promise<OverloadCooldownSettings> {
		return apiClient.put<OverloadCooldownSettings>(
			'/api/admin/settings/overload-cooldown',
			body
		);
	},

	/** GET 当前 429 default cooldown 设置。 */
	getRateLimit429CooldownSettings(): Promise<RateLimit429CooldownSettings> {
		return apiClient.get<RateLimit429CooldownSettings>(
			'/api/admin/settings/rate-limit-429-cooldown'
		);
	},

	/** PUT 完整 429 default cooldown 配置 —— 不是 patch，整体替换。 */
	updateRateLimit429CooldownSettings(
		body: RateLimit429CooldownSettings
	): Promise<RateLimit429CooldownSettings> {
		return apiClient.put<RateLimit429CooldownSettings>(
			'/api/admin/settings/rate-limit-429-cooldown',
			body
		);
	}
};
