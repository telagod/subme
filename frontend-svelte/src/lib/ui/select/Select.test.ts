/**
 * Select sentinel contract test（POC 3）
 *
 * 验尸点：
 *   - mount(value="")  → 必抛
 *   - mount(value="__all__") → 必不抛
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Select from './Select.svelte';

describe('Select sentinel contract', () => {
	it('throws when value is empty string', () => {
		expect(() => render(Select, { props: { value: '' } })).toThrow(/Select sentinel/);
	});

	it('throws when value is null', () => {
		// @ts-expect-error — intentionally pass null to assert runtime sentinel
		expect(() => render(Select, { props: { value: null } })).toThrow(/Select sentinel/);
	});

	it('does NOT throw when value is "__all__" sentinel', () => {
		expect(() => render(Select, { props: { value: '__all__' } })).not.toThrow();
	});

	it('does NOT throw when value is a real business value', () => {
		expect(() => render(Select, { props: { value: 'openai' } })).not.toThrow();
	});
});
