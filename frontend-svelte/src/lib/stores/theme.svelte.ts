/**
 * Theme store · app-wide light/dark preference.
 *
 * Keeps the shell theme state in the same localStorage-backed rune style as auth.
 * AppShell owns the actual documentElement class sync through its isDark prop.
 */
import { persisted } from './persisted.svelte';

export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'ui.theme';
const LEGACY_THEME_KEY = 'theme-preference';
const DEFAULT_THEME: ThemeMode = 'light';

function readLegacyTheme(): ThemeMode {
	if (typeof window === 'undefined') return DEFAULT_THEME;
	try {
		const stored = window.localStorage.getItem(LEGACY_THEME_KEY);
		return stored === 'dark' || stored === 'light' ? stored : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

function writeLegacyTheme(mode: ThemeMode): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(LEGACY_THEME_KEY, mode);
	} catch {
		// Best-effort compatibility mirror for the old Vue key.
	}
}

function clearLegacyTheme(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(LEGACY_THEME_KEY);
	} catch {
		// Best-effort test/reset helper.
	}
}

class ThemeStore {
	private readonly _mode = persisted<ThemeMode>(THEME_KEY, readLegacyTheme());

	get mode(): ThemeMode {
		return this._mode.value === 'dark' ? 'dark' : 'light';
	}

	get isDark(): boolean {
		return this.mode === 'dark';
	}

	setMode(mode: ThemeMode): void {
		this._mode.value = mode;
		writeLegacyTheme(mode);
	}

	toggle(): void {
		this.setMode(this.isDark ? 'light' : 'dark');
	}

	/** Testing hook: clear persisted preference and reset in-memory state. */
	_clearLocal(): void {
		this._mode.clear();
		clearLegacyTheme();
	}
}

export const theme = new ThemeStore();
