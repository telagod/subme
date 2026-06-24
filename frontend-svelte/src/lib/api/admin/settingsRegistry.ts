/**
 * Settings Registry API · 管理端入口（POC 4）
 *
 * 端点与 Vue tree (frontend/src/api/v1/admin/settings.ts) 同源；后端 handler 仍是
 * /api/v1/admin/settings 系列。本 POC 仅落地邮件相关四个端点，其余等 M10 全量铺开。
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

function unwrap<T>(raw: unknown): T {
	if (raw && typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).code !== undefined) return (raw as Record<string, unknown>).data as T;
	return raw as T;
}

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

/** Admin API Key 状态 —— GET /api/v1/admin/settings/admin-api-key 返回。 */
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

// ── M10e gateway long-tail specials（端口自 Vue tree） ────────────────────────
//
// 全部走自管 GET/PUT lifecycle，与 patchSettings 流水线解耦（与 overload-cooldown
// 同款）。openai_fast_policy_settings 例外：仍是 flat key，跟 form 同流水线。

export interface StreamTimeoutSettings {
	enabled: boolean;
	action: 'temp_unsched' | 'error' | 'none';
	temp_unsched_minutes: number;
	threshold_count: number;
	threshold_window_minutes: number;
}

export interface RectifierSettings {
	enabled: boolean;
	thinking_signature_enabled: boolean;
	thinking_budget_enabled: boolean;
	apikey_signature_enabled: boolean;
	apikey_signature_patterns: string[];
}

export interface BetaPolicyRule {
	beta_token: string;
	action: 'pass' | 'filter' | 'block';
	scope: 'all' | 'oauth' | 'apikey' | 'bedrock';
	error_message?: string;
	model_whitelist?: string[];
	fallback_action?: 'pass' | 'filter' | 'block';
	fallback_error_message?: string;
}

export interface BetaPolicySettings {
	rules: BetaPolicyRule[];
}

export interface OpenAIFastPolicyRule {
	service_tier: 'all' | 'priority' | 'flex';
	action: 'pass' | 'filter' | 'block';
	scope: 'all' | 'oauth' | 'apikey' | 'bedrock';
	error_message?: string;
	model_whitelist?: string[];
	fallback_action?: 'pass' | 'filter' | 'block';
	fallback_error_message?: string;
}

export interface OpenAIFastPolicySettings {
	rules: OpenAIFastPolicyRule[];
}

export interface WebSearchProviderConfig {
	type: 'brave' | 'tavily';
	api_key: string;
	api_key_configured: boolean;
	quota_limit: number | null;
	subscribed_at: number | null;
	quota_used?: number;
	proxy_id: number | null;
	expires_at: number | null;
}

export interface WebSearchEmulationConfig {
	enabled: boolean;
	providers: WebSearchProviderConfig[];
}

export interface WebSearchTestResult {
	provider: string;
	query: string;
	results: { url: string; title: string; snippet: string; page_age?: string }[];
}

export interface EmailTemplateOption {
	value: string;
	label?: string;
	description?: string;
	category?: string;
	optional?: boolean;
}

export type EmailTemplateEventOption = string | EmailTemplateOption;

export interface EmailTemplateSummary {
	event: string;
	locale: string;
	subject: string;
	is_custom?: boolean;
	updated_at?: string;
}

export interface EmailTemplateListResponse {
	events: EmailTemplateEventOption[];
	locales: string[];
	templates?: EmailTemplateSummary[];
	placeholders?: string[];
}

export interface EmailTemplateDetail {
	event: string;
	locale: string;
	subject: string;
	html: string;
	is_custom?: boolean;
	updated_at?: string;
	placeholders?: string[];
}

export interface UpdateEmailTemplateRequest {
	subject: string;
	html: string;
}

export interface PreviewEmailTemplateRequest extends UpdateEmailTemplateRequest {
	event: string;
	locale: string;
}

export interface EmailTemplatePreviewResponse {
	subject: string;
	html: string;
}

// ── M10d backup lifecycle ────────────────────────────────────────────────────
//
// 端口自 frontend/src/api/v1/admin/backup.ts。后端路由组：admin.Group("/backups")。
// 走 `/api/v1/admin/backups/...`（前端 client.baseURL 默认空 + apiBase 拼接，与
// 已落地的 affiliates / payment 同款）。
//
// 与 settings flat-form 完全解耦 —— 本 lifecycle 走 GET/PUT/POST/DELETE 自管，
// 不进 patchSettings 流水线。BackupSection.svelte 独立 fetch + 自带保存按钮。

export interface BackupS3Config {
	endpoint: string;
	region: string;
	bucket: string;
	access_key_id: string;
	secret_access_key?: string;
	prefix: string;
	force_path_style: boolean;
}

export interface BackupScheduleConfig {
	enabled: boolean;
	cron_expr: string;
	retain_days: number;
	retain_count: number;
}

export interface BackupRecord {
	id: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	backup_type?: string;
	file_name?: string;
	s3_key?: string;
	size_bytes?: number;
	triggered_by?: string;
	error_message?: string;
	started_at?: string;
	finished_at?: string;
	expires_at?: string;
	progress?: string;
	restore_status?: string;
	restore_error?: string;
	restored_at?: string;
}

export interface BackupTestS3Response {
	ok: boolean;
	message: string;
}

export interface BackupListResponse {
	items: BackupRecord[];
}

export const settingsApi = {
	/** 拉取后端全量 settings 快照。 */
	async getSettings(): Promise<SettingsMap> {
		return unwrap<SettingsMap>(await apiClient.get('/api/v1/admin/settings'));
	},

	/**
	 * 提交增量 patch。仅含调用方判定的 dirty key。
	 * 返回 void —— 后端可能回完整 SystemSettings，这里不暴露给调用方避免双源同步；
	 * 调用方应在 success 后用 form 视图覆盖 savedSettings 快照。
	 */
	async patchSettings(payload: SettingsMap): Promise<void> {
		await apiClient.patch<SettingsMap>('/api/v1/admin/settings', payload);
	},

	/** 用表单实时值测 SMTP 连接（不持久化）。 */
	async testSmtpConnection(body: TestSmtpRequest): Promise<ApiActionResult> {
		const res = await apiClient.post<{ message?: string }>(
			'/api/v1/admin/settings/test-smtp',
			body
		);
		return { success: true, message: res?.message };
	},

	/** 用表单实时值发测试邮件（不持久化）。 */
	async sendTestEmail(body: SendTestEmailRequest): Promise<ApiActionResult> {
		const res = await apiClient.post<{ message?: string }>(
			'/api/v1/admin/settings/send-test-email',
			body
		);
		return { success: true, message: res?.message };
	},

	// ── Admin API Key CRUD（独立 lifecycle，不进 patchSettings 流水线） ────────────

	/** GET 当前 admin API key 状态（masked）。 */
	async getAdminApiKey(): Promise<AdminApiKeyStatus> {
		return unwrap<AdminApiKeyStatus>(await apiClient.get('/api/v1/admin/settings/admin-api-key'));
	},

	/** POST 重新生成 admin API key —— 返回一次性明文，前端必须立刻显示给管理员。 */
	async regenerateAdminApiKey(): Promise<AdminApiKeyResult> {
		return unwrap<AdminApiKeyResult>(await apiClient.post('/api/v1/admin/settings/admin-api-key/regenerate', {}));
	},

	/** DELETE 当前 admin API key。 */
	async deleteAdminApiKey(): Promise<void> {
		await apiClient.delete('/api/v1/admin/settings/admin-api-key');
	},

	// ── M11 gateway 自管理 endpoints ──────────────────────────────────────────────

	/** GET 当前 529 overload cooldown 设置。 */
	async getOverloadCooldownSettings(): Promise<OverloadCooldownSettings> {
		return unwrap<OverloadCooldownSettings>(await apiClient.get('/api/v1/admin/settings/overload-cooldown'));
	},

	/** PUT 完整 529 overload cooldown 配置 —— 不是 patch，整体替换。 */
	async updateOverloadCooldownSettings(
		body: OverloadCooldownSettings
	): Promise<OverloadCooldownSettings> {
		return unwrap<OverloadCooldownSettings>(await apiClient.put('/api/v1/admin/settings/overload-cooldown', body));
	},

	/** GET 当前 429 default cooldown 设置。 */
	async getRateLimit429CooldownSettings(): Promise<RateLimit429CooldownSettings> {
		return unwrap<RateLimit429CooldownSettings>(await apiClient.get('/api/v1/admin/settings/rate-limit-429-cooldown'));
	},

	/** PUT 完整 429 default cooldown 配置 —— 不是 patch，整体替换。 */
	async updateRateLimit429CooldownSettings(
		body: RateLimit429CooldownSettings
	): Promise<RateLimit429CooldownSettings> {
		return unwrap<RateLimit429CooldownSettings>(await apiClient.put('/api/v1/admin/settings/rate-limit-429-cooldown', body));
	},

	// ── M10e gateway long-tail self-managed endpoints ──────────────────────────

	async getStreamTimeoutSettings(): Promise<StreamTimeoutSettings> {
		return unwrap<StreamTimeoutSettings>(await apiClient.get('/api/v1/admin/settings/stream-timeout'));
	},
	async updateStreamTimeoutSettings(body: StreamTimeoutSettings): Promise<StreamTimeoutSettings> {
		return unwrap<StreamTimeoutSettings>(await apiClient.put('/api/v1/admin/settings/stream-timeout', body));
	},

	async getRectifierSettings(): Promise<RectifierSettings> {
		return unwrap<RectifierSettings>(await apiClient.get('/api/v1/admin/settings/rectifier'));
	},
	async updateRectifierSettings(body: RectifierSettings): Promise<RectifierSettings> {
		return unwrap<RectifierSettings>(await apiClient.put('/api/v1/admin/settings/rectifier', body));
	},

	async getBetaPolicySettings(): Promise<BetaPolicySettings> {
		return unwrap<BetaPolicySettings>(await apiClient.get('/api/v1/admin/settings/beta-policy'));
	},
	async updateBetaPolicySettings(body: BetaPolicySettings): Promise<BetaPolicySettings> {
		return unwrap<BetaPolicySettings>(await apiClient.put('/api/v1/admin/settings/beta-policy', body));
	},

	async getWebSearchEmulationConfig(): Promise<WebSearchEmulationConfig> {
		return unwrap<WebSearchEmulationConfig>(await apiClient.get('/api/v1/admin/settings/web-search-emulation'));
	},
	async updateWebSearchEmulationConfig(
		body: WebSearchEmulationConfig
	): Promise<WebSearchEmulationConfig> {
		return unwrap<WebSearchEmulationConfig>(await apiClient.put('/api/v1/admin/settings/web-search-emulation', body));
	},
	async testWebSearchEmulation(query: string): Promise<WebSearchTestResult> {
		return unwrap<WebSearchTestResult>(await apiClient.post('/api/v1/admin/settings/web-search-emulation/test', { query }));
	},
	async resetWebSearchUsage(providerType: string): Promise<void> {
		await apiClient.post('/api/v1/admin/settings/web-search-emulation/reset-usage', {
			provider_type: providerType
		});
	},

	// ── Email template editor（独立 lifecycle，不进 patchSettings） ─────────────

	async getEmailTemplates(): Promise<EmailTemplateListResponse> {
		return unwrap<EmailTemplateListResponse>(await apiClient.get('/api/v1/admin/settings/email-templates'));
	},
	async getEmailTemplate(event: string, locale: string): Promise<EmailTemplateDetail> {
		return unwrap<EmailTemplateDetail>(await apiClient.get(
			`/api/v1/admin/settings/email-templates/${encodeURIComponent(event)}/${encodeURIComponent(locale)}`
		));
	},
	async updateEmailTemplate(
		event: string,
		locale: string,
		body: UpdateEmailTemplateRequest
	): Promise<EmailTemplateDetail> {
		return unwrap<EmailTemplateDetail>(await apiClient.put(
			`/api/v1/admin/settings/email-templates/${encodeURIComponent(event)}/${encodeURIComponent(locale)}`,
			body
		));
	},
	async restoreOfficialEmailTemplate(event: string, locale: string): Promise<EmailTemplateDetail> {
		return unwrap<EmailTemplateDetail>(await apiClient.post(
			`/api/v1/admin/settings/email-templates/${encodeURIComponent(event)}/${encodeURIComponent(locale)}/restore-official`,
			{}
		));
	},
	async previewEmailTemplate(
		body: PreviewEmailTemplateRequest
	): Promise<EmailTemplatePreviewResponse> {
		return unwrap<EmailTemplatePreviewResponse>(await apiClient.post('/api/v1/admin/settings/email-template-preview', body));
	},

	// ── M10d backup endpoints（独立 lifecycle，不进 patchSettings） ─────────────

	async getBackupS3Config(): Promise<BackupS3Config> {
		return unwrap<BackupS3Config>(await apiClient.get('/api/v1/admin/backups/s3-config'));
	},
	async updateBackupS3Config(body: BackupS3Config): Promise<BackupS3Config> {
		return unwrap<BackupS3Config>(await apiClient.put('/api/v1/admin/backups/s3-config', body));
	},
	async testBackupS3Connection(body: BackupS3Config): Promise<BackupTestS3Response> {
		return unwrap<BackupTestS3Response>(await apiClient.post('/api/v1/admin/backups/s3-config/test', body));
	},
	async getBackupSchedule(): Promise<BackupScheduleConfig> {
		return unwrap<BackupScheduleConfig>(await apiClient.get('/api/v1/admin/backups/schedule'));
	},
	async updateBackupSchedule(body: BackupScheduleConfig): Promise<BackupScheduleConfig> {
		return unwrap<BackupScheduleConfig>(await apiClient.put('/api/v1/admin/backups/schedule', body));
	},
	async listBackups(): Promise<BackupListResponse> {
		return unwrap<BackupListResponse>(await apiClient.get('/api/v1/admin/backups'));
	},
	async createBackup(body: { expire_days?: number }): Promise<BackupRecord> {
		return unwrap<BackupRecord>(await apiClient.post('/api/v1/admin/backups', body ?? {}));
	},
	async getBackup(id: string): Promise<BackupRecord> {
		return unwrap<BackupRecord>(await apiClient.get(`/api/v1/admin/backups/${encodeURIComponent(id)}`));
	},
	async deleteBackup(id: string): Promise<void> {
		await apiClient.delete(`/api/v1/admin/backups/${encodeURIComponent(id)}`);
	},
	async getBackupDownloadURL(id: string): Promise<{ url: string }> {
		return unwrap<{ url: string }>(await apiClient.get(
			`/api/v1/admin/backups/${encodeURIComponent(id)}/download-url`
		));
	},
	async restoreBackup(id: string, password: string): Promise<BackupRecord> {
		return unwrap<BackupRecord>(await apiClient.post(
			`/api/v1/admin/backups/${encodeURIComponent(id)}/restore`,
			{ password }
		));
	}
};
