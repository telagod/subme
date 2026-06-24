import type { InstallRequest, SetupStatus } from '$lib/api/setup';

export const SETUP_STEPS = ['database', 'redis', 'admin', 'ready'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function currentBrowserPort(locationLike: Pick<Location, 'port' | 'protocol'> | null = typeof window !== 'undefined' ? window.location : null): number {
	if (!locationLike) return 8080;
	if (locationLike.port) {
		const parsed = Number.parseInt(locationLike.port, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return locationLike.protocol === 'https:' ? 443 : 80;
}

export function defaultInstallRequest(port = currentBrowserPort()): InstallRequest {
	return {
		database: {
			host: 'localhost',
			port: 5432,
			user: 'postgres',
			password: '',
			dbname: 'sub2api',
			sslmode: 'disable'
		},
		redis: {
			host: 'localhost',
			port: 6379,
			password: '',
			db: 0,
			enable_tls: false
		},
		admin: {
			email: '',
			password: ''
		},
		server: {
			host: '0.0.0.0',
			port,
			mode: 'release'
		}
	};
}

export function canProceed(stepIndex: number, state: {
	dbConnected: boolean;
	redisConnected: boolean;
	adminEmail: string;
	adminPassword: string;
	confirmPassword: string;
}): boolean {
	if (stepIndex === 0) return state.dbConnected;
	if (stepIndex === 1) return state.redisConnected;
	if (stepIndex === 2) {
		return (
			state.adminEmail.trim() !== '' &&
			state.adminPassword.length >= 8 &&
			state.adminPassword === state.confirmPassword
		);
	}
	return true;
}

export function setupStatusReady(status: SetupStatus | null | undefined): boolean {
	return Boolean(status && status.needs_setup === false);
}

export async function waitForSetupRestart(
	getStatus: () => Promise<SetupStatus>,
	options: { attempts?: number; delayMs?: number; initialDelayMs?: number } = {}
): Promise<boolean> {
	const attempts = options.attempts ?? 60;
	const delayMs = options.delayMs ?? 1000;
	const initialDelayMs = options.initialDelayMs ?? 3000;
	if (initialDelayMs > 0) await delay(initialDelayMs);

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			if (setupStatusReady(await getStatus())) return true;
		} catch {
			// Service may be restarting and temporarily unavailable.
		}
		if (attempt < attempts - 1) await delay(delayMs);
	}
	return false;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
