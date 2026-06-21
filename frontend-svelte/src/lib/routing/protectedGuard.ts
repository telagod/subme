import type { AuthUser } from '$lib/stores/auth.svelte';

export type ProtectedAuth = {
	hydrate: () => Promise<void>;
	logout: () => Promise<void>;
	readonly isAuthenticated: boolean;
	readonly user: AuthUser | null;
};

export type Navigate = (path: string, opts?: { replaceState?: boolean }) => Promise<void> | void;

export function loginRedirectFor(pathname: string, search = ''): string {
	const current = `${pathname || '/dashboard'}${search || ''}`;
	return `/auth/login?next=${encodeURIComponent(current)}`;
}

export async function enforceProtectedRoute(
	auth: ProtectedAuth,
	navigate: Navigate,
	pathname: string,
	search = ''
): Promise<'allow' | 'login'> {
	await auth.hydrate();
	if (!auth.isAuthenticated) {
		await navigate(loginRedirectFor(pathname, search), { replaceState: true });
		return 'login';
	}
	return 'allow';
}

export async function logoutToLogin(auth: Pick<ProtectedAuth, 'logout'>, navigate: Navigate) {
	await auth.logout();
	await navigate('/auth/login', { replaceState: true });
}
