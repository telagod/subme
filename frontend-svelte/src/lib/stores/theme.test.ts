import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminLayoutSrc from '../../routes/admin/+layout.svelte?raw';
import userLayoutSrc from '../../routes/(user)/+layout.svelte?raw';
import { theme } from './theme.svelte';

describe('theme store', () => {
	beforeEach(() => {
		window.localStorage.clear();
		theme._clearLocal();
	});

	it('toggles between light and dark and persists preference', () => {
		expect(theme.mode).toBe('light');
		expect(theme.isDark).toBe(false);

		theme.toggle();

		expect(theme.mode).toBe('dark');
		expect(theme.isDark).toBe(true);
		expect(window.localStorage.getItem('ui.theme')).toBe('__v1__:"dark"');
		expect(window.localStorage.getItem('theme-preference')).toBe('dark');

		theme.toggle();

		expect(theme.mode).toBe('light');
		expect(theme.isDark).toBe(false);
		expect(window.localStorage.getItem('ui.theme')).toBe('__v1__:"light"');
		expect(window.localStorage.getItem('theme-preference')).toBe('light');
	});

	it('sets an explicit mode', () => {
		theme.setMode('dark');

		expect(theme.mode).toBe('dark');
		expect(theme.isDark).toBe(true);
	});

	it('initializes from the legacy Vue theme-preference key', async () => {
		theme._clearLocal();
		window.localStorage.setItem('theme-preference', 'dark');

		vi.resetModules();
		const mod = await import('./theme.svelte');

		expect(mod.theme.mode).toBe('dark');
		expect(mod.theme.isDark).toBe(true);
		mod.theme._clearLocal();
	});

	it('wires user and admin layouts into AppShell theme controls', () => {
		for (const src of [adminLayoutSrc, userLayoutSrc]) {
			expect(src).toContain("import { theme } from '$lib/stores/theme.svelte'");
			expect(src).toContain('theme.toggle();');
			expect(src).toContain('isDark={theme.isDark}');
			expect(src).toContain('onToggleTheme={handleToggleTheme}');
		}
	});
});
