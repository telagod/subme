/**
 * 最小 Toast Store · Svelte 5 runes 版本（POC 4）
 *
 * 设计：
 *   - 用模块级 $state 持有 queue —— 任何组件都可订阅 readonly 列表渲染容器。
 *   - 不依赖第三方库（不安装 svelte-sonner）；后续真要换 sonner 只需把 push/dismiss
 *     映射到 toast.success / toast.error 即可，调用方接口不变。
 *   - showSuccess / showError 与 Vue tree appStore.show{Success,Error}() 同名同语义，
 *     方便从 Vue 路径直接搬。
 *
 * 测试：
 *   - 在 vitest 里默认 silent（不挂渲染器），靠 setSilent(true) 切到捕获模式，
 *     断言 push 的 message 即可。生产路径完全不需要切换。
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
}

const _queue = $state<Toast[]>([]);
let _silent = false;
let _seq = 0;

/** 只读视图 —— 供 ToastRegion 组件订阅。 */
export const toasts = {
	get list(): Toast[] {
		return _queue;
	}
};

function push(kind: ToastKind, message: string) {
	const id = ++_seq;
	_queue.push({ id, kind, message });
	if (!_silent && typeof window !== 'undefined') {
		// 简单 3s 自动消散；测试模式（silent）下保留以便断言。
		setTimeout(() => dismiss(id), 3000);
	}
}

export function dismiss(id: number) {
	const idx = _queue.findIndex((t) => t.id === id);
	if (idx >= 0) _queue.splice(idx, 1);
}

export function showSuccess(message: string) {
	push('success', message);
}

export function showError(message: string) {
	push('error', message);
}

export function showInfo(message: string) {
	push('info', message);
}

/** 测试用：禁用自动消散并清空当前 queue。 */
export function _resetForTest(silent = true) {
	_silent = silent;
	_queue.length = 0;
	_seq = 0;
}
