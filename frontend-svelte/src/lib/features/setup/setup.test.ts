import { describe, expect, it, vi } from 'vitest';
import { setupApi } from '$lib/api/setup';
import {
	canProceed,
	currentBrowserPort,
	defaultInstallRequest,
	setupStatusReady,
	waitForSetupRestart
} from './setup';

describe('setup helpers', () => {
	it('builds Vue-compatible default install config', () => {
		expect(defaultInstallRequest(3000)).toEqual({
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
				port: 3000,
				mode: 'release'
			}
		});
	});

	it('derives browser port with HTTP/HTTPS defaults', () => {
		expect(currentBrowserPort({ port: '5173', protocol: 'http:' } as Location)).toBe(5173);
		expect(currentBrowserPort({ port: '', protocol: 'https:' } as Location)).toBe(443);
		expect(currentBrowserPort({ port: '', protocol: 'http:' } as Location)).toBe(80);
	});

	it('gates wizard progress by connection tests and admin credentials', () => {
		expect(canProceed(0, { dbConnected: false, redisConnected: false, adminEmail: '', adminPassword: '', confirmPassword: '' })).toBe(false);
		expect(canProceed(0, { dbConnected: true, redisConnected: false, adminEmail: '', adminPassword: '', confirmPassword: '' })).toBe(true);
		expect(canProceed(1, { dbConnected: true, redisConnected: false, adminEmail: '', adminPassword: '', confirmPassword: '' })).toBe(false);
		expect(canProceed(1, { dbConnected: true, redisConnected: true, adminEmail: '', adminPassword: '', confirmPassword: '' })).toBe(true);
		expect(canProceed(2, { dbConnected: true, redisConnected: true, adminEmail: 'admin@example.com', adminPassword: 'password1', confirmPassword: 'password1' })).toBe(true);
		expect(canProceed(2, { dbConnected: true, redisConnected: true, adminEmail: 'admin@example.com', adminPassword: 'short', confirmPassword: 'short' })).toBe(false);
	});

	it('waits for setup status to become normal mode', async () => {
		const getStatus = vi
			.fn()
			.mockRejectedValueOnce(new Error('restart'))
			.mockResolvedValueOnce({ needs_setup: true, step: 'welcome' })
			.mockResolvedValueOnce({ needs_setup: false, step: 'welcome' });
		await expect(waitForSetupRestart(getStatus, { attempts: 3, delayMs: 0, initialDelayMs: 0 })).resolves.toBe(true);
		expect(setupStatusReady({ needs_setup: false, step: 'welcome' })).toBe(true);
	});
});

describe('setupApi', () => {
	it('unwraps setup status envelopes', async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({ data: { needs_setup: true, step: 'welcome' } })
		});
		vi.stubGlobal('fetch', fetcher);

		await expect(setupApi.status()).resolves.toEqual({ needs_setup: true, step: 'welcome' });
		expect(fetcher).toHaveBeenCalledWith('/setup/status', {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
			cache: 'no-store'
		});
		vi.unstubAllGlobals();
	});

	it('throws backend setup error messages', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => JSON.stringify({ message: 'Invalid database hostname' })
		}));

		await expect(setupApi.status()).rejects.toThrow('Invalid database hostname');
		vi.unstubAllGlobals();
	});
});
