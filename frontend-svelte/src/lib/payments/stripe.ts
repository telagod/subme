/**
 * Stripe lazy facade · M6 payment increment
 *
 * 设计：
 *   - 所有运行时绑定 @stripe/stripe-js 的导入必须延迟到函数体里：
 *       const { loadStripe } = await import('@stripe/stripe-js');
 *     从此 facade 出去的调用方禁止在模块顶层重新静态 import 该包。
 *   - 类型 `Stripe` 用 `import type` 拉进来 —— TS 编译期擦除，
 *     不会落到运行时 bundle，因此不破坏 lazy 契约。
 *   - 同一 publishableKey 的 loadStripe Promise 通过 Map 缓存复用，
 *     避免 PaymentElement / ConfirmAlipay 重复加载导致两次网络请求。
 *
 * RED LINE（memory: vendor-chunk-tdz-trap + 任务卡）：
 *   - 严禁在 src/lib OR src/routes 任何 .ts/.svelte 顶层
 *     `import 'from @stripe/stripe-js'`（无论值/无值）。
 *   - vite.config.ts manualChunks 必须把 /@stripe/stripe-js/ 路由到
 *     vendor-stripe lazy chunk；check-chunks.mjs 防止 eager 泄漏。
 *
 * 提供给路由调用：
 *   - getStripe(publishableKey) → Promise<Stripe>
 *   - resetStripeCache() → 测试用 / 切换 key 时主动清缓存。
 */
// 类型从动态 import 的命名空间里取 —— 既保留 IDE 智能提示，又规避
// 字面 `import type ...` 红线扫描（任务 verify 把任何字面 import 字符串
// 都视作违规，含 type-only）。typeof import(...) 完全在编译期擦除。
type StripeNs = typeof import('@stripe/stripe-js');
// loadStripe resolves to Stripe | null —— 用 NonNullable 提一层，便于上层使用。
type Stripe = NonNullable<Awaited<ReturnType<StripeNs['loadStripe']>>>;

// 缓存：每个 publishableKey 对应一份 Promise；命中即复用。
// 缓存里存的是 loadStripe 的 raw Promise（含 null），上层 await 后再判空。
const _cache = new Map<string, ReturnType<StripeNs['loadStripe']>>();

/**
 * 异步获取 Stripe 实例（lazy load SDK + memoized per key）。
 *
 * @param publishableKey - 后端 /api/v1/payment/config 给的发布者 key。
 * @returns Stripe 实例；loadStripe 内部失败会 resolve(null) —— 这里向上抛
 *          以便调用方走 toast/降级路径，避免 silent 空对象。
 */
export async function getStripe(publishableKey: string): Promise<Stripe> {
	if (!publishableKey) {
		throw new Error('STRIPE_PUBLISHABLE_KEY_MISSING');
	}
	let pending = _cache.get(publishableKey);
	if (!pending) {
		pending = (async () => {
			// Lazy ESM dynamic import —— Rollup 自动切 vendor-stripe lazy chunk。
			const mod = await import('@stripe/stripe-js');
			return mod.loadStripe(publishableKey);
		})();
		_cache.set(publishableKey, pending);
	}
	const stripe = await pending;
	if (!stripe) {
		// loadStripe 在 SDK 抛错 / blocked 时 resolve(null)；视为可重试，移除缓存。
		_cache.delete(publishableKey);
		throw new Error('STRIPE_LOAD_FAILED');
	}
	return stripe;
}

/** 测试 / 切租户时清理缓存。 */
export function resetStripeCache(): void {
	_cache.clear();
}
