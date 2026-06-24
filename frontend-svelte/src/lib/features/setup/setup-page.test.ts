import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';

const mockTestDatabase = vi.fn();
const mockTestRedis = vi.fn();
const mockInstall = vi.fn();
const mockStatus = vi.fn();
const mockGoto = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/api/setup', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/setup')>();
	return {
		...actual,
		setupApi: {
			status: (...args: unknown[]) => mockStatus(...args),
			testDatabase: (...args: unknown[]) => mockTestDatabase(...args),
			testRedis: (...args: unknown[]) => mockTestRedis(...args),
			install: (...args: unknown[]) => mockInstall(...args)
		}
	};
});

vi.mock('$lib/features/setup/setup', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/features/setup/setup')>();
	return {
		...actual,
		waitForSetupRestart: vi.fn(async () => true)
	};
});

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => mockGoto(...args),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn(),
	invalidate: vi.fn().mockResolvedValue(undefined),
	invalidateAll: vi.fn().mockResolvedValue(undefined),
	preloadData: vi.fn().mockResolvedValue({}),
	preloadCode: vi.fn().mockResolvedValue(undefined),
	pushState: vi.fn(),
	replaceState: vi.fn(),
	onNavigate: vi.fn(),
	disableScrollHandling: vi.fn()
}));

beforeAll(async () => {
	addMessages('en', {
		setup: {
			title: 'subme Setup',
			description: 'Configure your subme instance',
			database: {
				title: 'Database Configuration',
				description: 'Connect to your PostgreSQL database',
				host: 'Host',
				port: 'Port',
				username: 'Username',
				password: 'Password',
				databaseName: 'Database Name',
				sslMode: 'SSL Mode',
				ssl: {
					disable: 'Disable',
					require: 'Require',
					verifyCa: 'Verify CA',
					verifyFull: 'Verify Full'
				}
			},
			redis: {
				title: 'Redis Configuration',
				description: 'Connect to your Redis server',
				host: 'Host',
				port: 'Port',
				password: 'Password (optional)',
				database: 'Database',
				enableTls: 'Enable TLS',
				enableTlsHint: 'Use TLS when connecting to Redis'
			},
			admin: {
				title: 'Admin Account',
				description: 'Create your administrator account',
				email: 'Email',
				password: 'Password',
				confirmPassword: 'Confirm Password',
				passwordMismatch: 'Passwords do not match'
			},
			ready: {
				title: 'Ready to Install',
				description: 'Review your configuration and complete setup',
				database: 'Database',
				redis: 'Redis',
				adminEmail: 'Admin Email'
			},
			status: {
				testing: 'Testing...',
				success: 'Connection Successful',
				testConnection: 'Test Connection',
				installing: 'Installing...',
				completeInstallation: 'Complete Installation',
				completed: 'Installation completed!',
				redirecting: 'Redirecting to login page...',
				restarting: 'Service is restarting, please wait...',
				timeout: 'Service restart is taking longer than expected.'
			}
		},
		common: {
			back: 'Back',
			next: 'Next'
		}
	});
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
});

beforeEach(() => {
	mockTestDatabase.mockReset().mockResolvedValue({});
	mockTestRedis.mockReset().mockResolvedValue({});
	mockInstall.mockReset().mockResolvedValue({ message: 'ok', restart: true });
	mockStatus.mockReset().mockResolvedValue({ needs_setup: false, step: 'welcome' });
	mockGoto.mockReset().mockResolvedValue(undefined);
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	vi.useRealTimers();
});

async function advanceToReady(container: HTMLElement): Promise<void> {
	await fireEvent.click(container.querySelector('[data-testid="setup-test-db"]') as HTMLButtonElement);
	await waitFor(() => expect(mockTestDatabase).toHaveBeenCalledTimes(1));
	await fireEvent.click(container.querySelector('[data-testid="setup-next"]') as HTMLButtonElement);

	await waitFor(() => expect(container.querySelector('[data-testid="setup-step-redis"]')).not.toBeNull());
	await fireEvent.click(container.querySelector('[data-testid="setup-test-redis"]') as HTMLButtonElement);
	await waitFor(() => expect(mockTestRedis).toHaveBeenCalledTimes(1));
	await fireEvent.click(container.querySelector('[data-testid="setup-next"]') as HTMLButtonElement);

	await waitFor(() => expect(container.querySelector('[data-testid="setup-step-admin"]')).not.toBeNull());
	await fireEvent.input(container.querySelector('[data-testid="setup-admin-email"]') as HTMLInputElement, {
		target: { value: 'admin@example.com' }
	});
	await fireEvent.input(container.querySelector('[data-testid="setup-admin-password"]') as HTMLInputElement, {
		target: { value: 'password1' }
	});
	await fireEvent.input(container.querySelector('[data-testid="setup-admin-confirm"]') as HTMLInputElement, {
		target: { value: 'password1' }
	});
	await fireEvent.click(container.querySelector('[data-testid="setup-next"]') as HTMLButtonElement);
	await waitFor(() => expect(container.querySelector('[data-testid="setup-step-ready"]')).not.toBeNull());
}

describe('/setup page', () => {
	it('walks through database, redis, admin, and install flow', async () => {
		const mod = await import('../../../routes/setup/+page.svelte');
		const { container } = render(mod.default);

		expect(container.querySelector('[data-testid="setup-step-database"]')).not.toBeNull();
		expect((container.querySelector('[data-testid="setup-next"]') as HTMLButtonElement).disabled).toBe(true);

		await advanceToReady(container);
		await fireEvent.click(container.querySelector('[data-testid="setup-install"]') as HTMLButtonElement);

		await waitFor(() => {
			expect(mockInstall).toHaveBeenCalledTimes(1);
			expect(container.querySelector('[data-testid="setup-success"]')).not.toBeNull();
		});
		const payload = mockInstall.mock.calls[0][0];
		expect(payload.database.dbname).toBe('sub2api');
		expect(payload.admin.email).toBe('admin@example.com');

		await vi.advanceTimersByTimeAsync(1500);
		expect(mockGoto).toHaveBeenCalledWith('/login', { replaceState: true });
	});

	it('shows connection errors and keeps next disabled', async () => {
		mockTestDatabase.mockRejectedValueOnce(new Error('Connection failed'));
		const mod = await import('../../../routes/setup/+page.svelte');
		const { container } = render(mod.default);

		await fireEvent.click(container.querySelector('[data-testid="setup-test-db"]') as HTMLButtonElement);
		await waitFor(() => {
			expect(container.querySelector('[data-testid="setup-error"]')?.textContent).toContain('Connection failed');
		});
		expect((container.querySelector('[data-testid="setup-next"]') as HTMLButtonElement).disabled).toBe(true);
	});
});
