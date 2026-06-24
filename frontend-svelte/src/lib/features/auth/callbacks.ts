/**
 * OAuth callback dispatch · M8 unified callback strategy table
 *
 * 设计契约（来自 Vue tree analyze）：
 *   - Vue tree 有 7 个独立 callback view（OAuthCallbackView/Linuxdo/DingTalk/
 *     DingTalkEmailCompletion/Wechat/WechatPayment/Oidc）—— Svelte rewrite
 *     压成一个 `/auth/callback/[provider]` polymorphic 路由 + 一个钉钉补邮箱页。
 *   - 不同 provider 的 UI 微差异（品牌色、文案、是否需要 WeChat mode 嗅探）只是
 *     "皮"；FSM 形状一致。这层抽出 strategy table，把 provider 特异点压成 config。
 *
 * Strategy shape：
 *   - call(params) → Promise<CallbackResult>，封装具体 POST。
 *   - intent 派生：state 含 `bind_current_user` → bind；否则 login。
 *     （Vue tree 把 intent 塞在 state base64 里；这里只关心是否含 bind 标记。）
 *
 * 失败语义：
 *   - 未知 provider → strategy lookup 失败 → CALLBACK_DISPATCH 抛同步 Error。
 *     调用方 await 时同样 throw（page 接住 → 跳 /auth/login）。
 *   - 网络/HTTP 4xx/5xx → apiClient throw Error；不在此层吞，原样上抛。
 *
 * 没有副作用：
 *   - 这层只下发 API call；setSession / goto / toast 全归 page 层。
 *   - 便于 vitest mock authApi 单测，零浏览器副作用。
 */
import {
	authApi,
	isTotpChallenge,
	isEmailCompletionRequired,
	type AuthResponse,
	type TotpChallengeResponse,
	type EmailCompletionRequired,
	type OAuthCallbackResponse
} from '$lib/api/auth';

/** intent 来源：state 字串带 `bind_current_user` 标记则视为绑定流程。 */
export type CallbackIntent = 'login' | 'bind';

export interface CallbackInput {
	code: string;
	state: string;
	/** WeChat 才用：'mp' 走微信内嵌浏览器，'open' 走外部浏览器；其他 provider 忽略。 */
	mode?: 'open' | 'mp';
}

/**
 * 归一化后的回调结果 —— page 层根据 kind 走分支。
 *
 * `auth` / `totp` / `emailCompletion` 三态对应后端三种 response shape。
 * intent 单独抽出，便于 page 在 auth 分支后判断是 "login 成功 setSession + goto"
 * 还是 "bind 成功 toast + 跳 /profile?tab=connections"。
 */
export type CallbackResult =
	| { kind: 'auth'; intent: CallbackIntent; response: AuthResponse }
	| { kind: 'totp'; response: TotpChallengeResponse }
	| { kind: 'emailCompletion'; response: EmailCompletionRequired };

export interface ProviderConfig {
	/** UI 显示用：未翻译的 provider 显示名（fallback；i18n 优先于此）。 */
	displayName: string;
	/** 品牌色 hex，纯 UI 装饰 —— 没翻不影响功能。 */
	brandColor: string;
	/**
	 * provider 是否需要走 EmailCompletionRequired 中间态。
	 * 目前只有 dingtalk 有这种能力（用户在钉钉里没绑邮箱）。其他 provider
	 * 即使后端误返此 shape 也会被 page 层走通用错误路径。
	 */
	supportsEmailCompletion: boolean;
}

/**
 * Provider 元数据表 —— 6 个支持的 provider + 1 个 GitHub/Google 共享别名。
 *
 * - linuxdo / dingtalk / oidc / wechat / github / google → 实际 provider。
 * - callback / oauth → 内部别名，留给后端 `/auth/callback?provider=` 形态，
 *   M8 阶段保留 alias 但 page 路由不暴露给用户；callbacks.test.ts 只测 6 个真实 provider。
 */
export const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
	linuxdo: { displayName: 'Linux.do', brandColor: '#f0941f', supportsEmailCompletion: false },
	dingtalk: { displayName: '钉钉', brandColor: '#1296db', supportsEmailCompletion: true },
	oidc: { displayName: 'OIDC', brandColor: '#27567d', supportsEmailCompletion: false },
	wechat: { displayName: '微信', brandColor: '#07c160', supportsEmailCompletion: false },
	github: { displayName: 'GitHub', brandColor: '#24292f', supportsEmailCompletion: false },
	google: { displayName: 'Google', brandColor: '#4285f4', supportsEmailCompletion: false }
};

/**
 * 判 state 是否携带 bind 意图。
 *
 * Vue tree 把 state 当 base64(JSON) 容器，里面可能含 intent: 'bind_current_user'。
 * 这里宽松匹配字串 —— 不解 base64，因为 backend 也接受裸 query 风格的 state。
 * 关键词命中即视为 bind；否则 login。
 */
export function deriveIntent(state: string): CallbackIntent {
	if (!state) return 'login';
	if (state.includes('bind_current_user')) return 'bind';
	if (state.includes('intent=bind')) return 'bind';
	return 'login';
}

/**
 * Provider strategy —— 每个 provider 的真实 POST 入口。
 *
 * 当前所有 provider 都打同一条 backend route `/auth/oauth/<provider>/callback`，
 * 但 future-proof：给出 strategy table，留下未来按 provider 切端点的余地
 * （比如 wechat 可能要切 `/oauth/wechat/start` 之类）。
 */
export type ProviderStrategy = (input: CallbackInput) => Promise<OAuthCallbackResponse>;

function defaultStrategy(provider: string): ProviderStrategy {
	return async ({ code, state, mode }) => {
		return authApi.oauthCallback(provider, { code, state, mode });
	};
}

/**
 * Dispatch 表：6 个 provider strategy。
 *
 * 选择 plain object 而不是 Map：枚举 / 反射 / TS 类型推导都更自然。
 * 未知 provider 由 dispatchCallback() 统一抛 UnknownProviderError。
 */
export const CALLBACK_DISPATCH: Record<string, ProviderStrategy> = {
	linuxdo: defaultStrategy('linuxdo'),
	dingtalk: defaultStrategy('dingtalk'),
	oidc: defaultStrategy('oidc'),
	wechat: defaultStrategy('wechat'),
	github: defaultStrategy('github'),
	google: defaultStrategy('google')
};

export class UnknownProviderError extends Error {
	readonly code = 'UNKNOWN_PROVIDER';
	constructor(public readonly provider: string) {
		super(`Unknown OAuth provider: ${provider}`);
	}
}

/**
 * 顶层调度入口 —— page 层只调这一个函数：
 *
 *   const result = await dispatchCallback('linuxdo', { code, state })
 *   switch (result.kind) { ... }
 *
 * intent 在 result.kind === 'auth' 时附带，便于 page 区分 login vs bind 后续动作。
 */
export async function dispatchCallback(
	provider: string,
	input: CallbackInput
): Promise<CallbackResult> {
	const strategy = CALLBACK_DISPATCH[provider];
	if (!strategy) {
		throw new UnknownProviderError(provider);
	}
	const response = await strategy(input);
	if (isEmailCompletionRequired(response)) {
		return { kind: 'emailCompletion', response };
	}
	if (isTotpChallenge(response)) {
		return { kind: 'totp', response };
	}
	const intent = deriveIntent(input.state ?? '');
	return { kind: 'auth', intent, response: response as AuthResponse };
}

/**
 * URL 错误参数到 user-friendly i18n key 的映射。
 *
 * 后端在 OAuth 失败时把 ?oauth_error=access_denied 之类塞回 callback URL。
 * page 层在 mount 时先扫这些参数，命中则跳过 dispatch 直接弹 toast + redirect。
 */
export function classifyOAuthErrorParam(err: string | null | undefined): string {
	if (!err) return '';
	const e = err.toLowerCase();
	if (e === 'access_denied' || e === 'user_cancelled') return 'auth.callback.errors.ACCESS_DENIED';
	if (e === 'invalid_state' || e === 'csrf') return 'auth.callback.errors.INVALID_STATE';
	if (e === 'server_error' || e === 'temporarily_unavailable')
		return 'auth.callback.errors.PROVIDER_ERROR';
	return 'auth.callback.errors.UNKNOWN';
}
