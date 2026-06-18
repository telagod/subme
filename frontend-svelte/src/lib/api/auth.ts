/**
 * Auth API endpoints · M6 thin wrapper
 *
 * 设计：
 *   - 路径与 Vue tree（`/api/v1/auth/*`）对齐；apiClient 已带 /api 前缀语义由 base 决定。
 *     注意：apiClient 不主动加 `/api/v1`，调用方必须给完整 path。
 *   - 仅暴露 M6 范围 actions：login / logout / me / register / forgotPassword /
 *     resetPassword / verifyEmail。其余 (2FA、refresh、OAuth) M7+ 再补。
 *   - 不抓 401 —— apiClient 已经统一兜底；本层只关心 payload shape + 错误传播。
 */
import { apiClient } from './client';

export interface LoginPayload {
	email: string;
	password: string;
	/** 可选 TOTP 2FA 码；当账户启用 2FA 时表单收集。 */
	totp?: string;
	turnstile_token?: string;
}

export interface AuthUser {
	id: number;
	email: string;
	username?: string;
	role?: 'admin' | 'user' | string;
	balance?: number;
	run_mode?: 'standard' | 'simple';
	[k: string]: unknown;
}

export interface AuthResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
	user: AuthUser;
}

export interface TotpChallengeResponse {
	requires_2fa: true;
	temp_token: string;
	user_email_masked?: string;
}

export type LoginResponse = AuthResponse | TotpChallengeResponse;

export function isTotpChallenge(r: LoginResponse): r is TotpChallengeResponse {
	return (
		typeof r === 'object' &&
		r !== null &&
		'requires_2fa' in r &&
		(r as TotpChallengeResponse).requires_2fa === true
	);
}

export interface RegisterPayload {
	email: string;
	username?: string;
	password: string;
	invitation_code?: string;
	aff_code?: string;
	promo_code?: string;
	verify_code?: string;
	agreement_consent?: boolean;
	turnstile_token?: string;
}

export interface RegisterResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
	user?: AuthUser;
	/** server 返回 verify_required=true 时进入邮件验证流程 */
	verify_required?: boolean;
	/** 邮箱验证已发出的提示 */
	message?: string;
}

export interface MeResponse {
	data: AuthUser;
}

export interface VerifyEmailResponse {
	/** ok=true 表示已成功验证 */
	ok?: boolean;
	/** server 用 status 描述非成功状态：already_verified / expired / invalid */
	status?: 'verified' | 'already_verified' | 'expired' | 'invalid';
	message?: string;
}

export const authApi = {
	login(payload: LoginPayload): Promise<LoginResponse> {
		return apiClient.post<LoginResponse>('/api/v1/auth/login', payload);
	},
	logout(refreshToken?: string | null): Promise<unknown> {
		return apiClient.post('/api/v1/auth/logout', { refresh_token: refreshToken ?? '' });
	},
	me(): Promise<MeResponse> {
		return apiClient.get<MeResponse>('/api/v1/auth/me');
	},
	register(payload: RegisterPayload): Promise<RegisterResponse> {
		return apiClient.post<RegisterResponse>('/api/v1/auth/register', payload);
	},
	/**
	 * 密码找回 · 请求重置链接。
	 *
	 * Vue tree 走 /auth/forgot-password；为兼容任务文档里给出的 /password-reset/request 别名，
	 * 这里同时暴露 requestPasswordReset，apiClient 实际仍命中 Vue 后端的 /forgot-password。
	 */
	forgotPassword(email: string, turnstileToken?: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/forgot-password', {
			email,
			turnstile_token: turnstileToken
		});
	},
	requestPasswordReset(email: string, turnstileToken?: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/forgot-password', {
			email,
			turnstile_token: turnstileToken
		});
	},
	resetPassword(email: string, token: string, newPassword: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/reset-password', {
			email,
			token,
			new_password: newPassword
		});
	},
	/**
	 * 密码找回 · 提交新密码。
	 *
	 * 与 resetPassword 同后端路径，但任务文档给出 {token, new_password} 签名（无 email），
	 * 后端按 reset_token 自身携带的身份信息处理；email 字段不存在时仅传 token + new_password。
	 */
	confirmPasswordReset(token: string, newPassword: string, email?: string): Promise<unknown> {
		const payload: Record<string, unknown> = {
			token,
			new_password: newPassword
		};
		if (email) payload.email = email;
		return apiClient.post('/api/v1/auth/reset-password', payload);
	},
	/** 邮箱验证 token（注册 / 找回流程）。Vue tree 用 send-verify-code，再 verify。 */
	verifyEmail(token: string): Promise<VerifyEmailResponse> {
		return apiClient.post<VerifyEmailResponse>('/api/v1/auth/verify-email', { token });
	},
	/** 触发重发邮箱验证邮件（链接式）。 */
	resendVerificationEmail(email: string, turnstileToken?: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/send-verify-code', {
			email,
			turnstile_token: turnstileToken
		});
	},
	/**
	 * Unified OAuth callback completion · M8 unified callback view
	 *
	 * 后端契约 (Vue tree analyze 给出):
	 *   - 主路径 POST /api/v1/auth/oauth/<provider>/callback {code, state, mode?}
	 *   - 返回 OAuthCallbackResponse 三态:
	 *       (a) AuthResponse { access_token, user, ... }            登录/绑定成功
	 *       (b) TotpChallengeResponse { requires_2fa, temp_token }  需要 2FA
	 *       (c) EmailCompletionRequired { requires_email_completion, partial_auth_token, provider_email_hint? }  钉钉缺邮箱
	 *
	 * provider 由路由 [provider] 传入；不在此层做白名单 —— callbacks.ts
	 * dispatch 已挡。失败一律 throw Error（apiClient 抛 message/HTTP code）。
	 */
	oauthCallback(provider: string, payload: OAuthCallbackPayload): Promise<OAuthCallbackResponse> {
		return apiClient.post<OAuthCallbackResponse>(
			`/api/v1/auth/oauth/${encodeURIComponent(provider)}/callback`,
			payload
		);
	},
	/**
	 * DingTalk email-completion · 二段流程
	 *
	 * DingTalk 是唯一可能给不出邮箱的 provider —— 用户在钉钉里没绑邮箱时
	 * callback 先发 partial_auth_token，前端跳 /auth/callback/dingtalk/email-completion
	 * 收齐 email + verify_code 后再 POST 这条端点换成正式 AuthResponse。
	 *
	 * 后端契约:
	 *   POST /api/v1/auth/oauth/dingtalk/email-completion
	 *     { email, code, partial_auth_token }
	 *   → AuthResponse 或 4xx error message。
	 */
	dingtalkEmailCompletion(payload: DingTalkEmailCompletionPayload): Promise<AuthResponse> {
		return apiClient.post<AuthResponse>(
			'/api/v1/auth/oauth/dingtalk/email-completion',
			payload
		);
	},
	/**
	 * Send DingTalk email-completion verification code.
	 *
	 * 服务端复用 /auth/send-verify-code 入口（与注册同源）；此处单独命名，
	 * 让钉钉补邮箱页面与注册的 verify-code 用同一后端通路而上层签名清晰。
	 */
	sendDingtalkEmailCode(email: string, partialAuthToken: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/send-verify-code', {
			email,
			intent: 'dingtalk_email_completion',
			partial_auth_token: partialAuthToken
		});
	}
};

// ── OAuth callback shapes ────────────────────────────────────────

export interface OAuthCallbackPayload {
	code?: string;
	state?: string;
	/** WeChat 专属: open | mp，由 callbacks.ts 决定后透传。 */
	mode?: 'open' | 'mp';
}

/**
 * 钉钉特化的中间态 —— 用户没绑邮箱时后端返回此 shape。
 * 前端跳 /auth/callback/dingtalk/email-completion 走二段流程。
 */
export interface EmailCompletionRequired {
	requires_email_completion: true;
	partial_auth_token: string;
	provider_email_hint?: string;
}

export function isEmailCompletionRequired(r: unknown): r is EmailCompletionRequired {
	return (
		typeof r === 'object' &&
		r !== null &&
		'requires_email_completion' in r &&
		(r as EmailCompletionRequired).requires_email_completion === true
	);
}

export type OAuthCallbackResponse =
	| AuthResponse
	| TotpChallengeResponse
	| EmailCompletionRequired;

export interface DingTalkEmailCompletionPayload {
	email: string;
	code: string;
	partial_auth_token: string;
}
