/**
 * Setup API endpoints.
 *
 * These endpoints live at /setup/*, not /api/v1/*, and must remain usable
 * before auth, config, and apiClient unauthorized hooks are initialized.
 */

export interface SetupStatus {
	needs_setup: boolean;
	step: string;
}

export interface DatabaseConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	dbname: string;
	sslmode: 'disable' | 'require' | 'verify-ca' | 'verify-full' | string;
}

export interface RedisConfig {
	host: string;
	port: number;
	password: string;
	db: number;
	enable_tls: boolean;
}

export interface AdminConfig {
	email: string;
	password: string;
}

export interface ServerConfig {
	host: string;
	port: number;
	mode: 'release' | 'debug' | string;
}

export interface InstallRequest {
	database: DatabaseConfig;
	redis: RedisConfig;
	admin: AdminConfig;
	server: ServerConfig;
}

export interface InstallResponse {
	message: string;
	restart: boolean;
}

interface ApiEnvelope<T> {
	code?: number;
	message?: string;
	detail?: string;
	data?: T;
}

function unwrapMaybeEnvelope<T>(value: T | ApiEnvelope<T>): T {
	if (
		value &&
		typeof value === 'object' &&
		'data' in value &&
		(value as ApiEnvelope<T>).data !== undefined
	) {
		return (value as ApiEnvelope<T>).data as T;
	}
	return value as T;
}

function errorMessage(status: number, parsed: unknown): string {
	if (parsed && typeof parsed === 'object') {
		const record = parsed as Record<string, unknown>;
		return String(record.detail || record.message || record.error || `HTTP ${status}`);
	}
	if (typeof parsed === 'string' && parsed.trim()) return parsed;
	return `HTTP ${status}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const init: RequestInit = {
		method,
		headers: { 'Content-Type': 'application/json' },
		cache: 'no-store'
	};
	if (body !== undefined) init.body = JSON.stringify(body);

	const res = await fetch(path, init);
	const text = await res.text();
	let parsed: unknown = undefined;
	if (text) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}
	if (!res.ok) {
		throw new Error(errorMessage(res.status, parsed));
	}
	return unwrapMaybeEnvelope<T>(parsed as T | ApiEnvelope<T>);
}

export const setupApi = {
	status(): Promise<SetupStatus> {
		return request<SetupStatus>('GET', '/setup/status');
	},
	testDatabase(config: DatabaseConfig): Promise<unknown> {
		return request('POST', '/setup/test-db', config);
	},
	testRedis(config: RedisConfig): Promise<unknown> {
		return request('POST', '/setup/test-redis', config);
	},
	install(config: InstallRequest): Promise<InstallResponse> {
		return request<InstallResponse>('POST', '/setup/install', config);
	}
};
