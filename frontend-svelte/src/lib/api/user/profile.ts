/**
 * User Profile API · Svelte rewrite (M7 profile/security/connections)
 *
 * 端点对齐 Vue tree（frontend/src/api/user.ts + auth.ts），但本层为 Svelte 端口
 * 提供一组语义清晰的入口：
 *   - updateBasicInfo  → PUT  /api/v1/user
 *   - changePassword   → PUT  /api/v1/user/password
 *   - enrollTotpStart  → POST /api/v1/user/totp/setup
 *   - enrollTotpConfirm → POST /api/v1/user/totp/enable
 *   - disableTotp      → POST /api/v1/user/totp/disable
 *   - startOAuthBind   → 构造 redirect URL（GET 直跳，不发 POST），交给 UI 触发
 *                        window.location.href；该函数仅返回字符串，便于测试。
 *   - unbindOAuth      → DELETE /api/v1/user/account-bindings/<provider>
 *   - deleteAccount    → DELETE /api/v1/user（subme 当前未暴露；保留 POC 入口，
 *                        后端落地前调用会 4xx，UI 用 confirm 表单 gate）。
 *
 * 设计：
 *   - 不引 axios；走 apiClient 已统一 401 兜底。
 *   - payload / response 用 UI 友好的 camelCase，snake_case 在本层折叠。
 *   - 不做缓存 —— +page.svelte 自行 stale。
 *
 * RED LINE：
 *   - 不在此层 import qrcode（QR 渲染在 TotpEnrollDialog 内 dynamic-import）。
 *   - 不写 window.location；UI 自行决定跳转时机。
 */
import { apiClient } from '../client';
import type { AuthUser } from '../auth';

// ── Basic info ─────────────────────────────────────────────────────────────

export interface UpdateBasicInfoPayload {
	username?: string;
	avatar_url?: string;
	language?: string;
	timezone?: string;
}

export async function updateBasicInfo(payload: UpdateBasicInfoPayload): Promise<AuthUser> {
	const resp = await apiClient.put<AuthUser | { data: AuthUser }>(`/api/v1/user`, payload);
	const wrapped = resp as { data?: AuthUser } | AuthUser;
	return wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data
		? (wrapped.data as AuthUser)
		: (wrapped as AuthUser);
}

// ── Password ───────────────────────────────────────────────────────────────

export interface ChangePasswordPayload {
	currentPassword: string;
	newPassword: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
	await apiClient.put<unknown>(`/api/v1/user/password`, {
		old_password: payload.currentPassword,
		new_password: payload.newPassword
	});
}

// ── TOTP / 2FA ─────────────────────────────────────────────────────────────

export interface EnrollTotpStartResponse {
	secret: string;
	qr_code_url: string;
	setup_token: string;
}

/**
 * 启动 TOTP 注册。Vue tree 需要 email_code 或 password 先验证身份，
 * 这里做单段 POST，由调用方组装 verification（password 或 email code）。
 */
export async function enrollTotpStart(payload: {
	password?: string;
	email_code?: string;
}): Promise<EnrollTotpStartResponse> {
	const resp = await apiClient.post<EnrollTotpStartResponse>(`/api/v1/user/totp/setup`, payload);
	return resp;
}

export interface EnrollTotpConfirmPayload {
	code: string;
	setup_token: string;
}

export async function enrollTotpConfirm(payload: EnrollTotpConfirmPayload): Promise<void> {
	await apiClient.post<unknown>(`/api/v1/user/totp/enable`, {
		totp_code: payload.code,
		setup_token: payload.setup_token
	});
}

export interface DisableTotpPayload {
	totpCode: string;
	password: string;
}

export async function disableTotp(payload: DisableTotpPayload): Promise<void> {
	await apiClient.post<unknown>(`/api/v1/user/totp/disable`, {
		totp_code: payload.totpCode,
		password: payload.password
	});
}

// ── OAuth bindings ─────────────────────────────────────────────────────────

export type OAuthProvider =
	| 'github'
	| 'google'
	| 'linuxdo'
	| 'dingtalk'
	| 'wechat'
	| 'oidc';

/**
 * 构造第三方账号绑定的起跳 URL。
 *
 * Vue tree 的 buildOAuthBindingStartURL：apiBase + /auth/oauth/<provider>/bind/start
 * 携带 redirect + intent；UI 端 prepareOAuthBindAccessTokenCookie() 后
 * window.location.href = url。本函数只返回 URL，转跳交给调用方。
 */
export function startOAuthBind(provider: OAuthProvider, opts: { redirect?: string } = {}): string {
	const base =
		typeof window !== 'undefined'
			? (window as unknown as { __APP_CONFIG__?: { apiBase?: string } }).__APP_CONFIG__?.apiBase ??
				''
			: '';
	const redirect = encodeURIComponent(opts.redirect ?? '/profile');
	return `${base}/api/v1/auth/oauth/${provider}/bind/start?redirect=${redirect}&intent=bind_current_user`;
}

export async function unbindOAuth(provider: OAuthProvider): Promise<AuthUser> {
	const resp = await apiClient.delete<AuthUser | { data: AuthUser }>(
		`/api/v1/user/account-bindings/${provider}`
	);
	const wrapped = resp as { data?: AuthUser } | AuthUser;
	return wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data
		? (wrapped.data as AuthUser)
		: (wrapped as AuthUser);
}

// ── Danger zone: delete account ────────────────────────────────────────────

export interface DeleteAccountPayload {
	email: string;
	password: string;
}

/**
 * 账户注销。subme 当前未暴露此端点（profile.api 备注: "no DELETE account endpoint"），
 * 保留前端入口为后端 future-work 预留契约；上游接通后 UI 无需调整。
 */
export async function deleteAccount(payload: DeleteAccountPayload): Promise<void> {
	await apiClient.delete<unknown>(`/api/v1/user`);
	// hint: 若后端要求 body，可改成 apiClient.post('/api/v1/user/delete', payload)
	// 不影响调用方契约。
	void payload;
}

export const userProfileApi = {
	updateBasicInfo,
	changePassword,
	enrollTotpStart,
	enrollTotpConfirm,
	disableTotp,
	startOAuthBind,
	unbindOAuth,
	deleteAccount
};
