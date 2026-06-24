/**
 * persisted<T>() · localStorage-backed Svelte 5 rune (M6 auth foundation)
 *
 * 设计契约：
 *   - SSR-safe：所有 window/localStorage 访问都先 `typeof window !== 'undefined'` 兜底，
 *     SvelteKit 在 prerender / Node 渲染阶段不会炸。
 *   - 失败兜底：JSON.parse 抛错、localStorage 抛 QuotaExceededError、Safari 私密模式
 *     直接禁写——一律 swallow + 退回 initial。永不 propagate 到上层 UI。
 *   - schema-version 前缀 (`__v__:`)：每个存储值附带版本头，未来 schema breaking change
 *     直接 bump V，旧值自动判失败回初值。当前 V=1。
 *   - 多 tab 同步：window.storage 事件订阅，其他 tab 写同 key 时同步本地 $state。
 *     适用：logout 同步、token 刷新同步。
 *
 * Vue tree 对照：
 *   `safeGetItem / safeSetItem / safeRemoveItem` 系列 +「不用 pinia-persistedstate」
 *   的手写策略。本实现把那套封装挪到 rune 层，token / user 等 5 个 key 全部通过它走。
 */

const SCHEMA_VERSION = 1;
const VERSION_PREFIX = `__v${SCHEMA_VERSION}__:`;

type Listener = () => void;

function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeRead<T>(key: string, initial: T): T {
	if (!isBrowser()) return initial;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null || raw === undefined) return initial;
		if (!raw.startsWith(VERSION_PREFIX)) {
			// schema mismatch (old or non-versioned write) → treat as missing, force reset。
			return initial;
		}
		const payload = raw.slice(VERSION_PREFIX.length);
		return JSON.parse(payload) as T;
	} catch {
		// JSON malformed / storage forbidden / quota → silent fallback。
		return initial;
	}
}

function safeWrite(key: string, value: unknown): void {
	if (!isBrowser()) return;
	try {
		const payload = VERSION_PREFIX + JSON.stringify(value);
		window.localStorage.setItem(key, payload);
	} catch {
		// 静默吞 QuotaExceededError / Safari private mode SecurityError。
		// 上层不感知失败，但 in-memory state 仍然是真值。
	}
}

function safeRemove(key: string): void {
	if (!isBrowser()) return;
	try {
		window.localStorage.removeItem(key);
	} catch {
		// 同上，静默。
	}
}

export interface PersistedRune<T> {
	get value(): T;
	set value(v: T);
	clear(): void;
	/** 强制重读 localStorage（多 tab 同步路径或手动恢复）。 */
	reload(): void;
}

/**
 * 创建一个 localStorage-backed 的 $state rune。
 *
 * @param key      localStorage 键名（建议带命名空间，例：'auth.token'）
 * @param initial  缺省值；解析失败、key 不存在、schema 不匹配时回落到此值
 *
 * 用法：
 *   const token = persisted<string | null>('auth.token', null);
 *   token.value = 'jwt...';   // 写入 localStorage + 触发响应式更新
 *   token.value;              // 读最新值
 *   token.clear();            // 删 localStorage + 复位 in-memory
 */
export function persisted<T>(key: string, initial: T): PersistedRune<T> {
	const state = $state<{ current: T }>({ current: safeRead(key, initial) });

	const listeners = new Set<Listener>();

	// 多 tab 同步：监听 storage 事件，仅响应同 key。
	if (isBrowser()) {
		window.addEventListener('storage', (ev: StorageEvent) => {
			if (ev.key !== key) return;
			// newValue=null 表示其他 tab 删了 key（logout 场景）。
			if (ev.newValue === null) {
				state.current = initial;
			} else {
				state.current = safeRead(key, initial);
			}
			for (const fn of listeners) fn();
		});
	}

	return {
		get value(): T {
			return state.current;
		},
		set value(v: T) {
			state.current = v;
			safeWrite(key, v);
		},
		clear(): void {
			state.current = initial;
			safeRemove(key);
		},
		reload(): void {
			state.current = safeRead(key, initial);
		}
	};
}
