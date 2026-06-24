import type { AuthUser } from '$lib/stores/auth.svelte';
import {
	enforceProtectedRoute,
	loginRedirectFor,
	logoutToLogin,
	type Navigate,
	type ProtectedAuth
} from './protectedGuard';

export type AdminGuardAuth = ProtectedAuth & {
	readonly isAuthenticated: boolean;
	readonly isAdmin: boolean;
	readonly user: AuthUser | null;
};

export { loginRedirectFor };

export async function enforceAdminRoute(
	auth: AdminGuardAuth,
	navigate: Navigate,
	pathname: string,
	search = ''
): Promise<'allow' | 'login' | 'forbidden'> {
	const protectedResult = await enforceProtectedRoute(auth, navigate, pathname, search);
	if (protectedResult === 'login') {
		return 'login';
	}
	if (!auth.isAdmin) {
		await navigate('/dashboard', { replaceState: true });
		return 'forbidden';
	}
	return 'allow';
}

export async function logoutFromAdmin(auth: Pick<AdminGuardAuth, 'logout'>, navigate: Navigate) {
	await logoutToLogin(auth, navigate);
}
