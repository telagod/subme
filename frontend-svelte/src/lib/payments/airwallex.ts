/**
 * Airwallex lazy facade · M6 payment increment
 *
 * 设计：
 *   - 与 stripe.ts 同样的延迟加载契约：所有 airwallex-payment-elements
 *     的运行时绑定都必须在 await import() 内部完成。
 *   - 类型 `AirwallexNamespace` 用 `typeof import(...)` 形式声明 ——
 *     TS 编译期擦除，不影响运行时 chunk。
 *   - 每个 env('demo'|'prod')cache 一份初始化后的 module namespace；
 *     再次调用直接复用，避免 init() 在某些场景下重复污染全局 listeners。
 *
 * RED LINE（memory: vendor-chunk-tdz-trap + 任务卡）：
 *   - 严禁在 src/lib OR src/routes 任何 .ts/.svelte 顶层
 *     `import 'from airwallex-payment-elements'` 或 `'@airwallex/*'`。
 *   - vite.config.ts manualChunks 必须把
 *       /airwallex-payment-elements/ 与 /@airwallex/
 *     路由到 vendor-airwallex lazy chunk；check-chunks.mjs 防止
 *     eager 泄漏。
 *
 * 提供给路由调用：
 *   - getAirwallex(env) → Promise<typeof import('airwallex-payment-elements')>
 *   - resetAirwallexCache() → 测试用 / 切换 env 时主动清缓存。
 */
type AirwallexNamespace = typeof import('airwallex-payment-elements');

// 每个 env 维护一份 init 后的 module namespace Promise。
const _cache = new Map<'demo' | 'prod', Promise<AirwallexNamespace>>();

/**
 * 异步获取 Airwallex SDK module namespace（lazy load + memoized per env）。
 *
 * @param env - 'demo' | 'prod'，与后端 channel.env 字段对齐。
 * @returns SDK 模块命名空间（`createElement` / `confirmPaymentIntent` 等）。
 */
export async function getAirwallex(env: 'demo' | 'prod'): Promise<AirwallexNamespace> {
	let pending = _cache.get(env);
	if (!pending) {
		pending = (async () => {
			// Lazy ESM dynamic import —— Rollup 自动切 vendor-airwallex lazy chunk。
			const mod = await import('airwallex-payment-elements');
			// init 是 idempotent 的：首次 attach 全局，二次 noop。
			// 包装在 try/catch 里，避免 SDK 升级后签名变化导致整个 facade 失活。
			try {
				const maybeInit = (mod as unknown as {
					init?: (opts: Record<string, unknown>) => void;
				}).init;
				if (typeof maybeInit === 'function') {
					maybeInit({ env, enabledElements: ['payments'] });
				}
			} catch {
				// 静默：init 失败不一定致命，让调用方自行 createElement 时再抛。
			}
			return mod;
		})();
		_cache.set(env, pending);
	}
	return pending;
}

/** 测试 / 切环境时清理缓存。 */
export function resetAirwallexCache(): void {
	_cache.clear();
}
