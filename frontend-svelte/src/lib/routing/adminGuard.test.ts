import { describe, expect, it, vi } from 'vitest';
import { enforceAdminRoute, loginRedirectFor, logoutFromAdmin, type AdminGuardAuth } from './adminGuard';

function makeAuth(overrides: Partial<AdminGuardAuth> = {}): AdminGuardAuth {
	return {
		hydrate: vi.fn(() => Promise.resolve()),
		logout: vi.fn(() => Promise.resolve()),
		isAuthenticated: false,
		isAdmin: false,
		user: null,
		...overrides
	};
}

describe('adminGuard', () => {
	it('builds login redirects with the attempted admin URL', () => {
		expect(loginRedirectFor('/admin/users', '?q=a b')).toBe(
			'/auth/login?next=%2Fadmin%2Fusers%3Fq%3Da%20b'
		);
	});

	it('sends anonymous users to login and preserves return path', async () => {
		const auth = makeAuth();
		const navigate = vi.fn();

		const result = await enforceAdminRoute(auth, navigate, '/admin/settings', '?tab=backup');

		expect(result).toBe('login');
		expect(auth.hydrate).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('/auth/login?next=%2Fadmin%2Fsettings%3Ftab%3Dbackup', {
			replaceState: true
		});
	});

	it('sends authenticated non-admin users to the user dashboard', async () => {
		const auth = makeAuth({ isAuthenticated: true, isAdmin: false });
		const navigate = vi.fn();

		const result = await enforceAdminRoute(auth, navigate, '/admin/users');

		expect(result).toBe('forbidden');
		expect(navigate).toHaveBeenCalledWith('/dashboard', { replaceState: true });
	});

	it('allows authenticated admins without navigation', async () => {
		const auth = makeAuth({ isAuthenticated: true, isAdmin: true });
		const navigate = vi.fn();

		const result = await enforceAdminRoute(auth, navigate, '/admin/dashboard');

		expect(result).toBe('allow');
		expect(navigate).not.toHaveBeenCalled();
	});

	it('logs out through the auth store before navigating to login', async () => {
		const auth = makeAuth({ isAuthenticated: true, isAdmin: true });
		const navigate = vi.fn();

		await logoutFromAdmin(auth, navigate);

		expect(auth.logout).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('/auth/login', { replaceState: true });
	});
});
