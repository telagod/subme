/**
 * Auth store · Svelte 5 class singleton (M6 auth foundation)
 *
 * 设计契约：
 *   - token / user 通过 persisted<T>() 持久化到 localStorage（schema-versioned）；
 *     in-memory $state 由 persisted rune 内部托管，自动响应式更新。
 *   - refreshing: 内部 $state 标志位（避免并发 me() 飞行）。
 *   - 三个 getter：isAuthenticated / isAdmin / isSimpleMode，纯派生，订阅方在
 *     模板里直接 `$auth.isAuthenticated` 即可触发响应式更新（class 字段是 reactive）。
 *   - login()：错误统一 throw Error；上层 LoginView 接住后映射到 i18n key
 *     (auth.errors.* / auth.login.*) → showError() 弹 toast。
 *   - logout()：best-effort POST /auth/logout，server 失败一律 swallow，本地 clear
 *     必然执行（Vue tree finally 同语义）。重定向交给调用方决定（不写 window.location）。
 *   - hydrate()：booted-with-token 但 user 可能 stale → 拉 /auth/me 补齐。
 *   - refreshUser()：force re-fetch /auth/me。
 *
 * 单例：导出 `auth` 实例，全局共享。class 字段位于 .svelte.ts 模块，可被组件 / 非组件
 * 双向访问（apiClient 401 interceptor 直接 import auth.logout()）。
 */
import { persisted } from './persisted.svelte';
import { authApi, isTotpChallenge, type AuthUser, type LoginPayload } from '$lib/api/auth';

const TOKEN_KEY = 'auth.token';
const USER_KEY = 'auth.user';

class AuthStore {
	// 持久化层：token + user 两条主线。
	private readonly _token = persisted<string | null>(TOKEN_KEY, null);
	private readonly _user = persisted<AuthUser | null>(USER_KEY, null);

	// 易失状态：仅活在内存，不持久化。
	refreshing = $state(false);

	// ── 读访问 ─────────────────────────────────────────────────────────
	get token(): string | null {
		return this._token.value;
	}
	get user(): AuthUser | null {
		return this._user.value;
	}
	get isAuthenticated(): boolean {
		return !!this._token.value && !!this._user.value;
	}
	get isAdmin(): boolean {
		return this._user.value?.role === 'admin';
	}
	get isSimpleMode(): boolean {
		return this._user.value?.run_mode === 'simple';
	}

	// ── 写动作 ─────────────────────────────────────────────────────────

	/**
	 * 完成账密登录。
	 *
	 * 流程：
	 *   1. POST /auth/login
	 *   2. 若返回 2FA challenge → 抛带 code='TOTP_REQUIRED' 的 Error，
	 *      LoginView 监听后切到 2FA 表单（M6 阶段不实现 2FA 完成路径，仅识别 + 报错）。
	 *   3. 正常 AuthResponse → 落 token + user。
	 *
	 * 失败：throw Error，message 已是后端 message 或 'HTTP <code>'；上层映射 i18n。
	 */
	async login(payload: LoginPayload): Promise<void> {
		const resp = await authApi.login(payload);
		if (isTotpChallenge(resp)) {
			const err = new Error('TOTP_REQUIRED') as Error & { code?: string; tempToken?: string };
			err.code = 'TOTP_REQUIRED';
			err.tempToken = resp.temp_token;
			throw err;
		}
		this._token.value = resp.access_token;
		this._user.value = resp.user ?? null;
	}

	/**
	 * 退出登录。
	 *
	 * 行为：
	 *   - 试图 POST /auth/logout 撤销 server-side refresh token；网络 / 4xx 一律 swallow。
	 *   - finally 永远 clear 本地 token + user。
	 *   - 重定向不在此处做；调用方（hooks.client / interceptor / UI 按钮）自决。
	 */
	async logout(): Promise<void> {
		try {
			await authApi.logout(null);
		} catch {
			// 静默：本地 teardown 才是关键。Vue tree 同 finally 语义。
		} finally {
			// 用 clear() 而不是 value=null：彻底删 localStorage key，
			// 触发跨 tab storage 事件（newValue=null），其他 tab 立即同步登出。
			this._token.clear();
			this._user.clear();
		}
	}

	/**
	 * 冷启动 hydrate：有 token 但可能 user 缺失或 stale，拉一次 /auth/me。
	 *
	 * - 无 token：no-op。
	 * - 有 token + user：no-op（信任本地）。
	 * - 有 token + 无 user：拉 me；失败则 clear token（视为失效）。
	 */
	async hydrate(): Promise<void> {
		if (!this._token.value) return;
		if (this._user.value) return;
		await this.refreshUser();
	}

	/**
	 * 强制重新拉取当前用户。失败时清空 token（视为不可信）。
	 */
	async refreshUser(): Promise<void> {
		if (!this._token.value) return;
		if (this.refreshing) return;
		this.refreshing = true;
		try {
			const resp = await authApi.me();
			// /auth/me 实际形态可能是 { data: User } 也可能直接是 User —— Vue tree
			// 同时见过两种 shape。先尝试 .data，再退回整体。
			const wrapped = resp as { data?: AuthUser } | AuthUser;
			const userObj =
				wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data
					? (wrapped.data as AuthUser)
					: (wrapped as AuthUser);
			this._user.value = userObj ?? null;
		} catch {
			this._token.clear();
			this._user.clear();
		} finally {
			this.refreshing = false;
		}
	}

	/**
	 * 测试 / OAuth callback / 跨 tab 同步用：直接灌入 token + user。
	 * 不走网络，仅落 localStorage + in-memory。
	 */
	setSession(token: string, user: AuthUser): void {
		this._token.value = token;
		this._user.value = user;
	}

	/**
	 * OAuth fragment / pending completion only returns an access token. Store it first so
	 * refreshUser() can call /auth/me, then let refreshUser() populate or clear user.
	 */
	setToken(token: string): void {
		this._token.value = token;
		this._user.clear();
	}

	/** 测试钩子：直接 clear 本地，不调用 server。 */
	_clearLocal(): void {
		this._token.clear();
		this._user.clear();
	}
}

export const auth = new AuthStore();
export type { AuthUser };
