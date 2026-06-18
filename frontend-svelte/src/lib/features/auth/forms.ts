/**
 * Shared zod schemas + superforms helpers for auth pages (M7 register/forgot/reset).
 *
 * 设计契约：
 *   - 客户端校验只用 zod；服务端真实校验仍在后端 Vue tree（接口契约不变）。
 *   - 错误信息一律是 i18n key（auth.register.errors.* 等），UI 层经 $_(key) 解。
 *   - 不暴露 superForm 包装 —— page 自己 import superForm/defaults；这里只给
 *     schema、初始值 helper 与几个共享 util（密码强度、Turnstile gating）。
 *
 * 密码策略：
 *   - 最少 8 位（任务约束）；同时要求至少一个字母 + 一个数字，避免 "12345678" 通过。
 *   - 复杂度不做硬性大小写要求 —— Vue tree 历史只要求 min 6，本仓库收紧到 8 + 字母数字。
 *   - confirmPassword 用 refine 在 schema 层比对。
 */
import { z } from 'zod';

// ── 通用片段 ──────────────────────────────────────────────────────────

/** 邮箱必填 + 形如 RFC822 简化版校验。 */
export const emailSchema = z
	.string()
	.min(1, 'auth.errors.EMAIL_REQUIRED')
	.email('auth.errors.EMAIL_INVALID');

/**
 * 密码强度校验：
 *   - 至少 8 位
 *   - 至少包含一个字母（任意大小写）
 *   - 至少包含一个数字
 */
export const passwordSchema = z
	.string()
	.min(8, 'auth.register.errors.PASSWORD_TOO_SHORT')
	.refine((v) => /[A-Za-z]/.test(v), 'auth.register.errors.PASSWORD_NEEDS_LETTER')
	.refine((v) => /[0-9]/.test(v), 'auth.register.errors.PASSWORD_NEEDS_DIGIT');

// ── Register ─────────────────────────────────────────────────────────

/**
 * Register schema —— 字段：
 *   email / password / confirmPassword / agreementConsent? / turnstileToken? / affCode?
 *
 * agreementConsent 与 turnstileToken 在 schema 上始终可选；是否强制由 UI 在提交前
 * 根据 publicSettings 单独 gate（避免 schema 与运行时 settings 紧耦合）。
 */
export const registerSchema = z
	.object({
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: z.string().min(1, 'auth.register.errors.CONFIRM_REQUIRED'),
		agreementConsent: z.boolean().optional().default(false),
		turnstileToken: z.string().optional().default(''),
		affCode: z.string().optional().default('')
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: 'auth.register.errors.PASSWORD_MISMATCH',
		path: ['confirmPassword']
	});

export type RegisterForm = z.infer<typeof registerSchema>;

// ── Forgot password ─────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
	email: emailSchema,
	turnstileToken: z.string().optional().default('')
});

export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

// ── Reset password ──────────────────────────────────────────────────

export const resetPasswordSchema = z
	.object({
		newPassword: passwordSchema,
		confirmPassword: z.string().min(1, 'auth.register.errors.CONFIRM_REQUIRED')
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		message: 'auth.register.errors.PASSWORD_MISMATCH',
		path: ['confirmPassword']
	});

export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

// ── Affiliate code 捕获 ────────────────────────────────────────────

const AFF_STORAGE_KEY = 'oauth_aff_code';

/**
 * 从 URL 抓取 ?aff= 或 ?aff_code= 并写入 sessionStorage（供注册提交时回填）。
 * 浏览器端调用；SSR 下静默 no-op。
 */
export function captureAffiliateFromUrl(url: URL): string {
	if (typeof window === 'undefined') return '';
	const aff = url.searchParams.get('aff') || url.searchParams.get('aff_code') || '';
	if (!aff) return readStoredAffiliateCode();
	try {
		window.sessionStorage.setItem(AFF_STORAGE_KEY, aff);
	} catch {
		// ignore quota
	}
	return aff;
}

export function readStoredAffiliateCode(): string {
	if (typeof window === 'undefined') return '';
	try {
		return window.sessionStorage.getItem(AFF_STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

export function clearStoredAffiliateCode(): void {
	if (typeof window === 'undefined') return;
	try {
		window.sessionStorage.removeItem(AFF_STORAGE_KEY);
	} catch {
		/* ignore */
	}
}

// ── 错误归一化 ────────────────────────────────────────────────────

/**
 * Map 后端 / 网络 Error 到 i18n key。
 *
 * 输入是 Error，message 可能是后端原文 / 'HTTP 4xx' / 'unauthorized'。
 * 输出是 i18n key 字符串；UI 层 $_() 解为最终文案。
 */
export function mapAuthError(err: unknown, ns: 'register' | 'forgot' | 'reset'): string {
	if (!(err instanceof Error)) return `auth.${ns}.errors.UNKNOWN`;
	const msg = (err.message ?? '').toLowerCase();
	const code = (err as Error & { code?: string }).code;
	if (code === 'INVALID_RESET_TOKEN') return 'auth.invalidOrExpiredToken';
	if (msg.includes('network') || msg.includes('failed to fetch')) return 'auth.errors.NETWORK_ERROR';
	if (msg.includes('http 409') || msg.includes('email_in_use') || msg.includes('exists'))
		return 'auth.register.errors.EMAIL_IN_USE';
	if (msg.includes('http 4')) return `auth.${ns}.errors.BAD_REQUEST`;
	if (msg.includes('http 5')) return `auth.${ns}.errors.SERVER_ERROR`;
	return `auth.${ns}.errors.UNKNOWN`;
}
