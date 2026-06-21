/**
 * svelte-i18n bootstrap（POC 3）
 *
 * 设计：
 *   - 懒注册 zh / en：locale 文件保持 .ts，svelte-i18n 接受 Promise<object>。
 *   - fallbackLocale: 'zh'（站点母语优先，Vue tree 沿用相同语义）。
 *   - initialLocale 从 localStorage 读取，缺省 'zh'；SSR 安全（typeof window）。
 *
 * 后续：locale 切换走 `locale.set('en')` 并同步写回 localStorage（POC 4 落地）。
 */
import { init, register, locale, waitLocale } from 'svelte-i18n';

const LOCALE_KEY = 'locale';

register('zh', () => import('./locales/zh').then((m) => m.default));
register('en', () => import('./locales/en').then((m) => m.default));

export const initialLocale =
	(typeof window !== 'undefined' && window.localStorage?.getItem(LOCALE_KEY)) || 'zh';

init({
	fallbackLocale: 'zh',
	initialLocale
});

export function waitInitialLocale(): Promise<void> {
	return waitLocale(initialLocale);
}

export { locale };
