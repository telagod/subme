/**
 * vitest stub for $app/stores · SvelteKit 虚拟模块。
 *
 * sveltekit-superforms v2 仍从 $app/stores 拉 page / navigating。jsdom 下没有
 * SvelteKit runtime，本桩提供最小 readable store，让 superForm() 至少能 import 通。
 */
import { readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost/'),
	params: {} as Record<string, string>,
	route: { id: null as string | null },
	status: 200,
	error: null,
	data: {},
	form: null,
	state: {}
});

export const navigating = readable(null);
export const updated = readable(false);
