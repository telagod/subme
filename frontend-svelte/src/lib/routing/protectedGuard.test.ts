import { describe, expect, it, vi } from 'vitest';
import {
	enforceProtectedRoute,
	loginRedirectFor,
	logoutToLogin,
	type ProtectedAuth
} from './protectedGuard';

function makeAuth(overrides: Partial<ProtectedAuth> = {}): ProtectedAuth {
	return {
		hydrate: vi.fn(() => Promise.resolve()),
		logout: vi.fn(() => Promise.resolve()),
		isAuthenticated: false,
		user: null,
		...overrides
	};
}

describe('protectedGuard', () => {
	it('builds login redirects with the attempted URL', () => {
		expect(loginRedirectFor('/billing', '?tab=history')).toBe(
			'/auth/login?next=%2Fbilling%3Ftab%3Dhistory'
		);
	});

	it('sends anonymous users to login and preserves return path', async () => {
		const auth = makeAuth();
		const navigate = vi.fn();

		const result = await enforceProtectedRoute(auth, navigate, '/dashboard', '?from=nav');

		expect(result).toBe('login');
		expect(auth.hydrate).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('/auth/login?next=%2Fdashboard%3Ffrom%3Dnav', {
			replaceState: true
		});
	});

	it('allows authenticated users without navigation', async () => {
		const auth = makeAuth({ isAuthenticated: true });
		const navigate = vi.fn();

		const result = await enforceProtectedRoute(auth, navigate, '/dashboard');

		expect(result).toBe('allow');
		expect(navigate).not.toHaveBeenCalled();
	});

	it('logs out through auth before navigating to login', async () => {
		const auth = makeAuth({ isAuthenticated: true });
		const navigate = vi.fn();

		await logoutToLogin(auth, navigate);

		expect(auth.logout).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('/auth/login', { replaceState: true });
	});
});
