/**
 * vitest stub for $app/forms · SvelteKit 虚拟模块。
 *
 * sveltekit-superforms 用 applyAction / deserialize / enhance；SPA 测试里
 * 这些路径不会被实际触发（superForm 走 use:enhance + onUpdate 拦截），
 * 但 import 必须能解析。
 */
export function applyAction(_data?: unknown): Promise<void> {
	return Promise.resolve();
}
export function deserialize<T = unknown>(data: string): T {
	try {
		return JSON.parse(data) as T;
	} catch {
		return data as unknown as T;
	}
}
/**
 * kit enhance —— SvelteKit form actions 客户端拦截器。
 *
 * sveltekit-superforms 用它把 form.submit 转成 SPA 调用：
 *   kitEnhance(form, async (submitParams) => { ... }) — 收到 submit 事件时
 *   阻止默认行为，调 submitParams handler；SPA 模式下 handler 内部
 *   会调 onUpdate({ form: validated, cancel }) → 验证 + 触发 onSubmit 业务。
 *
 * vitest 下需要把这套真实实现一份最小子集放出来：
 *   1. 监听 submit，preventDefault
 *   2. 构造 SubmitFunction 期望的 params shape（formData / formElement /
 *      action / cancel / controller / submitter / abort）
 *   3. 调 callback；如果 callback 返回 result-handler 函数，再调它（一些
 *      superforms 路径用 onSubmit 返回 onResult callback；M6 范围内不触发，
 *      no-op 即可）。
 */
export function enhance(form: HTMLFormElement, submit?: (params: unknown) => unknown) {
	async function handler(ev: Event) {
		ev.preventDefault();
		if (!submit) return;
		const formData = new FormData(form);
		const controller = new AbortController();
		let cancelled = false;
		const params = {
			action: new URL(form.action || 'http://localhost/', 'http://localhost/'),
			formData,
			formElement: form,
			controller,
			submitter: null as HTMLElement | null,
			cancel() {
				cancelled = true;
			},
			abort() {
				controller.abort();
			}
		};
		try {
			const ret = await submit(params);
			if (cancelled) return;
			if (typeof ret === 'function') {
				// onResult callback —— SPA 模式不命中，直接 noop。
				/* noop */
			}
		} catch {
			/* swallow — 业务层 onUpdate 自己已抛过 toast */
		}
	}
	form.addEventListener('submit', handler);
	return {
		destroy() {
			form.removeEventListener('submit', handler);
		}
	};
}
