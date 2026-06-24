/**
 * persisted.svelte.ts · vitest 覆盖（M6 auth foundation）
 *
 * 覆盖点：
 *   1. 基本 round-trip（写 → 读 → 改）
 *   2. 缺失 key 落回 initial
 *   3. 旧 schema / 无版本前缀的 raw → 视为缺失，落回 initial（防止脏值污染）
 *   4. JSON 损坏 → 落回 initial
 *   5. clear() 删 localStorage
 *   6. storage 事件触发跨 tab 同步
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { persisted } from './persisted.svelte';

describe('persisted rune · localStorage round-trip', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('reads initial when key absent', () => {
		const r = persisted<number>('test.absent', 42);
		expect(r.value).toBe(42);
	});

	it('round-trips set / get / clear', () => {
		const r = persisted<{ x: number }>('test.obj', { x: 0 });
		expect(r.value.x).toBe(0);
		r.value = { x: 7 };
		expect(r.value.x).toBe(7);
		// 新建一个 rune 验证持久化（同 key）。
		const r2 = persisted<{ x: number }>('test.obj', { x: 0 });
		expect(r2.value.x).toBe(7);
		r.clear();
		expect(window.localStorage.getItem('test.obj')).toBeNull();
		const r3 = persisted<{ x: number }>('test.obj', { x: 999 });
		expect(r3.value.x).toBe(999);
	});

	it('falls back to initial on malformed JSON', () => {
		// 写一个带版本头的损坏 JSON
		window.localStorage.setItem('test.bad', '__v1__:{not json');
		const r = persisted<string>('test.bad', 'fallback');
		expect(r.value).toBe('fallback');
	});

	it('treats unversioned legacy value as missing', () => {
		// 旧版本（无版本头）直接抛弃。
		window.localStorage.setItem('test.legacy', '"old"');
		const r = persisted<string>('test.legacy', 'fresh');
		expect(r.value).toBe('fresh');
	});

	it('treats stale schema-version prefix as missing', () => {
		window.localStorage.setItem('test.stale', '__v0__:"stale"');
		const r = persisted<string>('test.stale', 'new');
		expect(r.value).toBe('new');
	});

	it('reload() re-reads localStorage on demand', () => {
		const r = persisted<number>('test.reload', 0);
		// 模拟外部直写（譬如同 tab 内非 rune 路径）
		window.localStorage.setItem('test.reload', '__v1__:5');
		r.reload();
		expect(r.value).toBe(5);
	});

	it('storage event syncs across tabs (set)', () => {
		const r = persisted<string | null>('test.sync', null);
		expect(r.value).toBeNull();
		// 模拟另一个 tab 写入。
		window.localStorage.setItem('test.sync', '__v1__:"from-other-tab"');
		const ev = new StorageEvent('storage', {
			key: 'test.sync',
			oldValue: null,
			newValue: '__v1__:"from-other-tab"',
			storageArea: window.localStorage
		});
		window.dispatchEvent(ev);
		expect(r.value).toBe('from-other-tab');
	});

	it('storage event syncs across tabs (logout / remove)', () => {
		const r = persisted<string | null>('test.logout', null);
		r.value = 'present';
		expect(r.value).toBe('present');
		// 另一个 tab 调 logout 删 key。
		window.localStorage.removeItem('test.logout');
		const ev = new StorageEvent('storage', {
			key: 'test.logout',
			oldValue: '__v1__:"present"',
			newValue: null,
			storageArea: window.localStorage
		});
		window.dispatchEvent(ev);
		expect(r.value).toBeNull();
	});

	it('ignores storage events for other keys', () => {
		const r = persisted<string>('test.scoped', 'mine');
		r.value = 'mine-set';
		const ev = new StorageEvent('storage', {
			key: 'unrelated',
			oldValue: null,
			newValue: '__v1__:"noise"',
			storageArea: window.localStorage
		});
		window.dispatchEvent(ev);
		expect(r.value).toBe('mine-set');
	});
});
