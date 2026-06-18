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
	turnstile_token?: string;
}

export interface MeResponse {
	data: AuthUser;
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
	register(payload: RegisterPayload): Promise<AuthResponse> {
		return apiClient.post<AuthResponse>('/api/v1/auth/register', payload);
	},
	forgotPassword(email: string, turnstileToken?: string): Promise<unknown> {
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
	/** 邮箱验证 token（注册 / 找回流程）。Vue tree 用 send-verify-code，再 verify。 */
	verifyEmail(token: string): Promise<unknown> {
		return apiClient.post('/api/v1/auth/verify-email', { token });
	}
};
