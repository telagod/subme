import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pageSrc from '../../../routes/[...path]/+page.svelte?raw';

const gotoSpy = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoSpy(...args),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	preloadData: vi.fn(),
	preloadCode: vi.fn(),
	pushState: vi.fn(),
	replaceState: vi.fn(),
	onNavigate: vi.fn(),
	disableScrollHandling: vi.fn()
}));

beforeAll(async () => {
	addMessages('en', {
		common: { back: 'Back', dashboard: 'Dashboard' },
		errors: {
			pageNotFound: 'Page not found',
			pageNotFoundDescription: "The page you are looking for doesn't exist or has been moved."
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

describe('not found route', () => {
	it('keeps Vue catch-all route parity with a Svelte catch-all page', () => {
		expect(existsSync(resolve('src/routes/[...path]/+page.svelte'))).toBe(true);
		expect(pageSrc).toContain('data-testid="not-found-page"');
		expect(pageSrc).toContain('404');
	});

	it('renders actions and routes dashboard button through Svelte navigation', async () => {
		const page = await import('../../../routes/[...path]/+page.svelte');
		const { getByTestId, getByText } = render(page.default);

		expect(getByTestId('not-found-page')).toBeTruthy();
		expect(getByText('404')).toBeTruthy();
		await fireEvent.click(getByTestId('not-found-dashboard'));
		await waitFor(() => expect(gotoSpy).toHaveBeenCalledWith('/dashboard'));
	});
});
